import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { CATEGORY_META } from '../components/ui';
import { api } from '../lib/api';
import { ACTIVE_STATUSES, belgradeHour, euro, euroShort } from '../lib/format';
import { useStreamEvent } from '../lib/stream';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { Category, CustomerOrder } from '../types';
import { StatusPill, TopBar } from './CustomerLayout';
import { SQ_STATUS, heroPitch, productWord, reasonTitle } from './copy';
import { VenueCard } from './PartnerPage';
import { ProductCard } from './ProductRow';

export default function Home() {
  const { config, products, partners } = useConfig();
  const { user } = useAuth();
  const { count, subtotal_cents } = useCart();
  const [active, setActive] = useState<CustomerOrder | null>(null);
  const [hour, setHour] = useState(() => belgradeHour());
  useEffect(() => {
    const id = window.setInterval(() => setHour(belgradeHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadActive = () => {
    if (!user) return setActive(null);
    api<{ orders: CustomerOrder[] }>('/orders')
      .then((r) => setActive(r.orders.find((o) => ACTIVE_STATUSES.includes(o.status)) || null))
      .catch(() => {});
  };
  useEffect(loadActive, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useStreamEvent('order:update', loadActive);

  const popular = products.filter((p) => p.popular && p.available).slice(0, 6);

  return (
    <div className="page home">
      <TopBar />
      <section className="hero">
        <Logo size="lg" tagline />
        <p className="hero-pitch">{heroPitch(hour)}</p>
        <div className="hero-status">
          <StatusPill reason={config?.reason} online={config ? config.online : undefined} />
        </div>
      </section>

      {config?.reason && (
        <div className={`notice ${config.reason === 'BUSY' ? 'notice-busy' : 'notice-off'}`}>
          <Icon name={config.reason === 'BUSY' ? 'alert' : 'clock'} size={20} />
          <div>
            <b>{reasonTitle(config.reason)}</b>
            <span>{config.reason_message}</span>
          </div>
        </div>
      )}

      {active && (
        <Link to={`/orders/${active.number}/track`} className="active-order-banner">
          <span className="pulse" />
          <div>
            <b>#{active.number}</b>
            <span>{SQ_STATUS[active.status]} · prek për ta ndjekur</span>
          </div>
          <Icon name="right" />
        </Link>
      )}

      <div className="info-row">
        <div>
          <Icon name="clock" size={18} />
          <span>Orari</span>
          <b>{config ? `${config.open_time}–${config.close_time}` : '14:00–23:00'}</b>
        </div>
        <div>
          <Icon name="bag" size={18} />
          <span>Min. porosia</span>
          <b>{euroShort(config?.min_order_cents ?? 500)}</b>
        </div>
        <div>
          <Icon name="car" size={18} />
          <span>Dorëzimi</span>
          <b>{euroShort(config?.delivery_fee_cents ?? 400)}</b>
        </div>
      </div>

      <Link to="/shop" className="btn btn-primary btn-xl">
        POROSIT TANI <Icon name="right" />
      </Link>

      {partners.length > 0 && (
        <section>
          <h2 className="section-title">Restorantet dhe dyqanet</h2>
          <div className="venue-list">
            {partners.map((p) => (
              <VenueCard key={p.slug} partner={p} products={products} deliveryFee={config?.delivery_fee_cents ?? 400} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Kategoritë</h2>
        <div className="cat-grid">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <Link key={c} to={`/shop?cat=${c}`} className="cat-tile">
              <Icon name={CATEGORY_META[c].icon} size={26} />
              <span>{CATEGORY_META[c].sq}</span>
              <Icon name="right" size={16} className="cat-arrow" />
            </Link>
          ))}
        </div>
      </section>

      {popular.length > 0 && (
        <section>
          <h2 className="section-title">
            Të kërkuara tani <Link to="/shop">Shih të gjitha</Link>
          </h2>
          <div className="popular-scroll">
            {popular.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <p className="fine-print">
        Pagesa në dorëzim · Viti, Kosovë · Cigare vetëm 18+ (mund të kërkohet letërnjoftimi)
      </p>

      {count > 0 && (
        <Link to="/basket" className="basket-bar">
          <span>
            <b>{count}</b> {productWord(count)}
          </span>
          <span>SHKO TE SHPORTA</span>
          <b>{euro(subtotal_cents)}</b>
        </Link>
      )}
    </div>
  );
}
