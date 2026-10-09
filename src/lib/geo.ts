import type { LatLng, MapTiles } from '../types';

let mapTiles: MapTiles | null = null;
const tileListeners = new Set<(t: MapTiles) => void>();
export const getMapTiles = () => mapTiles;
export function setMapTiles(t: MapTiles | undefined) {
  if (!t || (mapTiles && mapTiles.url === t.url)) return;
  mapTiles = t;
  tileListeners.forEach((fn) => fn(t));
}
export function onMapTiles(fn: (t: MapTiles) => void) {
  tileListeners.add(fn);
  return () => void tileListeners.delete(fn);
}

export function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough road estimate when no route is available: 1.35x straight line at ~30 km/h. */
export function roughEstimate(a: LatLng, b: LatLng) {
  const meters = distanceMeters(a, b) * 1.35;
  return { meters, seconds: meters / (30 / 3.6) };
}

export interface RouteResult {
  coords: LatLng[];
  meters: number;
  seconds: number;
  approximate: boolean;
}

let osrmBase = 'https://router.project-osrm.org';
export const setRoutingUrl = (url: string) => {
  if (url) osrmBase = url;
};

const cache = new Map<string, RouteResult>();
const key = (a: LatLng, b: LatLng) => [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(4)).join(',');

/** Driving route via OSRM; falls back to a clearly-marked straight-line estimate if routing is unreachable. */
export async function getRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const k = key(from, to);
  const hit = cache.get(k);
  if (hit) return hit;
  try {
    const url = `${osrmBase}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await res.json();
    const r = j.routes?.[0];
    if (!r) throw new Error('no route');
    const result: RouteResult = {
      coords: r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      meters: r.distance,
      seconds: r.duration,
      approximate: false,
    };
    if (cache.size > 50) cache.clear();
    cache.set(k, result);
    return result;
  } catch {
    const est = roughEstimate(from, to);
    return { coords: [from, to], ...est, approximate: true };
  }
}

/** Opens turn-by-turn directions in Google Maps (the app on phones) to exact coordinates. */
export function googleMapsDirections(to: LatLng) {
  const q = new URLSearchParams({ api: '1', destination: `${to.lat},${to.lng}`, travelmode: 'driving' });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
