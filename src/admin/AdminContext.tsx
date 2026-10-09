import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { TRACKABLE_STATUSES, euro } from '../lib/format';
import { usePolling, useStreamEvent } from '../lib/stream';
import type { AdminOrder, DriverLocation, LatLng, OrderStatus, OrderingState, PaymentInput, Settings } from '../types';
import { audioReady, playAlert, showBrowserNotification, unlockAudio } from './sound';
import { useDriverLocation, type DriverGps } from './useDriverLocation';

interface AdminCtx {
  orders: AdminOrder[];
  state: OrderingState | null;
  loaded: boolean;
  reloadOrders: () => Promise<void>;
  settings: Settings | null;
  reloadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  gps: DriverGps;
  serverLocation: DriverLocation | null;
  /** Best known driver position: this device's GPS if sharing, otherwise the last position the server has. */
  driverPos: (LatLng & { heading: number | null; at: number }) | null;
  setStatus: (id: number, status: OrderStatus, note?: string, payment?: PaymentInput) => Promise<AdminOrder>;
  alertOrder: AdminOrder | null;
  dismissAlert: () => void;
  soundReady: boolean;
  enableSound: () => void;
  resetRequests: number;
  visitorLive: number;
  refreshSummary: () => void;
}

const Ctx = createContext<AdminCtx>(null!);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [state, setState] = useState<OrderingState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [serverLocation, setServerLocation] = useState<DriverLocation | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [soundReady, setSoundReady] = useState(audioReady());
  const [resetRequests, setResetRequests] = useState(0);
  const [visitorLive, setVisitorLive] = useState(0);
  const gps = useDriverLocation();
  const knownIds = useRef<Set<number> | null>(null);
  const ordersRef = useRef<AdminOrder[]>([]);
  ordersRef.current = orders;

  const reloadOrders = useCallback(async () => {
    try {
      const r = await api<{ orders: AdminOrder[]; state: OrderingState }>('/admin/orders');
      setOrders(r.orders);
      setState(r.state);
      setLoaded(true);
      // Detect orders that arrived while the stream was reconnecting.
      const ids = new Set(r.orders.map((o) => o.id));
      if (knownIds.current) {
        const fresh = r.orders.filter((o) => o.status === 'PENDING' && !knownIds.current!.has(o.id));
        if (fresh.length) announce(fresh[fresh.length - 1]);
      }
      knownIds.current = new Set([...(knownIds.current || []), ...ids]);
    } catch {
      /* keep last data; polling retries */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadSettings = useCallback(async () => {
    const r = await api<{ settings: Settings }>('/admin/settings');
    setSettings(r.settings);
  }, []);

  const refreshSummary = useCallback(() => {
    api<{ open_reset_requests: number; visitors?: { live: number } }>('/admin/summary')
      .then((r) => {
        setResetRequests(r.open_reset_requests);
        setVisitorLive(r.visitors?.live ?? 0);
      })
      .catch(() => {});
  }, []);

  const soundOn = settings?.sound_enabled !== false;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  function announce(o: AdminOrder) {
    if (soundOnRef.current) playAlert();
    void showBrowserNotification(`NEW ORDER #${o.number}`, `${o.customer_name} · ${euro(o.total_cents)} · ${o.address}`);
  }

  useEffect(() => {
    reloadOrders();
    reloadSettings().catch(() => {});
    refreshSummary();
    api<{ location: DriverLocation | null }>('/admin/location')
      .then((r) => setServerLocation(r.location))
      .catch(() => {});
  }, [reloadOrders, reloadSettings, refreshSummary]);

  useStreamEvent(['order:new', 'order:update', 'reconnect'], () => {
    reloadOrders();
    refreshSummary();
  });
  useStreamEvent('settings', () => reloadSettings().catch(() => {}));
  useStreamEvent('location', (loc: DriverLocation | null) => setServerLocation(loc));
  useStreamEvent('reset-request', refreshSummary);
  useStreamEvent('visitors', refreshSummary);
  usePolling(reloadOrders, 15000);

  // Unlock audio on the first interaction anywhere in the admin UI.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setTimeout(() => setSoundReady(audioReady()), 100);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const pending = orders.filter((o) => o.status === 'PENDING');
  const alertOrder = pending.find((o) => !dismissed.has(o.id)) || null;

  // Keep ringing every 6 s while an order waits for a decision, so it can't be missed.
  useEffect(() => {
    if (!pending.length) return;
    const id = setInterval(() => {
      if (soundOnRef.current) playAlert();
    }, 6000);
    return () => clearInterval(id);
  }, [pending.length]);

  // Tab title shows waiting orders.
  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) NEW ORDER · VND` : 'VND Admin';
    return () => {
      document.title = 'VND · Vitia Night Drop';
    };
  }, [pending.length]);

  const setStatus = useCallback(
    async (id: number, status: OrderStatus, note?: string, payment?: PaymentInput) => {
      const r = await api<{ order: AdminOrder; state: OrderingState }>(`/admin/orders/${id}/status`, {
        method: 'POST',
        body: { status, note, payment },
      });
      setState(r.state);
      const next = ordersRef.current
        .map((o) => (o.id === id ? r.order : o))
        .filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
      ordersRef.current = next;
      setOrders(next);
      // Starting a delivery turns on live location; finishing the last delivery turns it off.
      if (status === 'ON_THE_WAY' && !gps.sharing) gps.start();
      if ((status === 'DELIVERED' || status === 'CANCELLED') && gps.sharing && !next.some((o) => TRACKABLE_STATUSES.includes(o.status))) {
        void gps.stop();
      }
      return r.order;
    },
    [gps],
  );

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const r = await api<{ settings: Settings }>('/admin/settings', { method: 'PUT', body: patch });
    setSettings(r.settings);
  }, []);

  const driverPos = useMemo(() => {
    if (gps.fix) return { lat: gps.fix.lat, lng: gps.fix.lng, heading: gps.fix.heading, at: gps.fix.at };
    if (serverLocation)
      return { lat: serverLocation.lat, lng: serverLocation.lng, heading: serverLocation.heading, at: new Date(serverLocation.updated_at).getTime() };
    return null;
  }, [gps.fix, serverLocation]);

  const value: AdminCtx = {
    orders,
    state,
    loaded,
    reloadOrders,
    settings,
    reloadSettings,
    saveSettings,
    gps,
    serverLocation,
    driverPos,
    setStatus,
    alertOrder,
    dismissAlert: () => alertOrder && setDismissed(new Set([...dismissed, alertOrder.id])),
    soundReady,
    enableSound: () => {
      unlockAudio();
      setTimeout(() => {
        setSoundReady(audioReady());
        playAlert();
      }, 100);
    },
    resetRequests,
    visitorLive,
    refreshSummary,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAdmin = () => useContext(Ctx);
