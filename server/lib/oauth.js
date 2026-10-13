import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { createSession, hashPassword } from '../auth.js';
import { toAdmins } from '../realtime.js';
import { nowIso } from './util.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function publicOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

function safeNext(raw) {
  const next = String(raw || '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function stateSecret() {
  return config.facebook.appSecret || config.admin.password || 'vnd-oauth-dev';
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60e3 })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readState(raw) {
  const [body, sig] = String(raw || '').split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expect);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function loginRedirect(req, res, err, nextPath) {
  const q = new URLSearchParams();
  if (err) q.set('err', err);
  const next = safeNext(nextPath);
  if (next && next !== '/') q.set('next', next);
  res.redirect(302, `/login${q.toString() ? `?${q}` : ''}`);
}

export function startFacebook(req, res, via) {
  if (!config.facebook.appId || !config.facebook.appSecret) {
    return loginRedirect(req, res, 'social_setup');
  }
  const origin = publicOrigin(req);
  const redirectUri = `${origin}/api/auth/${via}/callback`;
  const state = signState({ next: safeNext(req.query.next), via });
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', config.facebook.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'public_profile,email');
  if (via === 'instagram') url.searchParams.set('display', 'page');
  res.redirect(302, url.toString());
}

export async function finishFacebook(req, res, via) {
  if (req.query.error) return loginRedirect(req, res, 'social_denied');
  const state = readState(req.query.state);
  if (!state || state.via !== via) return loginRedirect(req, res, 'social_failed');
  const code = String(req.query.code || '');
  if (!code) return loginRedirect(req, res, 'social_failed');

  const origin = publicOrigin(req);
  const redirectUri = `${origin}/api/auth/${via}/callback`;
  try {
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: config.facebook.appId,
          client_secret: config.facebook.appSecret,
          redirect_uri: redirectUri,
          code,
        }),
    );
    const token = await tokenRes.json();
    if (!token.access_token) return loginRedirect(req, res, 'social_failed', state.next);

    const meRes = await fetch(`${GRAPH}/me?fields=id,name,email&access_token=${encodeURIComponent(token.access_token)}`);
    const me = await meRes.json();
    if (!me.id) return loginRedirect(req, res, 'social_failed', state.next);

    const user = upsertSocialUser(via, me);
    createSession(res, user.id);
    res.redirect(302, safeNext(state.next));
  } catch (err) {
    console.error('[vnd] social login', err);
    loginRedirect(req, res, 'social_failed', state.next);
  }
}

function placeholderPhone(id) {
  const n = String(id).replace(/\D/g, '').slice(-8).padStart(8, '0');
  return `+383000${n}`;
}

function upsertSocialUser(via, me) {
  const name = String(me.name || '').trim() || (via === 'instagram' ? 'Instagram' : 'Facebook');
  const fbId = String(me.id);
  const existing =
    db.prepare('SELECT * FROM users WHERE facebook_id = ?').get(fbId) ||
    (via === 'instagram' ? db.prepare('SELECT * FROM users WHERE instagram_id = ?').get(fbId) : null);
  if (existing) {
    if (existing.role === 'admin' || existing.role === 'partner') {
      throw new Error('staff account cannot use social login');
    }
    if (via === 'instagram' && !existing.instagram_id) {
      db.prepare('UPDATE users SET instagram_id = ? WHERE id = ?').run(fbId, existing.id);
    }
    if (!existing.facebook_id) {
      db.prepare('UPDATE users SET facebook_id = ? WHERE id = ?').run(fbId, existing.id);
    }
    return existing;
  }

  const now = nowIso();
  let phone = placeholderPhone(fbId);
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
    phone = `+383000${crypto.randomBytes(4).toString('hex').slice(0, 8)}`;
  }
  const r = db
    .prepare(
      `INSERT INTO users (full_name, phone, password_hash, role, partner_slug, created_at, facebook_id, instagram_id)
       VALUES (?, ?, ?, 'customer', '', ?, ?, ?)`,
    )
    .run(
      name.slice(0, 80),
      phone,
      hashPassword(crypto.randomBytes(32).toString('hex')),
      now,
      fbId,
      via === 'instagram' ? fbId : '',
    );
  toAdmins('customers', {});
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
}

export function hidePlaceholderPhone(phone) {
  return String(phone || '').startsWith('+383000') ? '' : phone;
}
