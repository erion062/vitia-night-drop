import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Code-only Hostinger update. Does not ship data/vnd.db, uploads, or .env —
// those stay on the live server so orders, customers, and logins are not wiped.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(ROOT, 'dist', 'index.html');
if (!fs.existsSync(dist)) {
  console.error('Run npm run build first.');
  process.exit(1);
}

const staging = path.join(ROOT, 'data', '_update-staging');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const copyDir = (from, to, skip = new Set()) => {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(src, dst, skip);
    else fs.copyFileSync(src, dst);
  }
};

copyDir(path.join(ROOT, 'server'), path.join(staging, 'server'));
copyDir(path.join(ROOT, 'src'), path.join(staging, 'src'));
copyDir(path.join(ROOT, 'dist'), path.join(staging, 'dist'));
if (fs.existsSync(path.join(ROOT, 'public'))) copyDir(path.join(ROOT, 'public'), path.join(staging, 'public'));
for (const f of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(staging, f));
}

const pkgPath = path.join(staging, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = {
  ...pkg.scripts,
  build: "node -e \"console.log('[vnd] using prebuilt dist')\"",
  start: 'node server/hostinger.cjs',
};
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

fs.writeFileSync(
  path.join(staging, 'UPDATE.txt'),
  `VND update zip — code only

This zip does NOT contain:
  data/vnd.db     (orders, customers, products, visitors)
  data/uploads/   (product photos)
  .env            (admin / Andi passwords)

How to deploy on Hostinger
1. Stop the Node app in hPanel.
2. Optional but wise: download the live "data" folder as a backup.
3. Upload this zip into the SAME app folder and extract / overwrite.
   Do not delete the existing "data" folder or ".env".
4. Start the Node app.

New database tables (for example Visitors) are created automatically on start.
Existing rows are left alone.

Use vnd-hostinger.zip only for a first install or a full reset (that one
replaces the database and will lose live orders).
`,
);

const zipPath = path.join(ROOT, '..', 'vnd-update.zip');
fs.rmSync(zipPath, { force: true });
const tar = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', staging, '.'], { stdio: 'inherit' });
if (tar.status !== 0) process.exit(tar.status || 1);
fs.copyFileSync(path.join(staging, 'UPDATE.txt'), path.join(ROOT, '..', 'vnd-update-how.txt'));
fs.rmSync(staging, { recursive: true, force: true });
const mb = (fs.statSync(zipPath).size / 1e6).toFixed(1);
console.log(`wrote ${zipPath} (${mb} MB) — code only, live data stays on the server`);
