import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destDb = path.join(ROOT, 'data', 'vnd-launch.db');
for (const f of [destDb, destDb + '-wal', destDb + '-shm']) fs.rmSync(f, { force: true });

const live = new DatabaseSync(path.join(ROOT, 'data', 'vnd.db'));
live.exec(`VACUUM INTO '${destDb.replaceAll('\\', '/')}'`);
live.close();

const db = new DatabaseSync(destDb);
db.exec(`
  PRAGMA foreign_keys = ON;
  DELETE FROM order_items;
  DELETE FROM order_status_history;
  DELETE FROM orders;
  DELETE FROM sessions;
  DELETE FROM password_reset_requests;
  DELETE FROM driver_locations;
  DELETE FROM announcements;
  DELETE FROM visitor_events;
  DELETE FROM visitor_sessions;
  DELETE FROM users WHERE role = 'customer';
  DELETE FROM users WHERE role = 'admin';
  DELETE FROM users WHERE role = 'partner';
  VACUUM;
`);
const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
const products = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
db.close();
console.log(`launch db: ${users} user(s), ${products} products`);

const staging = path.join(ROOT, 'data', '_launch-staging');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const copyDir = (from, to, skip) => {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(src, dst, skip);
    else fs.copyFileSync(src, dst);
  }
};

copyDir(path.join(ROOT, 'server'), path.join(staging, 'server'), new Set());
copyDir(path.join(ROOT, 'src'), path.join(staging, 'src'), new Set());
copyDir(path.join(ROOT, 'dist'), path.join(staging, 'dist'), new Set());
if (fs.existsSync(path.join(ROOT, 'public'))) copyDir(path.join(ROOT, 'public'), path.join(staging, 'public'), new Set());
fs.mkdirSync(path.join(staging, 'data', 'uploads'), { recursive: true });
copyDir(path.join(ROOT, 'data', 'uploads'), path.join(staging, 'data', 'uploads'), new Set());
fs.copyFileSync(destDb, path.join(staging, 'data', 'vnd.db'));
for (const f of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(staging, f));
}

// Hostinger Express deploys run `npm run build` after a production npm install,
// which does not include Vite. dist/ is already in this zip.
const pkgPath = path.join(staging, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = {
  ...pkg.scripts,
  build: "node -e \"console.log('[vnd] using prebuilt dist')\"",
  start: 'node server/hostinger.cjs',
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const password = process.env.LAUNCH_ADMIN_PASSWORD || ('VndLive-' + crypto.randomBytes(6).toString('base64url'));
const andiPassword = process.env.LAUNCH_ANDI_PASSWORD || ('AndiLive-' + crypto.randomBytes(6).toString('base64url'));
const env = `NODE_ENV=production
HOST=0.0.0.0
DB_PATH=data/vnd.db
UPLOADS_DIR=data/uploads
ADMIN_PHONE=044000000
ADMIN_PASSWORD=${password}
ADMIN_NAME=Whitey
ANDI_PHONE=045453998
ANDI_PASSWORD=${andiPassword}
ANDI_NAME=Andi Market
ALLOWED_ORIGINS=https://vndviti.com,https://www.vndviti.com,https://limegreen-camel-225876.hostingersite.com
COOKIE_SECURE=true
TRUST_PROXY=true
`;
fs.writeFileSync(path.join(staging, '.env'), env);
fs.writeFileSync(
  path.join(ROOT, '..', 'vnd-admin-login.txt'),
  `VND admin\nPhone: 044000000\nPassword: ${password}\n\nAndi Market (his own dashboard)\nPhone: 045453998\nPassword: ${andiPassword}\nURL: https://vndviti.com/partner\n`,
);

const zipPath = path.join(ROOT, '..', 'vnd-hostinger.zip');
fs.rmSync(zipPath, { force: true });
const tar = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', staging, '.'], { stdio: 'inherit' });
if (tar.status !== 0) process.exit(tar.status || 1);
fs.rmSync(staging, { recursive: true, force: true });
const mb = (fs.statSync(zipPath).size / 1e6).toFixed(1);
console.log(`wrote ${zipPath} (${mb} MB)`);
console.warn('This is a FIRST INSTALL / RESET zip. It replaces the live database.');
console.warn('For normal updates use: npm run zip  →  Desktop\\vnd-update.zip');
