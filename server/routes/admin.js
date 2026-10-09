import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { hashPassword, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { CATEGORIES, db } from '../db.js';
import { toAdmins, toUser } from '../realtime.js';
import { clearDriverLocation, getDriverLocation, saveDriverLocation } from '../lib/location.js';
import { changeStatus, getAdminOrder, listActiveOrders, listHistory, orderingState } from '../lib/orders.js';
import { createAnnouncement, listAnnouncements, removeAnnouncement } from '../lib/announcements.js';
import { computeRevenue } from '../lib/revenue.js';
import { addDays } from '../lib/time.js';
import { getSettings, updateSettings } from '../lib/settings.js';
import { HttpError, int, nowIso, num, str } from '../lib/util.js';
import { listVisitors, visitorDetail, visitorSummary } from '../lib/visitors.js';

const router = Router();
router.use(requireAdmin);

// ---------- Dashboard & orders ----------

router.get('/summary', (_req, res) => {
  const s = getSettings();
  const state = orderingState(s);
  const today = computeRevenue({ range: 'today' });
  const activity = db
    .prepare(
      `SELECT h.status, h.created_at, h.note, o.number, o.id AS order_id, o.total_cents, o.customer_name
       FROM order_status_history h JOIN orders o ON o.id = h.order_id
       ORDER BY h.id DESC LIMIT 12`,
    )
    .all();
  const resets = db.prepare("SELECT COUNT(*) AS n FROM password_reset_requests WHERE status = 'open'").get().n;
  const customers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").get().n;
  res.json({
    state,
    today: today.totals,
    activity,
    open_reset_requests: resets,
    customers,
    visitors: visitorSummary(),
  });
});

router.get('/visitors', (_req, res) => {
  res.json(listVisitors());
});

router.get('/visitors/:id', (req, res) => {
  res.json(visitorDetail(str(req.params.id, { min: 8, max: 64, field: 'Visitor' })));
});

router.get('/orders', (req, res) => {
  if (req.query.scope === 'history') {
    const q = req.query;
    const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    // Business days start ~06:00 Europe/Belgrade (04:00 UTC in summer, 05:00 in winter).
    const from = day(q.from) ? `${day(q.from)}T04:00:00.000Z` : undefined;
    const to = day(q.to) ? `${addDays(day(q.to), 1)}T04:00:00.000Z` : undefined;
    res.json({
      orders: listHistory({
        from,
        to,
        status: typeof q.status === 'string' ? q.status : undefined,
        customer: typeof q.customer === 'string' ? q.customer.slice(0, 60) : undefined,
        number: typeof q.number === 'string' ? q.number.slice(0, 20) : undefined,
      }),
    });
    return;
  }
  res.json({ orders: listActiveOrders(), state: orderingState() });
});

router.get('/orders/:id', (req, res) => {
  res.json({ order: getAdminOrder(int(req.params.id, { min: 1, field: 'Order' })) });
});

router.post('/orders/:id/status', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Order' });
  const status = str(req.body?.status, { max: 20, field: 'Status' });
  const note = str(req.body?.note, { max: 200, field: 'Note', optional: true });
  const order = changeStatus(id, status, req.user, {
    note: status === 'CANCELLED' ? note || 'Declined by VND' : note,
    payment: req.body?.payment,
  });
  toAdmins('order:update', { id, number: order.number, status });
  toUser(order.user_id, 'order:update', { number: order.number, status });
  res.json({ order: getAdminOrder(id), state: orderingState() });
});

router.get('/revenue', (req, res) => {
  const { range, from, to } = req.query;
  res.json(computeRevenue({ range: String(range || 'today'), from: String(from || ''), to: String(to || '') }));
});

// ---------- Driver location ----------

router.get('/location', (_req, res) => {
  res.json({ location: getDriverLocation() });
});

router.post('/location', (req, res) => {
  if (!getSettings().location_sharing_enabled) throw new HttpError(409, 'Location sharing is disabled in Settings');
  const b = req.body || {};
  const loc = saveDriverLocation(req.user.id, {
    lat: num(b.lat, { min: -90, max: 90, field: 'Latitude' }),
    lng: num(b.lng, { min: -180, max: 180, field: 'Longitude' }),
    accuracy: b.accuracy == null ? null : num(b.accuracy, { min: 0, max: 100000, field: 'Accuracy' }),
    heading: b.heading == null ? null : num(b.heading, { min: 0, max: 360, field: 'Heading' }),
    speed: b.speed == null ? null : num(b.speed, { min: 0, max: 100, field: 'Speed' }),
  });
  res.json({ location: loc });
});

router.delete('/location', (_req, res) => {
  clearDriverLocation();
  res.json({ ok: true });
});

// ---------- Products ----------

function productInput(b, partial = false) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) out.name = str(b.name, { min: 1, max: 80, field: 'Name' });
  if (!partial || has('description')) out.description = str(b.description, { max: 200, field: 'Description', optional: true });
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Invalid category');
    out.category = b.category;
  }
  if (!partial || has('price_cents')) out.price_cents = int(b.price_cents, { min: 0, max: 100000, field: 'Sale price' });
  if (!partial || has('cost_cents')) out.cost_cents = int(b.cost_cents ?? 0, { min: 0, max: 100000, field: 'Purchase cost' });
  if (has('image_url')) {
    const url = str(b.image_url, { max: 500, field: 'Image', optional: true });
    if (url && !/^(\/uploads\/[\w.-]+|https:\/\/\S+)$/.test(url)) throw new HttpError(400, 'Image must be an upload or https URL');
    out.image_url = url;
  }
  if (has('accent')) {
    if (!/^#[0-9a-fA-F]{6}$/.test(b.accent)) throw new HttpError(400, 'Invalid colour');
    out.accent = b.accent;
  }
  if (has('available')) out.available = b.available ? 1 : 0;
  if (has('popular')) out.popular = b.popular ? 1 : 0;
  if (has('sort')) out.sort = int(b.sort, { min: 0, max: 10000, field: 'Sort' });
  return out;
}

const productsChanged = () => toAdmins('products', {});

router.get('/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY sort, id').all();
  res.json({ products: rows.map((p) => ({ ...p, available: !!p.available, popular: !!p.popular })) });
});

router.post('/products', (req, res) => {
  const p = productInput(req.body || {});
  const now = nowIso();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM products').get().m;
  const r = db
    .prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.name,
      p.description,
      p.category,
      p.price_cents,
      p.cost_cents,
      p.image_url || '',
      p.accent || '#00FF66',
      p.available ?? 1,
      p.popular ?? 0,
      p.sort ?? maxSort + 1,
      now,
      now,
    );
  productsChanged();
  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(Number(r.lastInsertRowid)) });
});

router.put('/products/:id', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Product' });
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Product not found');
  const p = productInput(req.body || {}, true);
  const keys = Object.keys(p);
  if (keys.length) {
    db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => p[k]),
      nowIso(),
      id,
    );
  }
  productsChanged();
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

router.delete('/products/:id', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Product' });
  const p = db.prepare('SELECT image_url FROM products WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Product not found');
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  removeUpload(p.image_url);
  productsChanged();
  res.json({ ok: true });
});

function removeUpload(url) {
  if (!url?.startsWith('/uploads/')) return;
  if (db.prepare('SELECT 1 FROM products WHERE image_url = ? UNION SELECT 1 FROM partners WHERE logo_url = ?').get(url, url)) return;
  const file = path.join(config.uploadsDir, path.basename(url));
  fs.promises.unlink(file).catch(() => {});
}

// Images are resized in the browser before upload, so 2 MB is plenty.
router.post('/uploads', (req, res) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''));
  if (!m) throw new HttpError(400, 'Upload a JPEG, PNG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new HttpError(400, 'Image too large (max 2 MB)');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  res.status(201).json({ url: `/uploads/${name}` });
});

// ---------- Settings ----------

router.get('/settings', (_req, res) => {
  res.json({ settings: getSettings() });
});

router.put('/settings', (req, res) => {
  const settings = updateSettings(req.body);
  toAdmins('settings', {});
  res.json({ settings });
});

// ---------- Announcements (customer banner) ----------

router.get('/announcements', (_req, res) => {
  res.json({ announcements: listAnnouncements() });
});

router.post('/announcements', (req, res) => {
  const id = createAnnouncement(req.body);
  res.status(201).json({ id, announcements: listAnnouncements() });
});

router.delete('/announcements/:id', (req, res) => {
  removeAnnouncement(int(req.params.id, { min: 1, field: 'Announcement' }));
  res.json({ announcements: listAnnouncements() });
});

// ---------- Password reset requests ----------

router.get('/reset-requests', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.phone, r.created_at, u.full_name FROM password_reset_requests r
       LEFT JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.id DESC`,
    )
    .all();
  res.json({ requests: rows });
});

router.post('/reset-requests/:id/resolve', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Request' });
  const r = db.prepare("SELECT * FROM password_reset_requests WHERE id = ? AND status = 'open'").get(id);
  if (!r) throw new HttpError(404, 'Request not found');
  const temp = String(crypto.randomInt(10000000, 99999999));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(temp), r.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(r.user_id);
  db.prepare("UPDATE password_reset_requests SET status = 'done', resolved_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ temporary_password: temp, phone: r.phone });
});

router.post('/reset-requests/:id/dismiss', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Request' });
  db.prepare("UPDATE password_reset_requests SET status = 'dismissed', resolved_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ ok: true });
});

export default router;
