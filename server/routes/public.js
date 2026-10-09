import { Router } from 'express';
import { rateLimit } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { activeAnnouncements } from '../lib/announcements.js';
import { orderingState, reasonMessage } from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { ingestTrack } from '../lib/visitors.js';

const router = Router();
const trackLimiter = rateLimit({ windowMs: 60e3, max: 90, key: (req) => `track:${req.ip}` });

router.post('/track', trackLimiter, (req, res) => {
  ingestTrack(req);
  res.json({ ok: true });
});

router.get('/config', (_req, res) => {
  const s = getSettings();
  const state = orderingState(s);
  res.set('Cache-Control', 'no-store');
  res.json({
    business_name: s.business_name,
    business_phone: s.business_phone,
    open_time: s.open_time,
    close_time: s.close_time,
    timezone: 'Europe/Belgrade',
    delivery_fee_cents: s.delivery_fee_cents,
    min_order_cents: s.min_order_cents,
    max_active_orders: s.max_active_orders,
    driver_name: s.driver_name,
    vehicle_name: s.vehicle_name,
    base_lat: s.base_lat,
    base_lng: s.base_lng,
    service_radius_km: s.service_radius_km,
    online: s.business_online,
    open_now: state.openNow,
    accepting_orders: state.accepting,
    reason: state.reason,
    reason_message: state.reason ? reasonMessage(state.reason, s) : '',
    active_orders: state.active,
    simulation: config.simulation,
    osrm_url: config.osrmUrl,
    announcements: activeAnnouncements().map(({ id, message, tone, expires_at }) => ({ id, message, tone, expires_at })),
    map_tiles: config.cartoKey
      ? {
          url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(config.cartoKey)}`,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          dark_filter: false,
        }
      : {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          dark_filter: true,
        },
  });
});

// Purchase cost is deliberately excluded from the public catalog.
router.get('/products', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, description, category, price_cents, image_url, accent, available, popular, partner, section
       FROM products ORDER BY sort, id`,
    )
    .all()
    .map((p) => ({ ...p, available: !!p.available, popular: !!p.popular }));
  const partners = db
    .prepare('SELECT slug, name, tagline, logo_url, hours, kind FROM partners WHERE active = 1 ORDER BY sort, name')
    .all();
  res.set('Cache-Control', 'no-cache');
  res.json({ products: rows, partners });
});

export default router;
