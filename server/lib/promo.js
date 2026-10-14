import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, int, nowIso, str } from './util.js';

const CODE_RE = /^[A-Z0-9]{3,16}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateCode() {
  let code = 'VND';
  for (let i = 0; i < 4; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

function publicOrigin() {
  return config.allowedOrigins[0] || 'https://vndviti.com';
}

export function shareText(row) {
  const origin = publicOrigin();
  return [
    `Kodi VND: ${row.code}`,
    `${row.percent}% zbritje te tarifa e dorëzimit`,
    `${origin}/?code=${row.code}`,
  ].join('\n');
}

export function publicPromo(row) {
  return {
    id: row.id,
    code: row.code,
    note: row.note,
    percent: row.percent,
    max_uses: row.max_uses,
    uses: row.uses,
    expires_at: row.expires_at || null,
    active: !!row.active,
    created_at: row.created_at,
    link: `${publicOrigin()}/?code=${row.code}`,
    share: shareText(row),
  };
}

export function listPromoCodes() {
  return db.prepare('SELECT * FROM promo_codes ORDER BY id DESC').all().map(publicPromo);
}

export function createPromoCode(body) {
  let code = normalizeCode(body?.code);
  if (!code) {
    do {
      code = generateCode();
    } while (db.prepare('SELECT 1 FROM promo_codes WHERE code = ?').get(code));
  }
  if (!CODE_RE.test(code)) throw new HttpError(400, 'Code must be 3–16 letters or numbers');
  if (db.prepare('SELECT 1 FROM promo_codes WHERE code = ?').get(code)) {
    throw new HttpError(409, `Code ${code} already exists`);
  }
  const note = str(body?.note, { max: 80, field: 'Note', optional: true });
  const percent = body?.percent == null ? 10 : int(body.percent, { min: 1, max: 100, field: 'Percent' });
  const maxUses = body?.max_uses == null || body.max_uses === '' ? 0 : int(body.max_uses, { min: 0, max: 100000, field: 'Max uses' });
  let expiresAt = '';
  if (body?.hours) {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 90) throw new HttpError(400, 'Expiry is invalid');
    if (hours > 0) expiresAt = new Date(Date.now() + hours * 3600e3).toISOString();
  }
  db.prepare(
    `INSERT INTO promo_codes (code, note, percent, max_uses, uses, expires_at, active, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
  ).run(code, note, percent, maxUses, expiresAt, nowIso());
  return db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code);
}

export function setPromoActive(id, active) {
  const row = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Code not found');
  db.prepare('UPDATE promo_codes SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id);
}

function liveError(row, lang) {
  const sq = lang === 'sq';
  if (!row || !row.active) return sq ? 'Ky kod s’është i vlefshëm' : 'This code is not valid';
  if (row.expires_at && row.expires_at < nowIso()) return sq ? 'Ky kod ka skaduar' : 'This code has expired';
  if (row.max_uses > 0 && row.uses >= row.max_uses) return sq ? 'Ky kod s’ka më përdorime' : 'This code has no uses left';
  return null;
}

export function previewPromo(raw, lang = 'sq') {
  const code = normalizeCode(raw);
  if (!code) throw new HttpError(400, lang === 'sq' ? 'Shkruaj kodin' : 'Enter a code');
  const row = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code);
  const err = liveError(row, lang);
  if (err) throw new HttpError(400, err, 'PROMO');
  return { code: row.code, percent: row.percent, label: `${row.percent}% off delivery` };
}

export function applyPromo(raw, feeCents) {
  const code = normalizeCode(raw);
  if (!code) return { discount_cents: 0, discount_label: '', promo_code: '' };
  const row = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(code);
  const err = liveError(row, 'sq');
  if (err) throw new HttpError(400, err, 'PROMO');
  const upd = db
    .prepare('UPDATE promo_codes SET uses = uses + 1 WHERE id = ? AND active = 1 AND (max_uses = 0 OR uses < max_uses)')
    .run(row.id);
  if (!upd.changes) throw new HttpError(400, 'Ky kod s’ka më përdorime', 'PROMO');
  const discount = Math.round((feeCents * row.percent) / 100);
  return {
    discount_cents: discount,
    discount_label: `${row.code} · ${row.percent}% off delivery`,
    promo_code: row.code,
  };
}
