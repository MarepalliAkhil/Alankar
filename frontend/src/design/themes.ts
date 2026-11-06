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
 * including text on glass laid over the darkest and lightest colours of that theme.
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
  /** The darkest and lightest colours used in this theme (for the glass contrast test). */
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
    // Sidebar and public navbar: clearly see-through (about 40 to 50 percent), with a strong blur.
    fillBar: alpha(c.surface, light ? 0.42 : 0.48),
    fillSolid: c.surface,
    tint: alpha(c.primary, light ? 0.06 : 0.08),
    border: light ? 'rgba(255, 255, 255, 0.72)' : alpha(c.text, 0.12),
    highlight: light ? 'rgba(255, 255, 255, 0.9)' : alpha(c.text, 0.08),
    shadow: light ? `0 10px 40px ${alpha(c.primary, 0.14)}` : '0 12px 40px rgba(0, 0, 0, 0.45)',
    noiseOpacity: light ? '0.035' : '0.06',
    // Real glass (Task 17 amendment): the ONE recipe for the sidebar, the public navbar, the bell
    // panel, the profile menu, the tour card and cards over photos. See `.glass-photo` in index.css.
    // The fill is about 20% white (light) or 30% dark tint (dark) so the photo clearly shows
    // through; a thin scrim of the page colour keeps text AA over the real photos (checked in
    // photo-contrast.test.ts against src/generated/photo-stats.json).
    fillPhoto: light ? 'rgba(255, 255, 255, 0.2)' : alpha(c.surface, 0.3),
    scrimPhoto: alpha(c.background, light ? SCRIM_LIGHT : SCRIM_DARK),
    highlightPhoto: light ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.14)',
    edgePhoto: light ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.22)',
    borderPhoto: 'rgba(255, 255, 255, 0.3)',
    shadowPhoto: light ? '0 8px 32px rgba(30, 27, 75, 0.2)' : '0 10px 36px rgba(0, 0, 0, 0.5)',
    blurPhoto: '24px',
    saturatePhoto: '150%',
  };
}

/** Opacity of the page veil over the full-window background photo (light and dark). */
export const PAGE_VEIL_LIGHT = 0.86;
export const PAGE_VEIL_DARK = 0.82;

/** Opacity of the thin readability scrim inside photo glass (light and dark). */
export const SCRIM_LIGHT = 0.3;
export const SCRIM_DARK = 0.4;

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
      // Amendment 2: every page except home shows a full-window photo behind ordinary text (not
      // only glass), so the veil must keep text, muted text and links AA over the real photos
      // (checked cell by cell in photo-contrast.test.ts). The photo still reads as a soft tint.
      pageVeil: alpha(color.background, mode === 'light' ? PAGE_VEIL_LIGHT : PAGE_VEIL_DARK),
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
        background: '#FAF6EF',
        surface: '#FFFFFF',
        surfaceMuted: '#F0E9DC',
        text: '#1F1B2D',
        textMuted: '#5A5568',
        primary: '#4A2C7A',
        primaryHover: '#381F62',
        primaryLight: '#7A57B5',
        primarySoft: '#EAE1F5',
        onPrimary: '#FFFFFF',
        accent: '#B45309',
        accentSoft: '#FBE8CF',
        onAccent: '#FFFFFF',
        border: '#E6DCCB',
        focus: '#4A2C7A',
        orbOne: 'rgba(180, 83, 9, 0.10)',
        orbTwo: 'rgba(122, 87, 181, 0.14)',
        orbThree: 'rgba(212, 168, 83, 0.12)',
      },
      ['#D8C9B0', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#14111C',
        surface: '#1E1A2B',
        surfaceMuted: '#272238',
        text: '#F5F0FA',
        textMuted: '#BDB5CF',
        primary: '#C4A8F0',
        primaryHover: '#D9C7F7',
        primaryLight: '#7A57B5',
        primarySoft: '#2F2547',
        onPrimary: '#1A0F2E',
        accent: '#F2B263',
        accentSoft: '#3A2A14',
        onAccent: '#2A1A05',
        border: '#3A3350',
        focus: '#D9C7F7',
        orbOne: 'rgba(242, 178, 99, 0.10)',
        orbTwo: 'rgba(122, 87, 181, 0.20)',
        orbThree: 'rgba(196, 168, 240, 0.10)',
      },
      ['#14111C', '#3B2F66'],
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
        background: '#F2F4F7',
        surface: '#FFFFFF',
        surfaceMuted: '#E7EBF1',
        text: '#0F172A',
        textMuted: '#475569',
        primary: '#1D4E89',
        primaryHover: '#163C6B',
        primaryLight: '#4F83C4',
        primarySoft: '#E1ECF8',
        onPrimary: '#FFFFFF',
        accent: '#0F766E',
        accentSoft: '#CCFBF1',
        onAccent: '#FFFFFF',
        border: '#D6DCE6',
        focus: '#1D4E89',
        orbOne: 'rgba(29, 78, 137, 0.07)',
        orbTwo: 'rgba(15, 118, 110, 0.07)',
        orbThree: 'rgba(148, 163, 184, 0.10)',
      },
      ['#8E97A8', '#FFFFFF'],
    ),
    dark: theme(
      'dark',
      {
        background: '#0B1018',
        surface: '#131A25',
        surfaceMuted: '#1A2332',
        text: '#E7ECF3',
        textMuted: '#A3ADBB',
        primary: '#7FB2F0',
        primaryHover: '#A8CCF7',
        primaryLight: '#4F83C4',
        primarySoft: '#172A44',
        onPrimary: '#07162B',
        accent: '#5EEAD4',
        accentSoft: '#12302D',
        onAccent: '#04201C',
        border: '#283142',
        focus: '#A8CCF7',
        orbOne: 'rgba(127, 178, 240, 0.08)',
        orbTwo: 'rgba(94, 234, 212, 0.06)',
        orbThree: 'rgba(148, 163, 184, 0.06)',
      },
      ['#05080E', '#4A556A'],
    ),
  },
};

// --------------------------------------------------------------------------- identity (Task 15)

/**
 * What makes each theme feel different besides colour: type pair, corner shapes, motion curve and an
 * ornament pattern. Written as CSS variables next to the colours (same for light and dark), so pages
 * and components change by theme without knowing which theme they are in. See docs/DESIGN_DIRECTION.md.
 */
const SANS =
  "'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const svg = (body: string, size = 64) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'%3E${body}%3C/svg%3E")`;

export const identities: Record<ThemeName, Record<string, string>> = {
  // Neutral shop theme: warm paper, aubergine and amber. One clean face, firm headings.
  brand: {
    'font-display': SANS,
    'font-sans': SANS,
    'heading-weight': '600',
    'heading-tracking': '-0.02em',
    'heading-leading': '1.1',
    'radius-input': '12px',
    'radius-nested': '14px',
    'radius-card': '20px',
    'radius-modal': '24px',
    'shape-leaf': '28px 8px 28px 8px',
    'shape-arch': '28px 28px 8px 8px',
    'motion-base': '200ms',
    'motion-slow': '320ms',
    'motion-ease': 'cubic-bezier(0.2, 0, 0, 1)',
    'ornament-size': '64px',
    'ornament-opacity': '0.08',
    'ornament-mask': svg(
      "%3Cpath d='M0 32h64M32 0v64' stroke='black' stroke-width='1' fill='none'/%3E",
    ),
  },
  // Salon: editorial and confident. Serif display, sharp cards, crisp quick motion, hairlines.
  salon: {
    'font-display': "'Crimson Pro', 'Iowan Old Style', Georgia, serif",
    'font-sans': SANS,
    'heading-weight': '400',
    'heading-tracking': '-0.015em',
    'heading-leading': '1.02',
    'radius-input': '4px',
    'radius-nested': '4px',
    'radius-card': '6px',
    'radius-modal': '8px',
    'shape-leaf': '0 24px 0 24px',
    'shape-arch': '6px 6px 6px 6px',
    'motion-fast': '90ms',
    'motion-base': '160ms',
    'motion-slow': '260ms',
    'motion-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
    'ornament-size': '24px',
    'ornament-opacity': '0.10',
    'ornament-mask': svg(
      "%3Cpath d='M0 24L24 0' stroke='black' stroke-width='1' fill='none'/%3E",
      24,
    ),
  },
  // Spa: calm and organic. Lora and Work Sans, pebble and arch shapes, slow breathing motion, ripples.
  spa: {
    'font-display': "'Lora', 'Iowan Old Style', Georgia, serif",
    'font-sans':
      "'Work Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    'heading-weight': '400',
    'heading-tracking': '-0.005em',
    'heading-leading': '1.2',
    'radius-input': '22px',
    'radius-nested': '26px',
    'radius-card': '36px',
    'radius-modal': '40px',
    'shape-leaf': '48px 48px 48px 12px',
    'shape-arch': '999px 999px 28px 28px',
    'motion-fast': '200ms',
    'motion-base': '420ms',
    'motion-slow': '700ms',
    'motion-ease': 'cubic-bezier(0.37, 0, 0.2, 1)',
    'ornament-size': '120px',
    'ornament-opacity': '0.10',
    'ornament-mask': svg(
      "%3Ccircle cx='60' cy='60' r='16' stroke='black' fill='none'/%3E%3Ccircle cx='60' cy='60' r='32' stroke='black' fill='none'/%3E%3Ccircle cx='60' cy='60' r='48' stroke='black' fill='none'/%3E",
      120,
    ),
  },
  // Parlor: warm and expressive. Poppins, leaf corners, springy motion, a floral tile.
  parlor: {
    'font-display':
      "'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    'font-sans':
      "'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    'heading-weight': '700',
    'heading-tracking': '-0.025em',
    'heading-leading': '1.1',
    'radius-input': '16px',
    'radius-nested': '20px',
    'radius-card': '28px',
    'radius-modal': '32px',
    'shape-leaf': '40px 8px 40px 8px',
    'shape-arch': '40px 40px 8px 8px',
    'motion-fast': '140ms',
    'motion-base': '240ms',
    'motion-slow': '420ms',
    'motion-ease': 'cubic-bezier(0.34, 1.4, 0.64, 1)',
    'ornament-size': '88px',
    'ornament-opacity': '0.12',
    'ornament-mask': svg(
      "%3Cg fill='black'%3E%3Cellipse cx='44' cy='24' rx='7' ry='13'/%3E%3Cellipse cx='44' cy='64' rx='7' ry='13'/%3E%3Cellipse cx='24' cy='44' rx='13' ry='7'/%3E%3Cellipse cx='64' cy='44' rx='13' ry='7'/%3E%3Ccircle cx='44' cy='44' r='5'/%3E%3C/g%3E",
      88,
    ),
  },
  // Staff: calm and dense. One face, tight corners, quick motion, no ornament.
  staff: {
    'font-display': SANS,
    'font-sans': SANS,
    'heading-weight': '600',
    'heading-tracking': '-0.015em',
    'heading-leading': '1.15',
    'radius-input': '8px',
    'radius-nested': '10px',
    'radius-card': '12px',
    'radius-modal': '16px',
    'shape-leaf': '12px',
    'shape-arch': '12px',
    'motion-fast': '90ms',
    'motion-base': '150ms',
    'motion-slow': '240ms',
    'motion-ease': 'cubic-bezier(0.2, 0, 0, 1)',
    'ornament-size': '64px',
    'ornament-opacity': '0',
    'ornament-mask': 'none',
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
