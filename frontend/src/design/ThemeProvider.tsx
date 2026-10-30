import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DARK_QUERY, applyDisplay, readStored, systemMode, writeStored } from './display';
import { ThemeContext, useTheme, type ModePreference, type ThemeState } from './theme-context';
import type { Mode, ThemeName } from './themes';

/**
 * Dark/light mode (remembered per browser, defaulting to the system setting), the page theme,
 * and "reduce transparency". Everything is applied as data attributes on <html>, so portals
 * (dialogs, toasts) are themed too.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ModePreference>(() => readStored().mode ?? 'system');
  const [system, setSystem] = useState<Mode>(systemMode);
  const [theme, setTheme] = useState<ThemeName>('brand');
  const [reduceTransparency, setReduce] = useState<boolean>(
    () => !!readStored().reduceTransparency,
  );

  useEffect(() => {
    let query: MediaQueryList | undefined;
    try {
      query = window.matchMedia?.(DARK_QUERY);
    } catch {
      query = undefined;
    }
    if (!query?.addEventListener) return;
    const onChange = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query?.removeEventListener('change', onChange);
  }, []);

  const mode: Mode = preference === 'system' ? system : preference;

  useEffect(() => {
    applyDisplay(mode, theme, reduceTransparency);
  }, [mode, theme, reduceTransparency]);

  const setPreference = useCallback((value: ModePreference) => {
    setPref(value);
    writeStored({ ...readStored(), mode: value });
  }, []);
  const setReduceTransparency = useCallback((value: boolean) => {
    setReduce(value);
    writeStored({ ...readStored(), reduceTransparency: value });
  }, []);

  const state = useMemo<ThemeState>(
    () => ({
      preference,
      mode,
      theme,
      reduceTransparency,
      setPreference,
      setTheme,
      setReduceTransparency,
    }),
    [preference, mode, theme, reduceTransparency, setPreference, setReduceTransparency],
  );
  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>;
}

/** Renders children in another theme (and optionally mode) without changing the page. */
export function ThemeScope({
  theme,
  mode,
  className,
  children,
}: {
  theme: ThemeName;
  mode?: Mode;
  className?: string;
  children: ReactNode;
}) {
  const current = useTheme();
  return (
    <div data-theme={theme} data-mode={mode ?? current.mode} className={className}>
      {children}
    </div>
  );
}
