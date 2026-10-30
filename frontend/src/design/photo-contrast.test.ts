import { describe, expect, it } from 'vitest';
import { MODES, THEMES, composite, contrast, themes } from './themes';
import { resolvedColors } from './tokens';

/**
 * Owner photos can contain any colour, so readability is checked against the worst cases: a
 * pure black and a pure white pixel under the veil.
 */
const cases = THEMES.flatMap((theme) => MODES.map((mode) => [theme, mode] as const));

describe('text over photos', () => {
  it.each(cases)('%s / %s: page text on a photo backdrop meets AA', (theme, mode) => {
    const c = resolvedColors(theme, mode);
    for (const pixel of ['#000000', '#FFFFFF']) {
      const backdrop = composite(c.backdropOverlay, pixel);
      for (const fg of ['text', 'textMuted'] as const) {
        expect(contrast(c[fg], backdrop), `${fg} over ${pixel}`).toBeGreaterThanOrEqual(4.5);
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
