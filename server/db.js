import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { SEED_PRODUCTS } from './seed.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

export const CATEGORIES = ['drinks', 'food', 'snacks', 'cigarettes', 'other'];

function productsTable(name) {
  return `CREATE TABLE IF NOT EXISTS ${name} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN (${CATEGORIES.map((c) => `'${c}'`).join(', ')})),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    image_url TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#00FF66',
    available INTEGER NOT NULL DEFAULT 1,
    popular INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`;
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  ${productsTable('products')}

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','PURCHASING','PURCHASED','ON_THE_WAY','DELIVERED','CANCELLED')),
    payment_method TEXT NOT NULL DEFAULT 'cash',
    subtotal_cents INTEGER NOT NULL,
    delivery_fee_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL,
    fuel_cost_cents INTEGER NOT NULL,
    eta_from TEXT,
    eta_to TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    purchasing_at TEXT,
    purchased_at TEXT,
    on_the_way_at TEXT,
    delivered_at TEXT,
    cancelled_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_cents INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);

  -- Only the driver's latest position is kept (one row); no location history is stored.
  CREATE TABLE IF NOT EXISTS driver_locations (
    driver_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    accuracy REAL,
    heading REAL,
    speed REAL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  -- Partner shops whose menu VND sells; their products carry products.partner = slug.
  CREATE TABLE IF NOT EXISTS partners (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    hours TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'promo' CHECK (tone IN ('promo', 'info', 'warning')),
    created_at TEXT NOT NULL,
    expires_at TEXT,
    removed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS visitor_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL DEFAULT '',
    user_phone TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    last_path TEXT NOT NULL DEFAULT '',
    last_label TEXT NOT NULL DEFAULT '',
    last_kind TEXT NOT NULL DEFAULT '',
    pages INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS visitor_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_visitor_sessions_seen ON visitor_sessions(last_seen);
  CREATE INDEX IF NOT EXISTS idx_visitor_events_vid ON visitor_events(visitor_id, id);
  CREATE INDEX IF NOT EXISTS idx_visitor_events_at ON visitor_events(at);
`);

// SQLite cannot alter a CHECK constraint, so an older products table is rebuilt once with the new category list.
const productsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'").get()?.sql || '';
if (CATEGORIES.some((c) => !productsSql.includes(`'${c}'`))) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(productsTable('products_new'));
    db.exec('INSERT INTO products_new SELECT id, name, description, category, price_cents, cost_cents, image_url, accent, available, popular, sort, created_at, updated_at FROM products');
    db.exec('DROP TABLE products');
    db.exec('ALTER TABLE products_new RENAME TO products');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// Columns added after launch; SQLite has no "ADD COLUMN IF NOT EXISTS".
const orderCols = new Set(db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name));
for (const [name, def] of [
  ['discount_cents', 'INTEGER NOT NULL DEFAULT 0'],
  ['discount_label', "TEXT NOT NULL DEFAULT ''"],
  ['cash_received_cents', 'INTEGER'],
]) {
  if (!orderCols.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${def}`);
}
const productCols = new Set(db.prepare('PRAGMA table_info(products)').all().map((c) => c.name));
for (const [name, def] of [
  ['partner', "TEXT NOT NULL DEFAULT ''"],
  ['section', "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!productCols.has(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${def}`);
}
const partnerCols = new Set(db.prepare('PRAGMA table_info(partners)').all().map((c) => c.name));
if (!partnerCols.has('kind')) db.exec("ALTER TABLE partners ADD COLUMN kind TEXT NOT NULL DEFAULT 'restaurant'");

// Partner shop logins need role=partner and partner_slug. SQLite cannot alter a CHECK.
const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
if (!usersSql.includes("'partner'") || !userCols.has('partner_slug')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'partner')),
      partner_slug TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    if (userCols.has('partner_slug')) {
      db.exec('INSERT INTO users_new SELECT id, full_name, phone, password_hash, role, partner_slug, created_at FROM users');
    } else {
      db.exec("INSERT INTO users_new SELECT id, full_name, phone, password_hash, role, '', created_at FROM users");
    }
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function seedProductsIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n > 0) return;
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO products (name, description, category, price_cents, cost_cents, accent, popular, sort, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  tx(() => {
    SEED_PRODUCTS.forEach((p, i) => {
      insert.run(p.name, p.description, p.category, p.price, p.cost, p.accent, p.popular ? 1 : 0, i, now, now);
    });
  });
  console.log(`[vnd] Seeded ${SEED_PRODUCTS.length} catalog products.`);
}
