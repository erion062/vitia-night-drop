import { config } from '../config.js';
import { db } from '../db.js';
import { HttpError, nowIso } from './util.js';

function apiBase() {
  return config.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export function paypalEnabled() {
  return !!(config.paypal.clientId && config.paypal.secret);
}

export function euroAmount(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

let tokenCache = { access: '', exp: 0 };

async function accessToken() {
  if (!paypalEnabled()) throw new HttpError(503, 'Pagesa me kartë s’është gati ende. Zgjidh pagesën në dorëzim.');
  if (tokenCache.access && tokenCache.exp > Date.now() + 15000) return tokenCache.access;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.secret}`).toString('base64');
  const res = await fetch(apiBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('[vnd] PayPal token failed', res.status, data.error || data);
    throw new HttpError(502, 'PayPal s’u lidh. Provo pagesën në dorëzim.');
  }
  tokenCache = { access: data.access_token, exp: Date.now() + Number(data.expires_in || 300) * 1000 };
  return tokenCache.access;
}

async function paypalFetch(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(apiBase() + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'paypal-request-id': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function createPaypalCheckout(amountCents) {
  const value = euroAmount(amountCents);
  const { ok, status, data } = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'EUR', value },
          description: 'VITIA NIGHT DROP',
        },
      ],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        brand_name: 'VND',
      },
    },
  });
  if (!ok || !data.id) {
    console.error('[vnd] PayPal create failed', status, data);
    throw new HttpError(502, 'Pagesa s’u hap. Provo përsëri ose pagesën në dorëzim.');
  }
  return data;
}

export async function capturePaypalCheckout(paypalOrderId) {
  const id = String(paypalOrderId || '').trim();
  if (!/^[A-Z0-9]+$/i.test(id) || id.length < 8 || id.length > 64) {
    throw new HttpError(400, 'Pagesa s’është e vlefshme');
  }
  const { ok, status, data } = await paypalFetch(`/v2/checkout/orders/${id}/capture`, { method: 'POST' });
  if (status === 422 && data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
    const existing = await paypalFetch(`/v2/checkout/orders/${id}`);
    return existing.data;
  }
  if (!ok) {
    console.error('[vnd] PayPal capture failed', status, data);
    throw new HttpError(402, 'Pagesa s’kaloi. Provo kartën tjetër ose pagesën në dorëzim.');
  }
  return data;
}

export function capturedAmountCents(order) {
  const unit = order?.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const value = cap?.amount?.value || unit?.amount?.value;
  const currency = cap?.amount?.currency_code || unit?.amount?.currency_code;
  if (currency && currency !== 'EUR') throw new HttpError(402, 'Pagesa s’kaloi. Provo pagesën në dorëzim.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new HttpError(402, 'Pagesa s’kaloi. Provo pagesën në dorëzim.');
  const status = cap?.status || order?.status;
  if (status && status !== 'COMPLETED' && order?.status !== 'COMPLETED') {
    throw new HttpError(402, 'Pagesa s’kaloi. Provo pagesën në dorëzim.');
  }
  return { cents, captureId: cap?.id || '', status: order?.status || '' };
}

export function savePaypalIntent(paypalOrderId, amountCents, payload) {
  db.prepare(
    `INSERT INTO paypal_intents (paypal_order_id, amount_cents, payload_json, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(paypalOrderId, amountCents, JSON.stringify(payload), nowIso());
}

export function getPaypalIntent(paypalOrderId) {
  return db.prepare('SELECT * FROM paypal_intents WHERE paypal_order_id = ?').get(paypalOrderId);
}

export function markPaypalIntentOrder(paypalOrderId, vndOrderId) {
  db.prepare('UPDATE paypal_intents SET vnd_order_id = ? WHERE paypal_order_id = ?').run(vndOrderId, paypalOrderId);
}
