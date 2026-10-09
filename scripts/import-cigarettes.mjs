#!/usr/bin/env node
/**
 * Replace the cigarettes catalog with Kosovo shelf SKUs.
 * Prices: Viva Fresh (zbritje.de listing, 2026) and ASK (Marlboro pack = €3.00, Aug 2026).
 * Pack shots are generated — retailers do not publish cigarette pack photos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const SEED_PATH = path.join(ROOT, 'server', 'seed.js');

fs.mkdirSync(UPLOADS, { recursive: true });

function euro(n) {
  return Math.round(n * 100);
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function packSvg({ brand, variant, accent, stripe }) {
  const color = accent;
  const b = escapeXml(brand);
  const v = escapeXml(variant);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <rect width="600" height="600" fill="#121212"/>
  <rect x="150" y="70" width="300" height="460" rx="10" fill="#1a1a1a" stroke="${stripe}" stroke-width="3"/>
  <rect x="150" y="70" width="300" height="108" rx="10" fill="${color}"/>
  <rect x="150" y="160" width="300" height="18" fill="${stripe}"/>
  <text x="300" y="138" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="36" font-weight="800" fill="#f2f2f2">${b}</text>
  <text x="300" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#f2f2f2">${v}</text>
  <text x="300" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#9a9a9a">20 cigare</text>
  <rect x="168" y="430" width="264" height="78" fill="#111"/>
  <text x="300" y="464" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#f2f2f2">DUHANI VRET</text>
  <text x="300" y="490" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#9a9a9a">18+ · Kosovë</text>
</svg>
`;
}

function lighterSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <rect width="600" height="600" fill="#121212"/>
  <rect x="240" y="90" width="120" height="380" rx="16" fill="#2a2a2a" stroke="#FF5A36" stroke-width="3"/>
  <rect x="252" y="108" width="96" height="70" rx="8" fill="#3a3a3a"/>
  <rect x="276" y="78" width="48" height="28" rx="6" fill="#c8c8c8"/>
  <circle cx="300" cy="300" r="18" fill="#00FF66"/>
  <text x="300" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#f2f2f2">NDËZËSE</text>
</svg>
`;
}

const CATALOG = [
  { name: 'Marlboro Red', brand: 'MARLBORO', variant: 'Red', shelf: 3.0, source: 'ASK gusht 2026', accent: '#D7282F', stripe: '#8B1A1F', popular: true },
  { name: 'Marlboro Gold', brand: 'MARLBORO', variant: 'Gold', shelf: 3.0, source: 'ASK gusht 2026', accent: '#C9A227', stripe: '#8A7318', popular: true },
  { name: 'Marlboro Touch 6MG', brand: 'MARLBORO', variant: 'Touch 6mg', shelf: 3.0, source: 'Viva Fresh', accent: '#D7282F', stripe: '#8B1A1F', popular: true },
  { name: 'Marlboro Fine Touch 4MG', brand: 'MARLBORO', variant: 'Fine Touch 4mg', shelf: 3.0, source: 'Viva Fresh', accent: '#D7282F', stripe: '#8B1A1F', popular: true },
  { name: 'Camel Blue', brand: 'CAMEL', variant: 'Blue', shelf: 2.9, source: 'Viva Fresh', accent: '#C4A35A', stripe: '#8A7030', popular: true },
  { name: 'Camel Filter', brand: 'CAMEL', variant: 'Filter', shelf: 2.9, source: 'Viva Fresh', accent: '#C4A35A', stripe: '#8A7030', popular: true },
  { name: 'Winston Blue', brand: 'WINSTON', variant: 'Blue', shelf: 2.8, source: 'Viva Fresh', accent: '#1E5AA8', stripe: '#143C70', popular: true },
  { name: 'Winston Classic', brand: 'WINSTON', variant: 'Classic', shelf: 2.8, source: 'Viva Fresh', accent: '#1E5AA8', stripe: '#143C70', popular: true },
  { name: 'Winston SS Blue', brand: 'WINSTON', variant: 'SS Blue', shelf: 2.8, source: 'Viva Fresh', accent: '#1E5AA8', stripe: '#143C70', popular: false },
  { name: 'Lucky Strike Original Red 20pcs', brand: 'LUCKY STRIKE', variant: 'Original Red', shelf: 2.8, source: 'Viva Fresh', accent: '#C41E3A', stripe: '#7A1224', popular: false },
  { name: 'Lucky Strike blue 20pcs', brand: 'LUCKY STRIKE', variant: 'Blue', shelf: 2.8, source: 'Viva Fresh', accent: '#C41E3A', stripe: '#7A1224', popular: false },
  { name: 'Lucky Strike Wild', brand: 'LUCKY STRIKE', variant: 'Wild', shelf: 2.9, source: 'Viva Fresh', accent: '#C41E3A', stripe: '#7A1224', popular: false },
  { name: 'Kent Demi Crystal 6MG', brand: 'KENT', variant: 'Demi Crystal 6mg', shelf: 2.9, source: 'Viva Fresh', accent: '#1A6B4A', stripe: '#0E3F2C', popular: false },
  { name: 'Kent Demi Crystal 4MG', brand: 'KENT', variant: 'Demi Crystal 4mg', shelf: 2.9, source: 'Viva Fresh', accent: '#1A6B4A', stripe: '#0E3F2C', popular: false },
  { name: 'Chesterfield Tuned Blue 6MG', brand: 'CHESTERFIELD', variant: 'Tuned Blue 6mg', shelf: 2.3, source: 'Viva Fresh', accent: '#3D7EA6', stripe: '#24506A', popular: false },
  { name: 'Chesterfield Tuned Aqua 4MG', brand: 'CHESTERFIELD', variant: 'Tuned Aqua 4mg', shelf: 2.3, source: 'Viva Fresh', accent: '#3D7EA6', stripe: '#24506A', popular: false },
  { name: 'West Red Soft', brand: 'WEST', variant: 'Red Soft', shelf: 2.2, source: 'Viva Fresh', accent: '#7A1F2B', stripe: '#4A1219', popular: false },
  { name: 'West Silver Soft', brand: 'WEST', variant: 'Silver Soft', shelf: 2.2, source: 'Viva Fresh', accent: '#8A8F98', stripe: '#555960', popular: false },
  { name: 'Lighter', brand: 'NDËZËSE', variant: 'Disposable', shelf: 0.7, source: 'shop', accent: '#FF5A36', stripe: '#CC3A1C', popular: false, isLighter: true },
];

const now = new Date().toISOString();
const rows = CATALOG.map((p, i) => {
  const file = p.isLighter ? 'cig-lighter.svg' : `cig-${slug(p.name)}.svg`;
  const svg = p.isLighter ? lighterSvg() : packSvg(p);
  fs.writeFileSync(path.join(UPLOADS, file), svg);
  const cents = euro(p.shelf);
  return {
    ...p,
    description: p.isLighter ? 'Ndëzëse e përdorshme' : `20 cigare · 18+ · ${p.source} €${p.shelf.toFixed(2)}`,
    price_cents: p.isLighter ? 120 : cents,
    cost_cents: cents,
    image_url: `/uploads/${file}`,
    sort: 3000 + i,
  };
});

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');

const names = rows.map((r) => r.name);
const orderedCig = db
  .prepare(
    `SELECT DISTINCT oi.product_id AS id FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE p.category = 'cigarettes'`,
  )
  .all()
  .map((r) => r.id);

db.exec('BEGIN IMMEDIATE');
try {
  const keep = new Set(orderedCig);
  for (const row of db.prepare("SELECT id, name FROM products WHERE category = 'cigarettes'").all()) {
    if (!names.includes(row.name) && !keep.has(row.id)) {
      db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    }
  }

  const update = db.prepare(
    `UPDATE products SET description=?, category='cigarettes', price_cents=?, cost_cents=?, image_url=?, accent=?, available=1, popular=?, sort=?, updated_at=? WHERE name=?`,
  );
  const insert = db.prepare(
    `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort, created_at, updated_at)
     VALUES (?,?, 'cigarettes', ?,?,?,?,1,?,?,?,?)`,
  );

  for (const p of rows) {
    const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
    if (existing) {
      update.run(p.description, p.price_cents, p.cost_cents, p.image_url, p.accent, p.popular ? 1 : 0, p.sort, now, p.name);
    } else {
      insert.run(p.name, p.description, p.price_cents, p.cost_cents, p.image_url, p.accent, p.popular ? 1 : 0, p.sort, now, now);
    }
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

const listed = db.prepare("SELECT name, price_cents, image_url FROM products WHERE category='cigarettes' AND available=1 ORDER BY sort").all();
console.log(`cigarettes: ${listed.length}`);
for (const r of listed) console.log(`  €${(r.price_cents / 100).toFixed(2).padStart(4)}  ${r.name}  ${r.image_url}`);

const seed = fs.readFileSync(SEED_PATH, 'utf8');
const block = [
  '  // Cigarettes',
  ...rows.map((p) => {
    const pop = p.popular ? ', popular: true' : '';
    const name = p.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const desc = p.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `  { name: '${name}', description: '${desc}', category: 'cigarettes', price: ${p.price_cents}, cost: ${p.cost_cents}, accent: '${p.accent}'${pop} },`;
  }),
  '',
].join('\n');
const next = seed.replace(/  \/\/ Cigarettes\n[\s\S]*?\n  \/\/ Other\n/, `${block}\n  // Other\n`);
if (next === seed) throw new Error('Could not patch seed.js cigarette block');
fs.writeFileSync(SEED_PATH, next);
console.log('updated server/seed.js');
