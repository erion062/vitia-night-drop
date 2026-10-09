import { Router } from 'express';
import { createSession, destroySession, hashPassword, rateLimit, verifyPassword } from '../auth.js';
import { db } from '../db.js';
import { toAdmins } from '../realtime.js';
import { HttpError, normalizePhone, nowIso, str } from '../lib/util.js';

const router = Router();

const limiter = rateLimit({ windowMs: 15 * 60e3, max: 20, key: (req) => `auth:${req.ip}` });

const publicUser = (u) => ({
  id: u.id,
  full_name: u.full_name,
  phone: u.phone,
  role: u.role,
  partner: u.partner || u.partner_slug || '',
});

function password(v, lang) {
  return str(v, { min: 6, max: 128, field: lang === 'sq' ? 'Fjalëkalimi' : 'Password', lang });
}

router.post('/register', limiter, (req, res) => {
  const fullName = str(req.body?.full_name, { min: 2, max: 80, field: 'Emri i plotë', lang: 'sq' });
  const phone = normalizePhone(req.body?.phone);
  if (!phone) throw new HttpError(400, 'Shkruaj një numër telefoni të vlefshëm');
  const pw = password(req.body?.password, 'sq');
  if (req.body?.confirm_password !== undefined && req.body.confirm_password !== pw) {
    throw new HttpError(400, 'Fjalëkalimet nuk përputhen');
  }
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
    throw new HttpError(409, 'Ekziston tashmë një llogari me këtë numër. Hyr këtu.');
  }
  const r = db
    .prepare("INSERT INTO users (full_name, phone, password_hash, role, created_at) VALUES (?, ?, ?, 'customer', ?)")
    .run(fullName, phone, hashPassword(pw), nowIso());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
  createSession(res, user.id);
  toAdmins('customers', {});
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', limiter, (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const pw = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = phone ? db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) : null;
  if (!user || !verifyPassword(pw, user.password_hash)) {
    throw new HttpError(401, 'Numri ose fjalëkalimi nuk është i saktë');
  }
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.post('/change-password', (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please log in');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body?.current_password || ''), user.password_hash)) {
    throw new HttpError(400, 'Current password is wrong');
  }
  const pw = password(req.body?.new_password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), user.id);
  res.json({ ok: true });
});

// No SMS provider at launch: the request lands on the admin dashboard,
// the admin issues a temporary password and tells the customer by phone.
router.post('/forgot', limiter, (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) throw new HttpError(400, 'Shkruaj një numër telefoni të vlefshëm');
  const user = db.prepare("SELECT id FROM users WHERE phone = ? AND role = 'customer'").get(phone);
  const open = db.prepare("SELECT 1 FROM password_reset_requests WHERE phone = ? AND status = 'open'").get(phone);
  if (user && !open) {
    db.prepare('INSERT INTO password_reset_requests (phone, user_id, created_at) VALUES (?, ?, ?)').run(
      phone,
      user.id,
      nowIso(),
    );
    toAdmins('reset-request', { phone });
  }
  // Same answer whether or not the account exists, so phone numbers can't be probed.
  res.json({ ok: true });
});

export default router;
