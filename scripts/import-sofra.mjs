#!/usr/bin/env node
/**
 * Adds partner bakery Furra Sofra from their price list
 * (Artikujt Sofra SHPK.xlsx, Oct 2026). Sale price = pickup cost.
 * Photos are the files they sent in Desktop/FurraSofra — not internet stock.
 *   node scripts/import-sofra.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const LOGO_SRC = path.join(ROOT, 'marketing', 'partners', 'sofra-logo.jpg');
const PHOTO_DIR = path.join(path.dirname(ROOT), 'FurraSofra');

const PARTNER = {
  slug: 'sofra',
  name: 'Furra Sofra',
  tagline: 'Furra · bukë, burek, pizza',
  phone: '',
  hours: '',
  logo: '/uploads/sofra-logo.jpg',
  kind: 'bakery',
};

const PHOTOS = {
  buke: 'WhatsApp Image 2026-10-09 at 2.53.06 PM (3).jpeg',
  'buke-thekre': 'WhatsApp Image 2026-10-09 at 2.53.07 PM.jpeg',
  'buke-misri': 'WhatsApp Image 2026-10-09 at 2.53.14 PM.jpeg',
  gjevrek: 'WhatsApp Image 2026-10-09 at 2.53.11 PM.jpeg',
  'kifle-gjize': 'WhatsApp Image 2026-10-09 at 2.53.06 PM (2).jpeg',
  'kifle-thjeshta': 'WhatsApp Image 2026-10-09 at 2.53.06 PM (4).jpeg',
  'kroasan-thate': 'WhatsApp Image 2026-10-09 at 2.53.06 PM (8).jpeg',
  'kroasan-qoko': 'WhatsApp Image 2026-10-09 at 2.53.09 PM.jpeg',
  'lesnato-vishnje': 'WhatsApp Image 2026-10-09 at 2.53.06 PM (6).jpeg',
  'tost-proshute': 'WhatsApp Image 2026-10-09 at 2.53.06 PM.jpeg',
  'tortilla-pule': 'WhatsApp Image 2026-10-09 at 2.53.06 PM (1).jpeg',
  'pizza-pjese': 'WhatsApp Image 2026-10-09 at 2.53.17 PM.jpeg',
  gurubija: 'WhatsApp Image 2026-10-09 at 2.53.06 PM (9).jpeg',
};

const item = (section, name, price, photo, description = '', popular = false) => ({
  section,
  name,
  price,
  photo,
  description,
  popular,
});

const MENU = [
  item('Bukë', 'Bukë', 0.6, 'buke', '', true),
  item('Bukë', 'Buke Thekre', 0.6, 'buke-thekre'),
  item('Bukë', 'Bukë Misri', 1.5, 'buke-misri'),
  item('Bukë', 'Krelan Misri', 1.5, 'buke-misri'),
  item('Burek', 'Burek me Mish', 1.5, '', '', true),
  item('Burek', 'Burek me Gjiz', 1.5, ''),
  item('Burek', 'Mantija me Mish', 0.2, ''),
  item('Burek', 'Mantija me Gjize', 0.2, ''),
  item('Kifle & ëmbëlsira', 'Gjevrek', 0.3, 'gjevrek'),
  item('Kifle & ëmbëlsira', 'Kifle me Virshlle', 0.5, ''),
  item('Kifle & ëmbëlsira', 'Kifle te thjeshta', 0.25, 'kifle-thjeshta'),
  item('Kifle & ëmbëlsira', 'Kifle me gjizë', 0.5, 'kifle-gjize'),
  item('Kifle & ëmbëlsira', 'Kroasan me qoko', 0.7, 'kroasan-qoko'),
  item('Kifle & ëmbëlsira', 'Kroasan i thatë', 0.7, 'kroasan-thate'),
  item('Kifle & ëmbëlsira', 'Lesnato me vishnje', 0.7, 'lesnato-vishnje'),
  item('Kifle & ëmbëlsira', 'Lesnato me gjizë', 0.7, ''),
  item('Kifle & ëmbëlsira', 'Bufle me qoko', 0.5, ''),
  item('Kifle & ëmbëlsira', 'Gurubija', 0.5, 'gurubija'),
  item('Pizza', 'Pizza me Pjese', 1, 'pizza-pjese', '', true),
  item('Pizza', 'Pizza 40 cm', 8, 'pizza-pjese'),
  item('Sandwich', 'Tost Proshutë', 1, 'tost-proshute'),
  item('Sandwich', 'Tost Pule', 1.5, ''),
  item('Sandwich', 'Tortilla me mish pule', 1.5, 'tortilla-pule'),
  item('Sandwich', 'Tortilla me proshutë', 1.5, 'tost-proshute'),
  item('Tradicionale', 'Flija', 1.5, '', '', true),
  item('Pije', 'Ayran 0.180 L', 0.3, '', '', false),
  item('Pije', 'Jogurta 0.180 L', 0.3, ''),
];

function copyPhotos() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, path.join(UPLOADS, 'sofra-logo.jpg'));
  else console.warn('logo missing: ' + LOGO_SRC);
  for (const [key, file] of Object.entries(PHOTOS)) {
    const src = path.join(PHOTO_DIR, file);
    const dest = path.join(UPLOADS, `sofra-${key}.jpg`);
    if (!fs.existsSync(src)) {
      console.warn(`photo missing: ${file}`);
      continue;
    }
    fs.copyFileSync(src, dest);
  }
}

function importMenu() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO partners (slug, name, tagline, logo_url, phone, hours, active, sort, created_at, kind)
       VALUES (?, ?, ?, ?, ?, ?, 1, 3, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, logo_url=excluded.logo_url,
         kind=excluded.kind, active=1`,
    ).run(PARTNER.slug, PARTNER.name, PARTNER.tagline, PARTNER.logo, PARTNER.phone, PARTNER.hours, now, PARTNER.kind);

    const names = new Set(MENU.map((m) => m.name));
    const ordered = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1');
    for (const row of db.prepare('SELECT id, name FROM products WHERE partner = ?').all(PARTNER.slug)) {
      if (names.has(row.name)) continue;
      if (ordered.get(row.id)) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(row.id);
      else db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    }

    const sortBase = 8000;
    const find = db.prepare('SELECT id FROM products WHERE partner = ? AND name = ?');
    const update = db.prepare(
      `UPDATE products SET description=?, category=?, price_cents=?, cost_cents=?, image_url=?, accent=?, available=1,
         popular=?, sort=?, section=?, updated_at=? WHERE id=?`,
    );
    const insert = db.prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort,
         partner, section, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    );
    MENU.forEach((m, i) => {
      const cents = Math.round(m.price * 100);
      const category = m.section === 'Pije' ? 'drinks' : 'food';
      const photo = m.photo && fs.existsSync(path.join(UPLOADS, `sofra-${m.photo}.jpg`)) ? `/uploads/sofra-${m.photo}.jpg` : '';
      const popular = m.popular ? 1 : 0;
      const existing = find.get(PARTNER.slug, m.name);
      if (existing) update.run(m.description, category, cents, cents, photo, '#C4A35A', popular, sortBase + i, m.section, now, existing.id);
      else insert.run(m.name, m.description, category, cents, cents, photo, '#C4A35A', popular, sortBase + i, PARTNER.slug, m.section, now, now);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE partner = ? AND available = 1').get(PARTNER.slug).n;
  const noPhoto = db.prepare("SELECT COUNT(*) AS n FROM products WHERE partner = ? AND image_url = ''").get(PARTNER.slug).n;
  console.log(`${PARTNER.name}: ${n} products live, ${noPhoto} without photo`);
  db.close();
}

function liveAdmin() {
  const p = path.join(ROOT, 'vnd-admin-login.txt');
  if (!fs.existsSync(p)) throw new Error('vnd-admin-login.txt is required for --live');
  const t = fs.readFileSync(p, 'utf8');
  return { phone: t.match(/Phone:\s*(\S+)/)?.[1], password: t.match(/Password:\s*(\S+)/)?.[1] };
}

async function importLive() {
  const { phone, password } = liveAdmin();
  const jar = [];
  async function api(pathname, opts = {}) {
    const res = await fetch('https://vndviti.com/api' + pathname, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        cookie: jar.join('; '),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) jar.push(c.split(';')[0]);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${pathname} ${res.status} ${data.error || ''}`.trim());
    return data;
  }
  await api('/auth/login', { method: 'POST', body: { phone, password } });
  const pub = await api('/products');
  if (!pub.partners?.some((p) => p.slug === 'sofra')) {
    throw new Error('Furra Sofra is not on the live site yet. Wait for the Git deploy, then run --live again.');
  }
  const existing = new Set((pub.products || []).filter((p) => p.partner === 'sofra').map((p) => p.name));
  const uploaded = {};
  for (const [key, file] of Object.entries(PHOTOS)) {
    const src = path.join(PHOTO_DIR, file);
    if (!fs.existsSync(src)) continue;
    const buf = fs.readFileSync(src);
    const data = 'data:image/jpeg;base64,' + buf.toString('base64');
    const r = await api('/admin/uploads', { method: 'POST', body: { data } });
    uploaded[key] = r.url;
    console.log('uploaded', key);
  }
  let added = 0;
  for (const m of MENU) {
    if (existing.has(m.name)) continue;
    await api('/admin/products', {
      method: 'POST',
      body: {
        name: m.name,
        description: m.description,
        category: m.section === 'Pije' ? 'drinks' : 'food',
        price_cents: Math.round(m.price * 100),
        cost_cents: Math.round(m.price * 100),
        image_url: (m.photo && uploaded[m.photo]) || '',
        accent: '#C4A35A',
        available: true,
        popular: !!m.popular,
        partner: PARTNER.slug,
        section: m.section,
      },
    });
    added += 1;
  }
  console.log(`${PARTNER.name}: added ${added} products on vndviti.com`);
}

copyPhotos();
if (process.argv.includes('--live')) await importLive();
else {
  await import('../server/db.js');
  importMenu();
}
