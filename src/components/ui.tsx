import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { SQ_STATUS, sqDiscountLabel } from '../customer/copy';
import { STATUS_LABEL, euro, time } from '../lib/format';
import type { Category, OrderStatus, Product } from '../types';
import { Icon } from './Icon';

const MapViewLazy = lazy(() => import('./MapView'));

/** Map is code-split so Leaflet only loads on pages that need it. */
export function Map({
  loadingLabel = 'Loading map…',
  ...props
}: ComponentProps<typeof MapViewLazy> & { loadingLabel?: string }) {
  return (
    <Suspense fallback={<div className={`map-wrap map-loading ${props.className || ''}`}>{loadingLabel}</div>}>
      <MapViewLazy {...props} />
    </Suspense>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </div>
  );
}

export function Field({
  label,
  icon,
  error,
  ...input
}: { label: string; icon?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-box">
        {icon && <Icon name={icon} size={18} />}
        <input {...input} />
      </span>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export const CATEGORY_META: Record<Category, { label: string; sq: string; icon: string }> = {
  drinks: { label: 'Drinks', sq: 'Pije', icon: 'drinks' },
  food: { label: 'Food', sq: 'Ushqim', icon: 'food' },
  snacks: { label: 'Snacks', sq: 'Ushqime të lehta', icon: 'snacks' },
  cigarettes: { label: 'Cigarettes', sq: 'Cigare', icon: 'cigarettes' },
  other: { label: 'Other', sq: 'Higjienë', icon: 'other' },
};

export function ProductImage({ product, size = 64 }: { product: Pick<Product, 'image_url' | 'accent' | 'category' | 'name'>; size?: number }) {
  if (product.image_url) {
    return (
      <img className="product-img" src={product.image_url} alt={product.name} width={size} height={size} loading="lazy" decoding="async" style={{ width: size, height: size }} />
    );
  }
  // Clean generated tile (no stock photo needed). Upload a real photo in Admin → Products.
  return (
    <div className="product-img tile" style={{ width: size, height: size, ['--tile' as string]: product.accent }} aria-label={product.name}>
      <Icon name={CATEGORY_META[product.category]?.icon || 'other'} size={Math.round(size * 0.42)} />
    </div>
  );
}

export function QtyControl({ qty, onAdd, onRemove, disabled }: { qty: number; onAdd: () => void; onRemove: () => void; disabled?: boolean }) {
  if (qty === 0) {
    return (
      <button type="button" className="add-btn" onClick={onAdd} disabled={disabled} aria-label="Shto">
        <Icon name="plus" size={20} />
      </button>
    );
  }
  return (
    <div className="qty">
      <button type="button" onClick={onRemove} aria-label="Hiq një">
        <Icon name={qty === 1 ? 'trash' : 'minus'} size={16} />
      </button>
      <span>{qty}</span>
      <button type="button" onClick={onAdd} disabled={disabled || qty >= 20} aria-label="Shto një">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: 'warn',
  ACCEPTED: 'blue',
  PURCHASING: 'blue',
  PURCHASED: 'accent',
  ON_THE_WAY: 'accent',
  DELIVERED: 'muted',
  CANCELLED: 'danger',
};

export function StatusBadge({ status, sq }: { status: OrderStatus; sq?: boolean }) {
  const label = sq ? SQ_STATUS[status] : STATUS_LABEL[status];
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{label.toUpperCase()}</span>;
}

/** Customer-facing progress: Received → Accepted → Purchased → On the way → Delivered. */
const STEPS: { key: string; label: string; doneLabel?: string; at: (o: TimelineOrder) => string | null; reached: OrderStatus[] }[] = [
  { key: 'received', label: 'Porosia u mor', at: (o) => o.created_at, reached: ['PENDING', 'ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY', 'DELIVERED'] },
  { key: 'accepted', label: 'Pranuar', at: (o) => o.accepted_at, reached: ['ACCEPTED', 'PURCHASING', 'PURCHASED', 'ON_THE_WAY', 'DELIVERED'] },
  { key: 'purchased', label: 'Duke bli', doneLabel: 'U ble', at: (o) => o.purchased_at || o.purchasing_at, reached: ['PURCHASED', 'ON_THE_WAY', 'DELIVERED'] },
  { key: 'onway', label: 'Në rrugë', at: (o) => o.on_the_way_at, reached: ['ON_THE_WAY', 'DELIVERED'] },
  { key: 'delivered', label: 'Dorëzuar', at: (o) => o.delivered_at, reached: ['DELIVERED'] },
];

interface TimelineOrder {
  status: OrderStatus;
  created_at: string;
  accepted_at: string | null;
  purchasing_at: string | null;
  purchased_at: string | null;
  on_the_way_at: string | null;
  delivered_at: string | null;
}

export function Timeline({ order, compact }: { order: TimelineOrder; compact?: boolean }) {
  const inProgress = (key: string) => key === 'purchased' && order.status === 'PURCHASING';
  return (
    <ol className={`timeline${compact ? ' compact' : ''}`}>
      {STEPS.map((s) => {
        const done = s.reached.includes(order.status);
        const active = !done && inProgress(s.key);
        return (
          <li key={s.key} className={done ? 'done' : active ? 'active' : ''}>
            <span className="dot">{done ? <Icon name="check" size={14} /> : null}</span>
            <span className="t-label">{done && s.doneLabel ? s.doneLabel : active ? `${s.label}…` : s.label}</span>
            <span className="t-time">{done || active ? time(s.at(order)) : '—'}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Totals({ subtotal, fee, discount = 0, discountLabel }: { subtotal: number; fee: number; discount?: number; discountLabel?: string }) {
  return (
    <div className="totals">
      <div>
        <span>Nëntotali</span>
        <span>{euro(subtotal)}</span>
      </div>
      <div>
        <span>Tarifa e dorëzimit</span>
        <span>{euro(fee)}</span>
      </div>
      {discount > 0 && (
        <div className="accent">
          <span>{sqDiscountLabel(discountLabel)}</span>
          <span>−{euro(discount)}</span>
        </div>
      )}
      <div className="grand">
        <span>Gjithsej</span>
        <span>{euro(subtotal + fee - discount)}</span>
      </div>
    </div>
  );
}

export function Empty({ icon = 'bag', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
