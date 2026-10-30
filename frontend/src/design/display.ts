import { useEffect } from 'react';
import { useTheme, type ModePreference } from './theme-context';
import { resolvedColors } from './tokens';
import type { Mode, ThemeName } from './themes';

export const STORAGE_KEY = 'salon-display';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export interface Stored {
  mode?: ModePreference;
  reduceTransparency?: boolean;
}

export function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? (value as Stored) : {};
  } catch {
    return {};
  }
}

export function writeStored(value: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // private mode or storage blocked: the choice lasts until the page is closed
  }
}

export function systemMode(): Mode {
  try {
    return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Writes the display settings onto <html> (before React renders, to avoid a flash). */
export function applyDisplay(mode: Mode, theme: ThemeName, reduce: boolean): void {
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.theme = theme;
  root.dataset.transparency = reduce ? 'reduced' : 'normal';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedColors(theme, mode).background);
}

/** Call once at startup, before rendering. */
export function initialDisplay(): void {
  const stored = readStored();
  const pref = stored.mode ?? 'system';
  applyDisplay(pref === 'system' ? systemMode() : pref, 'brand', !!stored.reduceTransparency);
}

/** Sets the page theme while the calling layout or page is shown. */
export function useRouteTheme(theme: ThemeName): void {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
    return () => setTheme('brand');
  }, [theme, setTheme]);
}
