import { useSyncExternalStore } from 'react';
import { PORTRAIT_MOBILE_QUERY } from '../../vite-plugins/photo-slots.js';

/**
 * Which picture a screen gets is decided by the SHAPE of the screen, never by the user agent:
 * a portrait window no wider than 900 px gets the portrait ("-mobile") photo, everything else the
 * landscape photo. `<picture>` sources and CSS use this very text as their media query; this hook
 * is the same query for the JavaScript-driven home background.
 */
export { PORTRAIT_MOBILE_QUERY };

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(PORTRAIT_MOBILE_QUERY);
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
}

export function matchesPortraitMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(PORTRAIT_MOBILE_QUERY).matches;
}

/**
 * True while the window is portrait and at most 900 px wide. Updates live when the phone is
 * rotated or the window is resized, so a component that loads only the matching photo switches
 * without ever loading both.
 */
export function usePortraitMobile(): boolean {
  return useSyncExternalStore(subscribe, matchesPortraitMobile, () => false);
}
