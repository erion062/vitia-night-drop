#!/usr/bin/env node
/**
 * Adds partner Ballerina from their printed food menu (Desktop/PhoneDrop-all)
 * plus the cake list they sent as text. No dish photos yet — logo only until
 * they send product pictures.
 *   node scripts/import-ballerina.mjs
 *   node scripts/import-ballerina.mjs --live
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const LOGO_SRC = path.join(ROOT, 'marketing', 'partners', 'ballerina-logo.jpg');

const PARTNER = {
  slug: 'ballerina',
  name: 'Ballerina',
  tagline: 'Pastiçeri · ushqim · ëmbëlsira',
  phone: '048722228',
  hours: '',
  logo: '/uploads/ballerina-logo.jpg',
  kind: 'pastry',
};

const ACCENT = '#C9A86C';

const item = (section, name, price, description = '', popular = false) => ({
  section,
  name,
  price,
  description,
  popular,
});

const MENU = [
  item('Torta', 'Snickers', 2, '', true),
  item('Torta', 'Mak', 2),
  item('Torta', 'Mallaga', 1.5),
  item('Torta', 'Magnolia', 2),
  item('Torta', 'Trileqe', 1.7, '', true),
  item('Torta', 'Sofla', 2),
  item('Torta', 'Milka', 2),
  item('Torta', 'Mozaik', 2),
  item('Torta', 'Lotus', 2),
  item('Torta', 'Eklera francez me lotus', 1.5),
  item('Torta', 'Festek', 2),
  item('Torta', 'Noel sarma', 2),
  item('Torta', 'Pavlora', 2),
  item('Torta', 'Cheesecake San Sebastian', 3.5, '', true),
  item('Torta', 'Fruit Cake', 1.5),
  item('Torta', 'Eklera francez me festek', 1.5),
  item('Fast Food', 'Bërxollë pule', 6),
  item('Fast Food', 'Chicken Wings', 6),
  item('Fast Food', 'Chicken Nuggets', 5),
  item('Fast Food', 'Chicken Burger', 2.5),
  item('Fast Food', 'Sandwich proshutë', 2),
  item('Fast Food', 'Sandwich pule', 2),
  item('Fast Food', 'Sandwich suxhuk', 2),
  item('Fast Food', 'Sandwich tuna', 2.5),
  item('Fast Food', 'Sandwich Ballerina', 2.5, '', true),
  item('Fast Food', 'Pomfrit', 1.5),
  item('Pasta', 'Makarona boloneze', 4.5),
  item('Pasta', 'Makarona carbonara', 4.5),
  item('Pasta', 'Makarona arrabiata', 4.5),
  item('Pasta', 'Shpageta boloneze', 4.5),
  item('Pasta', 'Shpageta carbonara', 4.5),
  item('Pasta', 'Shpageta arrabiata', 4.5),
  item('Pizza', 'Pizza Margarita', 3.5, '', true),
  item('Pizza', 'Pizza proshutë', 4.5),
  item('Pizza', 'Pizza fungi', 4.5),
  item('Pizza', 'Pizza fungi proshutë', 5),
  item('Pizza', 'Pizza tuna', 5.5),
  item('Pizza', 'Pizza peperoni', 4.5),
  item('Pizza', 'Pizza Ballerina', 6, '', true),
  item('Pallaçinka', 'Pallaçinkë me çokollatë', 3.5, 'Sheqer pluhur, luleshtrydhe, boronicë'),
  item('Pallaçinka', 'Pallaçinkë me Nutella', 4, 'Sheqer pluhur, luleshtrydhe, banane'),
  item('Waffle', 'Waffle me çokollatë', 3.5, 'Sheqer pluhur, luleshtrydhe, banane, akullore'),
  item('Waffle', 'Waffle me Nutella', 4, 'Sheqer pluhur, luleshtrydhe, banane, akullore'),
  item('Waffle', 'Waffle me mjaltë', 3.5, 'Sheqer pluhur, luleshtrydhe, banane'),
  item('Mëngjes', 'Omlet angleze', 5.5, 'Vezë, djathë, proshutë, vishlle'),
  item('Mëngjes', 'Omlet klasike', 3.5, 'Vezë, djathë, proshutë'),
  item('Mëngjes', 'Petulla', 3.5, 'Porcion petulla me djathë + çaj'),
  item('Sallata', 'Sallatë shope', 4),
  item('Sallata', 'Sallatë greke', 4.5),
  item('Sallata', 'Sallatë cezar', 5),
  item('Samun', 'Samun proshutë', 3.5),
  item('Samun', 'Samun suxhuk', 3.5),
  item('Samun', 'Samun mix', 4),
];

function copyLogo() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, path.join(UPLOADS, 'ballerina-logo.jpg'));
  else console.warn('logo missing: ' + LOGO_SRC);
}

function importMenu() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO partners (slug, name, tagline, logo_url, phone, hours, active, sort, created_at, kind)
       VALUES (?, ?, ?, ?, ?, ?, 1, 4, ?, ?)
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

    const sortBase = 9000;
    const find = db.prepare('SELECT id FROM products WHERE partner = ? AND name = ?');
    const update = db.prepare(
      `UPDATE products SET description=?, category=?, price_cents=?, cost_cents=?, accent=?, available=1,
         popular=?, sort=?, section=?, updated_at=? WHERE id=?`,
    );
    const insert = db.prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort,
         partner, section, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    );
    MENU.forEach((m, i) => {
      const cents = Math.round(m.price * 100);
      const popular = m.popular ? 1 : 0;
      const existing = find.get(PARTNER.slug, m.name);
      if (existing) update.run(m.description, 'food', cents, cents, ACCENT, popular, sortBase + i, m.section, now, existing.id);
      else insert.run(m.name, m.description, 'food', cents, cents, '', ACCENT, popular, sortBase + i, PARTNER.slug, m.section, now, now);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM products WHERE partner = ? AND available = 1').get(PARTNER.slug).n;
  console.log(`${PARTNER.name}: ${n} products live`);
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
  if (!pub.partners?.some((p) => p.slug === 'ballerina')) {
    throw new Error('Ballerina is not on the live site yet. Wait for the Git deploy, then run --live again.');
  }
  const existing = new Set((pub.products || []).filter((p) => p.partner === 'ballerina').map((p) => p.name));
  let added = 0;
  for (const m of MENU) {
    if (existing.has(m.name)) continue;
    await api('/admin/products', {
      method: 'POST',
      body: {
        name: m.name,
        description: m.description,
        category: 'food',
        price_cents: Math.round(m.price * 100),
        cost_cents: Math.round(m.price * 100),
        image_url: '',
        accent: ACCENT,
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

copyLogo();
if (process.argv.includes('--live')) await importLive();
else {
  await import('../server/db.js');
  importMenu();
}
