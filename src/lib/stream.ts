import { useEffect, useRef, useSyncExternalStore } from 'react';

// One shared Server-Sent Events connection for the whole app (only while logged in).
type Handler = (data: any) => void;

const listeners = new Map<string, Set<Handler>>();
const boundOnSource = new Set<string>();
let source: EventSource | null = null;
let wanted = false;
let retryTimer: number | undefined;
let connected = false;
const statusSubs = new Set<() => void>();

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusSubs.forEach((f) => f());
}

function dispatch(name: string, ev: MessageEvent) {
  let data: unknown = null;
  try {
    data = JSON.parse(ev.data);
  } catch {
    /* ignore */
  }
  listeners.get(name)?.forEach((h) => h(data));
}

function bind(name: string) {
  if (!source || boundOnSource.has(name)) return;
  boundOnSource.add(name);
  source.addEventListener(name, (ev) => dispatch(name, ev as MessageEvent));
}

function open() {
  if (!wanted || source) return;
  source = new EventSource('/api/stream');
  boundOnSource.clear();
  source.addEventListener('hello', () => {
    setConnected(true);
    // After a reconnect, let pages refetch anything they might have missed.
    listeners.get('reconnect')?.forEach((h) => h(null));
  });
  source.onerror = () => {
    setConnected(false);
    // Browser auto-retries unless the server refused (401) and closed the stream.
    // Re-open ourselves so a 401/dead socket does not look like a permanent "no connection".
    if (source && source.readyState === EventSource.CLOSED) {
      source.close();
      source = null;
      boundOnSource.clear();
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(open, 3000);
    }
  };
  for (const name of listeners.keys()) bind(name);
}

export function connectStream() {
  wanted = true;
  open();
}

export function disconnectStream() {
  wanted = false;
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  setConnected(false);
}

export function subscribe(name: string, handler: Handler) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(handler);
  bind(name);
  return () => listeners.get(name)?.delete(handler);
}

/** Subscribe to a server event for the lifetime of the component. */
export function useStreamEvent(name: string | string[], handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = Array.isArray(name) ? name.join('|') : name;
  useEffect(() => {
    const names = key.split('|');
    const offs = names.map((n) => subscribe(n, (d) => ref.current(d)));
    return () => offs.forEach((off) => off());
  }, [key]);
}

export function useStreamConnected() {
  return useSyncExternalStore(
    (cb) => {
      statusSubs.add(cb);
      return () => statusSubs.delete(cb);
    },
    () => connected,
  );
}

/** Calls `fn` every `ms` while the tab is visible — a safety net in case the live stream drops. */
export function usePolling(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    const onVisible = () => document.visibilityState === 'visible' && ref.current();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms]);
}
