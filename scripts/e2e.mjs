// End-to-end API test of the full VND flow against a throwaway database.
// Run: npm run test:e2e
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const DB = 'data/e2e-test.db';
for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    DB_PATH: DB,
    ADMIN_PHONE: '044999999',
    ADMIN_PASSWORD: 'e2e-admin-pass',
    ENABLE_SIMULATION: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  passed++;
  console.log('  ✓ ' + msg);
}

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = '';
  }
  async req(method, path, body) {
    const res = await fetch(BASE + '/api' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), Origin: BASE },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  /** Opens the SSE stream and records events. */
  async stream() {
    this.events = [];
    this.ctrl = new AbortController();
    const res = await fetch(BASE + '/api/stream', { headers: { Cookie: this.cookie }, signal: this.ctrl.signal });
    if (res.status !== 200) throw new Error(`${this.name} stream status ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(chunk)?.[1];
            const data = /^data: (.+)$/m.exec(chunk)?.[1];
            if (ev) this.events.push({ ev, data: data ? JSON.parse(data) : null });
          }
        }
      } catch {
        /* aborted */
      }
    })();
    await this.waitFor('hello');
  }
  async waitFor(ev, pred = () => true, ms = 3000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const hit = this.events.find((e) => e.ev === ev && pred(e.data));
      if (hit) {
        this.events.splice(this.events.indexOf(hit), 1);
        return hit.data;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`${this.name}: timed out waiting for "${ev}"`);
  }
  has(ev) {
    return this.events.some((e) => e.ev === ev);
  }
  close() {
    this.ctrl?.abort();
  }
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not start:\n' + serverLog);
}

const VITI = { lat: 42.3225, lng: 21.3601 };
const rand = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');

async function main() {
  await waitForServer();
  const admin = new Client('admin');
  const alice = new Client('alice');
  const bob = new Client('bob');

  console.log('Admin setup');
  ok((await admin.req('POST', '/auth/login', { phone: '044 999 999', password: 'e2e-admin-pass' })).status === 200, 'admin logs in');
  // Make the test independent of the time of day.
  ok((await admin.req('PUT', '/admin/settings', { open_time: '00:00', close_time: '00:00' })).status === 200, 'admin opens 24h for test');

  console.log('1-2. Register & login');
  const alicePhone = '049' + rand();
  let r = await alice.req('POST', '/auth/register', { full_name: 'Alice Test', phone: alicePhone, password: 'secret12', confirm_password: 'secret12' });
  ok(r.status === 201 && r.data.user.role === 'customer', 'customer registers');
  ok((await alice.req('POST', '/auth/register', { full_name: 'Dup', phone: alicePhone, password: 'secret12' })).status === 409, 'duplicate phone rejected');
  await alice.req('POST', '/auth/logout');
  ok((await alice.req('POST', '/auth/login', { phone: alicePhone, password: 'wrong' })).status === 401, 'wrong password rejected');
  ok((await alice.req('POST', '/auth/login', { phone: alicePhone, password: 'secret12' })).status === 200, 'customer logs in');
  ok((await alice.req('GET', '/admin/orders')).status === 403, 'customer blocked from admin API');
  r = await admin.req('GET', '/admin/summary');
  ok(r.data.customers >= 1, `admin sees ${r.data.customers} registered customer(s)`);

  console.log('3. Browse');
  r = await alice.req('GET', '/products');
  const products = r.data.products;
  ok(products.length >= 20, `catalog has ${products.length} products`);
  ok(products.every((p) => p.cost_cents === undefined), 'purchase cost not exposed to customers');
  const redbull = products.find((p) => /^Red Bull 250ml$/i.test(p.name));
  const marlboro = products.find((p) => p.name === 'Marlboro Red');
  ok(redbull && marlboro, 'catalog includes Red Bull 250ml and Marlboro Red');

  console.log('4-7. Basket, minimum order, checkout');
  const order = { customer_name: 'Alice Test', phone: alicePhone, address: 'Rr. Rexhep Mala 5, Viti', notes: 'Blue door', ...VITI };
  r = await alice.req('POST', '/orders', { ...order, items: [{ product_id: redbull.id, quantity: 2 }] });
  ok(r.status === 400 && /Porosia minimale/.test(r.data.error), 'order under €10 rejected: ' + r.data.error);
  r = await alice.req('POST', '/orders', { ...order, lat: 42.66, lng: 21.16, items: [{ product_id: marlboro.id, quantity: 3 }] });
  ok(r.status === 400 && /zona jote/.test(r.data.error) && r.data.code === 'OUT_OF_AREA', 'address outside delivery area rejected: ' + r.data.error);
  ok((await admin.req('PUT', '/admin/settings', { service_radius_km: 0.2 })).status === 400, 'delivery radius below 0.5 km rejected');
  ok((await admin.req('PUT', '/admin/settings', { base_lat: 91 })).status === 400, 'invalid delivery centre rejected');
  r = await admin.req('PUT', '/admin/settings', { base_lat: 42.66, base_lng: 21.16, service_radius_km: 2.5 });
  ok(r.status === 200 && r.data.settings.service_radius_km === 2.5, 'admin moves delivery area');
  r = await alice.req('POST', '/orders', { ...order, items: [{ product_id: marlboro.id, quantity: 3 }] });
  ok(r.status === 400 && /2\.5 km/.test(r.data.error), 'old area now outside the moved radius');
  r = await admin.req('GET', '/config');
  ok(r.data.base_lat === 42.66 && r.data.service_radius_km === 2.5, 'public config exposes the delivery area');
  await admin.req('PUT', '/admin/settings', { base_lat: 42.3214, base_lng: 21.3583, service_radius_km: 15 });

  await admin.stream();
  await alice.stream();
  // Tampered prices/totals from the browser must be ignored.
  r = await alice.req('POST', '/orders', {
    ...order,
    total_cents: 1,
    items: [
      { product_id: redbull.id, quantity: 2, price_cents: 1 },
      { product_id: marlboro.id, quantity: 2 },
    ],
  });
  ok(r.status === 201, 'order placed (cash on delivery)');
  const placed = r.data.order;
  const expectedSubtotal = redbull.price_cents * 2 + marlboro.price_cents * 2;
  ok(placed.subtotal_cents === expectedSubtotal, `server computed subtotal ${placed.subtotal_cents}`);
  ok(placed.delivery_fee_cents === 400 && placed.total_cents === expectedSubtotal + 400, 'delivery fee €4 added server-side');
  ok(/^VND-\d{4}$/.test(placed.number) && placed.status === 'PENDING', `order number ${placed.number}, status PENDING`);
  ok(placed.payment_method === 'cash', 'payment is cash on delivery');

  console.log('8. Admin receives order in real time');
  const newEv = await admin.waitFor('order:new');
  ok(newEv.number === placed.number, 'admin got order:new event');
  r = await admin.req('GET', '/admin/orders');
  const adminOrder = r.data.orders.find((o) => o.number === placed.number);
  ok(!!adminOrder && adminOrder.cost_cents > 0, 'order on admin active list with purchase cost');
  ok(r.data.state.active === 1, 'active count 1 / 5');

  console.log('Privacy');
  const bobPhone = '045' + rand();
  await bob.req('POST', '/auth/register', { full_name: 'Bob', phone: bobPhone, password: 'secret12' });
  ok((await bob.req('GET', `/orders/${placed.number}`)).status === 404, "another customer cannot read Alice's order");
  ok((await bob.req('POST', `/orders/${placed.number}/cancel`)).status === 404, "another customer cannot cancel Alice's order");
  ok((await bob.req('POST', `/admin/orders/${adminOrder.id}/status`, { status: 'ACCEPTED' })).status === 403, 'customer cannot change status');
  await bob.stream();

  console.log('9-12. Accept → purchasing → purchased');
  const id = adminOrder.id;
  ok((await admin.req('POST', `/admin/orders/${id}/status`, { status: 'DELIVERED' })).status === 409, 'invalid jump PENDING→DELIVERED rejected');
  ok((await admin.req('POST', `/admin/orders/${id}/status`, { status: 'ACCEPTED' })).status === 200, 'admin accepts');
  ok((await alice.waitFor('order:update', (d) => d.status === 'ACCEPTED')).number === placed.number, 'customer notified: ACCEPTED');
  await admin.req('POST', `/admin/orders/${id}/status`, { status: 'PURCHASING' });
  await alice.waitFor('order:update', (d) => d.status === 'PURCHASING');
  ok(true, 'customer notified: PURCHASING');
  await admin.req('POST', `/admin/orders/${id}/status`, { status: 'PURCHASED' });
  await alice.waitFor('order:update', (d) => d.status === 'PURCHASED');
  r = await alice.req('GET', `/orders/${placed.number}`);
  ok(r.data.order.status === 'PURCHASED' && r.data.order.purchased_at && r.data.order.accepted_at, 'customer sees PURCHASED with timestamps');
  ok(r.data.location === null && r.data.trackable === true, 'no driver location before sharing starts');

  console.log('13-14. Driver location sharing');
  ok((await admin.req('POST', '/admin/location', { lat: 42.3301, lng: 21.3502, heading: 120, accuracy: 6 })).status === 200, 'driver sends GPS position');
  const loc = await alice.waitFor('location', (d) => d && d.lat === 42.3301);
  ok(loc.lng === 21.3502, 'customer receives live driver position via stream');
  r = await alice.req('GET', `/orders/${placed.number}`);
  ok(r.data.location?.lat === 42.3301, 'tracking endpoint includes driver position');
  ok(r.data.driver.name === 'Whitey' && r.data.driver.vehicle === 'Opel Corsa 1.7 Diesel', 'driver Whitey / Opel Corsa 1.7 Diesel');
  await new Promise((res) => setTimeout(res, 300));
  ok(!bob.has('location'), 'unrelated customer does NOT receive driver location');
  ok((await bob.req('POST', '/admin/location', { lat: 1, lng: 1 })).status === 403, 'customer cannot post driver location');

  console.log('15-16. On the way');
  await admin.req('POST', `/admin/orders/${id}/status`, { status: 'ON_THE_WAY' });
  await alice.waitFor('order:update', (d) => d.status === 'ON_THE_WAY');
  await admin.req('POST', '/admin/location', { lat: 42.327, lng: 21.355, heading: 130, accuracy: 5 });
  ok((await alice.waitFor('location', (d) => d && d.lat === 42.327)).lng === 21.355, 'customer sees driver moving');

  console.log('18-19. Delivered');
  await admin.req('POST', `/admin/orders/${id}/status`, { status: 'DELIVERED' });
  await alice.waitFor('order:update', (d) => d.status === 'DELIVERED');
  r = await alice.req('GET', `/orders/${placed.number}`);
  ok(r.data.order.status === 'DELIVERED' && r.data.order.delivered_at, 'customer sees DELIVERED');
  ok(r.data.location === null && r.data.trackable === false, 'driver location hidden once delivered');
  r = await alice.req('GET', `/orders/${placed.number}`);
  ok(r.data.order.history.length === 6, 'status history stored (6 entries)');
  await admin.req('DELETE', '/admin/location');

  console.log('20-21. Revenue & history');
  r = await admin.req('GET', '/admin/revenue?range=today');
  const t = r.data.totals;
  ok(t.revenue_cents === placed.total_cents, `revenue today ${t.revenue_cents} = order total`);
  ok(t.delivery_fees_cents === 400 && t.product_sales_cents === expectedSubtotal, 'product sales / delivery fees split');
  ok(t.net_profit_cents < t.revenue_cents && t.net_profit_cents === t.product_profit_cents + 400 - 100, 'net profit = margin + fee − fuel');
  ok(t.delivered === 1 && r.data.top_products.length === 2, 'completed deliveries + top products');
  ok(r.data.by_hour.length === 24 && r.data.by_day.length === 1, 'hourly and daily series');
  for (const range of ['week', 'month']) ok((await admin.req('GET', `/admin/revenue?range=${range}`)).data.totals.delivered === 1, `range ${range} works`);
  r = await admin.req('GET', `/admin/orders?scope=history&number=${placed.number}`);
  ok(r.data.orders.length === 1 && r.data.orders[0].status === 'DELIVERED', 'history contains the delivered order');

  console.log('Availability');
  await admin.req('PUT', `/admin/products/${redbull.id}`, { available: false });
  r = await bob.req('POST', '/orders', { ...order, phone: bobPhone, items: [{ product_id: redbull.id, quantity: 10 }] });
  ok(r.status === 409 && r.data.code === 'UNAVAILABLE', 'unavailable product cannot be ordered');
  ok((await bob.req('GET', '/products')).data.products.find((p) => p.id === redbull.id).available === false, 'catalog shows it unavailable');
  await admin.req('PUT', `/admin/products/${redbull.id}`, { available: true });

  console.log('Active order limit (5)');
  const customers = [];
  for (let i = 0; i < 6; i++) {
    const c = new Client('c' + i);
    const phone = '043' + rand();
    await c.req('POST', '/auth/register', { full_name: 'Cust ' + i, phone, password: 'secret12' });
    customers.push({ c, phone });
  }
  for (let i = 0; i < 5; i++) {
    const { c, phone } = customers[i];
    r = await c.req('POST', '/orders', { ...order, phone, items: [{ product_id: marlboro.id, quantity: 3 }] });
    ok(r.status === 201, `order ${i + 1}/5 accepted`);
  }
  r = await customers[5].c.req('POST', '/orders', { ...order, phone: customers[5].phone, items: [{ product_id: marlboro.id, quantity: 3 }] });
  ok(r.status === 409 && r.data.code === 'BUSY' && /zënë/.test(r.data.error), '6th order blocked: ' + r.data.error);
  ok((await customers[5].c.req('GET', '/config')).data.reason === 'BUSY', 'public config reports BUSY');
  // Cancelled orders free capacity.
  const first = (await admin.req('GET', '/admin/orders')).data.orders[0];
  await admin.req('POST', `/admin/orders/${first.id}/status`, { status: 'CANCELLED', note: 'test' });
  r = await customers[5].c.req('POST', '/orders', { ...order, phone: customers[5].phone, items: [{ product_id: marlboro.id, quantity: 3 }] });
  ok(r.status === 201, 'capacity frees up after a cancellation');

  console.log('Cash calculator & offers');
  const payOrder = (await admin.req('GET', '/admin/orders')).data.orders.find((o) => o.status === 'PENDING');
  for (const s of ['ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY']) await admin.req('POST', `/admin/orders/${payOrder.id}/status`, { status: s });
  const due = payOrder.subtotal_cents + payOrder.delivery_fee_cents - Math.round(payOrder.subtotal_cents * 0.1);
  r = await admin.req('POST', `/admin/orders/${payOrder.id}/status`, {
    status: 'DELIVERED',
    payment: { discount: { type: 'percent', value: 10 }, cash_received_cents: due - 1 },
  });
  ok(r.status === 400 && /less than the total/.test(r.data.error), 'cash below the discounted total is rejected');
  r = await admin.req('POST', `/admin/orders/${payOrder.id}/status`, {
    status: 'DELIVERED',
    payment: { discount: { type: 'percent', value: 10 }, cash_received_cents: 2000, total_cents: 1 },
  });
  ok(r.status === 200 && r.data.order.total_cents === due, `10% off recomputed on the server (${due}), browser total ignored`);
  ok(r.data.order.discount_label === '10% off' && r.data.order.cash_received_cents === 2000, 'discount label and cash received stored');
  ok(r.data.order.net_profit_cents === r.data.order.product_profit_cents + r.data.order.delivery_fee_cents - r.data.order.fuel_cost_cents - r.data.order.discount_cents, 'profit accounts for the discount');
  const payer = customers.find((c) => c.phone && payOrder.phone.endsWith(c.phone.slice(1)));
  if (payer) {
    const seen = (await payer.c.req('GET', `/orders/${payOrder.number}`)).data.order;
    ok(seen.discount_cents === payOrder.subtotal_cents - (due - payOrder.delivery_fee_cents) && seen.total_cents === due, 'customer sees the discount on their order');
  }
  r = await admin.req('GET', '/admin/revenue?range=today');
  ok(r.data.totals.discounts_cents === Math.round(payOrder.subtotal_cents * 0.1), 'revenue reports discounts given');

  console.log('Offline switch');
  await admin.req('PUT', '/admin/settings', { business_online: false });
  ok((await bob.req('GET', '/config')).data.reason === 'OFFLINE', 'offline switch blocks ordering');

  console.log('Announcements');
  r = await bob.req('POST', '/admin/announcements', { message: 'Not allowed', hours: 1 });
  ok(r.status === 403, 'customers cannot post announcements');
  r = await admin.req('POST', '/admin/announcements', { message: '10% off all drinks tonight!', tone: 'promo', hours: 9 });
  ok(r.status === 201, 'admin posts a 9 h announcement');
  const annId = r.data.id;
  r = await admin.req('POST', '/admin/announcements', { message: 'Stays until removed', tone: 'info', hours: 0 });
  ok(r.status === 201, 'admin posts an open-ended announcement');
  let pub = (await bob.req('GET', '/config')).data.announcements;
  ok(pub.length === 2 && pub.some((a) => a.id === annId && a.expires_at), 'public config lists live announcements with expiry');
  ok(pub.some((a) => a.expires_at === null), 'open-ended announcement has no expiry');
  r = await admin.req('POST', '/admin/announcements', { message: 'x', hours: 1 });
  ok(r.status === 400, 'too-short message rejected');
  r = await admin.req('DELETE', `/admin/announcements/${annId}`);
  ok(r.status === 200, 'admin removes announcement');
  pub = (await bob.req('GET', '/config')).data.announcements;
  ok(pub.length === 1 && !pub.some((a) => a.id === annId), 'removed announcement disappears for customers');

  [admin, alice, bob].forEach((c) => c.close());
  console.log(`\nALL ${passed} CHECKS PASSED`);
}

main()
  .catch((e) => {
    console.error('\n' + e.message);
    console.error('--- server log ---\n' + serverLog);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
    setTimeout(() => {
      for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });
      process.exit();
    }, 300);
  });
