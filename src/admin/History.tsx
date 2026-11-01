import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, euro } from '../lib/format';
import { useStreamEvent } from '../lib/stream';
import type { AdminOrder, OrderStatus } from '../types';

const STATUS_FILTERS: { value: '' | OrderStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PURCHASING', label: 'Purchasing' },
  { value: 'PURCHASED', label: 'Purchased' },
  { value: 'ON_THE_WAY', label: 'On the way' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

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
  useStreamEvent('order:update', load);
  useStreamEvent('order:new', load);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const delivered = (orders || []).filter((o) => o.status === 'DELIVERED');

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>All orders</h1>
          <p className="muted">
            {orders
              ? `${orders.length} shown · delivered revenue ${euro(delivered.reduce((s, o) => s + o.total_cents, 0))} · est. profit ${euro(delivered.reduce((s, o) => s + o.net_profit_cents, 0))}`
              : ''}
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
            {STATUS_FILTERS.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
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
                <th className="r">Total</th>
                <th className="r">Est. profit</th>
                <th>Placed</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const doneAt = o.delivered_at || o.cancelled_at;
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
                    <td className="r">{euro(o.total_cents)}</td>
                    <td className="r accent">{o.status === 'DELIVERED' ? euro(o.net_profit_cents) : '—'}</td>
                    <td>{dateTime(o.created_at)}</td>
                    <td>{doneAt ? dateTime(doneAt) : '—'}</td>
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
