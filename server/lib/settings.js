import { db } from '../db.js';
import { DEFAULT_SETTINGS } from '../seed.js';
import { HttpError, hhmm, int, normalizePhone, num, str } from './util.js';

let cache = null;

function persistSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function getSettings() {
  if (cache) return cache;
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore corrupt value, default applies */
    }
  }
  if (stored.delivery_inner_km == null) {
    if (stored.delivery_fee_cents == null || stored.delivery_fee_cents === 400) {
      stored.delivery_fee_cents = DEFAULT_SETTINGS.delivery_fee_cents;
      persistSetting('delivery_fee_cents', stored.delivery_fee_cents);
    }
    stored.delivery_inner_km = DEFAULT_SETTINGS.delivery_inner_km;
    stored.delivery_per_km_cents = DEFAULT_SETTINGS.delivery_per_km_cents;
    persistSetting('delivery_inner_km', stored.delivery_inner_km);
    persistSetting('delivery_per_km_cents', stored.delivery_per_km_cents);
  }
  cache = { ...DEFAULT_SETTINGS, ...stored };
  return cache;
}

const bool = (v, field) => {
  if (typeof v !== 'boolean') throw new HttpError(400, `${field} must be true/false`);
  return v;
};

// Validators for every editable setting. Unknown keys are rejected.
const VALIDATORS = {
  business_name: (v) => str(v, { min: 2, max: 60, field: 'Business name' }),
  business_phone: (v) => str(v, { max: 30, field: 'Business phone', optional: true }),
  open_time: (v) => hhmm(v, 'Opening time'),
  close_time: (v) => hhmm(v, 'Closing time'),
  delivery_fee_cents: (v) => int(v, { min: 0, max: 5000, field: 'Delivery fee in Viti' }),
  delivery_inner_km: (v) => num(v, { min: 0.5, max: 20, field: 'In-town radius' }),
  delivery_per_km_cents: (v) => int(v, { min: 0, max: 500, field: 'Extra per km' }),
  min_order_cents: (v) => int(v, { min: 0, max: 20000, field: 'Minimum order' }),
  max_active_orders: (v) => int(v, { min: 1, max: 50, field: 'Maximum active orders' }),
  max_active_per_customer: (v) => int(v, { min: 1, max: 10, field: 'Active orders per customer' }),
  driver_name: (v) => str(v, { min: 1, max: 40, field: 'Driver name' }),
  vehicle_name: (v) => str(v, { min: 1, max: 60, field: 'Vehicle name' }),
  location_sharing_enabled: (v) => bool(v, 'Location sharing'),
  sound_enabled: (v) => bool(v, 'Notification sound'),
  business_online: (v) => bool(v, 'Business online'),
  fuel_cost_cents: (v) => int(v, { min: 0, max: 5000, field: 'Delivery/fuel cost' }),
  base_lat: (v) => num(v, { min: -90, max: 90, field: 'Base latitude' }),
  base_lng: (v) => num(v, { min: -180, max: 180, field: 'Base longitude' }),
  service_radius_km: (v) => num(v, { min: 0.5, max: 50, field: 'Service radius' }),
  no_go_lat: (v) => num(v, { min: -90, max: 90, field: 'No-go latitude' }),
  no_go_lng: (v) => num(v, { min: -180, max: 180, field: 'No-go longitude' }),
  no_go_radius_km: (v) => num(v, { min: 0, max: 50, field: 'No-go radius' }),
  whatsapp_phone: (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return '';
    const phone = normalizePhone(String(v));
    if (!phone) throw new HttpError(400, 'WhatsApp phone is invalid');
    return phone;
  },
  whatsapp_apikey: (v) => str(v, { max: 80, field: 'WhatsApp API key', optional: true }),
};

export function updateSettings(patch) {
  if (!patch || typeof patch !== 'object') throw new HttpError(400, 'Invalid settings');
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    const validate = VALIDATORS[key];
    if (!validate) throw new HttpError(400, `Unknown setting: ${key}`);
    clean[key] = validate(value);
  }
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [k, v] of Object.entries(clean)) upsert.run(k, JSON.stringify(v));
  cache = null;
  return getSettings();
}
