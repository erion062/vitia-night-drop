import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, Map, Spinner, StatusBadge } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { STATUS_LABEL, dateTime, euro, km, minutes, time } from '../lib/format';
import { googleMapsDirections } from '../lib/geo';
import { useStreamEvent } from '../lib/stream';
import { useRoute } from '../lib/useRoute';
import type { AdminOrder } from '../types';
import { useAdmin } from './AdminContext';
import { GpsPanel, OrderActions } from './components';

export default function OrderDetail() {
  const { id } = useParams();
  const { orders, driverPos, settings } = useAdmin();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ order: AdminOrder }>(`/admin/orders/${id}`)
      .then((r) => setOrder(r.order))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);
  useStreamEvent(['order:update', 'reconnect'], (d) => {
    if (!d || String(d.id) === id) load();
  });
  // Pick up status changes made from this page via the shared context.
  const live = orders.find((o) => String(o.id) === id);
  useEffect(() => {
    if (live && order && live.status !== order.status) load();
  }, [live?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = order && !['DELIVERED', 'CANCELLED'].includes(order.status);
  const route = useRoute(active ? driverPos : null, order);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!order) return <Spinner />;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <Link to="/admin/orders" className="muted back-link">
            <Icon name="left" size={16} /> Orders
          </Link>
          <h1>
            #{order.number} <StatusBadge status={order.status} />
          </h1>
          <p className="muted">Received {dateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <Map
            center={order}
            driver={driverPos ? { pos: driverPos, heading: driverPos.heading, label: 'YOU ARE HERE', sub: settings?.vehicle_name } : null}
            destination={{ pos: order, label: 'CUSTOMER', sub: order.address }}
            route={route?.coords}
            className="map-detail"
          />
          <div className="nav-stats">
            <div>
              <span>Customer</span>
              <b>{order.address}</b>
            </div>
            <div>
              <span>Distance</span>
              <b>{route ? km(route.meters) : driverPos ? '…' : '—'}</b>
            </div>
            <div>
              <span>ETA</span>
              <b>{route ? minutes(route.seconds) : driverPos ? '…' : '—'}</b>
            </div>
          </div>
          {!driverPos && active && <p className="hint">Start location sharing to see your position and the route.</p>}
          {route?.approximate && <p className="hint">Routing service unreachable — showing straight-line estimate.</p>}
          <a className="btn btn-xl btn-primary btn-block" href={googleMapsDirections(order)} target="_blank" rel="noopener noreferrer">
            <Icon name="nav" /> NAVIGATE TO CUSTOMER
          </a>
          {active && <GpsPanel compact />}
        </section>

        <section className="panel">
          <h2 className="panel-title">Customer</h2>
          <div className="kv">
            <span>Name</span>
            <b>{order.customer_name}</b>
          </div>
          <div className="kv">
            <span>Phone</span>
            <a href={`tel:${order.phone}`}>
              <b>{order.phone}</b>
            </a>
          </div>
          <div className="kv">
            <span>Address</span>
            <b className="right">{order.address}</b>
          </div>
          {order.notes && (
            <div className="kv">
              <span>Notes</span>
              <b className="right note">{order.notes}</b>
            </div>
          )}

          <h2 className="panel-title mt">Items</h2>
          <table className="table">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.name}>
                  <td>
                    {i.quantity}× {i.name}
                  </td>
                  <td className="muted">cost ~{euro((i.unit_cost_cents || 0) * i.quantity)}</td>
                  <td className="r">{euro(i.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="kv">
            <span>Product sales</span>
            <b>{euro(order.subtotal_cents)}</b>
          </div>
          <div className="kv">
            <span>Delivery fee</span>
            <b>{euro(order.delivery_fee_cents)}</b>
          </div>
          <div className="kv total">
            <span>Revenue (cash to collect)</span>
            <b>{euro(order.total_cents)}</b>
          </div>
          <div className="kv muted">
            <span>Est. net profit (after purchase cost & fuel)</span>
            <b className="accent">{euro(order.net_profit_cents)}</b>
          </div>

          <h2 className="panel-title mt">Actions</h2>
          <OrderActions order={order} big />

          <h2 className="panel-title mt">Status history</h2>
          <ul className="activity">
            {(order.history || []).map((h, i) => (
              <li key={i}>
                <span className={`dot s-${h.status}`} />
                <span>{STATUS_LABEL[h.status]}</span>
                {h.note && <span className="muted">{h.note}</span>}
                <span className="muted">{time(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
