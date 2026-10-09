import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import { connectStream, disconnectStream } from '../lib/stream';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  register: (data: { full_name: string; phone: string; password: string; confirm_password: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let delay = 2000;

    const load = () => {
      api<{ user: User | null }>('/auth/me')
        .then((r) => {
          if (cancelled) return;
          setUser(r.user);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          // Network / 502: keep any existing session in memory and retry. Do not treat a
          // failed fetch as logout — the cookie is still there once the server is reachable.
          if (e instanceof ApiError && e.status === 401) setUser(null);
          setLoading(false);
          timer = window.setTimeout(load, delay);
          delay = Math.min(delay * 1.5, 15000);
        });
    };

    load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (user) connectStream();
    else disconnectStream();
  }, [user]);

  const login = useCallback(async (phone: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { phone, password } });
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (data: { full_name: string; phone: string; password: string; confirm_password: string }) => {
    const r = await api<{ user: User }>('/auth/register', { method: 'POST', body: data });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
