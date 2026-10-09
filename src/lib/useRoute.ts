import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../types';
import { distanceMeters, getRoute, type RouteResult } from './geo';

/**
 * Driving route between two points. Re-requests only when the start moved noticeably
 * (or every minute) so a moving driver doesn't hammer the routing service.
 */
export function useRoute(from: LatLng | null | undefined, to: LatLng | null | undefined) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const last = useRef<{ from: LatLng; to: LatLng; at: number } | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!from || !to) {
      last.current = null;
      setRoute(null);
      return;
    }
    const l = last.current;
    const stale = !l || distanceMeters(l.to, to) > 20 || distanceMeters(l.from, from) > 120 || Date.now() - l.at > 60000;
    if (!stale) return;
    last.current = { from, to, at: Date.now() };
    const id = ++reqId.current;
    getRoute(from, to).then((r) => {
      if (id === reqId.current) setRoute(r);
    });
  }, [from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return route;
}

/** Seconds since an ISO timestamp, re-rendering every few seconds. */
export function useAge(iso: string | null | undefined, everyMs = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return iso ? Math.max(0, (now - new Date(iso).getTime()) / 1000) : null;
}
