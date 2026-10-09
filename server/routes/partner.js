import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requirePartner } from '../auth.js';
import { config } from '../config.js';
import { CATEGORIES, db } from '../db.js';
import { toAdmins } from '../realtime.js';
import { HttpError, int, nowIso, str } from '../lib/util.js';

const router = Router();
router.use(requirePartner);

function shop(req) {
  const row = db.prepare('SELECT * FROM partners WHERE slug = ?').get(req.user.partner);
  if (!row) throw new HttpError(404, 'Shop not found');
  return row;
}

function ownProduct(req, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND partner = ?').get(id, req.user.partner);
  if (!p) throw new HttpError(404, 'Product not found');
  return p;
}

router.get('/me', (req, res) => {
  res.json({ shop: shop(req) });
});

router.get('/products', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM products WHERE partner = ? ORDER BY sort, id')
    .all(req.user.partner)
    .map((p) => ({ ...p, available: !!p.available, popular: !!p.popular }));
  res.json({ shop: shop(req), products: rows });
});

function productInput(b, partial = false) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) out.name = str(b.name, { min: 1, max: 80, field: 'Emri', lang: 'sq' });
  if (!partial || has('description')) out.description = str(b.description, { max: 200, field: 'Përshkrimi', optional: true, lang: 'sq' });
  if (!partial || has('section')) out.section = str(b.section, { max: 40, field: 'Seksioni', optional: true, lang: 'sq' }) || 'Market';
  if (!partial || has('category')) {
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Kategori e pavlefshme');
    out.category = b.category;
  }
  if (!partial || has('price_cents')) out.price_cents = int(b.price_cents, { min: 1, max: 100000, field: 'Çmimi', lang: 'sq' });
  if (has('image_url')) {
    const url = str(b.image_url, { max: 500, field: 'Foto', optional: true, lang: 'sq' });
    if (url && !/^(\/uploads\/[\w.-]+|https:\/\/\S+)$/.test(url)) throw new HttpError(400, 'Fotoja duhet të jetë upload ose https');
    out.image_url = url;
  }
  if (has('available')) out.available = b.available ? 1 : 0;
  return out;
}

const changed = () => toAdmins('products', {});

router.post('/products', (req, res) => {
  const p = productInput(req.body || {});
  const now = nowIso();
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort), 7000) AS m FROM products WHERE partner = ?").get(req.user.partner).m;
  const r = db
    .prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort,
         partner, section, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '#00FF66', ?, 0, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.name,
      p.description || '',
      p.category || 'other',
      p.price_cents,
      p.price_cents,
      p.image_url || '',
      p.available ?? 1,
      maxSort + 1,
      req.user.partner,
      p.section || 'Market',
      now,
      now,
    );
  changed();
  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(Number(r.lastInsertRowid)) });
});

router.put('/products/:id', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Produkti', lang: 'sq' });
  ownProduct(req, id);
  const p = productInput(req.body || {}, true);
  if (p.price_cents != null) p.cost_cents = p.price_cents;
  const keys = Object.keys(p);
  if (keys.length) {
    db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND partner = ?`).run(
      ...keys.map((k) => p[k]),
      nowIso(),
      id,
      req.user.partner,
    );
  }
  changed();
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ? AND partner = ?').get(id, req.user.partner) });
});

router.delete('/products/:id', (req, res) => {
  const id = int(req.params.id, { min: 1, field: 'Produkti', lang: 'sq' });
  const p = ownProduct(req, id);
  db.prepare('DELETE FROM products WHERE id = ? AND partner = ?').run(id, req.user.partner);
  if (p.image_url?.startsWith('/uploads/') && !db.prepare('SELECT 1 FROM products WHERE image_url = ?').get(p.image_url)) {
    fs.promises.unlink(path.join(config.uploadsDir, path.basename(p.image_url))).catch(() => {});
  }
  changed();
  res.json({ ok: true });
});

router.post('/uploads', (req, res) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''));
  if (!m) throw new HttpError(400, 'Ngarko një foto JPEG, PNG ose WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new HttpError(400, 'Fotoja është shumë e madhe (max 2 MB)');
  const name = `andi-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  res.status(201).json({ url: `/uploads/${name}` });
});

export default router;
