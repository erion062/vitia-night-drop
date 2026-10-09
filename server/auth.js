import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { HttpError, nowIso } from './lib/util.js';

const COOKIE = 'vnd_session';
const SESSION_DAYS = 30;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT_OPTS);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieString(req, value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (config.cookieSecure || proto === 'https' || req?.secure) parts.push('Secure');
  return parts.join('; ');
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    nowIso(),
    expires,
  );
  res.setHeader('Set-Cookie', cookieString(res.req, token, SESSION_DAYS * 86400));
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.setHeader('Set-Cookie', cookieString(req, '', 0));
}

export function loadUser(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.full_name, u.phone, u.role, u.partner_slug, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(sha256(token));
    if (row && row.expires_at > nowIso()) {
      req.user = {
        id: row.id,
        full_name: row.full_name,
        phone: row.phone,
        role: row.role,
        partner: row.partner_slug || '',
      };
    }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Admin access only'));
  next();
}

export function requirePartner(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  if (req.user.role !== 'partner' || !req.user.partner) {
    return next(new HttpError(403, 'Partner access only'));
  }
  next();
}

function requestHosts(req) {
  const out = [];
  const add = (value) => {
    if (!value) return;
    for (const part of String(value).split(',')) {
      const host = part.trim().toLowerCase();
      if (host) out.push(host);
    }
  };
  add(req.headers['x-forwarded-host']);
  add(req.headers.host);
  add(req.hostname);
  return out;
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function checkOrigin(req, _res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return next(new HttpError(403, 'Bad origin'));
  }
  const originHost = originUrl.host.toLowerCase();
  const originName = originUrl.hostname.toLowerCase();
  const hosts = requestHosts(req);
  if (hosts.includes(originHost) || hosts.includes(originName)) return next();
  if (hosts.some((h) => h.split(':')[0] === originName)) return next();
  if (config.allowedOrigins.includes(origin.replace(/\/$/, ''))) return next();
  next(new HttpError(403, 'Cross-origin request blocked'));
}

/** Tiny fixed-window rate limiter (in memory, fine for a single-instance deployment). */
export function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, _res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) return next(new HttpError(429, 'Shumë prova. Prit pak minuta.'));
    next();
  };
}

export function ensureAdmin() {
  const { admin } = config;
  const phone = normalizeAdminPhone(admin.phone);
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!existing) {
    const byPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (byPhone) {
      db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?").run(
        hashPassword(admin.password),
        byPhone.id,
      );
    } else {
      db.prepare(
        "INSERT INTO users (full_name, phone, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
      ).run(admin.name, phone, hashPassword(admin.password), nowIso());
    }
    console.log(`[vnd] Admin account created for ${phone}`);
  } else if (admin.resetPassword) {
    db.prepare('UPDATE users SET password_hash = ?, phone = ? WHERE id = ?').run(
      hashPassword(admin.password),
      phone,
      existing.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log('[vnd] Admin password reset from ADMIN_PASSWORD. Remove ADMIN_RESET_PASSWORD now.');
  }
}

const ANDI_LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="36" fill="#181818"/>
  <text x="100" y="92" text-anchor="middle" fill="#00FF66" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800">ANDI</text>
  <text x="100" y="128" text-anchor="middle" fill="#f2f2f2" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="3">MARKET</text>
</svg>`;

export function ensureAndiMarket() {
  const { andi } = config;
  const phone = andi.phone ? normalizeAdminPhone(andi.phone) : '';
  const now = nowIso();
  const logo = '/uploads/andi-logo.svg';
  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadsDir, 'andi-logo.svg'), ANDI_LOGO);
  } catch {}
  db.prepare(
    `INSERT INTO partners (slug, name, tagline, logo_url, phone, hours, active, sort, created_at, kind)
     VALUES ('andi', 'Andi Market', 'Market · pije, ushqim, shtëpi', ?, ?, '14:00–23:00', 1, 2, ?, 'market')
     ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, logo_url=excluded.logo_url,
       kind='market', active=1`,
  ).run(logo, phone, now);

  if (!phone || andi.password.length < 6) {
    if (config.isProd) console.warn('[vnd] ANDI_PHONE / ANDI_PASSWORD not set — Andi Market login was not created.');
    return;
  }
  const existing = db.prepare("SELECT id FROM users WHERE role = 'partner' AND partner_slug = 'andi'").get();
  if (!existing) {
    const byPhone = db.prepare('SELECT id, role FROM users WHERE phone = ?').get(phone);
    if (byPhone) {
      db.prepare("UPDATE users SET role = 'partner', partner_slug = 'andi', full_name = ?, password_hash = ? WHERE id = ?").run(
        andi.name,
        hashPassword(andi.password),
        byPhone.id,
      );
    } else {
      db.prepare(
        "INSERT INTO users (full_name, phone, password_hash, role, partner_slug, created_at) VALUES (?, ?, ?, 'partner', 'andi', ?)",
      ).run(andi.name, phone, hashPassword(andi.password), now);
    }
    console.log(`[vnd] Andi Market login created for ${phone}`);
  } else if (andi.resetPassword) {
    db.prepare('UPDATE users SET password_hash = ?, phone = ?, full_name = ? WHERE id = ?').run(
      hashPassword(andi.password),
      phone,
      andi.name,
      existing.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log('[vnd] Andi Market password reset from ANDI_PASSWORD. Remove ANDI_RESET_PASSWORD now.');
  }
}

function normalizeAdminPhone(p) {
  let s = p.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = s.startsWith('383') ? '+' + s : '+383' + s.replace(/^0/, '');
  return s;
}
