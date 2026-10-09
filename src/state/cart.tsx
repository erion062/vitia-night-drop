import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '../types';
import { useConfig } from './config';

const KEY = 'vnd_cart_v1';
const MAX_QTY = 20;

type Lines = Record<number, number>; // productId -> quantity

interface CartLine {
  product: Product;
  quantity: number;
  total_cents: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal_cents: number;
  qty: (productId: number) => number;
  add: (productId: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, q: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx>(null!);

function load(): Lines {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useConfig();
  const [raw, setRaw] = useState<Lines>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(raw));
  }, [raw]);

  const setQty = useCallback((id: number, q: number) => {
    setRaw((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(MAX_QTY, Math.round(q)));
      if (clamped === 0) delete next[id];
      else next[id] = clamped;
      return next;
    });
  }, []);

  const value = useMemo<CartCtx>(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    // Only products that still exist and are available count; prices always come from the latest catalog.
    const lines: CartLine[] = Object.entries(raw)
      .map(([id, quantity]) => ({ product: byId.get(Number(id))!, quantity }))
      .filter((l) => l.product && l.product.available && l.product.price_cents > 0)
      .map((l) => ({ ...l, total_cents: l.product.price_cents * l.quantity }));
    return {
      lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      subtotal_cents: lines.reduce((s, l) => s + l.total_cents, 0),
      qty: (id) => raw[id] || 0,
      add: (id) => {
        const p = byId.get(id);
        if (!p || !p.available || p.price_cents <= 0) return;
        setQty(id, (raw[id] || 0) + 1);
      },
      remove: (id) => setQty(id, (raw[id] || 0) - 1),
      setQty,
      clear: () => setRaw({}),
    };
  }, [raw, products, setQty]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
