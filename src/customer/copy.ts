import type { OrderStatus } from '../types';

/** Customer-facing order status (admin keeps English STATUS_LABEL). */
export const SQ_STATUS: Record<OrderStatus, string> = {
  PENDING: 'Në pritje',
  ACCEPTED: 'Pranuar',
  PURCHASING: 'Duke bli',
  PURCHASED: 'U ble',
  ON_THE_WAY: 'Në rrugë',
  DELIVERED: 'Dorëzuar',
  CANCELLED: 'Anuluar',
};

export function itemCount(n: number) {
  return n === 1 ? '1 produkt' : `${n} produkte`;
}

export function productWord(n: number) {
  return n === 1 ? 'produkt' : 'produkte';
}

export function reasonTitle(reason?: string | null) {
  if (reason === 'BUSY') return 'VND ËSHTË I ZËNË TANI';
  if (reason === 'CLOSED') return 'JEMI MBYLLUR';
  return 'VND ËSHTË OFFLINE';
}

export function sqDiscountLabel(label?: string) {
  if (!label) return 'Ofertë';
  if (label === 'Free delivery') return 'Dorëzim falas';
  if (label.endsWith('% off')) return label.replace('% off', '% zbritje');
  if (/ off$/.test(label)) return label.replace(/ off$/, ' zbritje');
  return label;
}

export function sqCancelReason(reason?: string | null) {
  if (reason === 'Cancelled by customer') return 'E anulove këtë porosi.';
  return reason || 'Kjo porosi u anulua.';
}

/** Only the home pitch changes with the clock (Europe/Belgrade, 14:00–23:00). */
export function heroPitch(hour: number) {
  const rest = 'pije, cigare, ushqim. Operatori ta sjell tani, te dera.';
  if (hour >= 3 && hour < 14) return `Hapemi në 14:00 — pije, cigare, ushqim. Operatori ta sjell te dera.`;
  if (hour >= 14 && hour < 17) return `Mos dil pas pune — ${rest}`;
  if (hour >= 17 && hour < 21) return `Mos dil sonte — ${rest}`;
  if (hour >= 21) return `Mos dil natën — ${rest}`;
  return `Mos dil në mesnatë — ${rest}`;
}
