import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { guestOrders } from '../lib/guestOrders';
import { ACTIVE_STATUSES, dateTime, euro } from '../lib/format';
import { useStreamEvent } from '../lib/stream';
import { useAuth } from '../state/auth';
import type { CustomerOrder } from '../types';
import { TopBar } from './CustomerLayout';
import { itemCount } from './copy';
import type { TrackingData } from './useCustomerOrder';

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const load = useCallback(() => {
    if (user) {
      api<{ orders: CustomerOrder[] }>('/orders')
        .then((r) => setOrders(r.orders))
        .catch(() => setOrders([]));
      return;
    }
    const refs = guestOrders();
    if (refs.length === 0) {
      setOrders([]);
      return;
    }
    Promise.all(
      refs.map((g) =>
        api<TrackingData>(`/orders/${encodeURIComponent(g.number)}?token=${encodeURIComponent(g.token)}`)
          .then((d) => d.order)
          .catch(() => null),
      ),
    ).then((rows) => setOrders(rows.filter((o): o is CustomerOrder => !!o)));
  }, [user]);
  useEffect(load, [load]);
  useStreamEvent(['order:update', 'reconnect'], load);

  return (
    <div className="page">
      <TopBar title="Porositë e mia" />
      {!orders ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Empty icon="clock" title="Ende s’ke porosi">
          <p>Kur të vijë dëshira — ne dalim. S’ke nevojë për llogari.</p>
          <Link to="/shop" className="btn btn-primary">
            POROSIT TANI
          </Link>
        </Empty>
      ) : (
        <div className="order-list">
          {orders.map((o) => {
            const active = ACTIVE_STATUSES.includes(o.status);
            return (
              <Link key={o.number} to={active ? `/orders/${o.number}/track` : `/orders/${o.number}`} className={`card order-row${active ? ' active' : ''}`}>
                <div>
                  <b>#{o.number}</b>
                  <span>
                    {dateTime(o.created_at)} · {itemCount(o.items.reduce((s, i) => s + i.quantity, 0))}
                  </span>
                </div>
                <div className="order-row-right">
                  <StatusBadge status={o.status} sq />
                  <b>{euro(o.total_cents)}</b>
                </div>
                <Icon name="right" size={18} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
