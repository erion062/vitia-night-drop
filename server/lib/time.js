export const TIMEZONE = 'Europe/Belgrade';

// A "business day" runs from 06:00 to 05:59 local time, so a 14:00–03:00 shift counts as one day.
const BUSINESS_DAY_OFFSET_HOURS = 6;

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function localParts(date = new Date()) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

const toMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** True when `date` falls inside the opening window. Handles windows that cross midnight. */
export function isWithinHours(open, close, date = new Date()) {
  const { hour, minute } = localParts(date);
  const t = hour * 60 + minute;
  const o = toMinutes(open);
  const c = toMinutes(close);
  if (o === c) return true;
  return o < c ? t >= o && t < c : t >= o || t < c;
}

export function businessDate(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return localParts(new Date(d.getTime() - BUSINESS_DAY_OFFSET_HOURS * 3600e3)).date;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(dateStr, -dow);
}

export function daysBetween(from, to) {
  return Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400e3);
}
