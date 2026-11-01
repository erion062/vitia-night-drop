import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dateTime, euro } from '../lib/format';
import { useStreamEvent } from '../lib/stream';
import type { AdminOrder } from '../types';

interface CustomerRow {
  id: number;
  full_name: string;
  phone: string;
  created_at: string;
  guest: boolean;
  order_count: number;
  spent_cents: number;
  last_order_at: string | null;
}

export default function Customers() {
  const { id } = useParams();
  if (id) return <CustomerDetail id={id} />;
  return <CustomerList />;
}

function CustomerList() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    api<{ customers: CustomerRow[] }>(`/admin/customers?${params}`)
      .then((r) => {
        setRows(r.customers);
        setError('');
      })
      .catch((e) => {
        setRows([]);
        setError(errorMessage(e));
      });
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useStreamEvent(['customers', 'order:new', 'order:update'], load);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Customers</h1>
          <p className="muted">{rows ? `${rows.length} account${rows.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        </div>
      </div>
      <div className="filters">
        <label>
          Search
          <input placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="user" title="No customers yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Type</th>
                <th className="r">Orders</th>
                <th className="r">Spent</th>
                <th>Last order</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/admin/customers/${c.id}`}>{c.full_name || '—'}</Link>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.guest ? <span className="muted">Guest checkout</span> : 'Registered'}</td>
                  <td className="r">{c.order_count}</td>
                  <td className="r accent">{euro(c.spent_cents)}</td>
                  <td>{c.last_order_at ? dateTime(c.last_order_at) : '—'}</td>
                  <td>{dateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ customer: CustomerRow & { guest: boolean }; orders: AdminOrder[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ customer: CustomerRow & { guest: boolean }; orders: AdminOrder[] }>(`/admin/customers/${id}`)
      .then((r) => {
        setData(r);
        setError('');
      })
      .catch((e) => {
        setData(null);
        setError(errorMessage(e));
      });
  }, [id]);

  useEffect(load, [load]);
  useStreamEvent('order:update', load);

  if (error && !data) {
    return (
      <div className="adm-page">
        <Link to="/admin/customers" className="muted back-link">
          ← Customers
        </Link>
        <ErrorBox>{error}</ErrorBox>
      </div>
    );
  }
  if (!data) return <Spinner label="Loading customer…" />;

  const { customer: c, orders } = data;
  const spent = orders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.total_cents, 0);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <Link to="/admin/customers" className="muted back-link">
            ← Customers
          </Link>
          <h1>{c.full_name || 'Customer'}</h1>
          <p className="muted">
            {c.phone} · {c.guest ? 'Guest checkout' : 'Registered'} · Joined {dateTime(c.created_at)}
          </p>
        </div>
        <div className="right">
          <div className="muted small">Orders</div>
          <b>{orders.length}</b>
          <div className="muted small mt">Delivered spend</div>
          <b className="accent">{euro(spent)}</b>
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {orders.length === 0 ? (
        <Empty icon="list" title="No orders yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th className="r">Total</th>
                <th>Address</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/admin/orders/${o.id}`}>#{o.number}</Link>
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="r">{euro(o.total_cents)}</td>
                  <td>
                    <span className="muted small">{o.address}</span>
                  </td>
                  <td>{dateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
