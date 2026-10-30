/**
 * Task 11b: the maths behind the scroll-driven home hero (no React, so it is easy to test).
 *
 * The hero walks through the three division themes as you scroll: Salon "Midnight Studio", then
 * Spa "Sage Calm", then Beauty Parlor "Rose Glow". Each theme is held for most of its stretch and
 * blends into the next in a short window, so text is almost always shown in a theme whose
 * contrast is tested (themes.test.ts), and the blend itself is checked in hero.test.ts.
 */
import { cssVariables, themeVariables, tokens } from './tokens';
import { mixHex, type Mode, type ThemeName } from './themes';

export const HERO_THEMES = ['salon', 'spa', 'parlor'] as const satisfies readonly ThemeName[];
export type HeroTheme = (typeof HERO_THEMES)[number];

/** Share of each stage spent blending into the next one (the rest holds the theme). */
export const BLEND = 0.3;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Scroll progress through the hero (0 at the top, 1 at the end) -> stage position from 0 (Salon)
 * to 2 (Beauty Parlor), eased so each stage rests before moving on.
 */
export function stagePosition(progress: number): number {
  const raw = clamp(progress) * (HERO_THEMES.length - 1);
  const stage = Math.min(Math.floor(raw), HERO_THEMES.length - 2);
  const local = raw - stage;
  const start = (1 - BLEND) / 2;
  return stage + smooth(clamp((local - start) / BLEND));
}

/** The stage nearest to a position (0, 1 or 2). */
export function activeStage(position: number): number {
  return clamp(Math.round(position), 0, HERO_THEMES.length - 1);
}

/** How visible each stage's background is at a position (they add up to 1). */
export function stageWeights(position: number): number[] {
  return HERO_THEMES.map((_, i) => clamp(1 - Math.abs(position - i)));
}

/** Every colour, status and glass variable of a theme (base values included, so two themes
 * always have the same names). */
function allVariables(theme: HeroTheme, mode: Mode): Record<string, string> {
  return {
    ...cssVariables(tokens.color, 'color'),
    ...cssVariables(tokens.status, 'status'),
    ...cssVariables(tokens.glass, 'glass'),
    ...themeVariables(theme, mode),
  };
}

const COLOR = /^(#[0-9a-fA-F]{6}|rgba?\([^)]*\))$/;

/**
 * The theme's CSS variables at a position: colours are mixed between the two neighbouring
 * division themes; anything that is not a plain colour (shadows, numbers) comes from the nearer
 * theme.
 */
export function heroVariables(position: number, mode: Mode): Record<string, string> {
  const pos = clamp(position, 0, HERO_THEMES.length - 1);
  const from = Math.min(Math.floor(pos), HERO_THEMES.length - 2);
  const t = pos - from;
  const a = allVariables(HERO_THEMES[from], mode);
  const b = allVariables(HERO_THEMES[from + 1], mode);
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(a)) {
    const other = b[name];
    if (COLOR.test(value) && COLOR.test(other)) {
      out[name] = t === 0 ? value : t === 1 ? other : mixHex(value, other, t);
    } else {
      out[name] = t < 0.5 ? value : other;
    }
  }
  return out;
}
