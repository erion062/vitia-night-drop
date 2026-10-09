import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth';

const KEY = 'vnd_vid';
const KINDS = new Set(['page', 'click', 'cart', 'checkout', 'login']);

type Kind = 'page' | 'click' | 'cart' | 'checkout' | 'login';

let enabled = true;
let queue: { kind: Kind; path: string; label: string; at: number }[] = [];
let timer: number | undefined;
let lastPage = '';
let lastClick = '';
let lastClickAt = 0;

function visitorId() {
  try {
    let id = localStorage.getItem(KEY) || '';
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function currentPath() {
  return (window.location.pathname || '/').slice(0, 80);
}

export function pageTitle(path: string, search = '') {
  const p = path.split('?')[0].replace(/\/+$/, '') || '/';
  if (p === '/') return 'Home';
  if (p === '/shop') {
    const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const query = (q.get('q') || '').trim();
    const cat = q.get('cat') || '';
    if (query) return `Shop · search “${query.slice(0, 40)}”`;
    if (cat) return `Shop · ${cat}`;
    return 'Shop';
  }
  if (p.startsWith('/p/')) return `Partner · ${decodeURIComponent(p.slice(3).split('/')[0] || '')}`;
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

function skippedPath(path = currentPath()) {
  return path.startsWith('/admin') || path.startsWith('/partner');
}

function flush() {
  if (!enabled || !queue.length) return;
  const id = visitorId();
  if (!id) {
    queue = [];
    return;
  }
  const events = queue.splice(0, 40);
  const body = JSON.stringify({ visitor_id: id, sent_at: Date.now(), events });
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'same-origin',
    keepalive: true,
    cache: 'no-store',
  }).catch(() => {});
}

function schedule() {
  if (timer) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    flush();
  }, 1800);
}

export function setTrackingEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    queue = [];
    lastPage = '';
  }
}

export function track(kind: Kind, label: string, path = currentPath()) {
  if (!enabled || skippedPath(path) || !KINDS.has(kind)) return;
  const clean = label.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return;
  if (kind === 'page') {
    const key = `${path}|${clean}`;
    if (key === lastPage) return;
    lastPage = key;
  }
  queue.push({ kind, path, label: clean, at: Date.now() });
  if (queue.length >= 20) flush();
  else schedule();
}

function clickLabel(el: HTMLElement): { kind: Kind; label: string } | null {
    if (el.closest('[data-no-track], input, textarea, select, .leaflet-container, .map-wrap, .pw-toggle, .pw-field')) return null;

  const tracked = el.closest('[data-track]') as HTMLElement | null;
  if (tracked?.dataset.track) return { kind: 'click', label: tracked.dataset.track };

  const product = el.closest('.product-row, .product-card, .dish-group') as HTMLElement | null;
  if (product) {
    const name = product.querySelector('.product-name')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const add = el.closest('.add-btn, button[aria-label="Shto"], button[aria-label="Shto një"]');
    const rem = el.closest('button[aria-label="Hiq një"]');
    if (name && add) return { kind: 'cart', label: `Added ${name}` };
    if (name && rem) return { kind: 'cart', label: `Removed ${name}` };
    if (name) return { kind: 'click', label: name };
  }

  const hit = el.closest('a, button, [role="button"], .chip, .cat-tile, .partner-tile') as HTMLElement | null;
  if (!hit) return null;
  const aria = (hit.getAttribute('aria-label') || '').trim();
  const text = (hit.innerText || '').replace(/\s+/g, ' ').trim();
  const href = hit instanceof HTMLAnchorElement ? hit.getAttribute('href') || '' : '';
  const label = (aria && aria.length <= 60 ? aria : text || href).slice(0, 80);
  if (!label || label.length < 2) return null;
  return { kind: 'click', label };
}

export function VisitorTracker() {
  const { user } = useAuth();
  const loc = useLocation();
  const staff = user?.role === 'admin' || user?.role === 'partner';

  useEffect(() => {
    setTrackingEnabled(!staff);
  }, [staff]);

  useEffect(() => {
    if (staff) return;
    const wait = loc.search.includes('q=') ? 700 : 0;
    const id = window.setTimeout(() => {
      track('page', pageTitle(loc.pathname, loc.search), loc.pathname.slice(0, 80));
    }, wait);
    return () => window.clearTimeout(id);
  }, [loc.pathname, loc.search, staff]);

  useEffect(() => {
    if (staff) return;

    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const found = clickLabel(t);
      if (!found) return;
      const now = Date.now();
      if (found.label === lastClick && now - lastClickAt < 400) return;
      lastClick = found.label;
      lastClickAt = now;
      track(found.kind, found.label);
    };

    const onHide = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      flush();
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [staff]);

  return null;
}
