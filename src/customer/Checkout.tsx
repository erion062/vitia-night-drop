import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, Field, Map, Totals } from '../components/ui';
import { api, customerError } from '../lib/api';
import { track } from '../lib/track';
import { deliveryKm, quoteDeliveryFeeCents } from '../lib/delivery';
import { rememberGuestOrder } from '../lib/guestOrders';
import { rememberPromoCode, savedPromoCode } from '../lib/promo';
import { distanceMeters } from '../lib/geo';
import { euro, euroShort } from '../lib/format';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import type { CustomerOrder, LatLng } from '../types';
import { TopBar } from './CustomerLayout';
import { PaypalButtons } from './PaypalButtons';

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
  const [promoInput, setPromoInput] = useState(savedPromoCode());
  const [promo, setPromo] = useState<{ code: string; percent: number; label: string } | null>(null);
  const [promoMsg, setPromoMsg] = useState('');
  const [pay, setPay] = useState<'paypal' | 'cash'>('cash');

  useEffect(() => {
    const code = savedPromoCode();
    if (!code) return;
    api<{ code: string; percent: number; label: string }>(`/promo/check?code=${encodeURIComponent(code)}`)
      .then((r) => {
        setPromo(r);
        setPromoInput(r.code);
        setPromoMsg(`${r.percent}% zbritje te tarifa e dorëzimit`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.full_name) setName((n) => n || user.full_name);
    if (user?.phone) setPhone((p) => p || user.phone);
  }, [user]);

  const paypalOn = !!config?.paypal?.enabled && !!config.paypal.client_id;
  useEffect(() => {
    if (paypalOn) setPay('paypal');
  }, [paypalOn]);

  const fee = quoteDeliveryFeeCents(pos, config);
  const discount = promo ? Math.round((fee * promo.percent) / 100) : 0;
  const due = cart.subtotal_cents + fee - discount;
  const min = config?.min_order_cents ?? 1000;
  const center = pos || { lat: config?.base_lat ?? 42.3214, lng: config?.base_lng ?? 21.3583 };
  const area = config ? { center: { lat: config.base_lat, lng: config.base_lng }, radiusKm: config.service_radius_km } : null;
  const noGo =
    config && (config.no_go_radius_km || 0) > 0 && config.no_go_lat != null && config.no_go_lng != null
      ? { center: { lat: config.no_go_lat, lng: config.no_go_lng }, radiusKm: config.no_go_radius_km as number }
      : null;
  const outside = !!(pos && area && distanceMeters(pos, area.center) > area.radiusKm * 1000);
  const insideNoGo = !!(pos && noGo && distanceMeters(pos, noGo.center) <= noGo.radiusKm * 1000);

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

  async function applyPromo() {
    setPromoMsg('');
    setError('');
    const code = promoInput.trim();
    if (!code) {
      setPromo(null);
      rememberPromoCode('');
      return;
    }
    try {
      const r = await api<{ code: string; percent: number; label: string }>(`/promo/check?code=${encodeURIComponent(code)}`);
      setPromo(r);
      rememberPromoCode(r.code);
      setPromoInput(r.code);
      setPromoMsg(`${r.percent}% zbritje te tarifa e dorëzimit`);
    } catch (e) {
      setPromo(null);
      setPromoMsg(customerError(e));
    }
  }

  const checkoutBody = useCallback(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Shkruaj emrin';
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Shkruaj një numër telefoni të vlefshëm';
    if (address.trim().length < 5) e.address = 'Shkruaj rrugën dhe numrin e shtëpisë';
    if (!pos) e.pos = 'Vendos pin-in te dera në hartë';
    setErrors(e);
    if (Object.keys(e).length || outside || insideNoGo) return null;
    if (cart.subtotal_cents < min) {
      setError(`Porosia minimale është ${euroShort(min)}`);
      return null;
    }
    return {
      customer_name: name,
      phone,
      address,
      notes,
      lat: pos.lat,
      lng: pos.lng,
      promo_code: promo?.code || '',
      items: cart.lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
    };
  }, [name, phone, address, notes, pos, promo, cart.lines, min, outside, insideNoGo]);

  function finishOrder(r: { order: CustomerOrder; guest_token?: string }) {
    localStorage.setItem(LAST_ADDRESS, JSON.stringify({ address, pos }));
    if (r.guest_token) rememberGuestOrder(r.order.number, r.guest_token);
    rememberPromoCode('');
    track('checkout', `Placed order ${r.order.number}`);
    cart.clear();
    refreshConfig();
    nav(`/orders/${r.order.number}?placed=1`, { replace: true });
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError('');
    const body = checkoutBody();
    if (!body) return;
    setBusy(true);
    try {
      const r = await api<{ order: CustomerOrder; guest_token?: string }>('/orders', {
        method: 'POST',
        body,
      });
      finishOrder(r);
    } catch (e) {
      setBusy(false);
      setError(customerError(e));
      refreshConfig();
      refreshProducts();
    }
  }

  const blocked = config && !config.accepting_orders;
  if (cart.lines.length === 0 && !busy) return <Navigate to="/basket" replace />;

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
            exclusionArea={noGo ? { ...noGo, label: 'Jo këtu' } : null}
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
          {insideNoGo && (
            <div className="notice notice-out" role="alert">
              <Icon name="x" size={20} />
              <div>
                <b>Kjo zonë s’pranon porosi</b>
                <span>Lëviz pin-in jashtë rrethit të kuq.</span>
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
          <p className="hint">S’ke nevojë për llogari — mjafton emri dhe numri. Operatori të telefonon nëse duhet.</p>
          <Field label="Emri" icon="user" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" maxLength={80} />
          <Field label="Numri i telefonit" icon="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} autoComplete="tel" />
        </section>

        <section className="card">
          <h3 className="card-title">
            <span className="step">3</span> Pagesa
          </h3>
          {paypalOn && (
            <button type="button" className={`pay-option${pay === 'paypal' ? ' on' : ''}`} onClick={() => setPay('paypal')}>
              <Icon name="euro" size={20} />
              <div>
                <b>Apple Pay ose kartë</b>
                <span>Paguaj tani — paratë shkojnë te PayPal. {euro(due)}</span>
              </div>
              {pay === 'paypal' && <Icon name="check" size={18} />}
            </button>
          )}
          <button
            type="button"
            className={`pay-option${pay === 'cash' || !paypalOn ? ' on' : ''}`}
            onClick={() => setPay('cash')}
          >
            <Icon name="euro" size={20} />
            <div>
              <b>Pagesa në dorëzim</b>
              <span>Ki gati {euro(due)} — e saktë na ndihmon te dera.</span>
            </div>
            {(pay === 'cash' || !paypalOn) && <Icon name="check" size={18} />}
          </button>
          {paypalOn && pay === 'paypal' && (
            <PaypalButtons
              clientId={config.paypal!.client_id!}
              env={config.paypal?.env || 'live'}
              disabled={busy || !!blocked || outside || insideNoGo || cart.subtotal_cents < min}
              checkoutBody={checkoutBody}
              onPaid={(r) => {
                setBusy(true);
                finishOrder(r);
              }}
              onError={(msg) => {
                setBusy(false);
                setError(msg);
              }}
            />
          )}
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
          <div className="promo-row">
            <Field
              label="Kodi i ofertës (opsionale)"
              icon="tag"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="ANA10"
              maxLength={16}
              autoCapitalize="characters"
            />
            <button type="button" className="btn btn-outline" onClick={applyPromo}>
              Apliko
            </button>
          </div>
          {promoMsg && <p className={promo ? 'accent' : 'field-error'}>{promoMsg}</p>}
          <Totals
            subtotal={cart.subtotal_cents}
            fee={fee}
            discount={discount}
            discountLabel={promo?.label}
            feeHint={pos && config ? `${deliveryKm(pos, config).toFixed(1)} km` : 'në Viti, rritet me distancën'}
          />
        </section>

        <ErrorBox>{error}</ErrorBox>
        {blocked && <ErrorBox>{config.reason === 'BUSY' ? 'VND ËSHTË I ZËNË TANI. ' : ''}{config.reason_message}</ErrorBox>}

        {pay === 'cash' && (
          <div className="sticky-cta">
            <button className="btn btn-primary btn-xl" type="submit" disabled={busy || !!blocked || outside || insideNoGo || cart.subtotal_cents < min}>
              {busy ? 'Po vendoset porosia…' : outside ? 'ENDE S’JEMI TE ZONA JOTE' : insideNoGo ? 'KJO ZONË S’PRANON POROSI' : `VENDOS POROSINË · ${euro(due)}`}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
