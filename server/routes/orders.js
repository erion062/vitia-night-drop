import { Router } from 'express';
import { rateLimit } from '../auth.js';
import { db } from '../db.js';
import { toAdmins, toUser } from '../realtime.js';
import { getDriverLocation, publicLocation } from '../lib/location.js';
import { HttpError } from '../lib/util.js';
import {
  TRACKABLE_STATUSES,
  changeStatus,
  createOrder,
  getAdminOrder,
  getCustomerOrder,
  getCustomerOrderByAccess,
  listCustomerOrders,
} from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { notifyNewOrder } from '../lib/whatsapp.js';

const router = Router();

const orderLimiter = rateLimit({
  windowMs: 10 * 60e3,
  max: 10,
  key: (req) => `order:${req.user?.id || req.ip}`,
});

router.post('/', orderLimiter, (req, res) => {
  const { id, guest_token } = createOrder(req.user, req.body);
  const order = getAdminOrder(id);
  toAdmins('order:new', { id, number: order.number });
  notifyNewOrder(order);
  const view = req.user?.role === 'customer'
    ? getCustomerOrder(req.user.id, order.number).view
    : getCustomerOrderByAccess({ ...req, query: { ...req.query, token: guest_token }, body: { token: guest_token } }, order.number).view;
  res.status(201).json({ order: view, guest_token: guest_token || undefined });
});

router.use((req, _res, next) => {
  if (req.user) return next();
  if (req.method === 'GET' && req.query.token) return next();
  if (req.method === 'POST' && req.body?.token) return next();
  next(new HttpError(401, 'Hyr në llogari që të vazhdosh.'));
});

router.get('/', (req, res) => {
  if (!req.user) throw new HttpError(401, 'Hyr në llogari që të vazhdosh.');
  res.json({ orders: listCustomerOrders(req.user.id) });
});

/** Order + tracking info. The driver position is only included while *this* order is being handled. */
router.get('/:number', (req, res) => {
  const { row, view } = getCustomerOrderByAccess(req, req.params.number);
  const s = getSettings();
  const trackable = TRACKABLE_STATUSES.includes(row.status);
  res.set('Cache-Control', 'no-store');
  res.json({
    order: view,
    driver: { name: s.driver_name, vehicle: s.vehicle_name },
    location: trackable ? publicLocation(getDriverLocation()) : null,
    trackable,
  });
});

router.post('/:number/cancel', (req, res) => {
  const { row } = getCustomerOrderByAccess(req, req.params.number);
  if (row.status !== 'PENDING') {
    throw new HttpError(409, 'Kjo porosi s’mund të anulohet më.');
  }
  const actor = req.user || { id: row.user_id, role: 'customer' };
  changeStatus(row.id, 'CANCELLED', actor, { note: 'Cancelled by customer', allowFrom: ['PENDING'] });
  toAdmins('order:update', { id: row.id, number: row.number, status: 'CANCELLED' });
  toUser(row.user_id, 'order:update', { number: row.number, status: 'CANCELLED' });
  const updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(row.id);
  res.json({ ok: true, status: updated.status });
});

export default router;
