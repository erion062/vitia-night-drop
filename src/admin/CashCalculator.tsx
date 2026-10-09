import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { ErrorBox } from '../components/ui';
import { euro } from '../lib/format';
import type { AdminOrder, DiscountInput, PaymentInput } from '../types';

type Preset = { id: string; label: string; discount: DiscountInput };

const PRESETS: Preset[] = [
  { id: 'none', label: 'No offer', discount: null },
  { id: 'p5', label: '5%', discount: { type: 'percent', value: 5 } },
  { id: 'p10', label: '10%', discount: { type: 'percent', value: 10 } },
  { id: 'p15', label: '15%', discount: { type: 'percent', value: 15 } },
  { id: 'p20', label: '20%', discount: { type: 'percent', value: 20 } },
  { id: 'free', label: 'Free delivery', discount: { type: 'free_delivery' } },
  { id: 'e1', label: '€1 off', discount: { type: 'amount', value: 100 } },
  { id: 'e2', label: '€2 off', discount: { type: 'amount', value: 200 } },
];

const parseEuro = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** Mirrors the server's computePayment so the driver sees the exact figure that will be recorded. */
function discountCents(order: AdminOrder, d: DiscountInput) {
  if (!d) return 0;
  if (d.type === 'percent') return Math.round((order.subtotal_cents * Math.min(100, Math.max(0, d.value))) / 100);
  if (d.type === 'free_delivery') return order.delivery_fee_cents;
  return Math.min(d.value, order.subtotal_cents + order.delivery_fee_cents);
}

function quickAmounts(total: number) {
  const out = new Set<number>([total]);
  for (const step of [100, 500, 1000]) out.add(Math.ceil(total / step) * step);
  for (const note of [1000, 2000, 5000, 10000]) if (note >= total) out.add(note);
  return [...out].sort((a, b) => a - b).slice(0, 6);
}

export function CashCalculator({
  order,
  onClose,
  onConfirm,
}: {
  order: AdminOrder;
  onClose: () => void;
  onConfirm: (payment: PaymentInput) => Promise<void>;
}) {
  const [preset, setPreset] = useState('none');
  const [customPct, setCustomPct] = useState('');
  const [customEur, setCustomEur] = useState('');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const discount: DiscountInput = useMemo(() => {
    if (preset === 'pct') {
      const v = parseFloat(customPct.replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? { type: 'percent', value: Math.min(100, v) } : null;
    }
    if (preset === 'eur') {
      const c = parseEuro(customEur);
      return c ? { type: 'amount', value: c } : null;
    }
    return PRESETS.find((p) => p.id === preset)?.discount ?? null;
  }, [preset, customPct, customEur]);

  const original = order.subtotal_cents + order.delivery_fee_cents;
  const off = discountCents(order, discount);
  const total = original - off;
  const cash = received === '' ? null : parseEuro(received);
  const change = cash === null ? null : cash - total;

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm({ discount, cash_received_cents: cash });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cash-calc" role="dialog" aria-labelledby="cash-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="cash-title">Get paid · #{order.number}</h2>
            <span className="muted small">{order.customer_name} · cash on delivery</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="cc-section">
          <span className="field-label">Offer / discount</span>
          <div className="chips cc-chips">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={`chip${preset === p.id ? ' on' : ''}`} onClick={() => setPreset(p.id)}>
                {p.label}
              </button>
            ))}
            <button type="button" className={`chip${preset === 'pct' ? ' on' : ''}`} onClick={() => setPreset('pct')}>
              Other %
            </button>
            <button type="button" className={`chip${preset === 'eur' ? ' on' : ''}`} onClick={() => setPreset('eur')}>
              Other €
            </button>
          </div>
          {preset === 'pct' && (
            <label className="cc-inline">
              <input className="input" inputMode="decimal" autoFocus placeholder="12" value={customPct} onChange={(e) => setCustomPct(e.target.value)} />
              % off products
            </label>
          )}
          {preset === 'eur' && (
            <label className="cc-inline">
              €
              <input className="input" inputMode="decimal" autoFocus placeholder="3.00" value={customEur} onChange={(e) => setCustomEur(e.target.value)} />
              off the total
            </label>
          )}
        </div>

        <div className="cc-totals">
          <div>
            <span>Products</span>
            <span>{euro(order.subtotal_cents)}</span>
          </div>
          <div>
            <span>Delivery</span>
            <span>{euro(order.delivery_fee_cents)}</span>
          </div>
          {off > 0 && (
            <div className="cc-off">
              <span>Offer</span>
              <span>−{euro(off)}</span>
            </div>
          )}
          <div className="cc-due">
            <span>To collect</span>
            <b>{euro(total)}</b>
          </div>
          {off > 0 && <s className="muted small">{euro(original)}</s>}
        </div>

        <div className="cc-section">
          <span className="field-label">Cash received</span>
          <div className="cc-received">
            <span>€</span>
            <input className="input" inputMode="decimal" placeholder="20.00" value={received} onChange={(e) => setReceived(e.target.value)} />
          </div>
          <div className="chips cc-chips">
            {quickAmounts(total).map((c) => (
              <button key={c} type="button" className={`chip${cash === c ? ' on' : ''}`} onClick={() => setReceived((c / 100).toFixed(2))}>
                {c === total ? `Exact ${euro(c)}` : euro(c)}
              </button>
            ))}
          </div>
        </div>

        <div className={`cc-change${change === null ? '' : change < 0 ? ' short' : ' ok'}`}>
          <span>{change !== null && change < 0 ? 'Still missing' : 'Change to give'}</span>
          <b>{change === null ? '—' : euro(Math.abs(change))}</b>
        </div>

        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-xl btn-primary btn-block" disabled={busy || (change !== null && change < 0) || total < 0} onClick={confirm}>
          <Icon name="check" /> {busy ? 'Saving…' : `PAID ${euro(total)} · MARK DELIVERED`}
        </button>
      </div>
    </div>
  );
}
