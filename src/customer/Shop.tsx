import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CATEGORY_META, Empty, Spinner } from '../components/ui';
import { euro } from '../lib/format';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { Category } from '../types';
import { TopBar } from './CustomerLayout';
import { productWord } from './copy';
import { VenueCard } from './PartnerPage';
import { ProductRow } from './ProductRow';

export default function Shop() {
  const { config, products, partners, error, refreshConfig, refreshProducts } = useConfig();
  const { count, subtotal_cents } = useCart();
  const [params, setParams] = useSearchParams();
  const cat = (params.get('cat') || 'all') as Category | 'all';
  const q = params.get('q') || '';

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Partner menus live on their own page; they only join the main list when searching.
    return products
      .filter((p) => !p.partner || needle)
      .filter((p) => cat === 'all' || p.category === cat)
      .filter((p) => !needle || `${p.name} ${p.description}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.available) - Number(a.available));
  }, [products, cat, q]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="page shop">
      <TopBar title={cat === 'all' ? 'Dyqani' : CATEGORY_META[cat]?.sq} />
      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Kërko pije, cigare, pica…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Kërko produkte" />
      </div>
      <div className="chips">
        {(['all', ...Object.keys(CATEGORY_META)] as (Category | 'all')[]).map((c) => (
          <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => set('cat', c)}>
            {c === 'all' ? 'Të gjitha' : CATEGORY_META[c].sq}
          </button>
        ))}
      </div>

      {!q && cat === 'all' && partners.length > 0 && (
        <section>
          <h2 className="section-title">Restorantet dhe dyqanet</h2>
          <div className="venue-list">
            {partners.map((p) => (
              <VenueCard key={p.slug} partner={p} products={products} deliveryFee={config?.delivery_fee_cents ?? 400} />
            ))}
          </div>
        </section>
      )}

      {products.length === 0 ? (
        error ? (
          <Empty icon="alert" title="S’ka lidhje">
            <p>{error}</p>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                refreshConfig();
                refreshProducts();
              }}
            >
              Provo sërish
            </button>
          </Empty>
        ) : (
          <Spinner label="Produktet po ngarkohen…" />
        )
      ) : list.length === 0 ? (
        <Empty icon="search" title="S’u gjet asgjë">
          <p>Provo një kërkim tjetër ose hap një kategori.</p>
        </Empty>
      ) : (
        <div className="product-list">
          {list.map((p) => (
            <ProductRow key={p.id} product={p} showPartner />
          ))}
        </div>
      )}

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
