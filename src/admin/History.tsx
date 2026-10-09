import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, euro } from '../lib/format';
import { useStreamEvent } from '../lib/stream';
import type { AdminOrder } from '../types';

export default function History() {
  const [f, setF] = useState({ from: '', to: '', status: '', customer: '', number: '' });
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ scope: 'history' });
    Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
    api<{ orders: AdminOrder[] }>(`/admin/orders?${q}`)
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
  }, [f]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useStreamEvent('order:update', (d) => {
    if (d?.status === 'DELIVERED' || d?.status === 'CANCELLED') load();
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const delivered = (orders || []).filter((o) => o.status === 'DELIVERED');

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Order history</h1>
          <p className="muted">
            {orders ? `${orders.length} orders · revenue ${euro(delivered.reduce((s, o) => s + o.total_cents, 0))} · est. profit ${euro(delivered.reduce((s, o) => s + o.net_profit_cents, 0))}` : ''}
          </p>
        </div>
      </div>
      <div className="filters">
        <label>
          From <input type="date" value={f.from} onChange={set('from')} />
        </label>
        <label>
          To <input type="date" value={f.to} onChange={set('to')} />
        </label>
        <label>
          Status
          <select value={f.status} onChange={set('status')}>
            <option value="">All</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label>
          Customer <input placeholder="Name or phone" value={f.customer} onChange={set('customer')} />
        </label>
        <label>
          Order # <input placeholder="VND-1001" value={f.number} onChange={set('number')} />
        </label>
      </div>
      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Empty icon="history" title="No orders match" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="r">Revenue</th>
                <th className="r">Est. profit</th>
                <th>Delivery time</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const doneAt = o.delivered_at || o.cancelled_at;
                const mins = o.delivered_at ? Math.round((new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 60000) : null;
                return (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`}>#{o.number}</Link>
                    </td>
                    <td>
                      {o.customer_name}
                      <div className="muted small">{o.phone}</div>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="r">{o.status === 'DELIVERED' ? euro(o.total_cents) : <span className="muted">{euro(o.total_cents)}</span>}</td>
                    <td className="r accent">{o.status === 'DELIVERED' ? euro(o.net_profit_cents) : '—'}</td>
                    <td>{mins != null ? `${mins} min` : '—'}</td>
                    <td>{dateTime(doneAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
