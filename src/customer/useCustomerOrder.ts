import { useCallback, useEffect, useState } from 'react';
import { api, customerError } from '../lib/api';
import { usePolling, useStreamEvent } from '../lib/stream';
import type { CustomerOrder, DriverLocation } from '../types';

export interface TrackingData {
  order: CustomerOrder;
  driver: { name: string; vehicle: string };
  location: DriverLocation | null;
  trackable: boolean;
}

/** Loads one of the customer's own orders and keeps it live via the event stream (+ polling fallback). */
export function useCustomerOrder(number: string) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<TrackingData>(`/orders/${encodeURIComponent(number)}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(customerError(e)));
  }, [number]);

  useEffect(load, [load]);
  useStreamEvent(['order:update', 'reconnect'], (d) => {
    if (!d || d.number === number) load();
  });
  useStreamEvent('location', (loc: DriverLocation | null) => {
    setData((prev) => (prev && prev.trackable ? { ...prev, location: loc } : prev));
  });
  usePolling(load, error ? 4000 : 15000);

  return { data, error, reload: load };
}
