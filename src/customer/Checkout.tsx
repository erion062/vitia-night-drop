import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, Field, Map, Totals } from '../components/ui';
import { api, customerError } from '../lib/api';
import { track } from '../lib/track';
import { distanceMeters } from '../lib/geo';
import { euro, euroShort } from '../lib/format';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { CustomerOrder, LatLng } from '../types';
import { TopBar } from './CustomerLayout';

const LAST_ADDRESS = 'vnd_last_address';

export default function Checkout() {
  const { user } = useAuth();
  const cart = useCart();
  const { config, refreshConfig, refreshProducts } = useConfig();
  const nav = useNavigate();
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(LAST_ADDRESS) || 'null');
    } catch {
      return null;
    }
  })();

  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState<string>(saved?.address || '');
  const [notes, setNotes] = useState('');
  const [pos, setPos] = useState<LatLng | null>(saved?.pos || null);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (cart.lines.length === 0 && !busy) return <Navigate to="/basket" replace />;

  const fee = config?.delivery_fee_cents ?? 400;
  const min = config?.min_order_cents ?? 1000;
  const center = pos || { lat: config?.base_lat ?? 42.3214, lng: config?.base_lng ?? 21.3583 };
  const area = config ? { center: { lat: config.base_lat, lng: config.base_lng }, radiusKm: config.service_radius_km } : null;
  const outside = !!(pos && area && distanceMeters(pos, area.center) > area.radiusKm * 1000);

  function locate() {
    if (!navigator.geolocation) return setError('Shfletuesi s’mund ta ndajë lokacionin. Prek hartën dhe vendos pin-in te dera.');
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setErrors((e) => ({ ...e, pos: '' }));
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === 1
            ? 'S’e lejove lokacionin. Prek hartën dhe vendos pin-in te dera.'
            : 'S’e morëm lokacionin. Prek hartën dhe vendos pin-in te dera.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Shkruaj emrin';
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Shkruaj një numër telefoni të vlefshëm';
    if (address.trim().length < 5) e.address = 'Shkruaj rrugën dhe numrin e shtëpisë';
    if (!pos) e.pos = 'Vendos pin-in te dera në hartë';
    setErrors(e);
    return Object.keys(e).length === 0 && !outside;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError('');
    if (!validate()) return;
    if (cart.subtotal_cents < min) return setError(`Porosia minimale është ${euroShort(min)}`);
    setBusy(true);
    try {
      const r = await api<{ order: CustomerOrder }>('/orders', {
        method: 'POST',
        body: {
          customer_name: name,
          phone,
          address,
          notes,
          lat: pos!.lat,
          lng: pos!.lng,
          items: cart.lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        },
      });
      localStorage.setItem(LAST_ADDRESS, JSON.stringify({ address, pos }));
      track('checkout', `Placed order ${r.order.number}`);
      cart.clear();
      refreshConfig();
      nav(`/orders/${r.order.number}?placed=1`, { replace: true });
    } catch (e) {
      setBusy(false);
      setError(customerError(e));
      refreshConfig();
      refreshProducts();
    }
  }

  const blocked = config && !config.accepting_orders;

  return (
    <div className="page checkout">
      <TopBar title="Vendos porosinë" back />
      <form onSubmit={submit} noValidate>
        <section className="card">
          <h3 className="card-title">
            <span className="step">1</span> Ku ta sjellim
          </h3>
          <button type="button" className="btn btn-outline btn-block" onClick={locate} disabled={locating}>
            <Icon name="gps" size={18} /> {locating ? 'Po të gjejmë…' : 'Përdor lokacionin tim'}
          </button>
          <p className="hint">Ose prek hartën / lëviz pin-in te dera e saktë. Dorëzojmë brenda rrethit të gjelbër — ti rri, ne dalim.</p>
          <Map
            center={center}
            zoom={pos ? 17 : 14}
            picker={{ value: pos, onChange: (p) => { setPos(p); setErrors((e) => ({ ...e, pos: '' })); } }}
            serviceArea={area}
            className="map-picker"
            loadingLabel="Harta po ngarkohet…"
          />
          {errors.pos && <span className="field-error">{errors.pos}</span>}
          {outside && area && (
            <div className="notice notice-out" role="alert">
              <Icon name="pin" size={20} />
              <div>
                <b>Ende s’jemi te zona jote</b>
                <span>VND tani dorëzon brenda {Number(area.radiusKm.toFixed(1))} km nga Viti. Lëviz pin-in brenda rrethit të gjelbër.</span>
              </div>
            </div>
          )}
          <Field label="Adresa e dorëzimit" icon="pin" placeholder="p.sh. Rr. Skënderbeu 12, Viti" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} maxLength={200} autoComplete="street-address" />
          <label className="field">
            <span className="field-label">Shënime për derën (opsionale)</span>
            <textarea className="textarea" placeholder="p.sh. bie zilen, kati 2, dera blu…" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} />
          </label>
        </section>

        <section className="card">
          <h3 className="card-title">
            <span className="step">2</span> Të dhënat e tua
          </h3>
          <Field label="Emri" icon="user" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" maxLength={80} />
          <Field label="Numri i telefonit" icon="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} autoComplete="tel" />
        </section>

        <section className="card">
          <h3 className="card-title">
            <span className="step">3</span> Pagesa
          </h3>
          <div className="pay-option on">
            <Icon name="euro" size={20} />
            <div>
              <b>Pagesa në dorëzim</b>
              <span>Ki gati {euro(cart.subtotal_cents + fee)} — e saktë na ndihmon te dera.</span>
            </div>
            <Icon name="check" size={18} />
          </div>
        </section>

        <section className="card">
          <div className="summary-items">
            {cart.lines.map((l) => (
              <div key={l.product.id}>
                <span>
                  {l.quantity}× {l.product.name}
                </span>
                <span>{euro(l.total_cents)}</span>
              </div>
            ))}
          </div>
          <Totals subtotal={cart.subtotal_cents} fee={fee} />
        </section>

        <ErrorBox>{error}</ErrorBox>
        {blocked && <ErrorBox>{config.reason === 'BUSY' ? 'VND ËSHTË I ZËNË TANI. ' : ''}{config.reason_message}</ErrorBox>}

        <div className="sticky-cta">
          <button className="btn btn-primary btn-xl" type="submit" disabled={busy || !!blocked || outside || cart.subtotal_cents < min}>
            {busy ? 'Po vendoset porosia…' : outside ? 'ENDE S’JEMI TE ZONA JOTE' : `VENDOS POROSINË · ${euro(cart.subtotal_cents + fee)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
