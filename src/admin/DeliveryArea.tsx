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
  const [noGoCenter, setNoGoCenter] = useState<LatLng | null>(null);
  const [noGoRadiusText, setNoGoRadiusText] = useState('0');
  const [placeNoGo, setPlaceNoGo] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const savedLat = settings?.base_lat;
  const savedLng = settings?.base_lng;
  const savedKm = settings?.service_radius_km;
  const savedNoGoLat = settings?.no_go_lat;
  const savedNoGoLng = settings?.no_go_lng;
  const savedNoGoKm = settings?.no_go_radius_km;
  useEffect(() => {
    if (savedLat === undefined || savedLng === undefined || savedKm === undefined) return;
    setCenter({ lat: savedLat, lng: savedLng });
    setRadiusText(String(savedKm));
  }, [savedLat, savedLng, savedKm]);
  useEffect(() => {
    if (savedNoGoLat === undefined || savedNoGoLng === undefined || savedNoGoKm === undefined) return;
    setNoGoCenter({ lat: savedNoGoLat, lng: savedNoGoLng });
    setNoGoRadiusText(String(savedNoGoKm));
  }, [savedNoGoLat, savedNoGoLng, savedNoGoKm]);

  if (!settings || !center) return null;
  const radius = parseFloat(radiusText.replace(',', '.'));
  const valid = Number.isFinite(radius) && radius >= MIN_KM && radius <= MAX_KM;
  const noGoRadius = parseFloat(noGoRadiusText.replace(',', '.'));
  const noGoValid = Number.isFinite(noGoRadius) && noGoRadius >= 0 && noGoRadius <= MAX_KM;
  const noGoOn = noGoValid && noGoRadius > 0 && noGoCenter;
  const dirty =
    round(center.lat, 6) !== settings.base_lat ||
    round(center.lng, 6) !== settings.base_lng ||
    radius !== settings.service_radius_km ||
    (noGoCenter ? round(noGoCenter.lat, 6) !== settings.no_go_lat : false) ||
    (noGoCenter ? round(noGoCenter.lng, 6) !== settings.no_go_lng : false) ||
    (noGoValid && noGoRadius !== settings.no_go_radius_km);

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
      await saveSettings({
        base_lat: round(center!.lat, 6),
        base_lng: round(center!.lng, 6),
        service_radius_km: radius,
        no_go_lat: round((noGoCenter || center!).lat, 6),
        no_go_lng: round((noGoCenter || center!).lng, 6),
        no_go_radius_km: noGoValid ? noGoRadius : 0,
      });
      refreshConfig();
      setMsg('Areas saved. Green = we deliver. Red = no orders.');
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
      <p className="hint">Green circle: we deliver. Red circle: no orders. Drag the dots, or turn on “tap to place red” and tap the map.</p>
      <Map
        center={center}
        zoom={12}
        serviceArea={{ center, radiusKm: valid ? radius : settings.service_radius_km, label: 'Delivery centre', onMove: placeNoGo ? undefined : move }}
        exclusionArea={
          noGoOn
            ? {
                center: noGoCenter!,
                radiusKm: noGoRadius,
                label: 'No orders',
                onMove: (p) => {
                  setNoGoCenter(p);
                  setMsg('');
                },
                tapToMove: placeNoGo,
              }
            : null
        }
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
        <div className="field area-radius">
          <span className="field-label">Red no-go radius (0 = off)</span>
          <div className="area-radius-row">
            <input
              type="range"
              className="range"
              min={0}
              max={SLIDER_MAX_KM}
              step={0.1}
              value={noGoValid ? Math.min(noGoRadius, SLIDER_MAX_KM) : 0}
              onChange={(e) => {
                const v = e.target.value;
                setNoGoRadiusText(v);
                if (Number(v) > 0 && !noGoCenter) setNoGoCenter(center);
                setMsg('');
              }}
            />
            <span className="area-km">
              <input
                className="input"
                inputMode="decimal"
                value={noGoRadiusText}
                onChange={(e) => {
                  setNoGoRadiusText(e.target.value);
                  if (parseFloat(e.target.value.replace(',', '.')) > 0 && !noGoCenter) setNoGoCenter(center);
                  setMsg('');
                }}
                aria-label="No-go radius in km"
              />
              km
            </span>
          </div>
          {!noGoValid && <span className="field-error">No-go radius must be between 0 and {MAX_KM} km</span>}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={placeNoGo} onChange={(e) => setPlaceNoGo(e.target.checked)} disabled={!noGoOn} />
          Tap map to place the red zone
        </label>
        <p className="muted small">
          Green {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
          {noGoOn ? ` · Red ${noGoCenter.lat.toFixed(5)}, ${noGoCenter.lng.toFixed(5)}` : ''}
        </p>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {msg && <p className="accent">{msg}</p>}
      <div className="btn-row wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy || !valid || !noGoValid || !dirty}>
          {busy ? 'Saving…' : 'Save areas'}
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
            setNoGoCenter({ lat: settings.no_go_lat, lng: settings.no_go_lng });
            setNoGoRadiusText(String(settings.no_go_radius_km));
            setError('');
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
