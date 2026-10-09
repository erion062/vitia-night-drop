import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Map, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { STATUS_LABEL, euro, time } from '../lib/format';
import { usePolling, useStreamEvent } from '../lib/stream';
import type { OrderStatus } from '../types';
import { useAdmin } from './AdminContext';
import { CapacityCard, GpsPanel, OrderCard, StatCard } from './components';

interface Summary {
  today: {
    revenue_cents: number;
    net_profit_cents: number;
    orders_placed: number;
    delivered: number;
    avg_delivery_minutes: number | null;
  };
  activity: { status: OrderStatus; created_at: string; number: string; order_id: number; total_cents: number; customer_name: string }[];
  customers: number;
  visitors?: { live: number; today: number };
}

export default function Dashboard() {
  const { orders, settings, driverPos } = useAdmin();
  const [summary, setSummary] = useState<Summary | null>(null);
  const load = useCallback(() => {
    api<Summary>('/admin/summary').then(setSummary).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useStreamEvent(['order:new', 'order:update', 'customers', 'reconnect'], load);
  usePolling(load, 30000);

  const pending = orders.filter((o) => o.status === 'PENDING');
  const working = orders.filter((o) => o.status !== 'PENDING');
  const t = summary?.today;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>
            {greeting}, {settings?.driver_name || 'Whitey'}.
          </h1>
          <p className="muted">{pending.length ? `${pending.length} new order(s) waiting for you.` : 'Ready for orders.'}</p>
        </div>
      </div>

      <div className="stat-grid">
        <CapacityCard />
        <StatCard icon="clock" label="Today's orders" value={String(t?.orders_placed ?? 0)} sub={`${t?.delivered ?? 0} delivered`} />
        <StatCard icon="euro" label="Today's revenue" value={euro(t?.revenue_cents ?? 0)} sub="cash collected (delivered)" />
        <StatCard icon="chart" label="Est. net profit today" value={euro(t?.net_profit_cents ?? 0)} sub="estimate — not revenue" tone="accent" />
        <StatCard icon="user" label="Registered customers" value={String(summary?.customers ?? 0)} sub="accounts in the app" />
        <Link to="/admin/visitors" className="stat-link">
          <StatCard
            icon="eye"
            label="On the site now"
            value={String(summary?.visitors?.live ?? 0)}
            sub={`${summary?.visitors?.today ?? 0} unique visitors today`}
            tone="accent"
          />
        </Link>
      </div>

      <div className="dash-grid">
        <section className="panel">
          <h2 className="panel-title">
            New orders <span className="count">{pending.length}</span>
          </h2>
          {pending.length === 0 ? (
            <p className="muted pad">No orders waiting. New orders ring and pop up automatically.</p>
          ) : (
            pending.map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">
            Live map
            <Link to="/admin/map">Open</Link>
          </h2>
          <Map
            center={{ lat: settings?.base_lat ?? 42.3214, lng: settings?.base_lng ?? 21.3583 }}
            zoom={14}
            driver={driverPos ? { pos: driverPos, heading: driverPos.heading, label: 'You', sub: settings?.vehicle_name } : null}
            places={orders.map((o) => ({ id: o.id, pos: o, label: `#${o.number}`, sub: STATUS_LABEL[o.status], highlight: o.status === 'ON_THE_WAY' }))}
            serviceArea={settings ? { center: { lat: settings.base_lat, lng: settings.base_lng }, radiusKm: settings.service_radius_km } : null}
            className="map-dash"
          />
          <GpsPanel compact />
        </section>

        <section className="panel">
          <h2 className="panel-title">
            In progress <span className="count">{working.length}</span>
            <Link to="/admin/orders">All orders</Link>
          </h2>
          {working.length === 0 ? (
            <p className="muted pad">Nothing in progress.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {working.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`}>#{o.number}</Link>
                    </td>
                    <td>{o.customer_name}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>{euro(o.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 className="panel-title mt">Recent activity</h2>
          <ul className="activity">
            {(summary?.activity || []).map((a, i) => (
              <li key={i}>
                <span className={`dot s-${a.status}`} />
                <Link to={`/admin/orders/${a.order_id}`}>#{a.number}</Link>
                <span>{STATUS_LABEL[a.status]}</span>
                <span className="muted">{time(a.created_at)}</span>
              </li>
            ))}
            {summary && summary.activity.length === 0 && <li className="muted">No activity yet.</li>}
          </ul>
          <Link to="/admin/revenue" className="btn btn-outline btn-block mt">
            <Icon name="chart" size={18} /> Revenue dashboard
          </Link>
        </section>
      </div>
    </div>
  );
}
