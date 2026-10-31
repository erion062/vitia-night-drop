import { db } from '../db.js';
import { localParts } from './time.js';

/** One-time catalogue raise: +€0.30 on every priced item from 1 Nov 2026 (Europe/Belgrade). */
const KEY = 'price_raise_2026_11_01';
const CENTS = 30;
const FROM_DATE = '2026-11-01';

let finished = false;

export function maybeApplyNov1PriceRaise() {
  if (finished) return;
  if (localParts().date < FROM_DATE) return;

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  if (existing) {
    finished = true;
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE products SET price_cents = price_cents + ?, updated_at = ? WHERE price_cents > 0')
    .run(CENTS, now);
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(KEY, JSON.stringify({ at: now, cents: CENTS, products: result.changes }));
  finished = true;
  console.log(`[vnd] Nov 1 price raise: +€${(CENTS / 100).toFixed(2)} on ${result.changes} products`);
}
