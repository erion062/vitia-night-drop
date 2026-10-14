import { config } from '../config.js';
import { getSettings } from './settings.js';

function euro(cents) {
  return `€${(Number(cents || 0) / 100).toFixed(2)}`;
}

function adminUrl() {
  const origin = config.allowedOrigins[0] || 'https://vndviti.com';
  return `${origin}/admin`;
}

function orderText(order) {
  const items = (order.items || [])
    .slice(0, 12)
    .map((i) => `${i.quantity}× ${i.name}`)
    .join('\n');
  const extra = (order.items || []).length > 12 ? `\n+${order.items.length - 12} more` : '';
  const notes = order.notes ? `\nNote: ${order.notes}` : '';
  return [
    `VND NEW ORDER *${order.number}*`,
    order.customer_name,
    order.phone,
    order.address,
    items + extra,
    `Total *${euro(order.total_cents)}* cash`,
    order.promo_code ? `Code ${order.promo_code}` : '',
    notes,
    adminUrl(),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function sendCallMeBot(phone, apikey, text) {
  const url =
    'https://api.callmebot.com/whatsapp.php?' +
    new URLSearchParams({ phone, text, apikey });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(body.slice(0, 180) || `HTTP ${res.status}`);
    return { ok: true };
  } finally {
    clearTimeout(t);
  }
}

export async function sendWhatsApp(text) {
  const s = getSettings();
  const phone = String(s.whatsapp_phone || '').replace(/\D/g, '');
  const apikey = String(s.whatsapp_apikey || '').trim();
  if (!phone || !apikey) return { ok: false, error: 'Add your WhatsApp number and API key in Settings first.' };
  return sendCallMeBot(phone, apikey, text);
}

export function notifyNewOrder(order) {
  sendWhatsApp(orderText(order)).catch((err) => console.error('[vnd] whatsapp', err.message || err));
}

export async function sendWhatsAppTest() {
  return sendWhatsApp('VND test: WhatsApp order alerts are on. New orders will land here.');
}
