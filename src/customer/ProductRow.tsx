import { ProductImage, QtyControl } from '../components/ui';
import { euro } from '../lib/format';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { Product } from '../types';

export function ProductRow({ product, showPartner }: { product: Product; showPartner?: boolean }) {
  const cart = useCart();
  const { partners } = useConfig();
  const qty = cart.qty(product.id);
  const from = showPartner && product.partner ? partners.find((p) => p.slug === product.partner)?.name : '';
  const desc = [from, product.description].filter(Boolean).join(' · ');
  return (
    <div className={`product-row${product.available ? '' : ' unavailable'}`}>
      <ProductImage product={product} size={64} />
      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="product-desc">{desc}</div>
        <div className="product-price">
          {!product.available
            ? 'Tani s’është i disponueshëm'
            : product.price_cents > 0
              ? euro(product.price_cents)
              : product.partner
                ? '€0.00 · Andi e vendos'
                : euro(0)}
        </div>
      </div>
      {product.available && product.price_cents > 0 && (
        <QtyControl qty={qty} onAdd={() => cart.add(product.id)} onRemove={() => cart.remove(product.id)} />
      )}
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const qty = cart.qty(product.id);
  return (
    <div className="product-card">
      <ProductImage product={product} size={84} />
      <div className="product-name">{product.name}</div>
      <div className="product-card-foot">
        <span className="product-price">{product.price_cents > 0 ? euro(product.price_cents) : '€0.00'}</span>
        {product.price_cents > 0 && <QtyControl qty={qty} onAdd={() => cart.add(product.id)} onRemove={() => cart.remove(product.id)} />}
      </div>
    </div>
  );
}
