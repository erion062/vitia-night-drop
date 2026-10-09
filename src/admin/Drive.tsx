import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, Map, StatusBadge } from '../components/ui';
import { euro, km, minutes } from '../lib/format';
import { useRoute } from '../lib/useRoute';
import type { OrderStatus } from '../types';
import { useAdmin } from './AdminContext';
import { GpsPanel, OrderActions } from './components';

const PRIORITY: OrderStatus[] = ['ON_THE_WAY', 'PURCHASED', 'PURCHASING', 'ACCEPTED', 'PENDING'];

/** Simplified phone screen for the road: one order, big buttons, hand-off to the navigation app. */
export default function Drive() {
  const { orders, driverPos, settings } = useAdmin();
  const [params, setParams] = useSearchParams();
  const sorted = [...orders].sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status) || a.id - b.id);
  const order = sorted.find((o) => String(o.id) === params.get('id')) || sorted[0];
  const route = useRoute(order ? driverPos : null, order || null);

  return (
    <div className="adm-page drive">
      <div className="safety">
        <Icon name="alert" size={16} /> Use buttons only when safely stopped. Navigation opens in your maps app.
      </div>

      {sorted.length > 1 && (
        <div className="chips">
          {sorted.map((o) => (
            <button key={o.id} className={`chip${o.id === order?.id ? ' on' : ''}`} onClick={() => setParams({ id: String(o.id) }, { replace: true })}>
              #{o.number}
            </button>
          ))}
        </div>
      )}

      {!order ? (
        <>
          <Empty icon="steering" title="No active deliveries">
            <p>Accepted orders show up here with big buttons for the road.</p>
          </Empty>
          <GpsPanel />
        </>
      ) : (
        <>
          <Map
            center={order}
            driver={driverPos ? { pos: driverPos, heading: driverPos.heading, label: 'YOU', sub: settings?.vehicle_name } : null}
            destination={{ pos: order, label: 'CUSTOMER' }}
            route={route?.coords}
            className="map-drive"
          />
          <section className="drive-card">
            <div className="drive-head">
              <b>#{order.number}</b>
              <StatusBadge status={order.status} />
            </div>
            <div className="drive-customer">
              <b>{order.customer_name}</b>
              <span>{order.address}</span>
              {order.notes && <span className="note">“{order.notes}”</span>}
            </div>
            <div className="nav-stats">
              <div>
                <span>Distance</span>
                <b>{route ? km(route.meters) : '—'}</b>
              </div>
              <div>
                <span>ETA</span>
                <b>{route ? minutes(route.seconds) : '—'}</b>
              </div>
              <div>
                <span>Collect</span>
                <b>{euro(order.total_cents)}</b>
              </div>
            </div>
            <details className="drive-items">
              <summary>{order.items.reduce((s, i) => s + i.quantity, 0)} items to buy</summary>
              <ul>
                {order.items.map((i) => (
                  <li key={i.name}>
                    <b>{i.quantity}×</b> {i.name}
                  </li>
                ))}
              </ul>
            </details>
            <OrderActions order={order} big showNavigate />
            <a className="btn btn-xl btn-outline btn-block" href={`tel:${order.phone}`}>
              <Icon name="phone" /> CALL CUSTOMER
            </a>
          </section>
          <GpsPanel />
        </>
      )}
    </div>
  );
}
