import { db } from '../db.js';
import { toAdmins, toUsers } from '../realtime.js';
import { trackableUserIds } from './orders.js';
import { nowIso } from './util.js';

/** Positions older than this are never sent to customers. */
const MAX_CUSTOMER_AGE_MS = 10 * 60e3;

export function getDriverLocation() {
  return db.prepare('SELECT * FROM driver_locations ORDER BY updated_at DESC LIMIT 1').get() || null;
}

export function publicLocation(loc) {
  if (!loc) return null;
  if (Date.now() - new Date(loc.updated_at).getTime() > MAX_CUSTOMER_AGE_MS) return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    heading: loc.heading,
    accuracy: loc.accuracy,
    updated_at: loc.updated_at,
  };
}

export function saveDriverLocation(driverId, { lat, lng, accuracy = null, heading = null, speed = null }) {
  const updatedAt = nowIso();
  db.prepare(
    `INSERT INTO driver_locations (driver_id, lat, lng, accuracy, heading, speed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(driver_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
       heading = excluded.heading, speed = excluded.speed, updated_at = excluded.updated_at`,
  ).run(driverId, lat, lng, accuracy, heading, speed, updatedAt);
  const loc = getDriverLocation();
  broadcastLocation(loc);
  return loc;
}

export function clearDriverLocation() {
  db.prepare('DELETE FROM driver_locations').run();
  broadcastLocation(null);
}

/** Admins always get the position; customers only if they have an order being handled right now. */
export function broadcastLocation(loc) {
  toAdmins('location', loc);
  const users = trackableUserIds();
  if (users.length) toUsers(users, 'location', publicLocation(loc));
}
