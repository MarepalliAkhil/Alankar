import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import stats from '../generated/photo-stats.json';
import focus from './photo-focus.json';
import { composite, contrast } from './themes';
import { resolvedColors } from './tokens';

/**
 * The division hero puts a nearly transparent glass card over a photo, over a directional scrim on
 * the left. The photo cells are the same 32 x 18 averages the other photo tests use. Every cell
 * under the card (the left 69% of the picture, the middle rows) is pushed through the layers the
 * browser paints: scrim (strongest to 62% of the width, fading to nothing at 85%), then the glass
 * fill, and the writing colour must reach 4.5:1 (body text and buttons); the headline needs 3:1.
 */
const css = readFileSync(join(process.cwd(), 'src/design/index.css'), 'utf8');
const heroCss = css.slice(css.indexOf('division hero (Salon, Spa, Parlor)'));

type Stat = { cells: string };
const cellsOf = (slot: string) =>
  (stats as Record<string, Stat>)[slot]!.cells.match(/.{6}/g)!.map((hex) => `#${hex}`);

const DIVISIONS = [
  { id: 'salon', slot: 'salon-hero', theme: 'salon' },
  { id: 'spa', slot: 'spa-hero', theme: 'spa' },
  { id: 'parlor', slot: 'parlor-hero', theme: 'parlor' },
] as const;
const MODES = ['light', 'dark'] as const;

const hex = (rgb: string) =>
  `#${rgb
    .split(' ')
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
const rgba = (rgb: string, a: number) => `rgba(${rgb.split(' ').join(', ')}, ${a})`;

function scrimAlpha(x: number, peak: number): number {
  const { hold, end } = focus.scrimShape;
  if (x <= hold) return peak;
  if (x >= end) return 0;
  return peak * (1 - (x - hold) / (end - hold));
}

/** Writing colour: white over a dark scrim; the theme's own text colour over a light scrim. */
function inkFor(theme: (typeof DIVISIONS)[number]['theme'], mode: (typeof MODES)[number]): string {
  const scrim = focus.scrim[theme][mode];
  return scrim.color === '0 0 0' ? '#ffffff' : resolvedColors(theme, 'light').text;
}

function worst(division: (typeof DIVISIONS)[number], mode: (typeof MODES)[number]) {
  const scrim = focus.scrim[division.theme][mode];
  const glass = focus.glass[mode];
  const ink = inkFor(division.theme, mode);
  const cells = cellsOf(division.slot);
  let min = Infinity;
  for (let row = 3; row < 15; row += 1) {
    for (let col = 0; col < 22; col += 1) {
      const x = (col + 0.5) / 32;
      let behind = composite(rgba(scrim.color, scrimAlpha(x, scrim.alpha)), cells[row * 32 + col]!);
      behind = composite(rgba(glass.color, glass.alpha), behind);
      min = Math.min(min, contrast(ink, behind));
    }
  }
  return min;
}

describe('division hero: contrast over the real photos', () => {
  for (const division of DIVISIONS) {
    for (const mode of MODES) {
      it(`${division.id} / ${mode}: body text and buttons reach 4.5:1, the headline 3:1`, () => {
        const ratio = worst(division, mode);
        expect(ratio, `${division.id} ${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('the glass is nearly transparent: 8 to 14% white in light mode, 14 to 22% dark in dark mode', () => {
    expect(focus.glass.light.color).toBe('255 255 255');
    expect(focus.glass.light.alpha).toBeGreaterThanOrEqual(0.08);
    expect(focus.glass.light.alpha).toBeLessThanOrEqual(0.14);
    expect(focus.glass.dark.alpha).toBeGreaterThanOrEqual(0.14);
    expect(focus.glass.dark.alpha).toBeLessThanOrEqual(0.22);
  });

  it('the stylesheet uses the same scrim and glass numbers as photo-focus.json', () => {
    const pick = (selector: RegExp) => {
      const m = heroCss.match(selector);
      return m ? Number(m[1]) : NaN;
    };
    expect(pick(/data-division-hero='salon'\] \{[^}]*--hero-scrim-a:\s*([\d.]+)/)).toBe(
      focus.scrim.salon.light.alpha,
    );
    for (const [id, theme] of [
      ['spa', 'spa'],
      ['beauty-parlor', 'parlor'],
    ] as const) {
      for (const mode of MODES) {
        const re = new RegExp(
          `data-mode='${mode}'\\] \\.division-hero\\[data-division-hero='${id}'\\] \\{[^}]*--hero-scrim-a:\\s*([\\d.]+)`,
        );
        expect(pick(re), `${id} ${mode}`).toBe(focus.scrim[theme][mode].alpha);
      }
    }
    expect(heroCss).toContain(
      `rgb(var(--hero-scrim-rgb) / var(--hero-scrim-a)) ${focus.scrimShape.hold * 100}%`,
    );
    expect(heroCss).toContain(`rgb(var(--hero-scrim-rgb) / 0) ${focus.scrimShape.end * 100}%`);
    expect(heroCss).toMatch(/data-mode='light'\] \.division-hero \{[^}]*--hero-glass-a:\s*0\.1\b/);
    expect(hex('255 255 255')).toBe('#ffffff');
  });

  it('reduced transparency falls back to a solid card in the theme colours (which pass AA)', () => {
    expect(heroCss).toMatch(
      /prefers-reduced-transparency: reduce\) \{\s*\.division-hero \.hero-glass \{[^}]*backdrop-filter: none/,
    );
    expect(heroCss).toMatch(
      /\[data-transparency='reduced'\] \.division-hero \.hero-glass \{[^}]*backdrop-filter: none/,
    );
    for (const division of DIVISIONS) {
      for (const mode of MODES) {
        const t = resolvedColors(division.theme, mode);
        expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the glass blur between 10 and 16 px', () => {
    const blurs = Array.from(heroCss.matchAll(/backdrop-filter:\s*blur\((\d+)px\)/g)).map((m) =>
      Number(m[1]),
    );
    expect(blurs.length).toBeGreaterThan(0);
    for (const px of blurs) {
      expect(px).toBeGreaterThanOrEqual(10);
      expect(px).toBeLessThanOrEqual(16);
    }
  });
});

describe('division hero: layout rules (static CSS)', () => {
  it('is clamp(520px, 78dvh, 760px) tall on wide screens, with content centred', () => {
    expect(heroCss).toMatch(/min-height:\s*clamp\(520px,\s*78dvh,\s*760px\)/);
    expect(heroCss).toMatch(/\.division-hero \{\s*display:\s*flex;\s*align-items:\s*center/);
  });

  it('uses a 38 to 42dvh, roughly 4:3 top band on phones, with the card overlapping it', () => {
    expect(heroCss).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
    expect(heroCss).toMatch(/min-height:\s*38dvh/);
    expect(heroCss).toMatch(/max-height:\s*42dvh/);
    expect(heroCss).toMatch(/margin-top:\s*-3\.25rem/);
  });

  it('uses dvh (never vh) and keeps 16 px gutters with the safe areas', () => {
    expect(heroCss).not.toMatch(/\d(?<!d)vh\b/);
    expect(heroCss).toMatch(/max\(1rem,\s*env\(safe-area-inset-left\)\)/);
    expect(heroCss).toMatch(/max\(1rem,\s*env\(safe-area-inset-right\)\)/);
  });

  it('makes buttons and chips at least 44 px tall', () => {
    expect(heroCss).toMatch(/\.hero-ghost,\s*\.hero-chip \{[^}]*min-height:\s*2\.75rem/);
  });

  it('has a directional scrim on wide screens only (none on phones)', () => {
    expect(heroCss).toMatch(/\.division-hero__scrim \{\s*display:\s*none/);
    expect(heroCss).toMatch(
      /@media \(min-width: 641px\) \{[\s\S]*\.division-hero__scrim \{\s*display:\s*block/,
    );
    expect(heroCss).toMatch(/linear-gradient\(\s*90deg/);
  });

  it('writes support text at 14 px or more on desktop and 15 px on phones, body 17 to 18 px', () => {
    expect(heroCss).toMatch(/\.division-hero__facts \{[^}]*font-size:\s*0\.9375rem/);
    expect(heroCss).toMatch(/\.division-hero__facts \{\s*font-size:\s*0\.875rem/);
    expect(heroCss).toMatch(
      /\.division-hero__summary \{[^}]*font-size:\s*1\.0625rem[^}]*line-height:\s*1\.6/,
    );
    expect(heroCss).toMatch(/\.division-hero__summary \{\s*font-size:\s*1\.125rem/);
  });

  it('has a focal point for each division, for desktop and for phones', () => {
    for (const key of ['salon-hero', 'spa-hero', 'parlor-hero'] as const) {
      expect(focus.focus[key].desktop).toMatch(/^\d+% \d+%$/);
      expect(focus.focus[key].mobile).toMatch(/^\d+% \d+%$/);
    }
  });
});
