import { distanceMeters } from './geo';
import type { LatLng } from '../types';

type FeeSettings = {
  delivery_fee_cents: number;
  delivery_inner_km?: number;
  delivery_per_km_cents?: number;
  base_lat: number;
  base_lng: number;
};

/** Keep in sync with server/lib/delivery.js */
export function deliveryFeeForKm(km: number, settings: FeeSettings) {
  const base = Number(settings.delivery_fee_cents ?? 200);
  const inner = Number(settings.delivery_inner_km ?? 3);
  const perKm = Number(settings.delivery_per_km_cents ?? 50);
  const extraKm = Math.max(0, Number(km) - inner);
  const billed = extraKm > 0 ? Math.ceil(extraKm - 1e-9) : 0;
  return base + billed * perKm;
}

export function quoteDeliveryFeeCents(pos: LatLng | null | undefined, settings: FeeSettings | null | undefined) {
  if (!settings) return 200;
  if (!pos) return settings.delivery_fee_cents;
  const km = distanceMeters(pos, { lat: settings.base_lat, lng: settings.base_lng }) / 1000;
  return deliveryFeeForKm(km, settings);
}

export function deliveryKm(pos: LatLng, settings: Pick<FeeSettings, 'base_lat' | 'base_lng'>) {
  return distanceMeters(pos, { lat: settings.base_lat, lng: settings.base_lng }) / 1000;
}
