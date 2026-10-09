import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, Spinner, StatusBadge, Timeline, Totals } from '../components/ui';
import { api, customerError } from '../lib/api';
import { euro, time } from '../lib/format';
import { TopBar } from './CustomerLayout';
import { sqCancelReason } from './copy';
import { useCustomerOrder } from './useCustomerOrder';

export default function OrderPage() {
  const { number = '' } = useParams();
  const [params] = useSearchParams();
  const placed = params.get('placed') === '1';
  const { data, error, reload } = useCustomerOrder(number);
  const [cancelErr, setCancelErr] = useState('');
  const [cancelling, setCancelling] = useState(false);

  if (error && !data) {
    return (
      <div className="page">
        <TopBar title="Porosia" back />
        <ErrorBox>{error}</ErrorBox>
        <p className="muted">Po provohet automatikisht kur shërbyesi të jetë gati.</p>
        <button className="btn btn-outline" type="button" onClick={reload}>
          Provo sërish
        </button>
      </div>
    );
  }
  if (!data) return <Spinner label="Porosia po ngarkohet…" />;
  const o = data.order;
  const done = o.status === 'DELIVERED';
  const cancelled = o.status === 'CANCELLED';

  async function cancel() {
    if (!confirm('Anulon këtë porosi?')) return;
    setCancelling(true);
    try {
      await api(`/orders/${o.number}/cancel`, { method: 'POST' });
      reload();
    } catch (e) {
      setCancelErr(customerError(e));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="page order-page">
      <TopBar title={`#${o.number}`} back />

      {placed && o.status === 'PENDING' ? (
        <section className="placed-hero">
          <div className="big-check">
            <Icon name="check" size={44} />
          </div>
          <h1>POROSIA U VENDOS</h1>
          <p>E morëm. Së shpejti e konfirmojmë — ti rri, ne dalim.</p>
        </section>
      ) : done ? (
        <section className="placed-hero">
          <div className="big-check">
            <Icon name="check" size={44} />
          </div>
          <h1>DORËZUAR</h1>
          <p>Kënaqu! Faleminderit që zgjodhe VND.</p>
        </section>
      ) : cancelled ? (
        <section className="placed-hero cancelled">
          <div className="big-check">
            <Icon name="x" size={44} />
          </div>
          <h1>POROSIA U ANULUA</h1>
          <p>{sqCancelReason(o.cancel_reason)}</p>
        </section>
      ) : null}

      <section className="card">
        <div className="kv">
          <span>Numri i porosisë</span>
          <b>#{o.number}</b>
        </div>
        <div className="kv">
          <span>Statusi</span>
          <StatusBadge status={o.status} sq />
        </div>
        {!done && !cancelled && (
          <div className="kv">
            <span>Dorëzimi i parashikuar</span>
            <b>
              {time(o.eta_from)} – {time(o.eta_to)}
            </b>
          </div>
        )}
        <div className="kv">
          <span>Te dera</span>
          <b className="right">{o.address}</b>
        </div>
      </section>

      {!cancelled && (
        <section className="card">
          <Timeline order={o} />
        </section>
      )}

      {!done && !cancelled && (
        <Link to={`/orders/${o.number}/track`} className="btn btn-primary btn-xl">
          <Icon name="map" /> NDJEK POROSINË
        </Link>
      )}

      <section className="card">
        <h3 className="card-title">Produktet</h3>
        <div className="summary-items">
          {o.items.map((i, idx) => (
            <div key={idx}>
              <span>
                {i.quantity}× {i.name}
              </span>
              <span>{euro(i.line_total_cents)}</span>
            </div>
          ))}
        </div>
        <Totals subtotal={o.subtotal_cents} fee={o.delivery_fee_cents} discount={o.discount_cents} discountLabel={o.discount_label} />
        <p className="hint">
          <Icon name="euro" size={14} /> Pagesa në dorëzim
        </p>
      </section>

      {o.status === 'PENDING' && (
        <>
          <ErrorBox>{cancelErr}</ErrorBox>
          <button className="btn btn-ghost-danger btn-block" onClick={cancel} disabled={cancelling}>
            Anulo porosinë
          </button>
        </>
      )}
      {(done || cancelled) && (
        <Link to="/shop" className="btn btn-outline btn-block">
          Porosit përsëri
        </Link>
      )}
    </div>
  );
}
