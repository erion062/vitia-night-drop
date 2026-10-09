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
  listCustomerOrders,
} from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';

const router = Router();
router.use((req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Hyr në llogari që të vazhdosh.'));
  next();
});

const orderLimiter = rateLimit({ windowMs: 10 * 60e3, max: 10, key: (req) => `order:${req.user.id}` });

router.get('/', (req, res) => {
  res.json({ orders: listCustomerOrders(req.user.id) });
});

router.post('/', orderLimiter, (req, res) => {
  const id = createOrder(req.user, req.body);
  const order = getAdminOrder(id);
  toAdmins('order:new', { id, number: order.number });
  const { view } = getCustomerOrder(req.user.id, order.number);
  res.status(201).json({ order: view });
});

/** Order + tracking info. The driver position is only included while *this* order is being handled. */
router.get('/:number', (req, res) => {
  const { row, view } = getCustomerOrder(req.user.id, req.params.number);
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
  const { row } = getCustomerOrder(req.user.id, req.params.number);
  if (row.status !== 'PENDING') {
    throw new HttpError(409, 'Kjo porosi s’mund të anulohet më.');
  }
  changeStatus(row.id, 'CANCELLED', req.user, { note: 'Cancelled by customer', allowFrom: ['PENDING'] });
  toAdmins('order:update', { id: row.id, number: row.number, status: 'CANCELLED' });
  toUser(req.user.id, 'order:update', { number: row.number, status: 'CANCELLED' });
  const updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(row.id);
  res.json({ ok: true, status: updated.status });
});

export default router;
