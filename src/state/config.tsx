import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, customerError } from '../lib/api';
import { setMapTiles, setRoutingUrl } from '../lib/geo';
import { usePolling, useStreamEvent } from '../lib/stream';
import type { Partner, Product, PublicConfig } from '../types';

interface ConfigCtx {
  config: PublicConfig | null;
  products: Product[];
  partners: Partner[];
  error: string;
  refreshConfig: () => Promise<PublicConfig | null>;
  refreshProducts: () => Promise<void>;
}

const Ctx = createContext<ConfigCtx>(null!);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [error, setError] = useState('');

  const refreshConfig = useCallback(async () => {
    try {
      const c = await api<PublicConfig>('/config');
      setRoutingUrl(c.osrm_url);
      setMapTiles(c.map_tiles);
      setConfig(c);
      setError('');
      return c;
    } catch (e) {
      setError(customerError(e));
      return null;
    }
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      const r = await api<{ products: Product[]; partners?: Partner[] }>('/products');
      setProducts(r.products);
      setPartners(r.partners || []);
    } catch {
      /* keep previous list */
    }
  }, []);

  useEffect(() => {
    refreshConfig();
    refreshProducts();
  }, [refreshConfig, refreshProducts]);

  // Capacity ("busy") and open/closed state change over time. Retry faster while unreachable.
  usePolling(async () => {
    await refreshConfig();
    await refreshProducts();
  }, error ? 4000 : 20000);
  useStreamEvent(['announcements', 'reconnect'], () => {
    refreshConfig();
    refreshProducts();
  });

  return (
    <Ctx.Provider value={{ config, products, partners, error, refreshConfig, refreshProducts }}>{children}</Ctx.Provider>
  );
}

export const useConfig = () => useContext(Ctx);
