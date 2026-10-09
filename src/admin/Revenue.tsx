import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, Spinner, CATEGORY_META } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { businessDate, euro } from '../lib/format';
import { usePolling, useStreamEvent } from '../lib/stream';
import type { Category } from '../types';
import { StatCard } from './components';

interface RevenueData {
  range: { from: string; to: string };
  totals: {
    revenue_cents: number;
    product_sales_cents: number;
    delivery_fees_cents: number;
    product_cost_cents: number;
    fuel_cost_cents: number;
    discounts_cents: number;
    product_profit_cents: number;
    net_profit_cents: number;
    orders_placed: number;
    delivered: number;
    cancelled: number;
    active: number;
    avg_order_value_cents: number;
    avg_delivery_minutes: number | null;
  };
  by_hour: { hour: number; revenue_cents: number; orders: number }[];
  by_day: { date: string; revenue_cents: number; orders: number }[];
  top_products: { name: string; qty: number; revenue_cents: number }[];
  categories: { category: Category; qty: number; revenue_cents: number }[];
}

type Range = 'today' | 'week' | 'month' | 'custom';

function BarChart({ data, format }: { data: { label: string; value: number; sub?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const showEvery = data.length > 16 ? Math.ceil(data.length / 12) : 1;
  return (
    <div className="bar-chart">
      <div className="bars">
        {data.map((d, i) => (
          <div key={i} className="bar-col" title={`${d.label}: ${format(d.value)}${d.sub ? ` · ${d.sub}` : ''}`}>
            <div className="bar" style={{ height: `${(d.value / max) * 100}%` }}>
              {d.value > 0 && data.length <= 16 && <span>{format(d.value)}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="bar-labels">
        {data.map((d, i) => (
          <span key={i}>{i % showEvery === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
}

export default function Revenue() {
  const today = businessDate();
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [data, setData] = useState<RevenueData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = new URLSearchParams({ range });
    if (range === 'custom') {
      q.set('from', from);
      q.set('to', to);
    }
    api<RevenueData>(`/admin/revenue?${q}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [range, from, to]);
  useEffect(load, [load]);
  useStreamEvent(['order:update', 'order:new'], load);
  usePolling(load, 60000);

  const t = data?.totals;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Revenue dashboard</h1>
          <p className="muted">Live from delivered orders. Revenue is money collected — profit is an estimate after costs.</p>
        </div>
        <div className="range-picker">
          {(['today', 'week', 'month', 'custom'] as Range[]).map((r) => (
            <button key={r} className={`chip${range === r ? ' on' : ''}`} onClick={() => setRange(r)}>
              {r === 'today' ? 'Today' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Custom'}
            </button>
          ))}
          {range === 'custom' && (
            <span className="date-range">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span>→</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </span>
          )}
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!data || !t ? (
        <Spinner />
      ) : (
        <>
          <div className="stat-grid">
            <StatCard icon="euro" label="Total revenue" value={euro(t.revenue_cents)} sub="products + delivery fees" />
            <StatCard icon="cart" label="Total orders" value={String(t.orders_placed)} sub={`${t.cancelled} cancelled · ${t.active} active`} />
            <StatCard icon="check" label="Completed deliveries" value={String(t.delivered)} sub={t.avg_delivery_minutes != null ? `avg ${t.avg_delivery_minutes} min to deliver` : undefined} />
            <StatCard icon="chart" label="Estimated net profit" value={euro(t.net_profit_cents)} sub="estimate, NOT revenue" tone="accent" />
          </div>

          <div className="rev-grid">
            <section className="panel span-2">
              <h2 className="panel-title">Revenue by hour</h2>
              <BarChart
                data={data.by_hour.map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.revenue_cents, sub: `${h.orders} orders` }))}
                format={(v) => euro(v)}
              />
            </section>

            <section className="panel">
              <h2 className="panel-title">Breakdown</h2>
              <div className="breakdown">
                <div>
                  <span>Product sales</span>
                  <b>{euro(t.product_sales_cents)}</b>
                </div>
                <div>
                  <span>Delivery fees</span>
                  <b>{euro(t.delivery_fees_cents)}</b>
                </div>
                <div className="hl">
                  <span>Total revenue</span>
                  <b>{euro(t.revenue_cents)}</b>
                </div>
                <div className="sub">
                  <span>− Estimated purchase cost</span>
                  <b>{euro(t.product_cost_cents)}</b>
                </div>
                <div>
                  <span>Estimated product profit (margin)</span>
                  <b>{euro(t.product_profit_cents)}</b>
                </div>
                <div className="sub">
                  <span>− Estimated delivery/fuel cost</span>
                  <b>{euro(t.fuel_cost_cents)}</b>
                </div>
                {t.discounts_cents > 0 && (
                  <div className="sub">
                    <span>− Offers / discounts given</span>
                    <b>{euro(t.discounts_cents)}</b>
                  </div>
                )}
                <div className="hl accent">
                  <span>Estimated net profit</span>
                  <b>{euro(t.net_profit_cents)}</b>
                </div>
                <div>
                  <span>Average order value</span>
                  <b>{euro(t.avg_order_value_cents)}</b>
                </div>
              </div>
              <p className="hint">Net profit = sale price − purchase cost + delivery fee − fuel cost. Adjust costs in Products and Settings.</p>
            </section>

            <section className="panel span-2">
              <h2 className="panel-title">Revenue by day</h2>
              <BarChart data={data.by_day.map((d) => ({ label: d.date.slice(5), value: d.revenue_cents, sub: `${d.orders} orders` }))} format={(v) => euro(v)} />
              <h2 className="panel-title mt">Orders by day</h2>
              <BarChart data={data.by_day.map((d) => ({ label: d.date.slice(5), value: d.orders }))} format={(v) => String(v)} />
            </section>

            <section className="panel">
              <h2 className="panel-title">Top selling products</h2>
              {data.top_products.length === 0 && <p className="muted">No delivered orders in this period yet.</p>}
              <ul className="top-list">
                {data.top_products.map((p) => (
                  <li key={p.name}>
                    <span>{p.name}</span>
                    <div className="top-bar">
                      <div style={{ width: `${(p.qty / data.top_products[0].qty) * 100}%` }} />
                    </div>
                    <b>{p.qty}</b>
                    <span className="muted">{euro(p.revenue_cents)}</span>
                  </li>
                ))}
              </ul>
              {data.categories.length > 0 && (
                <>
                  <h2 className="panel-title mt">By category</h2>
                  <ul className="top-list">
                    {data.categories.map((c) => (
                      <li key={c.category}>
                        <span>{CATEGORY_META[c.category]?.label || c.category}</span>
                        <div className="top-bar">
                          <div style={{ width: `${(c.revenue_cents / t.product_sales_cents) * 100}%` }} />
                        </div>
                        <b>{Math.round((c.revenue_cents / t.product_sales_cents) * 100)}%</b>
                        <span className="muted">{euro(c.revenue_cents)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
