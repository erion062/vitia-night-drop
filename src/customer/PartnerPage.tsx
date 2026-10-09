import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, ProductImage, QtyControl, Spinner } from '../components/ui';
import { euro, euroShort } from '../lib/format';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { Partner, Product } from '../types';
import { TopBar } from './CustomerLayout';
import { productWord } from './copy';
import { ProductRow } from './ProductRow';

// Sizes/portions are separate products named "Pizza Margarita (30cm)"; they are shown as one dish.
const baseName = (name: string) => name.replace(/\s*\([^)]*\)$/, '');
const variantLabel = (name: string) => name.match(/\(([^)]*)\)$/)?.[1] || name;

export function PartnerTile({ partner }: { partner: Partner }) {
  return (
    <Link to={`/p/${partner.slug}`} className="partner-tile">
      {partner.logo_url ? <img src={partner.logo_url} alt="" className="partner-tile-logo" /> : <Icon name="bag" size={26} />}
      <div>
        <b>{partner.name}</b>
        <span>{partner.tagline}</span>
      </div>
      <Icon name="right" size={16} className="cat-arrow" />
    </Link>
  );
}

function DishGroup({ items }: { items: Product[] }) {
  const cart = useCart();
  const open = items.filter((p) => p.available);
  const first = open[0] || items[0];
  return (
    <div className={`product-row dish-group${open.length ? '' : ' unavailable'}`}>
      <ProductImage product={first} size={64} />
      <div className="product-info">
        <div className="product-name">{baseName(first.name)}</div>
        {open.length === 0 && <div className="product-price">Tani s’është i disponueshëm</div>}
        <div className="dish-variants">
          {open.map((p) => {
            const label = variantLabel(p.name);
            const hint = p.description && p.description.toLowerCase() !== label.toLowerCase() ? p.description : '';
            return (
              <div className="dish-variant" key={p.id}>
                <span className="dish-variant-label">
                  <b>{label}</b>
                  {hint && <small>{hint}</small>}
                </span>
                <span className="product-price">{p.price_cents > 0 ? euro(p.price_cents) : '€0.00'}</span>
                {p.price_cents > 0 && (
                  <QtyControl qty={cart.qty(p.id)} onAdd={() => cart.add(p.id)} onRemove={() => cart.remove(p.id)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PartnerPage() {
  const { slug } = useParams();
  const { config, partners, products } = useConfig();
  const { count, subtotal_cents } = useCart();
  const [params, setParams] = useSearchParams();
  const partner = partners.find((p) => p.slug === slug);
  const section = params.get('s') || 'all';

  const sections = useMemo(() => {
    const bySection = new Map<string, Map<string, Product[]>>();
    for (const p of products) {
      if (p.partner !== slug) continue;
      const s = p.section || 'Menu';
      if (!bySection.has(s)) bySection.set(s, new Map());
      const dishes = bySection.get(s)!;
      const key = baseName(p.name);
      dishes.set(key, [...(dishes.get(key) || []), p]);
    }
    return [...bySection.entries()].map(([name, dishes]) => ({ name, dishes: [...dishes.values()] }));
  }, [products, slug]);

  if (!partner) {
    return (
      <div className="page">
        <TopBar back title="Partneri" />
        {products.length === 0 ? (
          <Spinner label="Menyja po ngarkohet…" />
        ) : (
          <Empty icon="search" title="S’u gjet ky partner">
            <Link to="/shop" className="btn btn-outline">Shko te dyqani</Link>
          </Empty>
        )}
      </div>
    );
  }

  const shown = section === 'all' ? sections : sections.filter((s) => s.name === section);
  const pick = (s: string) => {
    const next = new URLSearchParams(params);
    if (s === 'all') next.delete('s');
    else next.set('s', s);
    setParams(next, { replace: true });
  };

  return (
    <div className="page partner-page">
      <TopBar back title={partner.name} />
      <section className="partner-hero">
        {partner.logo_url && <img src={partner.logo_url} alt={partner.name} className="partner-logo" />}
        <div>
          <h2>{partner.name}</h2>
          <p>{partner.tagline}</p>
          <p className="partner-meta">
            E sjell VND · Dorëzimi {euroShort(config?.delivery_fee_cents ?? 400)} · Pagesa në dorëzim
          </p>
        </div>
      </section>

      <div className="chips">
        <button className={`chip${section === 'all' ? ' on' : ''}`} onClick={() => pick('all')}>
          Të gjitha
        </button>
        {sections.map((s) => (
          <button key={s.name} className={`chip${section === s.name ? ' on' : ''}`} onClick={() => pick(s.name)}>
            {s.name}
          </button>
        ))}
      </div>

      {shown.map((s) => (
        <section key={s.name}>
          <h2 className="section-title">{s.name}</h2>
          <div className="product-list">
            {s.dishes.map((items) =>
              items.length === 1 && baseName(items[0].name) === items[0].name ? (
                <ProductRow key={items[0].id} product={items[0]} />
              ) : (
                <DishGroup key={items[0].id} items={items} />
              ),
            )}
          </div>
        </section>
      ))}

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
