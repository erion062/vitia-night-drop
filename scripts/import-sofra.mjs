#!/usr/bin/env node
/**
 * Adds partner bakery Furra Sofra from their price list
 * (Artikujt Sofra SHPK.xlsx, Oct 2026). Sale price = pickup cost.
 * WhatsApp files from Desktop/FurraSofra plus Commons fills for items
 * they did not photograph. Bukë is a loaf — not the milk bun they sent.
 *   node scripts/import-sofra.mjs
 *   node scripts/import-sofra.mjs --user-photos
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
  mantija: 'WhatsApp Image 2026-10-09 at 2.53.06 PM (5).jpeg',
};

/** Photos they dropped in Desktop/FurraSofra after the first import. */
const USER_PHOTOS = {
  'burek-mish': 'burekmemish.png',
  'burek-gjiz': 'burekmegjiz.png',
  flija: 'flija.jfif',
  'tortilla-proshute': 'tortillameporshute.jfif',
  'kifle-virshlle': 'kiflemevishlle.jfif',
  'lesnato-gjize': 'Lisnatomegjiz.png',
};

/** Commons fills still used until they send a replacement. No ayran/jogurta. */
const LOCAL_PHOTOS = {
  buke: 'sofra-weissbrot.jpg',
  'bufle-qoko': 'sofra-bufle-qoko.jpg',
  'tost-pule': 'sofra-tost-pule.jpg',
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
  item('Burek', 'Burek me Mish', 1.5, 'burek-mish', '', true),
  item('Burek', 'Burek me Gjiz', 1.5, 'burek-gjiz'),
  item('Burek', 'Mantija me Mish', 0.2, 'mantija'),
  item('Burek', 'Mantija me Gjize', 0.2, 'mantija'),
  item('Kifle & ëmbëlsira', 'Gjevrek', 0.3, 'gjevrek'),
  item('Kifle & ëmbëlsira', 'Kifle me Virshlle', 0.5, 'kifle-virshlle'),
  item('Kifle & ëmbëlsira', 'Kifle te thjeshta', 0.25, 'kifle-thjeshta'),
  item('Kifle & ëmbëlsira', 'Kifle me gjizë', 0.5, 'kifle-gjize'),
  item('Kifle & ëmbëlsira', 'Kroasan me qoko', 0.7, 'kroasan-qoko'),
  item('Kifle & ëmbëlsira', 'Kroasan i thatë', 0.7, 'kroasan-thate'),
  item('Kifle & ëmbëlsira', 'Lesnato me vishnje', 0.7, 'lesnato-vishnje'),
  item('Kifle & ëmbëlsira', 'Lesnato me gjizë', 0.7, 'lesnato-gjize'),
  item('Kifle & ëmbëlsira', 'Bufle me qoko', 0.5, 'bufle-qoko'),
  item('Kifle & ëmbëlsira', 'Gurubija', 0.5, 'gurubija'),
  item('Pizza', 'Pizza me Pjese', 1, 'pizza-pjese', '', true),
  item('Pizza', 'Pizza 40 cm', 8, 'pizza-pjese'),
  item('Sandwich', 'Tost Proshutë', 1, 'tost-proshute'),
  item('Sandwich', 'Tost Pule', 1.5, 'tost-pule'),
  item('Sandwich', 'Tortilla me mish pule', 1.5, 'tortilla-pule'),
  item('Sandwich', 'Tortilla me proshutë', 1.5, 'tortilla-proshute'),
  item('Tradicionale', 'Flija', 1.5, 'flija', '', true),
  item('Pije', 'Ayran 0.180 L', 0.3, '', '', false),
  item('Pije', 'Jogurta 0.180 L', 0.3, ''),
];

function destFile(key, srcFile) {
  const ext = path.extname(srcFile).toLowerCase() === '.png' ? '.png' : '.jpg';
  return path.join(UPLOADS, `sofra-${key}${ext}`);
}

function mimeOf(file) {
  return path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

function copyPhotos() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, path.join(UPLOADS, 'sofra-logo.jpg'));
  else console.warn('logo missing: ' + LOGO_SRC);
  for (const [key, file] of Object.entries(PHOTOS)) {
    const src = path.join(PHOTO_DIR, file);
    const dest = destFile(key, file);
    if (!fs.existsSync(src)) {
      console.warn(`photo missing: ${file}`);
      continue;
    }
    fs.copyFileSync(src, dest);
  }
  for (const [key, file] of Object.entries(USER_PHOTOS)) {
    const src = path.join(PHOTO_DIR, file);
    if (!fs.existsSync(src)) {
      console.warn(`photo missing: ${file}`);
      continue;
    }
    fs.copyFileSync(src, destFile(key, file));
  }
}

function ensureLocalPhotos() {
  for (const [key, file] of Object.entries(LOCAL_PHOTOS)) {
    const dest = path.join(UPLOADS, `sofra-${key}.jpg`);
    const src = path.join(UPLOADS, file);
    if (!fs.existsSync(src)) {
      console.warn(`photo missing: ${file}`);
      continue;
    }
    if (path.resolve(src) === path.resolve(dest)) continue;
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
      const photoFile = m.photo && ['.jpg', '.png'].map((ext) => path.join(UPLOADS, `sofra-${m.photo}${ext}`)).find((p) => fs.existsSync(p));
      const photo = photoFile ? `/uploads/${path.basename(photoFile)}` : '';
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

async function liveApi() {
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
  return api;
}

function photoSrc(key) {
  const user = USER_PHOTOS[key];
  if (user) {
    const p = destFile(key, user);
    if (fs.existsSync(p)) return p;
    const orig = path.join(PHOTO_DIR, user);
    if (fs.existsSync(orig)) return orig;
  }
  const jpg = path.join(UPLOADS, `sofra-${key}.jpg`);
  const png = path.join(UPLOADS, `sofra-${key}.png`);
  if (fs.existsSync(jpg)) return jpg;
  if (fs.existsSync(png)) return png;
  return '';
}

async function applyUserPhotosLive() {
  const api = await liveApi();
  const pub = await api('/products');
  const byName = new Map((pub.products || []).filter((p) => p.partner === 'sofra').map((p) => [p.name, p]));
  const uploaded = {};
  for (const [key, file] of Object.entries(USER_PHOTOS)) {
    const src = photoSrc(key) || path.join(PHOTO_DIR, file);
    if (!fs.existsSync(src)) {
      console.warn('skip missing', file);
      continue;
    }
    const buf = fs.readFileSync(src);
    if (buf.length > 2 * 1024 * 1024) {
      console.warn('too large', key, buf.length);
      continue;
    }
    const r = await api('/admin/uploads', {
      method: 'POST',
      body: { data: `data:${mimeOf(src)};base64,` + buf.toString('base64') },
    });
    uploaded[key] = r.url;
    console.log('uploaded', key, r.url);
  }
  let updated = 0;
  for (const m of MENU) {
    const product = byName.get(m.name);
    if (!product) continue;
    if (m.name === 'Ayran 0.180 L' || m.name === 'Jogurta 0.180 L') {
      await api(`/admin/products/${product.id}`, { method: 'PUT', body: { image_url: '' } });
      updated += 1;
      console.log('cleared', m.name);
      continue;
    }
    const url = m.photo && uploaded[m.photo];
    if (!url) continue;
    await api(`/admin/products/${product.id}`, { method: 'PUT', body: { image_url: url } });
    updated += 1;
    console.log('photo', m.name, url);
  }
  console.log(`${PARTNER.name}: applied ${updated} live photo updates`);
}

async function fixPhotosLive() {
  const api = await liveApi();
  const pub = await api('/products');
  const byName = new Map((pub.products || []).filter((p) => p.partner === 'sofra').map((p) => [p.name, p]));
  const uploaded = {};
  const keys = [...new Set(MENU.map((m) => m.photo).filter(Boolean))];
  for (const key of keys) {
    const src = path.join(UPLOADS, `sofra-${key}.jpg`);
    if (!fs.existsSync(src)) {
      console.warn('skip missing', key);
      continue;
    }
    const buf = fs.readFileSync(src);
    if (buf.length > 2 * 1024 * 1024) {
      console.warn('too large', key, buf.length);
      continue;
    }
    const r = await api('/admin/uploads', { method: 'POST', body: { data: 'data:image/jpeg;base64,' + buf.toString('base64') } });
    uploaded[key] = r.url;
    console.log('uploaded', key, r.url);
  }
  let updated = 0;
  for (const m of MENU) {
    const product = byName.get(m.name);
    const url = m.photo && uploaded[m.photo];
    if (!product || !url) continue;
    await api(`/admin/products/${product.id}`, { method: 'PUT', body: { image_url: url } });
    updated += 1;
    console.log('photo', m.name, url);
  }
  console.log(`${PARTNER.name}: updated photos on ${updated} live products`);
}

copyPhotos();
ensureLocalPhotos();
if (process.argv.includes('--user-photos')) await applyUserPhotosLive();
else if (process.argv.includes('--fix-photos')) await fixPhotosLive();
else if (process.argv.includes('--live')) await importLive();
else {
  await import('../server/db.js');
  importMenu();
}
