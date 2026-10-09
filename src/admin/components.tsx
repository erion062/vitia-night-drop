import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, StatusBadge } from '../components/ui';
import { errorMessage } from '../lib/api';
import { euro, km, minutes, time } from '../lib/format';
import { distanceMeters, googleMapsDirections, roughEstimate } from '../lib/geo';
import { useAge } from '../lib/useRoute';
import type { AdminOrder, LatLng, OrderStatus } from '../types';
import { useAdmin } from './AdminContext';
import { CashCalculator } from './CashCalculator';

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: string }>> = {
  ACCEPTED: { to: 'PURCHASING', label: 'START PURCHASING', icon: 'bag' },
  PURCHASING: { to: 'PURCHASED', label: 'MARK AS PURCHASED', icon: 'check' },
  PURCHASED: { to: 'ON_THE_WAY', label: "I'M ON THE WAY", icon: 'car' },
  ON_THE_WAY: { to: 'DELIVERED', label: 'MARK DELIVERED', icon: 'check' },
};

/** Large, state-appropriate action buttons for one order. */
export function OrderActions({ order, big, showNavigate }: { order: AdminOrder; big?: boolean; showNavigate?: boolean }) {
  const { setStatus } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  async function go(to: OrderStatus, note?: string) {
    setBusy(true);
    setError('');
    try {
      await setStatus(order.id, to, note);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function decline(label: string) {
    const reason = prompt(`${label} order #${order.number}? Optional reason for the customer:`, '');
    if (reason === null) return;
    void go('CANCELLED', reason.trim() || (order.status === 'PENDING' ? 'Declined by VND' : 'Cancelled by VND'));
  }

  const cls = `btn ${big ? 'btn-xl' : 'btn-lg'}`;
  const next = NEXT[order.status];
  return (
    <div className="order-actions">
      {order.status === 'PENDING' && (
        <div className="btn-row">
          <button className={`${cls} btn-primary`} disabled={busy} onClick={() => go('ACCEPTED')}>
            <Icon name="check" /> ACCEPT
          </button>
          <button className={`${cls} btn-danger-outline`} disabled={busy} onClick={() => decline('Decline')}>
            <Icon name="x" /> DECLINE
          </button>
        </div>
      )}
      {next && next.to === 'DELIVERED' ? (
        <button className={`${cls} btn-primary btn-block`} disabled={busy} onClick={() => setPaying(true)}>
          <Icon name="euro" /> GET PAID · MARK DELIVERED
        </button>
      ) : (
        next && (
          <button className={`${cls} btn-primary btn-block`} disabled={busy} onClick={() => go(next.to)}>
            <Icon name={next.icon} /> {next.label}
          </button>
        )
      )}
      {paying && (
        <CashCalculator
          order={order}
          onClose={() => setPaying(false)}
          onConfirm={async (payment) => {
            try {
              await setStatus(order.id, 'DELIVERED', undefined, payment);
              setPaying(false);
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      )}
      {order.status === 'DELIVERED' && order.cash_received_cents != null && (
        <p className="muted small">
          Paid {euro(order.cash_received_cents)} · change {euro(order.cash_received_cents - order.total_cents)}
          {order.discount_cents > 0 && ` · ${order.discount_label} (−${euro(order.discount_cents)})`}
        </p>
      )}
      {showNavigate && order.status !== 'PENDING' && (
        <a className={`${cls} btn-outline btn-block`} href={googleMapsDirections(order)} target="_blank" rel="noopener noreferrer">
          <Icon name="nav" /> NAVIGATE TO CUSTOMER
        </a>
      )}
      {order.status === 'DELIVERED' && (
        <button className={`${cls} btn-block`} disabled>
          <Icon name="check" /> COMPLETED
        </button>
      )}
      {['ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY'].includes(order.status) && (
        <button className="link-danger" disabled={busy} onClick={() => decline('Cancel')}>
          Cancel order
        </button>
      )}
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}

export function useDistance(to: LatLng) {
  const { driverPos, settings } = useAdmin();
  const from = driverPos || (settings ? { lat: settings.base_lat, lng: settings.base_lng } : null);
  if (!from) return null;
  return { ...roughEstimate(from, to), fromDriver: !!driverPos, straight: distanceMeters(from, to) };
}

export function OrderCard({ order, selected, onSelect }: { order: AdminOrder; selected?: boolean; onSelect?: () => void }) {
  const d = useDistance(order);
  return (
    <div className={`order-card${selected ? ' selected' : ''}${order.status === 'PENDING' ? ' pending' : ''}`}>
      <div className="order-card-head" onClick={onSelect} role={onSelect ? 'button' : undefined}>
        <div>
          <b className="order-no">#{order.number}</b>
          <span className="muted"> · {time(order.created_at)}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="order-card-body" onClick={onSelect}>
        <div className="oc-line">
          <Icon name="user" size={16} /> <b>{order.customer_name}</b>
          <a href={`tel:${order.phone}`} className="muted" onClick={(e) => e.stopPropagation()}>
            {order.phone}
          </a>
        </div>
        <div className="oc-line">
          <Icon name="pin" size={16} /> {order.address}
        </div>
        {d && (
          <div className="oc-line muted">
            <Icon name="car" size={16} /> ~{km(d.meters)} · ~{minutes(d.seconds)} {d.fromDriver ? 'from you' : 'from base'}
          </div>
        )}
        {order.notes && (
          <div className="oc-line note">
            <Icon name="message" size={16} /> {order.notes}
          </div>
        )}
        <ul className="oc-items">
          {order.items.map((i) => (
            <li key={i.name}>
              <span>
                {i.quantity}× {i.name}
              </span>
              <span>{euro(i.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        <div className="oc-total">
          <span>Total (cash)</span>
          <b>{euro(order.total_cents)}</b>
        </div>
      </div>
      <OrderActions order={order} />
      <Link className="oc-open" to={`/admin/orders/${order.id}`}>
        Open order <Icon name="right" size={14} />
      </Link>
    </div>
  );
}

const GPS_TEXT: Record<string, string> = {
  off: 'Location sharing OFF',
  starting: 'Starting GPS…',
  live: 'Sharing live location',
  denied: 'GPS permission denied',
  signal: 'Waiting for GPS signal',
  unsupported: 'GPS not supported',
  insecure: 'GPS needs HTTPS',
};

const GPS_FAILED = ['denied', 'unsupported', 'insecure'];

export function GpsPanel({ compact }: { compact?: boolean }) {
  const { gps, settings } = useAdmin();
  const age = useAge(gps.lastSentAt ? new Date(gps.lastSentAt).toISOString() : null, 2000);
  const stale = gps.sharing && age !== null && age > 30;
  const disabled = settings?.location_sharing_enabled === false;
  const failed = GPS_FAILED.includes(gps.status);
  const tone = failed ? 'warn' : !gps.sharing ? 'off' : gps.status === 'live' && !stale ? 'on' : 'warn';
  return (
    <div className={`gps-panel tone-${tone}${compact ? ' compact' : ''}`}>
      <div className="gps-head">
        <Icon name="gps" size={20} />
        <div>
          <b>{stale ? 'Location temporarily unavailable' : GPS_TEXT[gps.status]}</b>
          <span>
            {gps.sharing && gps.status === 'live' && !stale ? 'Customers can see you' : 'Customers cannot see you'}
            {gps.lastSentAt ? ` · last update ${time(new Date(gps.lastSentAt).toISOString())}` : ''}
            {gps.fix?.accuracy ? ` · ±${Math.round(gps.fix.accuracy)} m` : ''}
          </span>
        </div>
      </div>
      {gps.error && <div className="gps-error">{gps.error}</div>}
      {disabled ? (
        <div className="gps-error">Location sharing is disabled in Settings.</div>
      ) : gps.sharing ? (
        <button className="btn btn-danger-outline btn-block" onClick={() => void gps.stop()}>
          STOP LOCATION SHARING
        </button>
      ) : (
        <button className="btn btn-primary btn-block" onClick={gps.start}>
          <Icon name="gps" size={18} /> START LOCATION SHARING
        </button>
      )}
    </div>
  );
}

export function NewOrderAlert() {
  const { alertOrder, dismissAlert, setStatus } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!alertOrder) return null;
  const o = alertOrder;

  async function act(to: OrderStatus, note?: string) {
    setBusy(true);
    setError('');
    try {
      await setStatus(o.id, to, note);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal new-order" role="alertdialog" aria-labelledby="new-order-title">
        <div className="new-order-head">
          <span className="ring">
            <Icon name="bell" size={26} />
          </span>
          <div>
            <h2 id="new-order-title">NEW ORDER</h2>
            <span className="muted">Received {time(o.created_at)}</span>
          </div>
          <button className="icon-btn" onClick={dismissAlert} aria-label="Hide (order stays pending)">
            <Icon name="x" />
          </button>
        </div>
        <div className="kv">
          <span>Order</span>
          <b>#{o.number}</b>
        </div>
        <div className="kv">
          <span>Customer</span>
          <b>
            {o.customer_name} · <a href={`tel:${o.phone}`}>{o.phone}</a>
          </b>
        </div>
        <div className="kv">
          <span>Address</span>
          <b className="right">{o.address}</b>
        </div>
        <ul className="oc-items">
          {o.items.map((i) => (
            <li key={i.name}>
              <span>
                {i.quantity}× {i.name}
              </span>
              <span>{euro(i.line_total_cents)}</span>
            </li>
          ))}
        </ul>
        <div className="oc-total big">
          <span>Order total (cash)</span>
          <b>{euro(o.total_cents)}</b>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="btn-row">
          <button className="btn btn-xl btn-primary" disabled={busy} onClick={() => act('ACCEPTED')}>
            ACCEPT ORDER
          </button>
          <button
            className="btn btn-xl btn-danger-outline"
            disabled={busy}
            onClick={() => {
              const r = prompt('Decline this order? Optional reason for the customer:', '');
              if (r !== null) void act('CANCELLED', r.trim() || 'Declined by VND');
            }}
          >
            DECLINE
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatCard({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`stat-card${tone ? ` tone-${tone}` : ''}`}>
      <div className="stat-icon">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <span className="stat-label">{label}</span>
        <b className="stat-value">{value}</b>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function CapacityCard() {
  const { state } = useAdmin();
  if (!state) return null;
  const full = state.active >= state.max;
  return (
    <div className={`stat-card capacity${full ? ' full' : ''}`}>
      <div className="stat-icon">
        <Icon name="cart" size={22} />
      </div>
      <div className="grow">
        <span className="stat-label">Active orders</span>
        <b className="stat-value">
          {state.active} / {state.max}
        </b>
        <div className="progress">
          <div style={{ width: `${Math.min(100, (state.active / state.max) * 100)}%` }} />
        </div>
        <span className="stat-sub">{full ? 'FULL — customers see “VND IS CURRENTLY BUSY”' : `${state.max - state.active} slot(s) free`}</span>
      </div>
    </div>
  );
}
