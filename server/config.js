import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT) || 8787,
  host: env.HOST || '0.0.0.0',
  dbPath: path.resolve(ROOT, env.DB_PATH || 'data/vnd.db'),
  uploadsDir: path.resolve(ROOT, env.UPLOADS_DIR || 'data/uploads'),
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
