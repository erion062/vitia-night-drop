#!/usr/bin/env node
/**
 * Remove Andi Market catalog rows and generated pack photos.
 * Keeps the Andi partner shop, logo, and /partner login.
 * Does not touch VND products, orders, customers, or .env.
 *
 *   node scripts/clear-andi-products.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'data', 'vnd.db');
const UPLOADS = path.join(ROOT, 'data', 'uploads');

if (!fs.existsSync(DB_PATH)) {
  console.error('No data/vnd.db found.');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');

const before = db.prepare("SELECT COUNT(*) AS n FROM products WHERE partner = 'andi'").get().n;
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare("DELETE FROM products WHERE partner = 'andi'").run();
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  db.close();
  throw err;
}
const after = db.prepare("SELECT COUNT(*) AS n FROM products WHERE partner = 'andi'").get().n;
const partner = db.prepare("SELECT slug, name FROM partners WHERE slug = 'andi'").get();
db.close();

let photos = 0;
if (fs.existsSync(UPLOADS)) {
  for (const name of fs.readdirSync(UPLOADS)) {
    if (!name.startsWith('andi-') || name === 'andi-logo.svg') continue;
    fs.rmSync(path.join(UPLOADS, name), { force: true });
    photos += 1;
  }
}

const credits = path.join(ROOT, 'marketing', 'partners', 'andi-photo-credits.json');
if (fs.existsSync(credits)) fs.rmSync(credits);

console.log(`Andi products removed: ${before} → ${after}. Deleted ${photos} pack photos.`);
console.log(partner ? `Kept partner shop ${partner.name} (${partner.slug}) and logo.` : 'Andi partner row was not in this database.');
