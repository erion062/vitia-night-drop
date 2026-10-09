export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const nowIso = () => new Date().toISOString();

/**
 * Normalises Kosovo-style phone numbers to E.164 (+383...).
 * Accepts "044 123 456", "+383 44 123 456", "0038344123456" etc.
 */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('383')) s = '+' + s;
    else if (s.startsWith('0')) s = '+383' + s.slice(1);
    else s = '+383' + s;
  }
  if (!/^\+\d{8,15}$/.test(s)) return null;
  return s;
}

export function str(v, { min = 0, max = 200, field = 'Value', optional = false, lang } = {}) {
  const sq = lang === 'sq';
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (optional) return '';
    throw new HttpError(400, sq ? `${field} mungon` : `${field} is required`);
  }
  if (typeof v !== 'string') throw new HttpError(400, sq ? `${field} s’është e vlefshme` : `${field} is invalid`);
  const s = v.trim();
  if (s.length < min) throw new HttpError(400, sq ? `${field} duhet të ketë së paku ${min} shkronja` : `${field} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(400, sq ? `${field} duhet të ketë së shumti ${max} shkronja` : `${field} must be at most ${max} characters`);
  return s;
}

export function int(v, { min = -Infinity, max = Infinity, field = 'Value', lang } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, lang === 'sq' ? `${field} s’është e vlefshme` : `${field} is invalid`);
  }
  return n;
}

export function num(v, { min = -Infinity, max = Infinity, field = 'Value', lang } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, lang === 'sq' ? `${field} s’është e vlefshme` : `${field} is invalid`);
  }
  return n;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function hhmm(v, field) {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, `${field} must be HH:MM`);
  return v;
}
