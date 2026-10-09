#!/usr/bin/env node
/**
 * Adds partner Amici Lounge & Bar (Viti) from their printed menu (Oct 2026).
 * Sale price = pickup cost (no markup). Photos: ordinary Commons JPEGs, or a copy of
 * a matching La Casa photo when we already have one.
 *   node scripts/import-amici.mjs
 *   node scripts/import-amici.mjs --photos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const CREDITS = path.join(ROOT, 'marketing', 'partners', 'amici-photo-credits.json');
const LOGO_SRC = path.join(ROOT, 'marketing', 'partners', 'amici-logo.jpg');
const PHOTOS_ONLY = process.argv.includes('--photos');

const PARTNER = {
  slug: 'amici',
  name: 'Amici Lounge & Bar',
  tagline: 'Pica, pasta, sandwich, burger, krepë',
  phone: '+38349713171',
  hours: 'deri 24:00',
  logo: '/uploads/amici-logo.jpg',
};

const sized = (section, name, photo, sizes, description = '') =>
  sizes
    .filter((s) => s.price)
    .map((s) => ({
      section,
      name: `${name} (${s.label})`,
      description: [s.hint, description].filter(Boolean).join(' · '),
      price: s.price,
      photo,
    }));
const item = (section, name, price, photo, description = '') => ({ section, name, price, photo, description });

const MENU = [
  item('Sallatat', 'Sallatë Mix', 3.3, 'sallate-mix', 'Marullë, domate, tranguj, qepë, misër, ullinj'),
  item('Sallatat', 'Sallatë e Gjelbër', 2.5, 'sallate-gjelbert', 'Marullë, tranguj, vaj ulliri, uthull balsamike'),
  item('Sallatat', 'Sallatë Pule', 4, 'sallate-pule', 'Mish pule, marullë, djathë, tranguj, ullinj, misër'),
  item('Sallatat', 'Sallatë Shope', 3, 'sallate-shope', 'Domate, tranguj, djathë, qepë'),
  item('Sallatat', 'Sallatë Tuna', 3.3, 'sallate-tuna', 'Marullë, tuna, qepë, ullinj'),
  item('Sallatat', 'Sallatë Cezare', 3.5, 'sallate-cezar', 'Marullë, bukë e thekur, domate, ullinj, djathë, kastravec'),

  item('Pasta', 'Pasta Bolognese', 4.5, 'pasta-bolonez', 'Mish i bluar, sos domatesh, parmesan'),
  item('Pasta', 'Pasta Arrabiata', 5, 'pasta-arrabiata', 'Sos domatesh, spec djegës, parmesan'),
  item('Pasta', 'Pasta Carbonara', 5, 'pasta-karbonara', 'Proshutë viçi, borzilok, parmesan'),
  item('Pasta', 'Makarona në Tavë', 6, 'pasta-tave', 'Sos, kërpudha, proshutë, kaçkavall'),

  item('Risotto', 'Risotto Primavera', 3.5, 'risotto', 'Risotto me perime sezonale'),
  item('Risotto', 'Risotto me Mish Pule', 4.5, 'risotto-pule', 'Risotto, mish pule, perime sezonale'),
  item('Risotto', 'Risotto me Mish Viçi', 5, 'risotto-vici', 'Risotto, mish viçi, perime sezonale'),

  item('Krepë', 'Crepes Amici', 2.8, 'crepe-amici', 'Nutella, keksa, Bueno, banane, M&M, akullore'),
  item('Krepë', 'Crepes Bueno', 2.5, 'crepe-bueno', 'Nutella, Bueno, keksa të bluara'),
  item('Krepë', 'Crepes Nutella & Keksa', 2.3, 'crepe-nutella', 'Nutella, keksa të bluara'),
  item('Krepë', "Crepes M&M's", 2.3, 'crepe-mms', "Nutella, keksa, M&M's"),
  item('Krepë', 'Crepes me Proshutë dhe Djathë', 3, 'crepe-proshute', 'Proshutë viçi, djathë'),
  item('Krepë', 'Crepes Raffaello', 2.3, 'crepe-raffaello', 'Nutella, keksa të bluara'),
  item('Krepë', 'Crepes Amici Special', 4, 'crepe-special', 'Nutella, keksa, Raffaello, Bueno, banane, arra, mjaltë, akullore'),

  ...sized('Meze', 'Mezë e Nxehtë', 'meze-nxeht', [
    { label: '2 persona', price: 17.7, hint: 'Wings, nuggets, mish pule, perime, patatina, shnicel' },
    { label: '4 persona', price: 33.6, hint: 'Wings, nuggets, mish pule, perime, patatina, shnicel' },
  ]),
  ...sized('Meze', 'Mezë e Ftohtë', 'meze-ftoht', [
    { label: '2 persona', price: 8.3, hint: 'Kaçkavall, suxhuk, proshutë, ullinj, domate, djathë' },
    { label: '4 persona', price: 15.4, hint: 'Kaçkavall, suxhuk, proshutë, ullinj, domate, djathë' },
  ]),

  item('Mëngjesi', 'Omlet Shtëpie', 3.5, 'omlet', 'Vezë, djathë, suxhuk, proshutë, ajvar, domate'),
  item('Mëngjesi', 'Omlet me Vezë në Sy', 2.5, 'omlet-sy', 'Vezë, djathë, domate, tranguj'),
  item('Mëngjesi', 'Llokuma Shtëpie', 3.5, 'llokuma', 'Llokuma, ajvar, djathë, tranguj, domate'),
  item('Mëngjesi', 'Llokuma me Djathë', 2.5, 'llokuma-djath', 'Llokuma, djathë'),

  item('Sandwich', 'Sandwich Amici', 2.8, 'sandwich-amici', 'Sos domatesh, kaçkavall, majonez, patatina'),
  item('Sandwich', 'Sandwich Chicken Pesto', 2.5, 'sandwich-pesto', 'Proshutë pule, pesto, patatina, kaçkavall'),
  item('Sandwich', 'Sandwich Pule', 2.5, 'sandwich-pule', 'Mish pule, kaçkavall, majonez'),
  item('Sandwich', 'Sandwich Tuna', 2.5, 'sandwich-tuna', 'Tuna, kaçkavall, majonez'),
  item('Sandwich', 'Sandwich Proshutë', 2.5, 'sandwich-proshute', 'Proshutë, kaçkavall, majonez'),
  item('Sandwich', 'Sandwich i Ftohtë', 2.5, 'sandwich-ftoht', 'Proshutë, kaçkavall, majonez, domate, marullë, tranguj'),

  ...sized('Pizza', 'Pizza Amici', 'pizza-amici', [
    { label: 'Vogël', price: 4.5 },
    { label: 'Mesatare', price: 6 },
  ], 'Sos, kaçkavall, proshutë, kërpudha, oregano'),
  ...sized('Pizza', 'Pizza Margarita', 'pizza-margarita', [
    { label: 'Vogël', price: 3 },
    { label: 'Mesatare', price: 3.5 },
  ], 'Sos, kaçkavall'),
  ...sized('Pizza', 'Pizza Proshutë', 'pizza-proshute', [
    { label: 'Vogël', price: 3.5 },
    { label: 'Mesatare', price: 4.5 },
  ], 'Sos, kaçkavall, proshutë viçi'),
  ...sized('Pizza', 'Pizza Vegjetariane', 'pizza-veg', [
    { label: 'Vogël', price: 3.5 },
    { label: 'Mesatare', price: 5 },
  ], 'Sos, kaçkavall, speca, domate, kungulleshë'),
  ...sized('Pizza', 'Pizza Pepperoni', 'pizza-pepperoni', [
    { label: 'Vogël', price: 3.5 },
    { label: 'Mesatare', price: 4.5 },
  ], 'Sos, kaçkavall, suxhuk viçi'),
  ...sized('Pizza', 'Pizza Tuna', 'pizza-tuna', [
    { label: 'Vogël', price: 4 },
    { label: 'Mesatare', price: 5 },
  ], 'Sos, kaçkavall, tuna'),
  ...sized('Pizza', 'Pizza Chicken & Broccoli', 'pizza-broccoli', [
    { label: 'Vogël', price: 4.5 },
    { label: 'Mesatare', price: 5.5 },
  ], 'Sos, kaçkavall, broccoli, mish pule'),
  ...sized('Pizza', 'Pizza Proshutë & Funghi', 'pizza-funghi', [
    { label: 'Vogël', price: 3.5 },
    { label: 'Mesatare', price: 4.5 },
  ], 'Sos, kaçkavall, proshutë, kërpudha'),
  ...sized('Pizza', 'Pizza 4 Stinë', 'pizza-stine', [
    { label: 'Vogël', price: 4 },
    { label: 'Mesatare', price: 5.5 },
  ], 'Sos, kaçkavall, proshutë, pule, suxhuk, kërpudha'),

  item('Burger & tava', 'Chicken Burger', 2.8, 'burger-pule', 'Mish pule, kaçkavall, majonez, patatina, marullë, kastravec, domate'),
  item('Burger & tava', 'Cheese Burger', 2.8, 'burger-cheese', 'Mish viçi, kaçkavall, majonez, patatina, marullë'),
  item('Burger & tava', 'Double Cheese Burger', 4, 'burger-double', 'Dy mish viçi, kaçkavall, majonez, patatina, marullë, kastravec, domate'),
  item('Burger & tava', 'Chicken Wings (7 copë)', 5, 'wings'),
  item('Burger & tava', 'Chicken Nuggets (8 copë)', 4, 'nuggets', 'Nuggets, kaçkavall, pomfrit'),
  item('Burger & tava', 'Gyros Greek', 3.3, 'gyros', 'Mish pule, shmand, qepë, marullë'),
  ...sized('Burger & tava', 'File Pule', 'file-pule', [
    { label: 'Vogël', price: 4 },
    { label: 'Mesatare', price: 5.5 },
  ], 'Mish pule, sallatë, sos, patatina, perime'),
  ...sized('Burger & tava', 'Mish Ferre', 'mish-ferre', [
    { label: 'Vogël', price: 5.5 },
    { label: 'Mesatare', price: 9.5 },
  ], 'Mish viçi, sos, perime, patatina'),
  item('Burger & tava', 'Mish i Kombinar', 10, 'mish-kombinar', 'Sallatë, sos, perime, patatina'),
  item('Burger & tava', 'Patate', 1.8, 'patate', 'Të fërguara, majonez shtëpie'),
  item('Burger & tava', 'Kids Menu', 3.3, 'kids', 'Nuggets, pomfrit, leng, chips, banane'),
  item('Burger & tava', 'Pomfrit', 1.3, 'pomfrit', 'Të fërguara, majonez shtëpie'),
];

const POPULAR = new Set(['Pizza Amici (Mesatare)', 'Pizza Margarita (Mesatare)', 'Sandwich Amici', 'Crepes Amici']);

const REUSE = {
  'sallate-gjelbert': 'lacasa-sallate-gjelbert',
  'sallate-pule': 'lacasa-sallate-pule',
  'sallate-shope': 'lacasa-shope',
  'pasta-bolonez': 'lacasa-bolonez',
  'pasta-karbonara': 'lacasa-karbonara',
  omlet: 'lacasa-omlet',
  'sandwich-pule': 'lacasa-sandwich-pule',
  'sandwich-tuna': 'lacasa-sandwich-tuna',
  'sandwich-proshute': 'lacasa-sandwich-proshute',
  'pizza-margarita': 'lacasa-margarita',
  'pizza-proshute': 'lacasa-proshute',
  'pizza-veg': 'lacasa-vegjetariane',
  'pizza-pepperoni': 'lacasa-peperoni',
  'pizza-tuna': 'lacasa-tuna',
  'pizza-funghi': 'lacasa-fungi-proshute',
  'pizza-stine': 'lacasa-stinore',
  'pizza-amici': 'lacasa-pizza-lacasa',
  'burger-pule': 'lacasa-hamburger-pule',
  'burger-cheese': 'lacasa-hamburger',
  'file-pule': 'lacasa-file-pule',
  pomfrit: 'lacasa-pomfrit',
  patate: 'lacasa-pomfrit',
  'meze-ftoht': 'lacasa-menze',
  'crepe-mms': 'amici-crepe-amici',
  'crepe-special': 'amici-crepe-amici',
  'llokuma-djath': 'amici-llokuma',
  kids: 'amici-nuggets',
  'omlet-sy': 'lacasa-veze',
};

const SEARCH = {
  'sallate-mix': 'mixed green salad tomatoes cucumber',
  'sallate-tuna': 'tuna salad plate',
  'sallate-cezar': 'caesar salad',
  'pasta-arrabiata': 'penne arrabiata',
  'pasta-tave': 'baked pasta casserole',
  risotto: 'vegetable risotto',
  'risotto-pule': 'chicken risotto',
  'risotto-vici': 'beef risotto',
  'crepe-amici': 'nutella crepe banana',
  'crepe-bueno': 'chocolate crepe',
  'crepe-nutella': 'nutella crepe',
  'crepe-mms': 'crepe chocolate candy',
  'crepe-proshute': 'savory ham cheese crepe',
  'crepe-raffaello': 'white chocolate crepe',
  'crepe-special': 'loaded nutella crepe',
  'meze-nxeht': 'fried snacks platter wings nuggets',
  'omlet-sy': 'fried eggs omelette',
  llokuma: 'mekitsa',
  'llokuma-djath': 'fried dough cheese',
  'sandwich-amici': 'toasted sandwich fries',
  'sandwich-pesto': 'chicken pesto sandwich',
  'sandwich-ftoht': 'cold ham sandwich lettuce tomato',
  'pizza-broccoli': 'chicken broccoli pizza',
  'burger-double': 'double cheeseburger homemade',
  wings: 'chicken wings plate',
  nuggets: 'chicken nuggets fries',
  gyros: 'chicken gyros pita',
  'mish-ferre': 'grilled steak plate fries',
  'mish-kombinar': 'mixed grill plate',
  kids: 'kids meal nuggets fries',
};
const PICK = {
  'sallate-cezar': 'File:Caesar salad (1).jpg',
  'pasta-arrabiata': "File:Penne all'arrabbiata.jpg",
  risotto: 'File:Risotto.jpg',
  gyros: 'File:Pita giros.JPG',
  wings: 'File:Chicken wings for lunch.jpg',
  'crepe-proshute': 'File:Ham & Cheese Galettes 1of4 (8736292056).jpg',
  'meze-nxeht': 'File:Honey glazed chicken nuggets with French fries and salsa.jpg',
  'mish-ferre': 'File:Grilled Steak.jpg',
};

const UA = 'VND-partner-import/1.0 (https://vndviti.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commons(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error('Commons API failed');
}

async function findPhoto(key) {
  const info = { prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '600' };
  const data = PICK[key]
    ? await commons({ action: 'query', titles: PICK[key], ...info })
    : await commons({ action: 'query', generator: 'search', gsrsearch: `${SEARCH[key]} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '12', ...info });
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) continue;
    const ratio = ii.width / ii.height;
    if (!PICK[key] && (ii.width < 700 || ratio < 0.65 || ratio > 1.9)) continue;
    const m = ii.extmetadata || {};
    return {
      title: p.title,
      thumb: ii.thumburl,
      page: ii.descriptionurl,
      author: strip(m.Artist?.value) || 'unknown',
      license: strip(m.LicenseShortName?.value) || 'see page',
    };
  }
  return null;
}

async function downloadPhotos() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(path.dirname(CREDITS), { recursive: true });
  const credits = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, 'utf8')) : {};
  const keys = [...new Set(MENU.map((m) => m.photo))];
  for (const key of keys) {
    const dest = path.join(UPLOADS, `amici-${key}.jpg`);
    const reuse = REUSE[key] && path.join(UPLOADS, `${REUSE[key]}.jpg`);
    if (reuse && fs.existsSync(reuse)) {
      if (!fs.existsSync(dest)) fs.copyFileSync(reuse, dest);
      credits[key] = { reused: REUSE[key] };
      continue;
    }
    if (fs.existsSync(dest) && credits[key] && (!PICK[key] || credits[key].title === PICK[key])) continue;
    const photo = await findPhoto(key);
    if (!photo) {
      console.warn(`no photo for ${key} (${SEARCH[key] || ''})`);
      continue;
    }
    const res = await fetch(photo.thumb, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      console.warn(`download failed for ${key}: ${res.status}`);
      continue;
    }
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    credits[key] = { title: photo.title, page: photo.page, author: photo.author, license: photo.license };
    fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
    console.log(`photo ${key}: ${photo.title}`);
    await sleep(400);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, path.join(UPLOADS, 'amici-logo.jpg'));
  else console.warn('logo missing: ' + LOGO_SRC);
}

function importMenu() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO partners (slug, name, tagline, logo_url, phone, hours, active, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, logo_url=excluded.logo_url,
         phone=excluded.phone, hours=excluded.hours, active=1, sort=1`,
    ).run(PARTNER.slug, PARTNER.name, PARTNER.tagline, PARTNER.logo, PARTNER.phone, PARTNER.hours, now);

    const names = new Set(MENU.map((m) => m.name));
    const ordered = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1');
    for (const row of db.prepare('SELECT id, name FROM products WHERE partner = ?').all(PARTNER.slug)) {
      if (names.has(row.name)) continue;
      if (ordered.get(row.id)) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(row.id);
      else db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    }

    const sortBase = 6000;
    const find = db.prepare('SELECT id FROM products WHERE partner = ? AND name = ?');
    const update = db.prepare(
      `UPDATE products SET description=?, category='food', price_cents=?, cost_cents=?, image_url=?, accent=?, available=1,
         popular=?, sort=?, section=?, updated_at=? WHERE id=?`,
    );
    const insert = db.prepare(
      `INSERT INTO products (name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort,
         partner, section, created_at, updated_at)
       VALUES (?, ?, 'food', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    );
    MENU.forEach((m, i) => {
      const cents = Math.round(m.price * 100);
      const photo = fs.existsSync(path.join(UPLOADS, `amici-${m.photo}.jpg`)) ? `/uploads/amici-${m.photo}.jpg` : '';
      const popular = POPULAR.has(m.name) ? 1 : 0;
      const existing = find.get(PARTNER.slug, m.name);
      if (existing) update.run(m.description, cents, cents, photo, '#1B3D32', popular, sortBase + i, m.section, now, existing.id);
      else insert.run(m.name, m.description, cents, cents, photo, '#1B3D32', popular, sortBase + i, PARTNER.slug, m.section, now, now);
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

await downloadPhotos();
if (!PHOTOS_ONLY) {
  await import('../server/db.js');
  importMenu();
}
