// Development-only simulation tools. Mounted ONLY when config.simulation is true,
// which can never happen with NODE_ENV=production (see config.js).
import { Router } from 'express';
import { hashPassword, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { toAdmins } from '../realtime.js';
import { clearDriverLocation, getDriverLocation, saveDriverLocation } from '../lib/location.js';
import { createOrder } from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { HttpError, int, nowIso } from '../lib/util.js';

const router = Router();
router.use(requireAdmin);

let timer = null;

async function routePath(from, to) {
  try {
    const url = `${config.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const coords = j.routes?.[0]?.geometry?.coordinates;
    if (coords?.length > 1) return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    /* fall through to straight line */
  }
  return [from, to];
}

function resample(points, steps) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].lat - points[i - 1].lat, points[i].lng - points[i - 1].lng);
    segs.push(d);
    total += d;
  }
  const out = [];
  for (let s = 0; s <= steps; s++) {
    let target = (total * s) / steps;
    let i = 0;
    while (i < segs.length - 1 && target > segs[i]) target -= segs[i++];
    const t = segs[i] ? Math.min(1, target / segs[i]) : 1;
    const a = points[i];
    const b = points[i + 1] || a;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return out;
}

const bearing = (a, b) => {
  const deg = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
};

router.post('/drive', async (req, res) => {
  const id = int(req.body?.order_id, { min: 1, field: 'Order' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) throw new HttpError(404, 'Order not found');
  const seconds = Math.min(300, Math.max(20, Number(req.body?.seconds) || 90));
  const current = getDriverLocation();
  const start = current
    ? { lat: current.lat, lng: current.lng }
    : { lat: order.lat + 0.012, lng: order.lng - 0.014 };
  const pts = resample(await routePath(start, { lat: order.lat, lng: order.lng }), Math.round(seconds / 2));
  clearInterval(timer);
  let i = 0;
  timer = setInterval(() => {
    const p = pts[i];
    const next = pts[i + 1] || p;
    saveDriverLocation(req.user.id, { ...p, accuracy: 8, heading: bearing(p, next), speed: 9 });
    if (++i >= pts.length) clearInterval(timer);
  }, 2000);
  res.json({ ok: true, points: pts.length, seconds });
});

router.post('/stop', (_req, res) => {
  clearInterval(timer);
  clearDriverLocation();
  res.json({ ok: true });
});

const NAMES = ['Arben Krasniqi', 'Liridon Berisha', 'Xheneta Kelmendi', 'Dardan Gashi', 'Leona Hoxha', 'Egzon Morina'];
const STREETS = ['Rr. Skënderbeu', 'Rr. Rexhep Mala', 'Rr. Adem Jashari', 'Rr. Dëshmorët', 'Rr. Lidhja e Prizrenit'];

router.post('/customers', (req, res) => {
  const count = int(req.body?.count ?? 3, { min: 1, max: 5, field: 'Count' });
  const s = getSettings();
  const products = db.prepare('SELECT id, price_cents FROM products WHERE available = 1').all();
  const created = [];
  const errors = [];
  for (let n = 0; n < count; n++) {
    const phone = `+38349${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const r = db
      .prepare("INSERT INTO users (full_name, phone, password_hash, role, created_at) VALUES (?, ?, ?, 'customer', ?)")
      .run(name, phone, hashPassword('test1234'), nowIso());
    const user = { id: Number(r.lastInsertRowid) };
    const items = [];
    let subtotal = 0;
    while (subtotal < s.min_order_cents) {
      const p = products[Math.floor(Math.random() * products.length)];
      items.push({ product_id: p.id, quantity: 1 });
      subtotal += p.price_cents;
    }
    try {
      const id = createOrder(user, {
        customer_name: name,
        phone,
        address: `${STREETS[Math.floor(Math.random() * STREETS.length)]} ${1 + Math.floor(Math.random() * 60)}, Viti`,
        notes: 'Simulated test order',
        lat: s.base_lat + (Math.random() - 0.5) * 0.02,
        lng: s.base_lng + (Math.random() - 0.5) * 0.025,
        items,
      });
      toAdmins('order:new', { id });
      created.push(id);
    } catch (e) {
      errors.push(e.message);
    }
  }
  res.json({ created, errors });
});

export default router;
