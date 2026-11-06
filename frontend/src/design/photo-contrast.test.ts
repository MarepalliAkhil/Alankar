import { describe, expect, it } from 'vitest';
import stats from '../generated/photo-stats.json';
import { MODES, THEMES, composite, contrast, themes } from './themes';
import { resolvedColors } from './tokens';

/**
 * Glass is only a few percent opaque, so readability is verified against the REAL owner photos:
 * `npm run photos:stats` stores a 32x18 grid of average colours per photo, and every cell is
 * pushed through the same layers the browser paints (page veil, glass fill, scrim, top highlight).
 */
type Stat = { file: string; bytes: number; cells: string };
const photos = Object.entries(stats as Record<string, Stat>);
const cases = THEMES.flatMap((theme) => MODES.map((mode) => [theme, mode] as const));

function cellsOf(stat: Stat): string[] {
  return stat.cells.match(/.{6}/g)!.map((hex) => `#${hex}`);
}

describe('photo stats', () => {
  // Whether the stats still match public/photos is checked by "npm run photos:check".
  it.each(photos)('%s has a full 32 x 18 grid of colours', (_slot, stat) => {
    expect(cellsOf(stat)).toHaveLength(32 * 18);
  });
});

describe('text on photo glass over the real photos', () => {
  it.each(cases)('%s / %s: text meets AA on every photo cell', (theme, mode) => {
    const c = resolvedColors(theme, mode);
    const g = themes[theme][mode].glass;
    let worst = Infinity;
    let where = '';
    for (const [slot, stat] of photos) {
      cellsOf(stat).forEach((pixel, i) => {
        let behind = composite(c.backdropOverlay, pixel);
        behind = composite(g.fillPhoto, behind);
        behind = composite(g.scrimPhoto, behind);
        behind = composite(g.highlightPhoto, behind);
        // Inside photo glass the muted grey is switched off in CSS (it uses the full text colour).
        const ratio = contrast(c.text, behind);
        if (ratio < worst) {
          worst = ratio;
          where = `text on ${slot} cell ${i}`;
        }
      });
    }
    expect(worst, where).toBeGreaterThanOrEqual(4.5);
  });

  it.each(cases)('%s / %s: the photo still shows through (fill is light)', (theme, mode) => {
    const g = themes[theme][mode].glass;
    const alphaOf = (v: string) => Number(/,\s*([\d.]+)\)$/.exec(v)?.[1] ?? 1);
    const fill = alphaOf(g.fillPhoto);
    expect(fill).toBeGreaterThanOrEqual(mode === 'light' ? 0.14 : 0.24);
    expect(fill).toBeLessThanOrEqual(mode === 'light' ? 0.24 : 0.36);
  });

  it('reduced transparency falls back to a solid surface that meets AA', () => {
    for (const [theme, mode] of cases) {
      const c = resolvedColors(theme, mode);
      const solid = themes[theme][mode].glass.fillSolid;
      for (const fg of ['text', 'textMuted'] as const) {
        expect(contrast(c[fg], solid), `${theme}/${mode} ${fg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('plain text on the page background photo (Amendment 2)', () => {
  // Every page except the home page has the full-window photo directly behind ordinary text,
  // under the page veil. Text, muted text and links must stay AA over every cell of every
  // background photo, in every theme and mode.
  it.each(cases)(
    '%s / %s: text, muted text and links meet AA under the page veil',
    (theme, mode) => {
      const c = resolvedColors(theme, mode);
      let worst = Infinity;
      let where = '';
      for (const [slot, stat] of photos.filter(([name]) => name.endsWith('background'))) {
        cellsOf(stat).forEach((pixel, i) => {
          const behind = composite(c.pageVeil, pixel);
          for (const fg of ['text', 'textMuted', 'primaryHover'] as const) {
            const ratio = contrast(c[fg], behind);
            if (ratio < worst) {
              worst = ratio;
              where = `${fg} on ${slot} cell ${i}`;
            }
          }
        });
      }
      expect(worst, where).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('the photo is still a visible tint, not hidden (veil under 90 percent)', () => {
    for (const [theme, mode] of cases) {
      const alphaOf = (v: string) => Number(/,\s*([\d.]+)\)$/.exec(v)?.[1] ?? 1);
      expect(alphaOf(resolvedColors(theme, mode).pageVeil)).toBeLessThan(0.9);
    }
  });
});
