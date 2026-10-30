/**
 * Task 11: theme token sets. Five themes, each in light and dark:
 *
 *   brand   neutral Alankar violet (public pages that are not a division, customer portal base)
 *   salon   "Midnight Studio"  charcoal and navy with warm gold and copper
 *   spa     "Sage Calm"        sage green and warm sand
 *   parlor  "Rose Glow"        blush pink, rose and champagne gold
 *   staff   fixed theme for the receptionist, stylist and admin portals
 *
 * A theme only OVERRIDES the token values in tokens.ts (same names, same CSS variables), so every
 * existing page and component re-themes without changes. tokens.ts writes them as CSS rules keyed
 * on `[data-theme][data-mode]`; ThemeProvider sets those attributes on <html>, and ThemeScope can
 * set them on any element (the design-system page previews every theme side by side that way).
 *
 * Every text/background pair used by the components is checked for WCAG AA in themes.test.ts,
 * including text on glass laid over the darkest and lightest colours of that theme's artwork.
 */

export const THEMES = ['brand', 'salon', 'spa', 'parlor', 'staff'] as const;
export type ThemeName = (typeof THEMES)[number];
export const MODES = ['light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

export const themeLabels: Record<ThemeName, string> = {
  brand: 'Alankar',
  salon: 'Midnight Studio (Salon)',
  spa: 'Sage Calm (Spa)',
  parlor: 'Rose Glow (Beauty Parlor)',
  staff: 'Staff',
};

type Colors = Record<string, string>;

export interface ThemeTokens {
  color: Colors;
  status?: Record<string, { bg: string; fg: string }>;
  glass: Record<string, string>;
  /** The darkest and lightest colours used in this theme's artwork (for the glass contrast test). */
  artRange: [string, string];
}

/** Semantic colours shared by every dark theme (light themes keep the base values in tokens.ts). */
const darkSemantic: Colors = {
  success: '#22C55E',
  successSoft: '#0E2A1B',
  successText: '#86EFAC',
  warning: '#F59E0B',
  warningSoft: '#33240A',
  warningText: '#FCD34D',
  danger: '#F87171',
  dangerStrong: '#F87171',
  dangerSoft: '#3A1414',
  dangerText: '#FCA5A5',
  info: '#818CF8',
  infoSoft: '#1E2148',
  infoText: '#C7D2FE',
  overlay: 'rgba(0, 0, 0, 0.62)',
};

const darkStatus = {
  requested: { bg: '#2A2145', fg: '#D8CCFF' },
  awaitingPayment: { bg: '#3A2410', fg: '#FDBA74' },
  scheduled: { bg: '#2E2550', fg: '#C4B5FD' },
  checkedIn: { bg: '#232A52', fg: '#A5B4FC' },
  inProgress: { bg: '#33270B', fg: '#FCD34D' },
  completed: { bg: '#0F2E1C', fg: '#86EFAC' },
  rejected: { bg: '#3A1414', fg: '#FCA5A5' },
  paymentExpired: { bg: '#22262E', fg: '#FCA5A5' },
  cancelled: { bg: '#22262E', fg: '#CBD5E1' },
  noShow: { bg: '#3A1414', fg: '#FCA5A5' },
};

/** rgba() of a #RRGGBB colour. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function glassFor(mode: Mode, c: Colors): Record<string, string> {
  const light = mode === 'light';
  return {
    fill: alpha(c.surface, light ? 0.78 : 0.72),
    fillDense: alpha(c.surface, light ? 0.88 : 0.86),
    fillSolid: c.surface,
    tint: alpha(c.primary, light ? 0.06 : 0.08),
    border: light ? 'rgba(255, 255, 255, 0.72)' : alpha(c.text, 0.12),
    highlight: light ? 'rgba(255, 255, 255, 0.9)' : alpha(c.text, 0.08),
    shadow: light ? `0 10px 40px ${alpha(c.primary, 0.14)}` : '0 12px 40px rgba(0, 0, 0, 0.45)',
    noiseOpacity: light ? '0.035' : '0.06',
  };
}

function theme(mode: Mode, color: Colors, artRange: [string, string]): ThemeTokens {
  const all = mode === 'dark' ? { ...darkSemantic, ...color } : color;
  return {
    color: {
      ...all,
      artOverlay: mode === 'light' ? alpha(color.background, 0.55) : alpha(color.background, 0.62),
      photoOverlay:
        mode === 'light' ? alpha(color.background, 0.62) : alpha(color.background, 0.66),
      // The page photo stays recognisable (about 34% tint in light, 52% in dark); text sits on glass.
      backdropOverlay: alpha(color.background, mode === 'light' ? 0.34 : 0.52),
    },
    status: mode === 'dark' ? darkStatus : undefined,
    glass: glassFor(mode, color),
    artRange,
  };
}

export const themes: Record<ThemeName, Record<Mode, ThemeTokens>> = {
  brand: {
    light: theme(
      'light',
      {
        background: '#F8F6FF',
        surface: '#FFFFFF',
        surfaceMuted: '#F1EDFC',
        text: '#1E1B4B',
        textMuted: '#5B5675',
        primary: '#7C3AED',
        primaryHover: '#6D28D9',
        primaryLight: '#8B5CF6',
        primarySoft: '#EDE9FE',
        onPrimary: '#FFFFFF',
        accent: '#BE185D',
        accentSoft: '#FCE7F3',
        onAccent: '#FFFFFF',
        border: '#E4DDF7',
        focus: '#7C3AED',
        orbOne: 'rgba(139, 92, 246, 0.22)',
        orbTwo: 'rgba(165, 180, 252, 0.28)',
        orbThree: 'rgba(244, 114, 182, 0.12)',
      },
      ['#C4B5FD', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#0F0B1E',
        surface: '#1A1530',
        surfaceMuted: '#231C3D',
        text: '#F3F0FF',
        textMuted: '#B9B2D6',
        primary: '#A78BFA',
        primaryHover: '#C4B5FD',
        primaryLight: '#8B5CF6',
        primarySoft: '#2E2550',
        onPrimary: '#160F2E',
        accent: '#F9A8D4',
        accentSoft: '#3B1830',
        onAccent: '#2A0A1C',
        border: '#352B55',
        focus: '#C4B5FD',
        orbOne: 'rgba(139, 92, 246, 0.25)',
        orbTwo: 'rgba(99, 102, 241, 0.18)',
        orbThree: 'rgba(244, 114, 182, 0.12)',
      },
      ['#0F0B1E', '#3B2F66'],
    ),
  },
  salon: {
    light: theme(
      'light',
      {
        background: '#F5F2EB',
        surface: '#FFFFFF',
        surfaceMuted: '#ECE6DA',
        text: '#121829',
        textMuted: '#4A5163',
        primary: '#7A5518',
        primaryHover: '#5F4210',
        primaryLight: '#B8893A',
        primarySoft: '#F1E6CF',
        onPrimary: '#FFFFFF',
        accent: '#9A4E22',
        accentSoft: '#F5E1D3',
        onAccent: '#FFFFFF',
        border: '#DED5C3',
        focus: '#7A5518',
        orbOne: 'rgba(184, 137, 58, 0.18)',
        orbTwo: 'rgba(30, 41, 82, 0.10)',
        orbThree: 'rgba(199, 125, 78, 0.12)',
      },
      ['#B8893A', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#0C1020',
        surface: '#151B2E',
        surfaceMuted: '#1D2439',
        text: '#F4EFE6',
        textMuted: '#B9B3A6',
        primary: '#D4A853',
        primaryHover: '#E6C27A',
        primaryLight: '#B8893A',
        primarySoft: '#2B2617',
        onPrimary: '#171107',
        accent: '#D98A5A',
        accentSoft: '#33201A',
        onAccent: '#1C0D05',
        border: '#2C3550',
        focus: '#E6C27A',
        orbOne: 'rgba(212, 168, 83, 0.16)',
        orbTwo: 'rgba(56, 78, 140, 0.22)',
        orbThree: 'rgba(217, 138, 90, 0.12)',
      },
      ['#070A15', '#8A6E42'],
    ),
  },
  spa: {
    light: theme(
      'light',
      {
        background: '#F4F0E6',
        surface: '#FFFFFF',
        surfaceMuted: '#E9E4D6',
        text: '#1C2A21',
        textMuted: '#4B584E',
        primary: '#46694D',
        primaryHover: '#36533C',
        primaryLight: '#7FA285',
        primarySoft: '#E2ECDF',
        onPrimary: '#FFFFFF',
        accent: '#7D5F33',
        accentSoft: '#F0E6D4',
        onAccent: '#FFFFFF',
        border: '#D8D2C1',
        focus: '#46694D',
        orbOne: 'rgba(127, 162, 133, 0.22)',
        orbTwo: 'rgba(216, 194, 156, 0.30)',
        orbThree: 'rgba(70, 105, 77, 0.10)',
      },
      ['#7FA285', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#0E1612',
        surface: '#16221C',
        surfaceMuted: '#1E2C25',
        text: '#EEF2EA',
        textMuted: '#AFBAAF',
        primary: '#9CC09F',
        primaryHover: '#B8D4BA',
        primaryLight: '#7FA285',
        primarySoft: '#1F3326',
        onPrimary: '#0D1B10',
        accent: '#D8C29C',
        accentSoft: '#2E281C',
        onAccent: '#1E160A',
        border: '#2A3B32',
        focus: '#B8D4BA',
        orbOne: 'rgba(127, 162, 133, 0.18)',
        orbTwo: 'rgba(216, 194, 156, 0.10)',
        orbThree: 'rgba(70, 105, 77, 0.16)',
      },
      ['#08100C', '#5F7F64'],
    ),
  },
  parlor: {
    light: theme(
      'light',
      {
        background: '#FDF4F5',
        surface: '#FFFFFF',
        surfaceMuted: '#F7E6EA',
        text: '#3A1422',
        textMuted: '#6B4655',
        primary: '#A8355A',
        primaryHover: '#8A2747',
        primaryLight: '#D9779A',
        primarySoft: '#FBE1E9',
        onPrimary: '#FFFFFF',
        accent: '#7E5C1E',
        accentSoft: '#F3E8CF',
        onAccent: '#FFFFFF',
        border: '#EED5DC',
        focus: '#A8355A',
        orbOne: 'rgba(217, 119, 154, 0.20)',
        orbTwo: 'rgba(227, 200, 143, 0.26)',
        orbThree: 'rgba(168, 53, 90, 0.10)',
      },
      ['#D9779A', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#180D12',
        surface: '#24141B',
        surfaceMuted: '#2E1A23',
        text: '#FBEFF2',
        textMuted: '#D2B5BF',
        primary: '#F2A7BB',
        primaryHover: '#F8C6D3',
        primaryLight: '#D9779A',
        primarySoft: '#3A1C28',
        onPrimary: '#33101D',
        accent: '#E3C88F',
        accentSoft: '#33291A',
        onAccent: '#251B08',
        border: '#43283A',
        focus: '#F8C6D3',
        orbOne: 'rgba(242, 167, 187, 0.16)',
        orbTwo: 'rgba(227, 200, 143, 0.10)',
        orbThree: 'rgba(168, 53, 90, 0.18)',
      },
      ['#0F070B', '#8C7558'],
    ),
  },
  staff: {
    light: theme(
      'light',
      {
        background: '#F3F4F7',
        surface: '#FFFFFF',
        surfaceMuted: '#E9EBF0',
        text: '#111827',
        textMuted: '#4B5563',
        primary: '#6D28D9',
        primaryHover: '#5B21B6',
        primaryLight: '#8B5CF6',
        primarySoft: '#EDE9FE',
        onPrimary: '#FFFFFF',
        accent: '#0F766E',
        accentSoft: '#CCFBF1',
        onAccent: '#FFFFFF',
        border: '#DADDE5',
        focus: '#6D28D9',
        orbOne: 'rgba(109, 40, 217, 0.10)',
        orbTwo: 'rgba(15, 118, 110, 0.10)',
        orbThree: 'rgba(148, 163, 184, 0.12)',
      },
      ['#8E97A8', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#0B0F17',
        surface: '#141A24',
        surfaceMuted: '#1B2230',
        text: '#E7ECF3',
        textMuted: '#A3ADBB',
        primary: '#A78BFA',
        primaryHover: '#C4B5FD',
        primaryLight: '#8B5CF6',
        primarySoft: '#272148',
        onPrimary: '#120D26',
        accent: '#5EEAD4',
        accentSoft: '#12302D',
        onAccent: '#04201C',
        border: '#283142',
        focus: '#C4B5FD',
        orbOne: 'rgba(167, 139, 250, 0.12)',
        orbTwo: 'rgba(94, 234, 212, 0.08)',
        orbThree: 'rgba(148, 163, 184, 0.08)',
      },
      ['#05080E', '#4A556A'],
    ),
  },
};

/** Which theme a division page uses. */
export const divisionTheme = {
  salon: 'salon',
  spa: 'spa',
  'beauty-parlor': 'parlor',
} as const satisfies Record<string, ThemeName>;

// --------------------------------------------------------------------------- colour maths

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** "rgba(r, g, b, a)" -> [r, g, b, a]; "#RRGGBB" -> [r, g, b, 1]. */
export function parseColor(value: string): [number, number, number, number] {
  if (value.startsWith('#')) return [...rgb(value), 1];
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

/** A translucent colour laid over an opaque one. */
export function composite(top: string, bottom: string): string {
  const [r, g, b, a] = parseColor(top);
  const [br, bg, bb] = parseColor(bottom);
  const mix = (f: number, back: number) => Math.round(f * a + back * (1 - a));
  return `#${[mix(r, br), mix(g, bg), mix(b, bb)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(color: string): number {
  const [r, g, b] = parseColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of two opaque colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes two #RRGGBB colours (t = 0 gives a, t = 1 gives b). Used by the scroll-driven hero. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab, aa] = parseColor(a);
  const [br, bg, bb, ba] = parseColor(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  if (aa === 1 && ba === 1 && a.startsWith('#') && b.startsWith('#')) {
    return `#${[m(ar, br), m(ag, bg), m(ab, bb)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  const alphaMix = +(aa + (ba - aa) * t).toFixed(3);
  return `rgba(${m(ar, br)}, ${m(ag, bg)}, ${m(ab, bb)}, ${alphaMix})`;
}

/** The text/background pairs the components use, with the ratio each must reach. */
export const CONTRAST_PAIRS: { fg: string; bg: string; min: number; use: string }[] = [
  { fg: 'text', bg: 'background', min: 7, use: 'Body text on the page' },
  { fg: 'text', bg: 'surface', min: 7, use: 'Body text on cards' },
  { fg: 'textMuted', bg: 'surface', min: 4.5, use: 'Secondary text on cards' },
  { fg: 'textMuted', bg: 'background', min: 4.5, use: 'Secondary text on the page' },
  { fg: 'textMuted', bg: 'surfaceMuted', min: 4.5, use: 'Secondary text on muted panels' },
  { fg: 'onPrimary', bg: 'primary', min: 4.5, use: 'Primary button' },
  { fg: 'onPrimary', bg: 'primaryHover', min: 4.5, use: 'Primary button, hover' },
  { fg: 'primaryHover', bg: 'surface', min: 4.5, use: 'Links on cards' },
  { fg: 'primaryHover', bg: 'primarySoft', min: 4.5, use: 'Active menu item, secondary button' },
  { fg: 'text', bg: 'primarySoft', min: 4.5, use: 'Text on soft highlight' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, use: 'Accent button' },
  { fg: 'accent', bg: 'surface', min: 4.5, use: 'Accent text' },
  { fg: 'successText', bg: 'successSoft', min: 4.5, use: 'Success badge' },
  { fg: 'warningText', bg: 'warningSoft', min: 4.5, use: 'Warning badge' },
  { fg: 'dangerText', bg: 'dangerSoft', min: 4.5, use: 'Error badge' },
  { fg: 'infoText', bg: 'infoSoft', min: 4.5, use: 'Info badge' },
  { fg: 'focus', bg: 'background', min: 3, use: 'Focus ring' },
];
