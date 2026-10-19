import { useEffect, useRef, useState } from 'react';
import { api, customerError } from '../lib/api';
import type { CustomerOrder } from '../types';

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void> };
      FUNDING?: { APPLEPAY?: string; CARD?: string; PAYPAL?: string };
      isFundingEligible?: (source: string) => boolean;
    };
  }
}

function sdkSrc(clientId: string, env: string) {
  const host = env === 'live' ? 'www.paypal.com' : 'www.sandbox.paypal.com';
  const q = new URLSearchParams({
    'client-id': clientId,
    currency: 'EUR',
    intent: 'capture',
    components: 'buttons,applepay',
    'enable-funding': 'applepay,card',
    'disable-funding': 'credit,paylater',
  });
  return `https://${host}/sdk/js?${q}`;
}

function loadSdk(clientId: string, env: string) {
  const src = sdkSrc(clientId, env);
  const existing = document.querySelector<HTMLScriptElement>(`script[data-vnd-paypal]`);
  if (existing && window.paypal) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.vndPaypal = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('PayPal s’u ngarkua. Provo pagesën në dorëzim.'));
    document.head.appendChild(s);
  });
}

export function PaypalButtons({
  clientId,
  env,
  disabled,
  checkoutBody,
  onPaid,
  onError,
}: {
  clientId: string;
  env: string;
  disabled?: boolean;
  checkoutBody: () => Record<string, unknown> | null;
  onPaid: (r: { order: CustomerOrder; guest_token?: string }) => void;
  onError: (msg: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const bodyRef = useRef(checkoutBody);
  const paidRef = useRef(onPaid);
  const errRef = useRef(onError);
  const disabledRef = useRef(disabled);
  bodyRef.current = checkoutBody;
  paidRef.current = onPaid;
  errRef.current = onError;
  disabledRef.current = disabled;

  useEffect(() => {
    let gone = false;
    loadSdk(clientId, env)
      .then(() => {
        if (!gone) setReady(true);
      })
      .catch((e) => errRef.current(e instanceof Error ? e.message : 'PayPal s’u ngarkua.'));
    return () => {
      gone = true;
    };
  }, [clientId, env]);

  useEffect(() => {
    const el = box.current;
    const paypal = window.paypal;
    if (!ready || !el || !paypal) return;
    el.innerHTML = '';
    const buttons = paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 },
      onClick: (_data: unknown, actions: { reject: () => Promise<void>; resolve: () => Promise<void> }) => {
        if (disabledRef.current || !bodyRef.current()) return actions.reject();
        return actions.resolve();
      },
      createOrder: async () => {
        try {
          const body = bodyRef.current();
          if (!body) throw new Error('invalid');
          const r = await api<{ id: string }>('/paypal/orders', { method: 'POST', body });
          return r.id;
        } catch (e) {
          errRef.current(
            e instanceof Error && e.message === 'invalid'
              ? 'Plotëso emrin, telefonin, adresën dhe pin-in në hartë.'
              : customerError(e),
          );
          throw e;
        }
      },
      onApprove: async (data: { orderID: string }) => {
        try {
          const r = await api<{ order: CustomerOrder; guest_token?: string }>(`/paypal/orders/${data.orderID}/capture`, {
            method: 'POST',
          });
          paidRef.current(r);
        } catch (e) {
          errRef.current(customerError(e));
          throw e;
        }
      },
      onError: () => errRef.current('Pagesa s’kaloi. Provo kartën tjetër ose pagesën në dorëzim.'),
      onCancel: () => errRef.current('Pagesa u anullua. Mund të provosh sërish ose të paguash në dorëzim.'),
    });
    buttons.render(el).catch(() => errRef.current('PayPal s’u hap. Provo pagesën në dorëzim.'));
    return () => {
      el.innerHTML = '';
    };
  }, [ready]);

  return (
    <div className="paypal-box">
      {!ready && <p className="hint">Pagesa me Apple Pay / kartë po hapet…</p>}
      <div ref={box} className={disabled ? 'paypal-disabled' : undefined} />
    </div>
  );
}
