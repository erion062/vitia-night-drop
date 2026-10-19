import { Router } from 'express';
import { rateLimit } from '../auth.js';
import {
  capturedAmountCents,
  capturePaypalCheckout,
  createPaypalCheckout,
  getPaypalIntent,
  markPaypalIntentOrder,
  paypalEnabled,
  savePaypalIntent,
} from '../lib/paypal.js';
import {
  createOrder,
  getAdminOrder,
  getCustomerOrder,
  getCustomerOrderByAccess,
  orderingState,
  quoteCheckout,
  reasonMessage,
} from '../lib/orders.js';
import { toAdmins } from '../realtime.js';
import { notifyNewOrder } from '../lib/whatsapp.js';
import { HttpError } from '../lib/util.js';

const router = Router();
const limiter = rateLimit({ windowMs: 10 * 60e3, max: 20, key: (req) => `paypal:${req.user?.id || req.ip}` });

router.post('/orders', limiter, async (req, res) => {
  if (!paypalEnabled()) throw new HttpError(503, 'Pagesa me kartë s’është gati ende. Zgjidh pagesën në dorëzim.');
  const quote = quoteCheckout(req.body);
  const state = orderingState(quote.settings);
  if (!state.accepting) throw new HttpError(409, reasonMessage(state.reason, quote.settings), state.reason);
  const paypal = await createPaypalCheckout(quote.total_cents);
  savePaypalIntent(paypal.id, quote.total_cents, quote);
  res.json({ id: paypal.id, amount_cents: quote.total_cents });
});

router.post('/orders/:id/capture', limiter, async (req, res) => {
  if (!paypalEnabled()) throw new HttpError(503, 'Pagesa me kartë s’është gati ende. Zgjidh pagesën në dorëzim.');
  const paypalId = String(req.params.id || '');
  const intent = getPaypalIntent(paypalId);
  if (!intent) throw new HttpError(404, 'Pagesa s’u gjet. Provo përsëri.');
  if (intent.vnd_order_id) {
    const order = getAdminOrder(intent.vnd_order_id);
    const view = req.user?.role === 'customer'
      ? getCustomerOrder(req.user.id, order.number).view
      : getCustomerOrderByAccess({ ...req, query: { token: order.guest_token }, body: { token: order.guest_token } }, order.number).view;
    res.json({ order: view, guest_token: order.guest_token || undefined });
    return;
  }
  const captured = await capturePaypalCheckout(paypalId);
  const paid = capturedAmountCents(captured);
  if (paid.cents !== intent.amount_cents) {
    throw new HttpError(402, 'Shuma e pagesës nuk përputhet. Na shkruaj në WhatsApp.');
  }
  const quote = JSON.parse(intent.payload_json);
  const { id, guest_token } = createOrder(req.user, quote, {
    quote,
    payment_method: 'paypal',
    paid: true,
    paypal_order_id: paypalId,
    skipCapacity: true,
  });
  markPaypalIntentOrder(paypalId, id);
  const order = getAdminOrder(id);
  toAdmins('order:new', { id, number: order.number });
  notifyNewOrder(order);
  const view = req.user?.role === 'customer'
    ? getCustomerOrder(req.user.id, order.number).view
    : getCustomerOrderByAccess({ ...req, query: { token: guest_token }, body: { token: guest_token } }, order.number).view;
  res.status(201).json({ order: view, guest_token: guest_token || undefined });
});

export default router;
