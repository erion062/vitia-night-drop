import type { OrderStatus } from '../types';

export const TIMEZONE = 'Europe/Belgrade';

export const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;
export const euroShort = (cents: number) => (cents % 100 === 0 ? `€${cents / 100}` : euro(cents));

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: '2-digit', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const time = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—');
export const date = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const dateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export const km = (meters: number) => (meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`);
export const minutes = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`;

/** Admin / driver UI. Customer screens use SQ_STATUS in src/customer/copy.ts. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  PURCHASING: 'Purchasing',
  PURCHASED: 'Purchased',
  ON_THE_WAY: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY'];
export const TRACKABLE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY'];

/** Local "HH:MM" clock in Europe/Belgrade. */
export const clock = (d = new Date()) => timeFmt.format(d);

/** Hour 0–23 in Europe/Belgrade. */
export function belgradeHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(d));
}

/** Today's business date (06:00 cut-off) as YYYY-MM-DD, matching the server. */
export function businessDate(d = new Date()) {
  const shifted = new Date(d.getTime() - 6 * 3600e3);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
  return p;
}
