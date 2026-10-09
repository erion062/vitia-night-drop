import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { checkOrigin, ensureAdmin, ensureAndiMarket, ensureFurraSofra, loadUser, requireAuth } from './auth.js';
import { config } from './config.js';
import { seedProductsIfEmpty } from './db.js';
import { openStream } from './realtime.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import publicRoutes from './routes/public.js';
import partnerRoutes from './routes/partner.js';
import devRoutes from './routes/dev.js';
import { HttpError } from './lib/util.js';

ensureAdmin();
ensureAndiMarket();
ensureFurraSofra();
seedProductsIfEmpty();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${config.osrmUrl}`,
      "font-src 'self' data:",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

// ---------- API ----------
const api = express.Router();
const jsonSmall = express.json({ limit: '100kb' });
const jsonUpload = express.json({ limit: '3mb' });
api.use((req, res, next) =>
  req.path === '/admin/uploads' || req.path === '/partner/uploads' ? jsonUpload(req, res, next) : jsonSmall(req, res, next),
);
api.use(loadUser);
api.use(checkOrigin);
api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
api.get('/stream', requireAuth, openStream);
api.use('/', publicRoutes);
api.use('/auth', authRoutes);
api.use('/orders', orderRoutes);
if (config.simulation) {
  api.use('/admin/dev', devRoutes);
  console.warn('[vnd] SIMULATION MODE ENABLED (development only)');
}
api.use('/admin', adminRoutes);
api.use('/partner', partnerRoutes);
api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
api.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[vnd]', err);
  const admin = String(req.path || '').startsWith('/admin');
  res.status(status).json({
    error: status >= 500
      ? (admin ? 'Something went wrong. Please try again.' : 'Diçka shkoi keq. Provo sërish.')
      : err.message,
    code: err.code,
  });
});
app.use('/api', api);

// ---------- Uploaded product images ----------
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, index: false }));

// ---------- Built PWA (production) ----------
if (fs.existsSync(config.distDir)) {
  app.use(
    express.static(config.distDir, {
      index: false,
      setHeaders(res, file) {
        const name = path.basename(file);
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (name === 'sw.js' || name.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
  const indexHtml = path.join(config.distDir, 'index.html');
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}

app.listen(config.port, config.host, (err) => {
  if (err) {
    console.error(`[vnd] Could not start on port ${config.port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`[vnd] VITIA NIGHT DROP running on http://localhost:${config.port} (${config.isProd ? 'production' : 'development'})`);
});

export default app;
