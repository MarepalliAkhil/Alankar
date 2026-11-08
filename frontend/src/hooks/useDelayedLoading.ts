import { useEffect, useRef, useState } from 'react';

/** The logo loader waits this long before showing, and once shown stays at least `MIN`. */
export const LOGO_LOADER_DELAY_MS = 300;
export const LOGO_LOADER_MIN_MS = 500;

/**
 * True while the loader should be on screen: only when `loading` lasts longer than `delay`, and
 * then for at least `min`, so a fast load never shows it and a slow one never flickers.
 */
export function useDelayedLoading(
  loading: boolean,
  { delay = LOGO_LOADER_DELAY_MS, min = LOGO_LOADER_MIN_MS } = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading && !visible) {
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!loading && visible) {
      const left = min - (Date.now() - shownAt.current);
      if (left <= 0) {
        setVisible(false);
        return;
      }
      const timer = window.setTimeout(() => setVisible(false), left);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, visible, delay, min]);
  return visible;
}
