const KEY = 'vnd_promo_code';

export function savedPromoCode() {
  try {
    return (localStorage.getItem(KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function rememberPromoCode(code: string) {
  const c = code.trim().toUpperCase();
  try {
    if (c) localStorage.setItem(KEY, c);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
