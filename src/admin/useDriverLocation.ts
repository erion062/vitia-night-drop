import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { distanceMeters } from '../lib/geo';

export type GpsStatus = 'off' | 'starting' | 'live' | 'denied' | 'signal' | 'unsupported' | 'insecure';

export interface Fix {
  lat: number;
  lng: number;
  heading: number | null;
  accuracy: number | null;
  speed: number | null;
  at: number;
}

const FLAG = 'vnd_sharing';
const SEND_EVERY_MS = 4000;
const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 };

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Shares this device's real GPS position with the backend while delivering.
 * Never invents positions: if GPS fails, the UI shows the failure.
 */
export function useDriverLocation() {
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<GpsStatus>('off');
  const [fix, setFix] = useState<Fix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  const watchId = useRef<number | null>(null);
  const lastSend = useRef(0);
  const prevFix = useRef<Fix | null>(null);
  const wake = useRef<WakeLockSentinelLike | null>(null);
  const sending = useRef(false);

  const send = useCallback(async (f: Fix, force = false) => {
    if (sending.current) return;
    if (!force && Date.now() - lastSend.current < SEND_EVERY_MS) return;
    sending.current = true;
    lastSend.current = Date.now();
    try {
      await api('/admin/location', {
        method: 'POST',
        body: { lat: f.lat, lng: f.lng, accuracy: f.accuracy, heading: f.heading, speed: f.speed },
      });
      setLastSentAt(Date.now());
      setError('');
    } catch (e) {
      setError(`Could not send location: ${errorMessage(e)}`);
    } finally {
      sending.current = false;
    }
  }, []);

  const onFix = useCallback(
    (p: GeolocationPosition) => {
      if (watchId.current === null) return; // stopped meanwhile
      const c = p.coords;
      const prev = prevFix.current;
      let heading = c.heading != null && !Number.isNaN(c.heading) ? c.heading : null;
      if (heading == null && prev) {
        if (distanceMeters(prev, { lat: c.latitude, lng: c.longitude }) > 8) {
          const deg = (Math.atan2(c.longitude - prev.lng, c.latitude - prev.lat) * 180) / Math.PI;
          heading = (deg + 360) % 360;
        } else heading = prev.heading;
      }
      const f: Fix = {
        lat: c.latitude,
        lng: c.longitude,
        heading,
        accuracy: c.accuracy ?? null,
        speed: c.speed != null && !Number.isNaN(c.speed) ? c.speed : null,
        at: Date.now(),
      };
      prevFix.current = f;
      setFix(f);
      setStatus('live');
      void send(f, !prev);
    },
    [send],
  );

  const onError = useCallback((err: GeolocationPositionError) => {
    if (err.code === 1) {
      setStatus('denied');
      setError('Location permission denied. Allow location for this site in your browser settings.');
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
      localStorage.removeItem(FLAG);
    } else {
      setStatus('signal');
      setError(err.code === 3 ? 'GPS timeout — waiting for signal…' : 'GPS signal unavailable — waiting…');
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
      if (wl) wake.current = await wl.request('screen');
    } catch {
      /* not critical */
    }
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('This browser cannot share GPS location.');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('insecure');
      setError('GPS only works over HTTPS. Open the admin at your https:// address (or http://localhost when testing).');
      return;
    }
    if (watchId.current !== null) return;
    setSharing(true);
    setStatus('starting');
    setError('');
    localStorage.setItem(FLAG, '1');
    void requestWakeLock();
    watchId.current = navigator.geolocation.watchPosition(onFix, onError, GEO_OPTS);
  }, [onFix, onError, requestWakeLock]);

  const stop = useCallback(async () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    prevFix.current = null;
    localStorage.removeItem(FLAG);
    setSharing(false);
    setStatus('off');
    setFix(null);
    setLastSentAt(null);
    setError('');
    void wake.current?.release().catch(() => {});
    wake.current = null;
    await api('/admin/location', { method: 'DELETE' }).catch(() => {});
  }, []);

  // Resume sharing after a reload if it was on; watch for permission being revoked.
  useEffect(() => {
    if (localStorage.getItem(FLAG) === '1') start();
    const onVis = () => {
      if (document.visibilityState === 'visible' && watchId.current !== null) void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    let perm: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        perm = p;
        p.onchange = () => {
          if (p.state === 'denied' && watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
            setSharing(false);
            localStorage.removeItem(FLAG);
            setStatus('denied');
            setError('Location permission was revoked. Customers can no longer see you.');
          }
        };
      })
      .catch(() => {});
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (perm) perm.onchange = null;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Some browsers only report positions when the device moves. While stationary (e.g. at the shop),
  // ask for a fresh real reading so customers keep seeing a live — not stale — position.
  useEffect(() => {
    if (!sharing) return;
    const id = setInterval(() => {
      if (watchId.current === null) return;
      if (!prevFix.current || Date.now() - prevFix.current.at > 12000) {
        navigator.geolocation.getCurrentPosition(onFix, () => {}, { ...GEO_OPTS, maximumAge: 0, timeout: 10000 });
      }
    }, 10000);
    return () => clearInterval(id);
  }, [sharing, onFix]);

  return { sharing, status, fix, lastSentAt, error, start, stop };
}

export type DriverGps = ReturnType<typeof useDriverLocation>;
