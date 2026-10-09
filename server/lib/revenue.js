import { db } from '../db.js';
import { orderProfit } from './orders.js';
import { addDays, businessDate, daysBetween, localParts, weekStart } from './time.js';
import { HttpError } from './util.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(range = 'today', from, to) {
  const today = businessDate();
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: weekStart(today), to: today };
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today };
    case 'custom': {
      if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw new HttpError(400, 'Pick a start and end date');
      if (from > to) throw new HttpError(400, 'Start date must be before end date');
      if (daysBetween(from, to) > 366) throw new HttpError(400, 'Range too long (max 1 year)');
      return { from, to };
    }
    default:
      throw new HttpError(400, 'Unknown range');
  }
}

/** Loads orders whose business date falls within [from, to]. */
function ordersInRange(from, to) {
  // Generous UTC window, then filter precisely by business date in JS.
  const lo = addDays(from, -1) + 'T00:00:00.000Z';
  const hi = addDays(to, 2) + 'T00:00:00.000Z';
  return db
    .prepare('SELECT * FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY created_at')
    .all(lo, hi)
    .filter((o) => {
      const d = businessDate(o.created_at);
      return d >= from && d <= to;
    });
}

// Hours shown on the hourly chart, in business-day order (06:00 → 05:00).
const HOUR_ORDER = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);

export function computeRevenue({ range, from, to }) {
  const r = resolveRange(range, from, to);
  const orders = ordersInRange(r.from, r.to);
  const delivered = orders.filter((o) => o.status === 'DELIVERED');

  const t = {
    revenue_cents: 0,
    product_sales_cents: 0,
    delivery_fees_cents: 0,
    product_cost_cents: 0,
    fuel_cost_cents: 0,
    discounts_cents: 0,
    product_profit_cents: 0,
    net_profit_cents: 0,
  };
  let deliveryMinutesSum = 0;
  let deliveryMinutesN = 0;

  const byHour = new Map(HOUR_ORDER.map((h) => [h, { hour: h, revenue_cents: 0, orders: 0 }]));
  const byDay = new Map();
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) byDay.set(d, { date: d, revenue_cents: 0, orders: 0 });

  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    byHour.get(localParts(new Date(o.created_at)).hour).orders += 1;
    const day = byDay.get(businessDate(o.created_at));
    if (day) day.orders += 1;
  }

  for (const o of delivered) {
    const p = orderProfit(o);
    t.revenue_cents += o.total_cents;
    t.product_sales_cents += o.subtotal_cents;
    t.delivery_fees_cents += o.delivery_fee_cents;
    t.product_cost_cents += o.cost_cents;
    t.fuel_cost_cents += o.fuel_cost_cents;
    t.discounts_cents += o.discount_cents || 0;
    t.product_profit_cents += p.product_profit_cents;
    t.net_profit_cents += p.net_profit_cents;
    byHour.get(localParts(new Date(o.created_at)).hour).revenue_cents += o.total_cents;
    const day = byDay.get(businessDate(o.created_at));
    if (day) day.revenue_cents += o.total_cents;
    if (o.delivered_at) {
      deliveryMinutesSum += (new Date(o.delivered_at) - new Date(o.created_at)) / 60e3;
      deliveryMinutesN += 1;
    }
  }

  const top = new Map();
  const categories = new Map();
  if (delivered.length) {
    const rows = db
      .prepare(
        `SELECT name, category, SUM(quantity) AS qty, SUM(line_total_cents) AS revenue_cents
         FROM order_items WHERE order_id IN (${delivered.map(() => '?').join(',')})
         GROUP BY name, category`,
      )
      .all(...delivered.map((o) => o.id));
    for (const row of rows) {
      top.set(row.name, row);
      const c = categories.get(row.category) || { category: row.category, qty: 0, revenue_cents: 0 };
      c.qty += row.qty;
      c.revenue_cents += row.revenue_cents;
      categories.set(row.category, c);
    }
  }

  return {
    range: r,
    totals: {
      ...t,
      orders_placed: orders.length,
      delivered: delivered.length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
      active: orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status)).length,
      avg_order_value_cents: delivered.length ? Math.round(t.revenue_cents / delivered.length) : 0,
      avg_delivery_minutes: deliveryMinutesN ? Math.round(deliveryMinutesSum / deliveryMinutesN) : null,
    },
    by_hour: [...byHour.values()],
    by_day: [...byDay.values()],
    top_products: [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
    categories: [...categories.values()].sort((a, b) => b.revenue_cents - a.revenue_cents),
  };
}
