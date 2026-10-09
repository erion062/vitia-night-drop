import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, ProductImage, QtyControl, Totals } from '../components/ui';
import { euro, euroShort } from '../lib/format';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import { TopBar } from './CustomerLayout';
import { reasonTitle } from './copy';

export default function Basket() {
  const cart = useCart();
  const { config } = useConfig();
  const { user } = useAuth();
  const nav = useNavigate();
  const min = config?.min_order_cents ?? 1000;
  const fee = config?.delivery_fee_cents ?? 400;
  const missing = Math.max(0, min - cart.subtotal_cents);
  const blocked = config && !config.accepting_orders;

  if (cart.lines.length === 0) {
    return (
      <div className="page">
        <TopBar title="Shporta jote" back />
        <Empty icon="cart" title="Shporta është bosh">
          <p>Pije, ushqime të lehta, cigare e gjëra të nevojshme — te dera, vonë natën. Ti rri, ne dalim.</p>
          <Link to="/shop" className="btn btn-primary">
            POROSIT TANI
          </Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page basket">
      <TopBar title="Shporta jote" back />
      <div className="card basket-lines">
        {cart.lines.map((l) => (
          <div key={l.product.id} className="basket-line">
            <ProductImage product={l.product} size={52} />
            <div className="product-info">
              <div className="product-name">{l.product.name}</div>
              <div className="product-desc">{euro(l.product.price_cents)} copa</div>
            </div>
            <div className="basket-line-right">
              <b>{euro(l.total_cents)}</b>
              <QtyControl qty={l.quantity} onAdd={() => cart.add(l.product.id)} onRemove={() => cart.remove(l.product.id)} />
            </div>
          </div>
        ))}
        <Link to="/shop" className="add-more">
          <Icon name="plus" size={16} /> Shto edhe
        </Link>
      </div>

      <div className="card">
        <Totals subtotal={cart.subtotal_cents} fee={fee} />
      </div>

      {missing > 0 ? (
        <div className="min-order">
          <div className="min-order-text">
            <Icon name="alert" size={18} />
            <span>
              <b>Porosia minimale është {euroShort(min)}</b> · shto edhe {euro(missing)}
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${Math.min(100, (cart.subtotal_cents / min) * 100)}%` }} />
          </div>
        </div>
      ) : (
        <div className="min-ok">
          <Icon name="check" size={18} /> Min. u arrit — mund ta vendosësh porosinë
        </div>
      )}

      {blocked && (
        <div className={`notice ${config.reason === 'BUSY' ? 'notice-busy' : 'notice-off'}`}>
          <Icon name="alert" size={20} />
          <div>
            <b>{reasonTitle(config.reason)}</b>
            <span>{config.reason_message}</span>
          </div>
        </div>
      )}

      <div className="sticky-cta">
        <button className="btn btn-primary btn-xl" disabled={missing > 0 || !!blocked} onClick={() => nav(user ? '/checkout' : '/login?next=/checkout')}>
          {missing > 0 ? `Porosia minimale është ${euroShort(min)}` : blocked ? 'Tani s’mund të porositësh' : `VAZHDO · ${euro(cart.subtotal_cents + fee)}`}
          {missing === 0 && !blocked && <Icon name="right" />}
        </button>
      </div>
    </div>
  );
}
