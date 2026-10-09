import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ErrorBox, Map } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useConfig } from '../state/config';
import type { LatLng } from '../types';
import { useAdmin } from './AdminContext';

const MIN_KM = 0.5;
const MAX_KM = 50;
const SLIDER_MAX_KM = 30;
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Delivery radius editor: customers outside the circle cannot order. */
export function DeliveryArea() {
  const { settings, saveSettings } = useAdmin();
  const { refreshConfig } = useConfig();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radiusText, setRadiusText] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const savedLat = settings?.base_lat;
  const savedLng = settings?.base_lng;
  const savedKm = settings?.service_radius_km;
  useEffect(() => {
    if (savedLat === undefined || savedLng === undefined || savedKm === undefined) return;
    setCenter({ lat: savedLat, lng: savedLng });
    setRadiusText(String(savedKm));
  }, [savedLat, savedLng, savedKm]);

  if (!settings || !center) return null;
  const radius = parseFloat(radiusText.replace(',', '.'));
  const valid = Number.isFinite(radius) && radius >= MIN_KM && radius <= MAX_KM;
  const dirty = round(center.lat, 6) !== settings.base_lat || round(center.lng, 6) !== settings.base_lng || radius !== settings.service_radius_km;

  function move(p: LatLng) {
    setCenter(p);
    setMsg('');
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('This browser cannot share location.');
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        move({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Tap the map instead.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    setMsg('');
    setError('');
    setBusy(true);
    try {
      await saveSettings({ base_lat: round(center!.lat, 6), base_lng: round(center!.lng, 6), service_radius_km: radius });
      refreshConfig();
      setMsg('Delivery area saved. Customers outside it now see “We’re not in your location yet”.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel delivery-area">
      <h2 className="panel-title">
        <Icon name="pin" size={18} /> Delivery area
      </h2>
      <p className="hint">Tap the map or drag the green centre dot to move the area. Customers outside the circle see “We’re not in your location yet”.</p>
      <Map
        center={center}
        zoom={12}
        serviceArea={{ center, radiusKm: valid ? radius : settings.service_radius_km, label: 'Delivery centre', onMove: move }}
        className="map-area"
      />
      <div className="area-controls">
        <div className="field area-radius">
          <span className="field-label">Radius</span>
          <div className="area-radius-row">
            <input
              type="range"
              className="range"
              min={MIN_KM}
              max={SLIDER_MAX_KM}
              step={0.5}
              value={valid ? Math.min(radius, SLIDER_MAX_KM) : settings.service_radius_km}
              onChange={(e) => {
                setRadiusText(e.target.value);
                setMsg('');
              }}
            />
            <span className="area-km">
              <input
                className="input"
                inputMode="decimal"
                value={radiusText}
                onChange={(e) => {
                  setRadiusText(e.target.value);
                  setMsg('');
                }}
                aria-label="Radius in km"
              />
              km
            </span>
          </div>
          {!valid && <span className="field-error">Radius must be between {MIN_KM} and {MAX_KM} km</span>}
        </div>
        <p className="muted small">
          Centre {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
        </p>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="accent">{msg}</p>}
      <div className="btn-row wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy || !valid || !dirty}>
          {busy ? 'Saving…' : 'Save delivery area'}
        </button>
        <button className="btn btn-outline" onClick={useMyLocation} disabled={locating}>
          <Icon name="gps" size={16} /> {locating ? 'Finding you…' : 'Centre on my location'}
        </button>
        <button
          className="btn btn-outline"
          disabled={!dirty}
          onClick={() => {
            setCenter({ lat: settings.base_lat, lng: settings.base_lng });
            setRadiusText(String(settings.service_radius_km));
            setError('');
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
