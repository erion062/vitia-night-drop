import { db } from '../db.js';
import { toAll } from '../realtime.js';
import { HttpError, nowIso, num, str } from './util.js';

const TONES = ['promo', 'info', 'warning'];
const MAX_ACTIVE = 5;

/** Announcements customers should see right now; expired ones simply stop matching. */
export function activeAnnouncements() {
  return db
    .prepare(
      `SELECT id, message, tone, created_at, expires_at FROM announcements
       WHERE removed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY id DESC`,
    )
    .all(nowIso());
}

export function listAnnouncements() {
  const now = nowIso();
  return db
    .prepare('SELECT id, message, tone, created_at, expires_at, removed_at FROM announcements ORDER BY id DESC LIMIT 30')
    .all()
    .map((a) => ({
      ...a,
      active: !a.removed_at && (!a.expires_at || a.expires_at > now),
    }));
}

export function createAnnouncement(body) {
  const message = str(body?.message, { min: 2, max: 160, field: 'Message' });
  const tone = TONES.includes(body?.tone) ? body.tone : 'promo';
  // 0 hours = stays up until removed by hand.
  const hours = num(body?.hours ?? 0, { min: 0, max: 24 * 30, field: 'Duration' });
  if (activeAnnouncements().length >= MAX_ACTIVE) {
    throw new HttpError(400, `You can have at most ${MAX_ACTIVE} live announcements. Remove one first.`);
  }
  const now = new Date();
  const expires = hours > 0 ? new Date(now.getTime() + hours * 3600e3).toISOString() : null;
  const r = db
    .prepare('INSERT INTO announcements (message, tone, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(message, tone, now.toISOString(), expires);
  toAll('announcements', {});
  return Number(r.lastInsertRowid);
}

export function removeAnnouncement(id) {
  const r = db.prepare('UPDATE announcements SET removed_at = ? WHERE id = ? AND removed_at IS NULL').run(nowIso(), id);
  if (!r.changes) throw new HttpError(404, 'Announcement not found');
  toAll('announcements', {});
}
