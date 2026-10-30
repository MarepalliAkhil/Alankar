/**
 * Design tokens: the ONLY place for colours, radii, shadows, blur, spacing, fonts and motion.
 *
 * - `applyTokens()` writes every token to a CSS variable on <html> at startup.
 * - `tailwindTheme` maps Tailwind class names to those CSS variables.
 * A redesign (stage 2) changes this file and the ui components, never the pages.
 *
 * Task 11: the values below are the base (the "brand" theme in light mode). themes.ts holds the
 * other themes and dark mode as overrides of these same names; applyTokens() writes them all as
 * one stylesheet keyed on `[data-theme][data-mode]`.
 */
import { MODES, THEMES, themes, type Mode, type ThemeName } from './themes';

export const tokens = {
  color: {
    primary: '#7C3AED',
    primaryHover: '#6D28D9',
    primaryLight: '#8B5CF6',
    primarySoft: '#EDE9FE',
    onPrimary: '#FFFFFF',
    text: '#1E1B4B',
    textMuted: '#5B5675',
    background: '#F8F6FF',
    surface: '#FFFFFF',
    surfaceMuted: '#F1EDFC',
    border: '#E4DDF7',
    accent: '#BE185D',
    accentSoft: '#FCE7F3',
    onAccent: '#FFFFFF',
    // Laid over background artwork so text above it stays readable (Task 11).
    artOverlay: 'rgba(248, 246, 255, 0.55)',
    success: '#22C55E',
    successSoft: '#DCFCE7',
    successText: '#166534',
    warning: '#F59E0B',
    warningSoft: '#FEF3C7',
    warningText: '#92400E',
    danger: '#EF4444',
    dangerStrong: '#DC2626',
    dangerSoft: '#FEE2E2',
    dangerText: '#991B1B',
    info: '#6366F1',
    infoSoft: '#E0E7FF',
    infoText: '#3730A3',
    overlay: 'rgba(30, 27, 75, 0.45)',
    focus: '#7C3AED',
    orbOne: 'rgba(139, 92, 246, 0.22)',
    orbTwo: 'rgba(165, 180, 252, 0.28)',
    orbThree: 'rgba(244, 114, 182, 0.12)',
  },
  // Appointment status capsules (soft background + dark text for AA contrast).
  status: {
    requested: { bg: '#F5F3FF', fg: '#5B21B6' },
    awaitingPayment: { bg: '#FFEDD5', fg: '#9A3412' },
    scheduled: { bg: '#EDE9FE', fg: '#5B21B6' },
    checkedIn: { bg: '#E0E7FF', fg: '#3730A3' },
    inProgress: { bg: '#FEF3C7', fg: '#92400E' },
    completed: { bg: '#DCFCE7', fg: '#166534' },
    rejected: { bg: '#FEE2E2', fg: '#991B1B' },
    paymentExpired: { bg: '#F1F5F9', fg: '#7F1D1D' },
    cancelled: { bg: '#F1F5F9', fg: '#475569' },
    noShow: { bg: '#FEE2E2', fg: '#991B1B' },
  },
  glass: {
    fill: 'rgba(255, 255, 255, 0.66)',
    fillDense: 'rgba(255, 255, 255, 0.88)',
    // The "reduce transparency" fallback: a solid surface, no blur.
    fillSolid: '#FFFFFF',
    tint: 'rgba(124, 58, 237, 0.06)',
    border: 'rgba(255, 255, 255, 0.72)',
    highlight: 'rgba(255, 255, 255, 0.9)',
    shadow: '0 10px 40px rgba(124, 58, 237, 0.14)',
    blurSm: '8px',
    blur: '16px',
    blurLg: '28px',
    saturate: '160%',
    // A tiny generated grain texture over glass (SVG feTurbulence, no image file).
    noise:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
    noiseOpacity: '0.035',
  },
  radius: {
    none: '0px',
    input: '14px',
    nested: '16px',
    card: '24px',
    modal: '28px',
    full: '9999px',
  },
  shadow: {
    none: 'none',
    card: '0 10px 40px rgba(91, 33, 182, 0.12)',
    raised: '0 16px 48px rgba(91, 33, 182, 0.18)',
    focus: '0 0 0 3px rgba(124, 58, 237, 0.35)',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  font: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  motion: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
    page: '260ms',
    ease: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  z: {
    nav: '40',
    overlay: '50',
    toast: '60',
  },
} as const;

export type ColorToken = keyof typeof tokens.color;

type TokenTree = { readonly [key: string]: string | TokenTree };
export type NestedVars = { [key: string]: string | NestedVars };

export const kebab = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Flattens tokens to CSS custom properties, e.g. color.primaryHover -> --color-primary-hover. */
export function cssVariables(source: TokenTree = tokens, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const name = prefix ? `${prefix}-${kebab(key)}` : kebab(key);
    if (typeof value === 'string') {
      out[`--${name}`] = value;
    } else {
      Object.assign(out, cssVariables(value, name));
    }
  }
  return out;
}

/** Every colour of one theme in one mode: the base values with the theme's overrides. */
export function resolvedColors(theme: ThemeName, mode: Mode): Record<string, string> {
  return { ...tokens.color, ...themes[theme][mode].color };
}

/** The CSS variables a theme sets on top of the base, for one mode. */
export function themeVariables(theme: ThemeName, mode: Mode): Record<string, string> {
  const t = themes[theme][mode];
  return {
    ...cssVariables(t.color, 'color'),
    ...(t.status ? cssVariables(t.status, 'status') : {}),
    ...cssVariables(t.glass, 'glass'),
  };
}

const block = (selector: string, vars: Record<string, string>, extra = '') =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('')}${extra}}`;

/** One stylesheet: the base tokens on :root, then every theme in both modes. */
export function themeStylesheet(): string {
  const rules = [block(':root', cssVariables(), 'color-scheme:light;')];
  for (const theme of THEMES) {
    for (const mode of MODES) {
      rules.push(
        block(
          `[data-theme="${theme}"][data-mode="${mode}"]`,
          themeVariables(theme, mode),
          `color-scheme:${mode};`,
        ),
      );
    }
  }
  return rules.join('\n');
}

/**
 * Writes all tokens as one stylesheet (base on :root, themes on [data-theme][data-mode]). Call
 * once before rendering. A stylesheet rather than inline styles on <html>, so a theme rule can
 * override the base.
 */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  const doc = root.ownerDocument;
  let tag = doc.getElementById('design-tokens');
  if (!tag) {
    tag = doc.createElement('style');
    tag.id = 'design-tokens';
    doc.head.appendChild(tag);
  }
  tag.textContent = themeStylesheet();
  if (!root.dataset.theme) root.dataset.theme = 'brand';
  if (!root.dataset.mode) root.dataset.mode = 'light';
}

function varTree(group: string, source: TokenTree): NestedVars {
  const out: NestedVars = {};
  for (const [key, value] of Object.entries(source)) {
    const name = `${group}-${kebab(key)}`;
    out[kebab(key)] = typeof value === 'string' ? `var(--${name})` : varTree(name, value);
  }
  return out;
}

function flatVars(group: string, source: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(source)) {
    out[kebab(key)] = `var(--${group}-${kebab(key)})`;
  }
  return out;
}

/** Tailwind theme values that point at the CSS variables above. */
export const tailwindTheme = {
  colors: {
    transparent: 'transparent',
    current: 'currentColor',
    ...varTree('color', tokens.color),
    status: varTree('status', tokens.status),
    glass: flatVars('glass', {
      fill: '',
      fillDense: '',
      fillSolid: '',
      tint: '',
      border: '',
      highlight: '',
    }),
  } as NestedVars,
  borderRadius: flatVars('radius', tokens.radius),
  boxShadow: flatVars('shadow', tokens.shadow),
  fontFamily: { sans: ['var(--font-sans)'] },
  spacing: flatVars('space', tokens.space),
  zIndex: flatVars('z', tokens.z),
  transitionDuration: flatVars('motion', {
    fast: tokens.motion.fast,
    base: tokens.motion.base,
    slow: tokens.motion.slow,
    page: tokens.motion.page,
  }),
  transitionTimingFunction: { brand: 'var(--motion-ease)' },
  backdropBlur: {
    glass: 'var(--glass-blur)',
    'glass-sm': 'var(--glass-blur-sm)',
    'glass-lg': 'var(--glass-blur-lg)',
  },
};
