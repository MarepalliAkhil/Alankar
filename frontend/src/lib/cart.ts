import { useSyncExternalStore } from 'react';
import type { CartItem } from '../api/shop';

/**
 * The shop cart: product ids and quantities only (never prices, never personal data), kept in
 * this browser so a refresh does not empty it. Prices are always fetched from the server.
 */
const KEY = 'salon-shop-cart';
const listeners = new Set<() => void>();
let items: CartItem[] = load();

function load(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is CartItem =>
          typeof x === 'object' &&
          x !== null &&
          typeof (x as CartItem).product === 'string' &&
          Number.isInteger((x as CartItem).quantity) &&
          (x as CartItem).quantity > 0,
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

function save(next: CartItem[]) {
  items = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode or storage full: the cart still works until the page is closed
  }
  listeners.forEach((fn) => fn());
}

export const cart = {
  get: () => items,
  set(product: string, quantity: number) {
    const rest = items.filter((i) => i.product !== product);
    save(quantity > 0 ? [...rest, { product, quantity }] : rest);
  },
  add(product: string, quantity = 1, max = 10) {
    const have = items.find((i) => i.product === product)?.quantity ?? 0;
    cart.set(product, Math.min(have + quantity, max));
  },
  clear: () => save([]),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** For tests. */
  reset() {
    items = [];
    listeners.forEach((fn) => fn());
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(cart.subscribe, cart.get, cart.get);
}
