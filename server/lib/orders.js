import { db, tx } from '../db.js';
import { getSettings } from './settings.js';
import { isWithinHours } from './time.js';
import { HttpError, haversineKm, int, normalizePhone, nowIso, num, str } from './util.js';

export const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY'];
/** Statuses during which the customer may see the driver's live position. */
export const TRACKABLE_STATUSES = ['ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY'];

const TRANSITIONS = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PURCHASING', 'CANCELLED'],
  PURCHASING: ['PURCHASED', 'CANCELLED'],
  PURCHASED: ['ON_THE_WAY', 'CANCELLED'],
  ON_THE_WAY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const TIMESTAMP_COLUMN = {
  ACCEPTED: 'accepted_at',
  PURCHASING: 'purchasing_at',
  PURCHASED: 'purchased_at',
  ON_THE_WAY: 'on_the_way_at',
  DELIVERED: 'delivered_at',
  CANCELLED: 'cancelled_at',
};

const ACTIVE_SQL = ACTIVE_STATUSES.map((s) => `'${s}'`).join(',');

export function activeOrderCount() {
  return db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status IN (${ACTIVE_SQL})`).get().n;
}

/** Whether new orders can be placed right now, and if not, why. */
export function orderingState(settings = getSettings()) {
  const active = activeOrderCount();
  const openNow = isWithinHours(settings.open_time, settings.close_time);
  let reason = null;
  if (!settings.business_online) reason = 'OFFLINE';
  else if (!openNow) reason = 'CLOSED';
  else if (active >= settings.max_active_orders) reason = 'BUSY';
  return { accepting: !reason, reason, active, max: settings.max_active_orders, openNow };
}

const REASON_MESSAGES = {
  OFFLINE: 'VND s’është online tani. Provo përsëri më vonë.',
  CLOSED: 'VND është mbyllur. Dorëzojmë 14:00–03:00.',
  BUSY: 'VND është i zënë tani. Provo sërish pas pak minutash.',
};

export function reasonMessage(reason, settings = getSettings()) {
  if (reason === 'CLOSED') return `VND është mbyllur. Dorëzojmë ${settings.open_time}–${settings.close_time}.`;
  return REASON_MESSAGES[reason] || '';
}

export function createOrder(user, body) {
  const settings = getSettings();
  const customerName = str(body?.customer_name, { min: 2, max: 80, field: 'Emri', lang: 'sq' });
  const phone = normalizePhone(body?.phone);
  if (!phone) throw new HttpError(400, 'Shkruaj një numër telefoni të vlefshëm');
  const address = str(body?.address, { min: 5, max: 200, field: 'Adresa e dorëzimit', lang: 'sq' });
  const notes = str(body?.notes, { max: 300, field: 'Shënimet', optional: true, lang: 'sq' });
  const lat = num(body?.lat, { min: -90, max: 90, field: 'Vendndodhja e dorëzimit', lang: 'sq' });
  const lng = num(body?.lng, { min: -180, max: 180, field: 'Vendndodhja e dorëzimit', lang: 'sq' });
  if (haversineKm(lat, lng, settings.base_lat, settings.base_lng) > settings.service_radius_km) {
    throw new HttpError(400, `Ende s’jemi te zona jote. VND tani dorëzon brenda ${settings.service_radius_km} km nga Viti.`, 'OUT_OF_AREA');
  }

  if (!Array.isArray(body?.items) || body.items.length === 0) throw new HttpError(400, 'Shporta është bosh');
  if (body.items.length > 30) throw new HttpError(400, 'Shumë produkte të ndryshme');
  const qtyById = new Map();
  for (const it of body.items) {
    const id = int(it?.product_id, { min: 1, field: 'Produkti', lang: 'sq' });
    const q = int(it?.quantity, { min: 1, max: 20, field: 'Sasia', lang: 'sq' });
    qtyById.set(id, Math.min(20, (qtyById.get(id) || 0) + q));
  }

  return tx(() => {
    const state = orderingState(settings);
    if (!state.accepting) throw new HttpError(409, reasonMessage(state.reason, settings), state.reason);

    const mine = db
      .prepare(`SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN (${ACTIVE_SQL})`)
      .get(user.id).n;
    if (mine >= settings.max_active_per_customer) {
      throw new HttpError(409, 'Ke tashmë një porosi në rrugë. Prit derisa të dorëzohet.', 'CUSTOMER_LIMIT');
    }

    const ids = [...qtyById.keys()];
    const products = db
      .prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids);
    if (products.length !== ids.length) throw new HttpError(400, 'Disa produkte s’janë më. Rifresko listen.');

    // Prices always come from the database, never from the browser.
    let subtotal = 0;
    let cost = 0;
    const lines = products.map((p) => {
      if (!p.available) throw new HttpError(409, `${p.name} s’është i disponueshëm tani`, 'UNAVAILABLE');
      if (p.price_cents <= 0) throw new HttpError(409, `${p.name} s’ka çmim ende. Andi e vendos te paneli.`, 'UNAVAILABLE');
      const q = qtyById.get(p.id);
      subtotal += p.price_cents * q;
      cost += p.cost_cents * q;
      return { p, q };
    });

    if (subtotal < settings.min_order_cents) {
      throw new HttpError(400, `Porosia minimale është €${(settings.min_order_cents / 100).toFixed(0)}`, 'MIN_ORDER');
    }

    const fee = settings.delivery_fee_cents;
    const now = new Date();
    const createdAt = now.toISOString();
    const etaFrom = new Date(now.getTime() + 20 * 60e3).toISOString();
    const etaTo = new Date(now.getTime() + 40 * 60e3).toISOString();

    const res = db
      .prepare(
        `INSERT INTO orders (number, user_id, customer_name, phone, address, notes, lat, lng, status,
          subtotal_cents, delivery_fee_cents, total_cents, cost_cents, fuel_cost_cents, eta_from, eta_to, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'TMP-' + createdAt + Math.random(),
        user.id,
        customerName,
        phone,
        address,
        notes,
        lat,
        lng,
        subtotal,
        fee,
        subtotal + fee,
        cost,
        settings.fuel_cost_cents,
        etaFrom,
        etaTo,
        createdAt,
        createdAt,
      );
    const orderId = Number(res.lastInsertRowid);
    const number = `VND-${1000 + orderId}`;
    db.prepare('UPDATE orders SET number = ? WHERE id = ?').run(number, orderId);

    const insItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, name, category, unit_price_cents, unit_cost_cents, quantity, line_total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const partnerName = new Map(db.prepare('SELECT slug, name FROM partners').all().map((r) => [r.slug, r.name]));
    for (const { p, q } of lines) {
      const name = p.partner && partnerName.has(p.partner) ? `${partnerName.get(p.partner)} · ${p.name}` : p.name;
      insItem.run(orderId, p.id, name, p.category, p.price_cents, p.cost_cents, q, p.price_cents * q);
    }
    db.prepare(
      "INSERT INTO order_status_history (order_id, status, changed_by, created_at) VALUES (?, 'PENDING', ?, ?)",
    ).run(orderId, user.id, createdAt);

    return orderId;
  });
}

/**
 * Discount given at the door. Percent applies to products only; a fixed amount can also cover
 * the delivery fee. The total is always recomputed here from the stored order, never taken from the browser.
 */
export function computePayment(order, payment) {
  const d = payment?.discount;
  let discount = 0;
  let label = '';
  if (d && d.type === 'percent') {
    const pct = num(d.value, { min: 0, max: 100, field: 'Discount' });
    discount = Math.round((order.subtotal_cents * pct) / 100);
    label = pct ? `${+pct.toFixed(2)}% off` : '';
  } else if (d && d.type === 'amount') {
    discount = int(d.value, { min: 0, max: order.subtotal_cents + order.delivery_fee_cents, field: 'Discount' });
    label = discount ? `€${(discount / 100).toFixed(2)} off` : '';
  } else if (d && d.type === 'free_delivery') {
    discount = order.delivery_fee_cents;
    label = 'Free delivery';
  }
  if (d?.label && discount) label = str(d.label, { max: 40, field: 'Discount label' });
  const total = order.subtotal_cents + order.delivery_fee_cents - discount;
  let cash = null;
  if (payment?.cash_received_cents !== undefined && payment.cash_received_cents !== null) {
    cash = int(payment.cash_received_cents, { min: 0, max: 100000, field: 'Cash received' });
    if (cash < total) throw new HttpError(400, `Cash received is less than the total (€${(total / 100).toFixed(2)})`);
  }
  return { discount_cents: discount, discount_label: label, total_cents: total, cash_received_cents: cash };
}

export function changeStatus(orderId, to, actor, { note = '', allowFrom, payment } = {}) {
  if (!TRANSITIONS[to]) throw new HttpError(400, 'Unknown status');
  return tx(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new HttpError(404, 'Order not found');
    if (allowFrom && !allowFrom.includes(order.status)) {
      throw new HttpError(409, `This order can no longer be changed (${order.status})`);
    }
    if (!TRANSITIONS[order.status].includes(to)) {
      throw new HttpError(409, `Cannot change order from ${order.status} to ${to}`);
    }
    if (to === 'DELIVERED' && payment) {
      const p = computePayment(order, payment);
      db.prepare(
        'UPDATE orders SET discount_cents = ?, discount_label = ?, total_cents = ?, cash_received_cents = ? WHERE id = ?',
      ).run(p.discount_cents, p.discount_label, p.total_cents, p.cash_received_cents, orderId);
      Object.assign(order, p);
    }
    const now = nowIso();
    const col = TIMESTAMP_COLUMN[to];
    db.prepare(
      `UPDATE orders SET status = ?, ${col} = ?, updated_at = ?, cancel_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancel_reason END WHERE id = ?`,
    ).run(to, now, now, to, note, orderId);
    db.prepare(
      'INSERT INTO order_status_history (order_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(orderId, to, actor.id, note, now);
    return { ...order, status: to };
  });
}

// ---------- Reading & serialising ----------

function itemsFor(orderIds) {
  if (orderIds.length === 0) return new Map();
  const rows = db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id`)
    .all(...orderIds);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.order_id)) map.set(r.order_id, []);
    map.get(r.order_id).push(r);
  }
  return map;
}

export function orderProfit(o) {
  const productProfit = o.subtotal_cents - o.cost_cents;
  return {
    product_profit_cents: productProfit,
    net_profit_cents: productProfit + o.delivery_fee_cents - o.fuel_cost_cents - (o.discount_cents || 0),
  };
}

function history(orderId) {
  return db
    .prepare('SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY id')
    .all(orderId);
}

/** Customer-safe view of an order: no purchase costs, no internal ids. */
export function customerView(o, items, withHistory = false) {
  const view = {
    number: o.number,
    status: o.status,
    customer_name: o.customer_name,
    phone: o.phone,
    address: o.address,
    notes: o.notes,
    lat: o.lat,
    lng: o.lng,
    payment_method: o.payment_method,
    subtotal_cents: o.subtotal_cents,
    delivery_fee_cents: o.delivery_fee_cents,
    discount_cents: o.discount_cents || 0,
    discount_label: o.discount_label || '',
    total_cents: o.total_cents,
    eta_from: o.eta_from,
    eta_to: o.eta_to,
    cancel_reason: o.cancel_reason,
    created_at: o.created_at,
    accepted_at: o.accepted_at,
    purchasing_at: o.purchasing_at,
    purchased_at: o.purchased_at,
    on_the_way_at: o.on_the_way_at,
    delivered_at: o.delivered_at,
    cancelled_at: o.cancelled_at,
    items: (items || []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price_cents: i.unit_price_cents,
      line_total_cents: i.line_total_cents,
    })),
  };
  if (withHistory) view.history = history(o.id).map(({ status, created_at }) => ({ status, created_at }));
  return view;
}

export function adminView(o, items, withHistory = false) {
  const view = {
    ...o,
    ...orderProfit(o),
    items: items || [],
  };
  if (withHistory) view.history = history(o.id);
  return view;
}

export function listCustomerOrders(userId) {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
  const items = itemsFor(rows.map((r) => r.id));
  return rows.map((r) => customerView(r, items.get(r.id)));
}

export function getCustomerOrder(userId, number) {
  const o = db.prepare('SELECT * FROM orders WHERE number = ? AND user_id = ?').get(number, userId);
  if (!o) throw new HttpError(404, 'S’e gjetëm këtë porosi');
  return { row: o, view: customerView(o, itemsFor([o.id]).get(o.id), true) };
}

export function getAdminOrder(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new HttpError(404, 'Order not found');
  return adminView(o, itemsFor([o.id]).get(o.id), true);
}

export function listActiveOrders() {
  const rows = db.prepare(`SELECT * FROM orders WHERE status IN (${ACTIVE_SQL}) ORDER BY id ASC`).all();
  const items = itemsFor(rows.map((r) => r.id));
  return rows.map((r) => adminView(r, items.get(r.id)));
}

export function listHistory({ from, to, status, customer, number, limit = 200 }) {
  const where = ["status IN ('DELIVERED','CANCELLED')"];
  const params = [];
  if (status && ['DELIVERED', 'CANCELLED'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (customer) {
    where.push('(customer_name LIKE ? OR phone LIKE ?)');
    params.push(`%${customer}%`, `%${customer}%`);
  }
  if (number) {
    where.push('number LIKE ?');
    params.push(`%${number.replace(/^#/, '')}%`);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at < ?');
    params.push(to);
  }
  const rows = db
    .prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`)
    .all(...params, Math.min(limit, 1000));
  const items = itemsFor(rows.map((r) => r.id));
  return rows.map((r) => adminView(r, items.get(r.id)));
}

export function trackableUserIds() {
  return db
    .prepare(
      `SELECT DISTINCT user_id FROM orders WHERE status IN (${TRACKABLE_STATUSES.map((s) => `'${s}'`).join(',')})`,
    )
    .all()
    .map((r) => r.user_id);
}
