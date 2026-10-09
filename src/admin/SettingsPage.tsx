import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ErrorBox } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dateTime } from '../lib/format';
import { useConfig } from '../state/config';
import type { Settings } from '../types';
import { useAdmin } from './AdminContext';
import { GpsPanel } from './components';
import { DeliveryArea } from './DeliveryArea';
import { playAlert, unlockAudio } from './sound';

interface ResetRequest {
  id: number;
  phone: string;
  full_name: string | null;
  created_at: string;
}

const euroInput = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(parseFloat(String(v).replace(',', '.') || '0') * 100);

function ResetRequests() {
  const { refreshSummary } = useAdmin();
  const [list, setList] = useState<ResetRequest[]>([]);
  const [issued, setIssued] = useState<{ phone: string; temporary_password: string } | null>(null);
  const load = useCallback(() => {
    api<{ requests: ResetRequest[] }>('/admin/reset-requests').then((r) => setList(r.requests)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function resolve(id: number) {
    const r = await api<{ phone: string; temporary_password: string }>(`/admin/reset-requests/${id}/resolve`, { method: 'POST' });
    setIssued(r);
    load();
    refreshSummary();
  }
  async function dismiss(id: number) {
    await api(`/admin/reset-requests/${id}/dismiss`, { method: 'POST' });
    load();
    refreshSummary();
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Password reset requests</h2>
      {issued && (
        <div className="notice notice-ok">
          <Icon name="check" size={18} />
          <div>
            <b>
              Temporary password for {issued.phone}: <code>{issued.temporary_password}</code>
            </b>
            <span>Call or message the customer with it. They can log in and keep using it.</span>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="muted">No open requests.</p>
      ) : (
        <ul className="reset-list">
          {list.map((r) => (
            <li key={r.id}>
              <div>
                <b>{r.full_name || 'Customer'}</b> · <a href={`tel:${r.phone}`}>{r.phone}</a>
                <div className="muted small">{dateTime(r.created_at)}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => resolve(r.id)}>
                Issue temp password
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => dismiss(r.id)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: cur, new_password: next } });
      setMsg('Password changed.');
      setCur('');
      setNext('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="panel">
      <h2 className="panel-title">Admin password</h2>
      <form onSubmit={submit} className="settings-form">
        <label className="field">
          <span className="field-label">Current password</span>
          <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="field">
          <span className="field-label">New password (min 6)</span>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <ErrorBox>{error}</ErrorBox>
        {msg && <p className="accent">{msg}</p>}
        <button className="btn btn-outline" disabled={!cur || next.length < 6}>
          Change password
        </button>
      </form>
    </section>
  );
}

function DevTools() {
  const { orders } = useAdmin();
  const [msg, setMsg] = useState('');
  const run = async (path: string, body: unknown) => {
    try {
      const r = await api<Record<string, unknown>>(`/admin/dev/${path}`, { method: 'POST', body });
      setMsg(JSON.stringify(r));
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };
  const target = orders.find((o) => o.status === 'ON_THE_WAY') || orders.find((o) => o.status !== 'PENDING') || orders[0];
  return (
    <section className="panel dev-panel">
      <h2 className="panel-title">
        <Icon name="alert" size={18} /> Development simulation
      </h2>
      <p className="muted">Only available when ENABLE_SIMULATION=true and NODE_ENV is not production. Never active on the live site.</p>
      <div className="btn-row wrap">
        <button className="btn btn-outline btn-sm" onClick={() => run('customers', { count: 2 })}>
          Create 2 test orders
        </button>
        <button className="btn btn-outline btn-sm" disabled={!target} onClick={() => target && run('drive', { order_id: target.id, seconds: 90 })}>
          Simulate drive to {target ? `#${target.number}` : '—'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => run('stop', {})}>
          Stop simulated location
        </button>
      </div>
      {msg && <pre className="dev-out">{msg}</pre>}
    </section>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings } = useAdmin();
  const { config, refreshConfig } = useConfig();
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  useEffect(() => {
    if (!settings) return;
    setForm({
      business_name: settings.business_name,
      business_phone: settings.business_phone,
      open_time: settings.open_time,
      close_time: settings.close_time,
      delivery_fee: euroInput(settings.delivery_fee_cents),
      min_order: euroInput(settings.min_order_cents),
      max_active_orders: String(settings.max_active_orders),
      max_active_per_customer: String(settings.max_active_per_customer),
      driver_name: settings.driver_name,
      vehicle_name: settings.vehicle_name,
      fuel_cost: euroInput(settings.fuel_cost_cents),
      location_sharing_enabled: settings.location_sharing_enabled,
      sound_enabled: settings.sound_enabled,
      business_online: settings.business_online,
    });
  }, [settings]);

  if (!settings) return null;
  const v = (k: string) => String(form[k] ?? '');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');
    const patch: Partial<Settings> = {
      business_name: v('business_name'),
      business_phone: v('business_phone'),
      open_time: v('open_time'),
      close_time: v('close_time'),
      delivery_fee_cents: toCents(v('delivery_fee')),
      min_order_cents: toCents(v('min_order')),
      max_active_orders: parseInt(v('max_active_orders'), 10),
      max_active_per_customer: parseInt(v('max_active_per_customer'), 10),
      driver_name: v('driver_name'),
      vehicle_name: v('vehicle_name'),
      fuel_cost_cents: toCents(v('fuel_cost')),
      location_sharing_enabled: !!form.location_sharing_enabled,
      sound_enabled: !!form.sound_enabled,
      business_online: !!form.business_online,
    };
    try {
      await saveSettings(patch);
      refreshConfig();
      setMsg('Settings saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleOnline() {
    try {
      await saveSettings({ business_online: !settings!.business_online });
      refreshConfig();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <h1>Settings</h1>
        <button className={`btn btn-lg ${settings.business_online ? 'btn-danger-outline' : 'btn-primary'}`} onClick={toggleOnline}>
          <Icon name="power" size={18} /> {settings.business_online ? 'GO OFFLINE' : 'GO ONLINE'}
        </button>
      </div>

      <DeliveryArea />

      <div className="settings-grid">
        <form className="panel settings-form" onSubmit={save}>
          <h2 className="panel-title">Business</h2>
          <div className="two-col">
            <label className="field">
              <span className="field-label">Business name</span>
              <input className="input" value={v('business_name')} onChange={set('business_name')} />
            </label>
            <label className="field">
              <span className="field-label">Business phone (shown to customers)</span>
              <input className="input" type="tel" value={v('business_phone')} onChange={set('business_phone')} placeholder="+383 4x xxx xxx" />
            </label>
            <label className="field">
              <span className="field-label">Opens</span>
              <input className="input" type="time" value={v('open_time')} onChange={set('open_time')} />
            </label>
            <label className="field">
              <span className="field-label">Closes</span>
              <input className="input" type="time" value={v('close_time')} onChange={set('close_time')} />
            </label>
            <label className="field">
              <span className="field-label">Delivery fee (€)</span>
              <input className="input" inputMode="decimal" value={v('delivery_fee')} onChange={set('delivery_fee')} />
            </label>
            <label className="field">
              <span className="field-label">Minimum order (€)</span>
              <input className="input" inputMode="decimal" value={v('min_order')} onChange={set('min_order')} />
            </label>
            <label className="field">
              <span className="field-label">Maximum active orders</span>
              <input className="input" type="number" min={1} max={50} value={v('max_active_orders')} onChange={set('max_active_orders')} />
            </label>
            <label className="field">
              <span className="field-label">Active orders per customer</span>
              <input className="input" type="number" min={1} max={10} value={v('max_active_per_customer')} onChange={set('max_active_per_customer')} />
            </label>
            <label className="field">
              <span className="field-label">Timezone</span>
              <input className="input" value="Europe/Belgrade" disabled />
            </label>
          </div>

          <h2 className="panel-title mt">Driver</h2>
          <div className="two-col">
            <label className="field">
              <span className="field-label">Driver name</span>
              <input className="input" value={v('driver_name')} onChange={set('driver_name')} />
            </label>
            <label className="field">
              <span className="field-label">Vehicle</span>
              <input className="input" value={v('vehicle_name')} onChange={set('vehicle_name')} />
            </label>
          </div>

          <h2 className="panel-title mt">Profit estimate</h2>
          <label className="field">
            <span className="field-label">Estimated delivery/fuel cost per delivery (€)</span>
            <input className="input" inputMode="decimal" value={v('fuel_cost')} onChange={set('fuel_cost')} />
          </label>
          <p className="hint">Applies to new orders. Purchase cost per product is set in Products.</p>

          <h2 className="panel-title mt">Switches</h2>
          <label className="toggle-row">
            <input type="checkbox" checked={!!form.business_online} onChange={set('business_online')} />
            <span>Business online (accepting orders during opening hours)</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={!!form.location_sharing_enabled} onChange={set('location_sharing_enabled')} />
            <span>Driver location sharing allowed</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={!!form.sound_enabled} onChange={set('sound_enabled')} />
            <span>New-order notification sound</span>
          </label>

          <ErrorBox>{error}</ErrorBox>
          {msg && <p className="accent">{msg}</p>}
          <button className="btn btn-primary btn-lg">Save settings</button>
        </form>

        <div className="settings-side">
          <section className="panel">
            <h2 className="panel-title">Alerts</h2>
            <div className="btn-row wrap">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  unlockAudio();
                  setTimeout(playAlert, 100);
                }}
              >
                <Icon name="volume" size={16} /> Test sound
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={notif === 'granted' || notif === 'unsupported'}
                onClick={async () => setNotif(await Notification.requestPermission())}
              >
                <Icon name="bell" size={16} /> {notif === 'granted' ? 'Notifications enabled' : notif === 'unsupported' ? 'Notifications unsupported' : 'Enable browser notifications'}
              </button>
            </div>
            <p className="hint">Keep this dashboard open (and the sound unlocked) during opening hours so no order is missed.</p>
          </section>
          <GpsPanel />
          <ResetRequests />
          <ChangePassword />
          {config?.simulation && <DevTools />}
        </div>
      </div>
    </div>
  );
}
