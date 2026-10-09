#!/usr/bin/env node
/**
 * Adds partner restaurant Pizza La Casa (Viti) with its full menu.
 * Prices are La Casa's own menu prices (Oct 2026); VND pays the same price at pickup, so cost = price.
 * Photos: ordinary dish photos from Wikimedia Commons (free licences), credits in
 * marketing/partners/lacasa-photo-credits.json. Re-running only downloads missing photos.
 *   node scripts/import-lacasa.mjs            photos + database
 *   node scripts/import-lacasa.mjs --photos   photos only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const CREDITS = path.join(ROOT, 'marketing', 'partners', 'lacasa-photo-credits.json');
const LOGO_SRC = path.join(ROOT, 'marketing', 'partners', 'lacasa-logo.jpg');
const PHOTOS_ONLY = process.argv.includes('--photos');

const PARTNER = {
  slug: 'lacasa',
  name: 'Pizza La Casa',
  short: 'La Casa',
  tagline: 'Pica, sandviçe, hamburger, skarë',
  phone: '+38345209210',
  hours: '08:00–24:00',
  logo: '/uploads/lacasa-logo.jpg',
};

const SIZES = { '22cm': 'Fëmijë', '30cm': 'Individuale', '40cm': 'Ndarje / sharing', '60cm': 'Familjare' };
const pizza = (name, photo, prices) =>
  Object.keys(SIZES)
    .map((size, i) => prices[i] && { name: `${name} (${size})`, description: SIZES[size], price: prices[i], photo, section: 'Pizza' })
    .filter(Boolean);
const item = (section, name, price, photo, description = '') => ({ section, name, price, photo, description });

const MENU = [
  ...pizza('Pizza Margarita', 'margarita', [2.5, 4, 7, 15]),
  ...pizza('Pizza Proshutë', 'proshute', [3, 5, 8, 18]),
  ...pizza('Pizza Fungi', 'fungi', [2.5, 5, 8, 16]),
  ...pizza('Pizza Fungi-Proshutë', 'fungi-proshute', [3, 5, 8, 18]),
  ...pizza('Pizza Vegjetariane', 'vegjetariane', [3, 5, 8, 16]),
  ...pizza('Pizza Peperoni', 'peperoni', [2.5, 5, 8, 17]),
  ...pizza('Pizza 4 Stinore', 'stinore', [0, 6, 8, 18]),
  ...pizza('Pizza Tuna', 'tuna', [3, 6, 9, 20]),
  ...pizza('Pizza Kalabreze', 'kalabreze', [3, 6, 9, 18]),
  ...pizza('Pizza La Casa', 'pizza-lacasa', [3, 6, 9, 20]),
  ...pizza('Pizza Mish Pule', 'pizza-pule', [3, 6, 9, 20]),
  ...pizza('Pizza Nutella', 'nutella', [0, 7, 10, 0]),
  ...pizza('Pizza Dyner Familjar', 'dyner', [3, 6, 9, 20]),

  item('Sandwich', 'Sandwich La Casa', 3, 'sandwich-lacasa'),
  item('Sandwich', 'Sandwich Pule', 3, 'sandwich-pule'),
  item('Sandwich', 'Sandwich Tuna', 3, 'sandwich-tuna'),
  item('Sandwich', 'Sandwich Proshut me Vezë', 3, 'sandwich-veze'),
  item('Sandwich', 'Sandwich Proshutë', 2.5, 'sandwich-proshute'),
  item('Sandwich', 'Tosta Proshut', 2.5, 'tosta'),
  item('Sandwich', 'Sandwich në Pet Pule', 3.5, 'pet-pule', 'Me pete tortilla'),
  item('Sandwich', 'Sandwich La Casa Pet', 3.5, 'pet-lacasa', 'Me pete tortilla'),

  item('Hamburger', 'Hamburger Classic', 2, 'hamburger'),
  item('Hamburger', 'Hamburger me Vezë', 2.5, 'hamburger-veze'),
  item('Hamburger', 'Hamburger me Mish Pule', 3, 'hamburger-pule'),
  item('Hamburger', 'Hamburger me Pomfrit', 2.5, 'hamburger-pomfrit'),
  item('Hamburger', 'Extra Vezë', 0.5, 'veze', 'Shtesë për hamburger'),

  item('Tacos', 'Tacos XL', 3, 'tacos'),
  item('Tacos', 'Tacos XXL', 4, 'tacos'),

  item('Kombinim Skarë', 'Kombinim Skarë', 10, 'skare'),
  item('Kombinim Skarë', 'Mish Viçi Porcion', 10, 'vici'),
  item('Kombinim Skarë', 'Pleskavicë Classic', 5, 'pleskavice'),
  item('Kombinim Skarë', 'Pleskavicë e Mbushur', 7, 'pleskavice'),
  item('Kombinim Skarë', 'Bërxoll Pule', 7, 'berxoll-pule'),
  item('Kombinim Skarë', 'File Pule', 5, 'file-pule'),
  item('Kombinim Skarë', 'Sallatë Pule', 5, 'sallate-pule'),

  item('Sallatat', 'Sallatë e Gjelbërt (e vogël)', 3, 'sallate-gjelbert', 'E vogël'),
  item('Sallatat', 'Sallatë e Gjelbërt (e madhe)', 5, 'sallate-gjelbert', 'E madhe'),
  item('Sallatat', 'Sallatë Shope (e vogël)', 3, 'shope', 'E vogël'),
  item('Sallatat', 'Sallatë Shope (e madhe)', 5, 'shope', 'E madhe'),
  item('Sallatat', 'Sallatë Greke (e vogël)', 3, 'greke', 'E vogël'),
  item('Sallatat', 'Sallatë Greke (e madhe)', 5, 'greke', 'E madhe'),

  item('Pasta & Pomfrit', 'Makarona Karbonara', 5, 'karbonara'),
  item('Pasta & Pomfrit', 'Makarona Bolonez', 5, 'bolonez'),
  item('Pasta & Pomfrit', 'Chicken Fingers', 7, 'fingers'),
  item('Pasta & Pomfrit', 'Pomfrita', 2, 'pomfrit'),
  item('Pasta & Pomfrit', 'Pomfrit Kaqkavall', 3.5, 'pomfrit-kackavall'),

  item('Mëngjesi', 'Omleti', 3, 'omlet'),
  item('Mëngjesi', 'Petulla, Djath, Ajvar', 3.5, 'petulla'),

  item('Specialitete', 'Menze e Ftohtë (1 person)', 5, 'menze', '1 person'),
  item('Specialitete', 'Menze e Ftohtë (2 persona)', 10, 'menze', '2 persona'),
  item('Specialitete', 'Menze e Ftohtë (3–4 persona)', 20, 'menze', '3–4 persona'),
  item('Specialitete', 'Sos Secret', 1, 'sos', 'Salca e shtëpisë'),
];

const POPULAR = new Set(['Pizza Margarita (30cm)', 'Pizza La Casa (30cm)', 'Sandwich La Casa']);

// Wikimedia Commons searches; the first ordinary-looking JPEG wins. PICK pins a specific file.
const SEARCH = {
  margarita: 'pizza margherita',
  proshute: 'ham pizza',
  fungi: 'mushroom pizza',
  'fungi-proshute': 'ham mushroom pizza',
  vegjetariane: 'vegetarian pizza',
  peperoni: 'pepperoni pizza',
  stinore: 'pizza quattro stagioni',
  tuna: 'tuna pizza',
  kalabreze: 'salami pizza',
  'pizza-lacasa': 'pizza capricciosa',
  'pizza-pule': 'chicken pizza',
  nutella: 'nutella pizza',
  dyner: 'kebab pizza',
  'sandwich-lacasa': 'sandwich baguette ham cheese',
  'sandwich-pule': 'chicken sandwich',
  'sandwich-tuna': 'tuna sandwich',
  'sandwich-veze': 'egg ham sandwich',
  'sandwich-proshute': 'ham sandwich',
  tosta: 'ham cheese toast sandwich',
  'pet-pule': 'chicken wrap',
  'pet-lacasa': 'wrap tortilla sandwich',
  hamburger: 'hamburger',
  'hamburger-veze': 'burger fried egg',
  'hamburger-pule': 'chicken burger',
  'hamburger-pomfrit': 'burger and fries',
  veze: 'fried egg',
  tacos: 'french tacos',
  skare: 'mixed grill meat',
  vici: 'grilled veal',
  pleskavice: 'pljeskavica',
  'berxoll-pule': 'grilled chicken breast',
  'file-pule': 'chicken fillet plate',
  'sallate-pule': 'chicken salad',
  'sallate-gjelbert': 'green salad',
  shope: 'shopska salad',
  greke: 'greek salad',
  karbonara: 'spaghetti carbonara',
  bolonez: 'spaghetti bolognese',
  fingers: 'chicken fingers',
  pomfrit: 'french fries',
  'pomfrit-kackavall': 'cheese fries',
  omlet: 'omelette',
  petulla: 'mekitsa',
  menze: 'meat cheese platter',
  sos: 'garlic sauce',
};
const PICK = {
  proshute: 'File:Pizza Ham & Cheese (4254288665).jpg',
  fungi: 'File:Pizza Funghi mit Pizzahalter.JPG',
  'fungi-proshute': 'File:Pizza prosciutto e funghi, Edingen.jpg',
  peperoni: 'File:Pepperoni and mushroom pizza - Massachusetts.jpg',
  hamburger: 'File:Homemade cheeseburger.jpg',
  'sandwich-proshute': 'File:Ham and cheese sandwich.jpg',
  skare: 'File:Platter meat and sausage with potato slices.jpg',
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
  throw new Error('Commons API failed: ' + url);
}

async function findPhoto(key) {
  const info = { prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '600' };
  const data = PICK[key]
    ? await commons({ action: 'query', titles: PICK[key], ...info })
    : await commons({ action: 'query', generator: 'search', gsrsearch: `${SEARCH[key]} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15', ...info });
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) continue;
    const ratio = ii.width / ii.height;
    if (!PICK[key] && (ii.width < 800 || ratio < 0.7 || ratio > 1.8)) continue;
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
    const file = path.join(UPLOADS, `lacasa-${key}.jpg`);
    if (fs.existsSync(file) && credits[key] && (!PICK[key] || credits[key].title === PICK[key])) continue;
    const photo = await findPhoto(key);
    if (!photo) {
      console.warn(`no photo for ${key} (${SEARCH[key]})`);
      continue;
    }
    const res = await fetch(photo.thumb, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      console.warn(`download failed for ${key}: ${res.status}`);
      continue;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    credits[key] = { title: photo.title, page: photo.page, author: photo.author, license: photo.license };
    fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
    console.log(`photo ${key}: ${photo.title}`);
    await sleep(400);
  }
  if (fs.existsSync(LOGO_SRC)) fs.copyFileSync(LOGO_SRC, path.join(UPLOADS, 'lacasa-logo.jpg'));
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
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name, tagline=excluded.tagline, logo_url=excluded.logo_url,
         phone=excluded.phone, hours=excluded.hours, active=1`,
    ).run(PARTNER.slug, PARTNER.name, PARTNER.tagline, PARTNER.logo, PARTNER.phone, PARTNER.hours, now);

    const names = new Set(MENU.map((m) => m.name));
    const ordered = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1');
    for (const row of db.prepare('SELECT id, name FROM products WHERE partner = ?').all(PARTNER.slug)) {
      if (names.has(row.name)) continue;
      if (ordered.get(row.id)) db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(row.id);
      else db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    }

    const sortBase = 5000;
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
      const photo = fs.existsSync(path.join(UPLOADS, `lacasa-${m.photo}.jpg`)) ? `/uploads/lacasa-${m.photo}.jpg` : '';
      const popular = POPULAR.has(m.name) ? 1 : 0;
      const existing = find.get(PARTNER.slug, m.name);
      if (existing) update.run(m.description, cents, cents, photo, '#E53935', popular, sortBase + i, m.section, now, existing.id);
      else insert.run(m.name, m.description, cents, cents, photo, '#E53935', popular, sortBase + i, PARTNER.slug, m.section, now, now);
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
