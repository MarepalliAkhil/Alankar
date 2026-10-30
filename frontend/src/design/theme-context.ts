import { createContext, useContext } from 'react';
import type { Mode, ThemeName } from './themes';

export type ModePreference = Mode | 'system';

export interface ThemeState {
  /** What the visitor chose (remembered in this browser). */
  preference: ModePreference;
  /** The mode in use: the preference, or the system setting when it is "system". */
  mode: Mode;
  /** The theme of the current page (set by layouts and pages, not by the visitor). */
  theme: ThemeName;
  /** "Reduce transparency": glass becomes solid (remembered in this browser). */
  reduceTransparency: boolean;
  setPreference: (value: ModePreference) => void;
  setTheme: (value: ThemeName) => void;
  setReduceTransparency: (value: boolean) => void;
}

const fallback: ThemeState = {
  preference: 'system',
  mode: 'light',
  theme: 'brand',
  reduceTransparency: false,
  setPreference: () => undefined,
  setTheme: () => undefined,
  setReduceTransparency: () => undefined,
};

export const ThemeContext = createContext<ThemeState>(fallback);

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
