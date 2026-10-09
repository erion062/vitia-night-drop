import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Map, StatusBadge } from '../components/ui';
import { STATUS_LABEL, km, minutes } from '../lib/format';
import { googleMapsDirections } from '../lib/geo';
import { useRoute } from '../lib/useRoute';
import { useAdmin } from './AdminContext';
import { GpsPanel } from './components';

export default function MapPage() {
  const { orders, driverPos, settings } = useAdmin();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = orders.find((o) => o.id === selectedId) || orders.find((o) => o.status === 'ON_THE_WAY') || null;
  const route = useRoute(selected ? driverPos : null, selected);

  return (
    <div className="adm-page map-page">
      <div className="map-page-grid">
        <Map
          center={{ lat: settings?.base_lat ?? 42.3214, lng: settings?.base_lng ?? 21.3583 }}
          zoom={14}
          driver={driverPos ? { pos: driverPos, heading: driverPos.heading, label: 'YOU ARE HERE', sub: settings?.vehicle_name } : null}
          destination={selected ? { pos: selected, label: `#${selected.number}`, sub: selected.address } : null}
          places={orders
            .filter((o) => o.id !== selected?.id)
            .map((o) => ({ id: o.id, pos: o, label: `#${o.number}`, sub: STATUS_LABEL[o.status], onClick: () => setSelectedId(o.id) }))}
          route={route?.coords}
          serviceArea={settings ? { center: { lat: settings.base_lat, lng: settings.base_lng }, radiusKm: settings.service_radius_km } : null}
          className="map-big"
        />
        <aside className="panel">
          <GpsPanel compact />
          {selected && (
            <div className="map-selected">
              <h3>
                #{selected.number} <StatusBadge status={selected.status} />
              </h3>
              <p>{selected.customer_name}</p>
              <p className="muted">{selected.address}</p>
              <div className="nav-stats">
                <div>
                  <span>Distance</span>
                  <b>{route ? km(route.meters) : '—'}</b>
                </div>
                <div>
                  <span>ETA</span>
                  <b>{route ? minutes(route.seconds) : '—'}</b>
                </div>
              </div>
              <a className="btn btn-lg btn-primary btn-block" href={googleMapsDirections(selected)} target="_blank" rel="noopener noreferrer">
                <Icon name="nav" /> NAVIGATE TO CUSTOMER
              </a>
              <Link className="btn btn-outline btn-block" to={`/admin/orders/${selected.id}`}>
                Open order
              </Link>
            </div>
          )}
          <h3 className="panel-title mt">Active orders</h3>
          {orders.length === 0 && <p className="muted">No active orders.</p>}
          {orders.map((o) => (
            <button key={o.id} className={`map-list-item${o.id === selected?.id ? ' on' : ''}`} onClick={() => setSelectedId(o.id)}>
              <b>#{o.number}</b>
              <span>{o.address}</span>
              <StatusBadge status={o.status} />
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
