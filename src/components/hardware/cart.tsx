"use client";

// The hardware cart — client-side, persisted per browser (localStorage), read
// by the header badge, the cart page and checkout. Prices here are DISPLAY
// only; checkout re-prices everything server-side from the catalog.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  productId: string;
  variantId: string | null;    // null = product without variants
  slug: string;
  name: string;                // product name snapshot for display
  variantName: string | null;
  sku: string | null;
  unitGross: number;           // EUR, display only
  image: string | null;        // product hero, for the emotional cart/checkout
  qty: number;
};

type CartApi = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  keyOf: (item: Pick<CartItem, "productId" | "variantId">) => string;
};

const STORAGE_KEY = "np7-hw-cart";
const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* fresh cart */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, loaded]);

  const keyOf = useCallback((i: Pick<CartItem, "productId" | "variantId">) => `${i.productId}:${i.variantId ?? "-"}`, []);

  const api = useMemo<CartApi>(() => ({
    items,
    count: items.reduce((a, i) => a + i.qty, 0),
    subtotal: items.reduce((a, i) => a + i.qty * i.unitGross, 0),
    keyOf,
    add: (item, qty = 1) => setItems((cur) => {
      const k = keyOf(item);
      const existing = cur.find((i) => keyOf(i) === k);
      if (existing) return cur.map((i) => (keyOf(i) === k ? { ...i, qty: i.qty + qty } : i));
      return [...cur, { ...item, qty }];
    }),
    setQty: (key, qty) => setItems((cur) =>
      qty <= 0 ? cur.filter((i) => keyOf(i) !== key) : cur.map((i) => (keyOf(i) === key ? { ...i, qty } : i))),
    remove: (key) => setItems((cur) => cur.filter((i) => keyOf(i) !== key)),
    clear: () => setItems([]),
  }), [items, keyOf]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}

/** Header cart badge — provider-free (reads storage directly), so the shared
 *  header can render on pages outside the hardware layout without crashing. */
export function CartBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        const items: CartItem[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        setCount(items.reduce((a, i) => a + i.qty, 0));
      } catch { setCount(0); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    const t = setInterval(read, 2000);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("focus", read); clearInterval(t); };
  }, []);
  if (count === 0) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#c2ff38] text-black text-[10px] font-black">
      {count}
    </span>
  );
}
