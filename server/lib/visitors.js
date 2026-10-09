import { db, tx } from '../db.js';
import { toAdmins } from '../realtime.js';
import { businessDate } from './time.js';
import { HttpError, nowIso, str } from './util.js';

const KINDS = new Set(['page', 'click', 'cart', 'checkout', 'login']);
const LIVE_MS = 5 * 60e3;
const EVENT_DAYS = 14;
const SESSION_DAYS = 30;

let ingestCount = 0;
let notifyTimer;

function notifyAdmins() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => toAdmins('visitors', { at: nowIso() }), 700);
}

function maybePrune() {
  ingestCount += 1;
  if (ingestCount % 40 !== 1) return;
  const eventsCut = new Date(Date.now() - EVENT_DAYS * 86400e3).toISOString();
  const sessionsCut = new Date(Date.now() - SESSION_DAYS * 86400e3).toISOString();
  db.prepare('DELETE FROM visitor_events WHERE at < ?').run(eventsCut);
  db.prepare('DELETE FROM visitor_sessions WHERE last_seen < ?').run(sessionsCut);
}

function clean(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function pageTitle(path) {
  const p = String(path || '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (p === '/') return 'Home';
  if (p === '/shop') return 'Shop';
  if (p.startsWith('/p/')) {
    const slug = decodeURIComponent(p.slice(3).split('/')[0] || '');
    return slug ? `Partner · ${slug}` : 'Partner';
  }
  if (p === '/basket') return 'Basket';
  if (p === '/checkout') return 'Checkout';
  if (p === '/account') return 'Account';
  if (p === '/login') return 'Login';
  if (p === '/register') return 'Register';
  if (p === '/forgot') return 'Forgot password';
  if (p === '/orders') return 'My orders';
  if (/^\/orders\/[^/]+\/track$/.test(p)) return 'Track order';
  if (p.startsWith('/orders/')) return 'Order';
  return p;
}

export function describeUa(ua) {
  const s = String(ua || '');
  const device = /iPhone|iPad/.test(s)
    ? 'iPhone'
    : /Android/.test(s)
      ? 'Android'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS|Macintosh/.test(s)
          ? 'Mac'
          : 'Phone';
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Chrome|CriOS/.test(s)
        ? 'Chrome'
        : /Firefox|FxiOS/.test(s)
          ? 'Firefox'
          : /Safari/.test(s)
            ? 'Safari'
            : 'Browser';
  return `${browser} · ${device}`;
}

function todayStartIso() {
  return `${businessDate()}T04:00:00.000Z`;
}

function liveSince() {
  return new Date(Date.now() - LIVE_MS).toISOString();
}

function visitorRow(row, liveCut) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    last_seen: row.last_seen,
    user_name: row.user_name || '',
    user_phone: row.user_phone || '',
    device: row.device || '',
    last_path: row.last_path || '',
    last_label: row.last_label || pageTitle(row.last_path),
    last_kind: row.last_kind || '',
    pages: row.pages || 0,
    clicks: row.clicks || 0,
    live: row.last_seen >= liveCut,
  };
}

export function ingestTrack(req) {
  if (req.user?.role === 'admin' || req.user?.role === 'partner') return { ok: true, skipped: true };

  const vid = str(req.body?.visitor_id, { min: 8, max: 64, field: 'visitor_id' });
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(vid)) throw new HttpError(400, 'visitor_id is invalid');

  const raw = req.body?.events;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: true };
  if (raw.length > 40) throw new HttpError(400, 'Too many events');

  const now = Date.now();
  const sentAt = Number(req.body?.sent_at);
  const skew = Number.isFinite(sentAt) ? now - sentAt : 0;
  const ua = String(req.headers['user-agent'] || '').slice(0, 180);
  const device = describeUa(ua);
  const customer = req.user?.role === 'customer' ? req.user : null;
  const userName = customer ? clean(customer.full_name, 80) : '';
  const userPhone = customer ? clean(customer.phone, 24) : '';
  const userId = customer ? customer.id : null;

  const events = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== 'object') continue;
    const kind = KINDS.has(ev.kind) ? ev.kind : 'click';
    let path = clean(ev.path, 80);
    if (!path.startsWith('/')) path = '/';
    if (path.startsWith('/admin') || path.startsWith('/partner')) continue;
    let label = clean(ev.label, 80) || (kind === 'page' ? pageTitle(path) : '');
    if (!label) continue;
    const clientAt = Number(ev.at);
    let atMs = Number.isFinite(clientAt) ? clientAt + skew : now;
    if (atMs < now - 10 * 60e3 || atMs > now + 30e3) atMs = now;
    events.push({ kind, path, label, at: new Date(atMs).toISOString() });
  }
  if (!events.length) return { ok: true };

  const seen = nowIso();
  tx(() => {
    let row = db.prepare('SELECT * FROM visitor_sessions WHERE id = ?').get(vid);
    if (!row) {
      db.prepare(
        `INSERT INTO visitor_sessions (id, created_at, last_seen, user_id, user_name, user_phone, device)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(vid, seen, seen, userId, userName, userPhone, device);
      row = db.prepare('SELECT * FROM visitor_sessions WHERE id = ?').get(vid);
    }

    let pages = 0;
    let clicks = 0;
    let last = row;
    const insert = db.prepare(
      'INSERT INTO visitor_events (visitor_id, at, kind, path, label) VALUES (?, ?, ?, ?, ?)',
    );
    for (const ev of events) {
      const dupPage =
        ev.kind === 'page' && last.last_kind === 'page' && last.last_path === ev.path && last.last_label === ev.label;
      if (dupPage) continue;
      insert.run(vid, ev.at, ev.kind, ev.path, ev.label);
      if (ev.kind === 'page') pages += 1;
      else clicks += 1;
      last = { ...last, last_kind: ev.kind, last_path: ev.path, last_label: ev.label };
    }

    db.prepare(
      `UPDATE visitor_sessions
       SET last_seen = ?, device = ?, last_path = ?, last_label = ?, last_kind = ?,
           pages = pages + ?, clicks = clicks + ?,
           user_id = COALESCE(?, user_id),
           user_name = CASE WHEN ? != '' THEN ? ELSE user_name END,
           user_phone = CASE WHEN ? != '' THEN ? ELSE user_phone END
       WHERE id = ?`,
    ).run(
      seen,
      device,
      last.last_path || row.last_path,
      last.last_label || row.last_label,
      last.last_kind || row.last_kind,
      pages,
      clicks,
      userId,
      userName,
      userName,
      userPhone,
      userPhone,
      vid,
    );
  });

  maybePrune();
  notifyAdmins();
  return { ok: true };
}

function countKind(from, kind) {
  return db.prepare('SELECT COUNT(*) AS n FROM visitor_events WHERE at >= ? AND kind = ?').get(from, kind).n;
}

export function listVisitors() {
  const from = todayStartIso();
  const liveCut = liveSince();
  const live = db.prepare('SELECT COUNT(*) AS n FROM visitor_sessions WHERE last_seen >= ?').get(liveCut).n;
  const todayVisitors = db.prepare('SELECT COUNT(*) AS n FROM visitor_sessions WHERE last_seen >= ?').get(from).n;
  const pages = countKind(from, 'page');
  const clicks = db
    .prepare("SELECT COUNT(*) AS n FROM visitor_events WHERE at >= ? AND kind IN ('click', 'cart')")
    .get(from).n;
  const carts = countKind(from, 'cart');
  const checkouts = countKind(from, 'checkout');

  const topPages = db
    .prepare(
      `SELECT label, COUNT(*) AS n FROM visitor_events
       WHERE at >= ? AND kind = 'page'
       GROUP BY label ORDER BY n DESC LIMIT 8`,
    )
    .all(from);
  const topClicks = db
    .prepare(
      `SELECT label, COUNT(*) AS n FROM visitor_events
       WHERE at >= ? AND kind IN ('click', 'cart')
       GROUP BY label ORDER BY n DESC LIMIT 8`,
    )
    .all(from);

  const visitors = db
    .prepare('SELECT * FROM visitor_sessions ORDER BY last_seen DESC LIMIT 150')
    .all()
    .map((row) => visitorRow(row, liveCut));

  return {
    live,
    today: { visitors: todayVisitors, pages, clicks, carts, checkouts },
    top_pages: topPages,
    top_clicks: topClicks,
    visitors,
  };
}

export function visitorDetail(id) {
  const liveCut = liveSince();
  const row = db.prepare('SELECT * FROM visitor_sessions WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'Visitor not found');
  const events = db
    .prepare('SELECT id, at, kind, path, label FROM visitor_events WHERE visitor_id = ? ORDER BY id DESC LIMIT 400')
    .all(id)
    .reverse();
  return { visitor: visitorRow(row, liveCut), events };
}

export function visitorSummary() {
  const from = todayStartIso();
  const liveCut = liveSince();
  return {
    live: db.prepare('SELECT COUNT(*) AS n FROM visitor_sessions WHERE last_seen >= ?').get(liveCut).n,
    today: db.prepare('SELECT COUNT(*) AS n FROM visitor_sessions WHERE last_seen >= ?').get(from).n,
  };
}
