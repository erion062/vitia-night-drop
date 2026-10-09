import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Hostinger Git deploys live under hbuilds/current/nodejs and wipe that folder
// on every push. Keep the shop database next to the domain, not inside the build.
function posixPath(p) {
  return String(p).replace(/\\/g, '/');
}

function hostingerPersistentDir() {
  const n = posixPath(ROOT);
  const i = n.indexOf('/hbuilds/');
  if (i === -1) return '';
  return path.join(n.slice(0, i), 'persistent');
}

function insideHbuilds(absPath) {
  return posixPath(absPath).includes('/hbuilds/');
}

function resolveShopPath(envValue, fileName) {
  const persist = hostingerPersistentDir();
  const fallback = path.join(persist || path.join(ROOT, 'data'), fileName);
  if (!envValue) return fallback;
  const resolved = path.resolve(ROOT, envValue);
  if (persist && insideHbuilds(resolved)) return fallback;
  return resolved;
}

function copyFileIfMissing(src, dest) {
  if (!src || src === dest || !fs.existsSync(src) || fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDbIfMissing(srcDb, destDb) {
  if (!copyFileIfMissing(srcDb, destDb)) return false;
  for (const extra of ['-wal', '-shm']) copyFileIfMissing(srcDb + extra, destDb + extra);
  return true;
}

function copyUploadsIfEmpty(srcDir, destDir) {
  if (!srcDir || srcDir === destDir || !fs.existsSync(srcDir)) return false;
  if (fs.existsSync(destDir) && fs.readdirSync(destDir).length) return false;
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
  return true;
}

const dbPath = resolveShopPath(env.DB_PATH, 'vnd.db');
const uploadsDir = resolveShopPath(env.UPLOADS_DIR, 'uploads');

const persistDir = hostingerPersistentDir();
if (persistDir) {
  const domainRoot = path.dirname(persistDir);
  const dbCandidates = [];
  if (env.DB_PATH) dbCandidates.push(path.resolve(ROOT, env.DB_PATH));
  dbCandidates.push(
    path.join(ROOT, 'data', 'vnd.db'),
    path.resolve(ROOT, '..', 'previous', 'nodejs', 'data', 'vnd.db'),
    path.resolve(ROOT, '..', '..', 'previous', 'nodejs', 'data', 'vnd.db'),
    path.join(domainRoot, 'hbuilds', 'last-source', 'data', 'vnd.db'),
    path.join(domainRoot, 'hbuilds', 'previous', 'nodejs', 'data', 'vnd.db'),
    path.join(domainRoot, 'hbuilds', 'current', 'nodejs', 'data', 'vnd.db'),
    path.join(domainRoot, 'data', 'vnd.db'),
    path.join(domainRoot, 'nodejs', 'data', 'vnd.db'),
    path.join(domainRoot, 'public_html', 'data', 'vnd.db'),
  );
  const versionsDir = path.join(domainRoot, 'hbuilds', 'versions');
  if (fs.existsSync(versionsDir)) {
    for (const name of fs.readdirSync(versionsDir)) {
      dbCandidates.push(path.join(versionsDir, name, 'nodejs', 'data', 'vnd.db'));
    }
  }
  for (const src of dbCandidates) {
    if (copyDbIfMissing(src, dbPath)) {
      console.warn(`[vnd] Copied existing shop database to ${dbPath} so Git deploys will not wipe it.`);
      break;
    }
  }
  const uploadCandidates = [];
  if (env.UPLOADS_DIR) uploadCandidates.push(path.resolve(ROOT, env.UPLOADS_DIR));
  uploadCandidates.push(
    path.join(ROOT, 'data', 'uploads'),
    path.resolve(ROOT, '..', 'previous', 'nodejs', 'data', 'uploads'),
    path.resolve(ROOT, '..', '..', 'previous', 'nodejs', 'data', 'uploads'),
    path.join(domainRoot, 'hbuilds', 'last-source', 'data', 'uploads'),
    path.join(domainRoot, 'hbuilds', 'previous', 'nodejs', 'data', 'uploads'),
    path.join(domainRoot, 'hbuilds', 'current', 'nodejs', 'data', 'uploads'),
    path.join(domainRoot, 'data', 'uploads'),
    path.join(domainRoot, 'nodejs', 'data', 'uploads'),
    path.join(domainRoot, 'public_html', 'data', 'uploads'),
  );
  if (fs.existsSync(versionsDir)) {
    for (const name of fs.readdirSync(versionsDir)) {
      uploadCandidates.push(path.join(versionsDir, name, 'nodejs', 'data', 'uploads'));
    }
  }
  for (const src of uploadCandidates) {
    if (copyUploadsIfEmpty(src, uploadsDir)) {
      console.warn(`[vnd] Copied existing product photos to ${uploadsDir}.`);
      break;
    }
  }
  console.warn(`[vnd] Shop database at ${dbPath}`);
}

export const config = {
  isProd,
  port: Number(env.PORT) || 8787,
  host: env.HOST || '0.0.0.0',
  dbPath,
  uploadsDir,
  distDir: path.join(ROOT, 'dist'),
  admin: {
    phone: env.ADMIN_PHONE || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Whitey',
    resetPassword: env.ADMIN_RESET_PASSWORD === 'true',
  },
  andi: {
    phone: env.ANDI_PHONE || '',
    password: env.ANDI_PASSWORD || '',
    name: env.ANDI_NAME || 'Andi Market',
    resetPassword: env.ANDI_RESET_PASSWORD === 'true',
  },
  sofra: {
    phone: env.SOFRA_PHONE || '',
    password: env.SOFRA_PASSWORD || '',
    name: env.SOFRA_NAME || 'Furra Sofra',
    resetPassword: env.SOFRA_RESET_PASSWORD === 'true',
  },
  // Simulation can never be switched on in production, even if the env var is set.
  simulation: !isProd && env.ENABLE_SIMULATION === 'true',
  allowedOrigins: (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  trustProxy: env.TRUST_PROXY !== 'false',
  osrmUrl: (env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  // Public by design: CARTO keys are sent from the browser on every tile request.
  cartoKey: (env.CARTO_API_KEY || '').trim(),
};

if (isProd && !config.cartoKey) {
  console.warn('[vnd] CARTO_API_KEY not set; maps fall back to darkened OpenStreetMap tiles.');
}

if (isProd && env.ENABLE_SIMULATION === 'true') {
  console.warn('[vnd] ENABLE_SIMULATION is ignored in production.');
}

if (isProd && (!config.admin.phone || config.admin.password.length < 10)) {
  console.error('[vnd] ADMIN_PHONE and ADMIN_PASSWORD (min 10 characters) must be set in production.');
  process.exit(1);
}

if (!isProd && !config.admin.phone) {
  config.admin.phone = '044000000';
  config.admin.password = 'vnd-dev-admin';
  console.warn('[vnd] Using development admin login 044000000 / vnd-dev-admin');
}
if (!isProd && !config.andi.phone) {
  config.andi.phone = '045453998';
  config.andi.password = 'andi-dev-market';
  console.warn('[vnd] Using development Andi Market login 045453998 / andi-dev-market');
}
