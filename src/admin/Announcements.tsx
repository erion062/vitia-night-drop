import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnnouncementBar } from '../components/AnnouncementBar';
import { Icon } from '../components/Icon';
import { ErrorBox, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dateTime } from '../lib/format';
import { useConfig } from '../state/config';
import type { Announcement, AnnouncementTone } from '../types';

const DURATIONS = [
  { hours: 1, label: '1 h' },
  { hours: 3, label: '3 h' },
  { hours: 6, label: '6 h' },
  { hours: 9, label: '9 h' },
  { hours: 12, label: '12 h' },
  { hours: 24, label: '24 h' },
  { hours: 72, label: '3 days' },
  { hours: 0, label: 'Until I remove it' },
];

const TONES: { id: AnnouncementTone; label: string }[] = [
  { id: 'promo', label: 'Offer' },
  { id: 'info', label: 'Info' },
  { id: 'warning', label: 'Warning' },
];

const EXAMPLES = ['10% off all drinks tonight!', 'Free delivery on orders over €25 until midnight', 'Delivery may be slower tonight because of the rain'];

function remaining(expires: string | null) {
  if (!expires) return 'Until removed';
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3600e3);
  const m = Math.round((ms % 3600e3) / 60e3);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

export default function Announcements() {
  const { refreshConfig } = useConfig();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<AnnouncementTone>('promo');
  const [hours, setHours] = useState(9);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  const load = useCallback(() => {
    api<{ announcements: Announcement[] }>('/admin/announcements')
      .then((r) => setList(r.announcements))
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const duration = custom !== '' ? Number(custom.replace(',', '.')) : hours;
  const durationOk = Number.isFinite(duration) && duration >= 0 && duration <= 720;

  async function publish(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ announcements: Announcement[] }>('/admin/announcements', {
        method: 'POST',
        body: { message, tone, hours: duration },
      });
      setList(r.announcements);
      setMessage('');
      refreshConfig();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      const r = await api<{ announcements: Announcement[] }>(`/admin/announcements/${id}`, { method: 'DELETE' });
      setList(r.announcements);
      refreshConfig();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const live = (list || []).filter((a) => a.active && (!a.expires_at || new Date(a.expires_at).getTime() > Date.now()));
  const past = (list || []).filter((a) => !live.includes(a)).slice(0, 10);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Announcements</h1>
          <p className="muted">A banner at the top of the customer app — offers, news or warnings. It disappears by itself when the time runs out.</p>
        </div>
      </div>

      <div className="ann-grid">
        <section className="panel">
          <h2 className="panel-title">New announcement</h2>
          <form onSubmit={publish} className="settings-form">
            <label className="field">
              <span className="field-label">Message ({message.trim().length}/160)</span>
              <textarea
                className="textarea"
                rows={2}
                maxLength={160}
                placeholder="e.g. 10% off all drinks tonight!"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <div className="ann-examples">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} className="chip ann-example" onClick={() => setMessage(ex)}>
                  {ex}
                </button>
              ))}
            </div>

            <div className="field">
              <span className="field-label">Style</span>
              <div className="chips ann-chips">
                {TONES.map((t) => (
                  <button type="button" key={t.id} className={`chip${tone === t.id ? ' on' : ''}`} onClick={() => setTone(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Show for</span>
              <div className="chips ann-chips">
                {DURATIONS.map((d) => (
                  <button
                    type="button"
                    key={d.hours}
                    className={`chip${custom === '' && hours === d.hours ? ' on' : ''}`}
                    onClick={() => {
                      setHours(d.hours);
                      setCustom('');
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <label className="ann-custom">
                or exactly
                <input className="input" inputMode="decimal" placeholder="10" value={custom} onChange={(e) => setCustom(e.target.value)} />
                hours
              </label>
            </div>

            {message.trim().length >= 2 && (
              <div className="field">
                <span className="field-label">Preview</span>
                <AnnouncementBar items={[{ id: 0, message: message.trim(), tone, expires_at: null }]} preview />
              </div>
            )}

            <ErrorBox>{error}</ErrorBox>
            <button className="btn btn-primary" disabled={busy || message.trim().length < 2 || !durationOk}>
              <Icon name="megaphone" size={18} /> {busy ? 'Publishing…' : 'Publish to customers'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2 className="panel-title">Live now ({live.length})</h2>
          {!list ? (
            <Spinner />
          ) : live.length === 0 ? (
            <p className="muted">Nothing is showing to customers.</p>
          ) : (
            <ul className="ann-list">
              {live.map((a) => (
                <li key={a.id} className={`ann-item tone-${a.tone}`}>
                  <div>
                    <b>{a.message}</b>
                    <span className="muted small">
                      {remaining(a.expires_at)} · posted {dateTime(a.created_at!)}
                    </span>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(a.id)}>
                    <Icon name="trash" size={16} /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <h3 className="ann-past-title muted">Recent</h3>
              <ul className="ann-list past">
                {past.map((a) => (
                  <li key={a.id} className="ann-item">
                    <div>
                      <span>{a.message}</span>
                      <span className="muted small">
                        {a.removed_at ? `Removed ${dateTime(a.removed_at)}` : `Expired ${a.expires_at ? dateTime(a.expires_at) : ''}`}
                      </span>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setMessage(a.message);
                        setTone(a.tone);
                      }}
                    >
                      Reuse
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
