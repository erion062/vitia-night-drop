import { haversineKm } from './util.js';

/** €2 inside Viti, then extra for each started kilometre beyond the in-town radius. */
export function deliveryFeeForKm(km, settings) {
  const base = Number(settings.delivery_fee_cents ?? 200);
  const inner = Number(settings.delivery_inner_km ?? 3);
  const perKm = Number(settings.delivery_per_km_cents ?? 50);
  const extraKm = Math.max(0, Number(km) - inner);
  const billed = extraKm > 0 ? Math.ceil(extraKm - 1e-9) : 0;
  return base + billed * perKm;
}

export function quoteDeliveryFeeCents(lat, lng, settings) {
  const km = haversineKm(lat, lng, settings.base_lat, settings.base_lng);
  return deliveryFeeForKm(km, settings);
}
