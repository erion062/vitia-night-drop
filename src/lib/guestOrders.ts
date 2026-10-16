const KEY = 'vnd_guest_orders';

export interface GuestOrderRef {
  number: string;
  token: string;
}

function load(): GuestOrderRef[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.number && x.token) : [];
  } catch {
    return [];
  }
}

function save(list: GuestOrderRef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function rememberGuestOrder(number: string, token: string) {
  if (!number || !token) return;
  save([{ number, token }, ...load().filter((x) => x.number !== number)]);
}

export function guestToken(number: string) {
  try {
    const q = new URLSearchParams(window.location.search).get('token');
    if (q) return q;
  } catch {
    /* ignore */
  }
  return load().find((x) => x.number === number)?.token || '';
}

export function guestOrders() {
  return load();
}

export function guestQuery(number: string) {
  const token = guestToken(number);
  return token ? `?token=${encodeURIComponent(token)}` : '';
}
