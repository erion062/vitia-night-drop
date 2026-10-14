import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ErrorBox, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dateTime } from '../lib/format';

interface PromoCode {
  id: number;
  code: string;
  note: string;
  percent: number;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
  link: string;
  share: string;
}

const DURATIONS = [
  { hours: 0, label: 'No expiry' },
  { hours: 24, label: '24 h' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
];

function usesLeft(c: PromoCode) {
  if (!c.max_uses) return `${c.uses} used · unlimited`;
  return `${c.uses} / ${c.max_uses} used`;
}

export default function PromoCodes() {
  const [list, setList] = useState<PromoCode[] | null>(null);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('Marketing');
  const [hours, setHours] = useState(0);
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(() => {
    api<{ codes: PromoCode[] }>('/admin/promo-codes')
      .then((r) => setList(r.codes))
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ code: PromoCode; codes: PromoCode[] }>('/admin/promo-codes', {
        method: 'POST',
        body: {
          code: code.trim() || undefined,
          note,
          percent: 10,
          max_uses: maxUses === '' ? 0 : Number(maxUses),
          hours,
        },
      });
      setList(r.codes);
      setCode('');
      try {
        await navigator.clipboard.writeText(r.code.share);
      } catch {
        /* clipboard may be blocked */
      }
      setCopied(r.code.code);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: number) {
    try {
      const r = await api<{ codes: PromoCode[] }>(`/admin/promo-codes/${id}/toggle`, { method: 'POST' });
      setList(r.codes);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function copyShare(c: PromoCode) {
    await navigator.clipboard.writeText(c.share);
    setCopied(c.code);
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Promo codes</h1>
          <p className="muted">Create a code for the marketing girl. Customers who enter it at checkout get 10% off the delivery fee on that order.</p>
        </div>
      </div>

      <div className="ann-grid">
        <section className="panel">
          <h2 className="panel-title">New code</h2>
          <form onSubmit={create} className="settings-form">
            <label className="field">
              <span className="field-label">Code (leave blank to generate)</span>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ANA10" maxLength={16} autoCapitalize="characters" />
            </label>
            <label className="field">
              <span className="field-label">Who is this for</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Marketing girl / TikTok" maxLength={80} />
            </label>
            <label className="field">
              <span className="field-label">Max uses (blank = unlimited)</span>
              <input className="input" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
            </label>
            <div className="field">
              <span className="field-label">Expires</span>
              <div className="chips ann-chips">
                {DURATIONS.map((d) => (
                  <button type="button" key={d.hours} className={`chip${hours === d.hours ? ' on' : ''}`} onClick={() => setHours(d.hours)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">Discount is always 10% of the delivery fee, applied when they place the order.</p>
            <ErrorBox>{error}</ErrorBox>
            <button className="btn btn-primary" disabled={busy}>
              <Icon name="tag" size={18} /> {busy ? 'Creating…' : 'Create and copy text'}
            </button>
            {copied && <p className="accent">Copied {copied} — send it on WhatsApp.</p>}
          </form>
        </section>

        <section className="panel">
          <h2 className="panel-title">Codes ({list?.length ?? 0})</h2>
          {!list ? (
            <Spinner />
          ) : list.length === 0 ? (
            <p className="muted">No codes yet.</p>
          ) : (
            <ul className="ann-list">
              {list.map((c) => (
                <li key={c.id} className="ann-item">
                  <div>
                    <b>{c.code}</b>
                    <span className="muted small">
                      {c.note || '10% off delivery'} · {usesLeft(c)}
                      {c.expires_at ? ` · until ${dateTime(c.expires_at)}` : ''}
                      {!c.active ? ' · paused' : ''}
                    </span>
                  </div>
                  <div className="btn-row wrap">
                    <button className="btn btn-outline btn-sm" onClick={() => copyShare(c)}>
                      <Icon name="message" size={16} /> {copied === c.code ? 'Copied' : 'Copy for WhatsApp'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => toggle(c.id)}>
                      {c.active ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
