import { describe, expect, it } from 'vitest';
import { MODES, THEMES, composite, contrast, themes } from './themes';
import { resolvedColors } from './tokens';

/**
 * Owner photos can contain any colour, so readability is checked against the worst cases: a
 * pure black and a pure white pixel under the veil.
 */
const cases = THEMES.flatMap((theme) => MODES.map((mode) => [theme, mode] as const));

describe('text over photos', () => {
  // The page photo is only lightly tinted, so text always sits on glass (cards, headers, bars).
  it.each(cases)('%s / %s: text on glass over a page backdrop meets AA', (theme, mode) => {
    const c = resolvedColors(theme, mode);
    const glass = themes[theme][mode].glass;
    for (const fill of [glass.fill, glass.fillDense]) {
      for (const pixel of ['#000000', '#FFFFFF']) {
        const behind = composite(fill, composite(c.backdropOverlay, pixel));
        for (const fg of ['text', 'textMuted'] as const) {
          expect(contrast(c[fg], behind), `${fg} over ${pixel}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(cases)('%s / %s: text on dense glass over a hero photo meets AA', (theme, mode) => {
    const c = resolvedColors(theme, mode);
    const dense = themes[theme][mode].glass.fillDense;
    for (const pixel of ['#000000', '#FFFFFF']) {
      const behind = composite(dense, composite(c.photoOverlay, pixel));
      for (const fg of ['text', 'textMuted'] as const) {
        expect(contrast(c[fg], behind), `${fg} over ${pixel}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
