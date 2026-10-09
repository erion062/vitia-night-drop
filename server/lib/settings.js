import { db } from '../db.js';
import { DEFAULT_SETTINGS } from '../seed.js';
import { HttpError, hhmm, int, num, str } from './util.js';

let cache = null;

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
  delivery_fee_cents: (v) => int(v, { min: 0, max: 5000, field: 'Delivery fee' }),
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
