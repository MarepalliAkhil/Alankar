import { describe, expect, it } from 'vitest';
import { activeStage, heroVariables, stagePosition, stageWeights } from './hero';
import { CONTRAST_PAIRS, MODES, composite, contrast, themes } from './themes';
import { kebab, themeVariables } from './tokens';

const v = (vars: Record<string, string>, name: string) => vars[`--color-${kebab(name)}`];

describe('scroll-driven hero', () => {
  it('rests on each stage and blends only in a short window', () => {
    expect(stagePosition(0)).toBe(0);
    expect(stagePosition(0.1)).toBe(0);
    expect(stagePosition(0.5)).toBe(1);
    expect(stagePosition(0.6)).toBe(1);
    expect(stagePosition(1)).toBe(2);
    expect(stagePosition(0.25)).toBeCloseTo(0.5, 5);
    // monotonic
    let last = -1;
    for (let p = 0; p <= 1; p += 0.01) {
      const pos = stagePosition(p);
      expect(pos).toBeGreaterThanOrEqual(last);
      last = pos;
    }
  });

  it('weights the backgrounds so they always add up to 1', () => {
    for (let pos = 0; pos <= 2; pos += 0.05) {
      const sum = stageWeights(pos).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
    expect(stageWeights(1)).toEqual([0, 1, 0]);
    expect(activeStage(1.4)).toBe(1);
    expect(activeStage(1.6)).toBe(2);
  });

  it.each(MODES)('uses the exact division theme at each stage (%s)', (mode) => {
    expect(heroVariables(0, mode)['--color-primary']).toBe(
      themeVariables('salon', mode)['--color-primary'],
    );
    expect(heroVariables(1, mode)['--color-primary']).toBe(
      themeVariables('spa', mode)['--color-primary'],
    );
    expect(heroVariables(2, mode)['--color-primary']).toBe(
      themeVariables('parlor', mode)['--color-primary'],
    );
  });

  it.each(MODES)('keeps body text readable all the way through the blend (%s)', (mode) => {
    const failures: string[] = [];
    for (let pos = 0; pos <= 2.0001; pos += 0.02) {
      const vars = heroVariables(pos, mode);
      // Text on cards, page and buttons: AA (4.5) at every step of the blend.
      for (const { fg, bg } of CONTRAST_PAIRS.filter((p) =>
        ['text', 'textMuted', 'onPrimary'].includes(p.fg),
      )) {
        const ratio = contrast(v(vars, fg), v(vars, bg));
        if (ratio < 4.5) failures.push(`${pos.toFixed(2)} ${fg}/${bg} ${ratio.toFixed(2)}`);
      }
      // Text on the hero's dense glass card, over the darkest and lightest artwork of both
      // neighbouring themes.
      const from = Math.min(Math.floor(pos), 1);
      for (const theme of [
        ['salon', 'spa', 'parlor'][from],
        ['salon', 'spa', 'parlor'][from + 1],
      ]) {
        for (const art of themes[theme as 'salon'][mode].artRange) {
          const backdrop = composite(vars['--glass-fill-dense'], art);
          for (const fg of ['text', 'textMuted']) {
            const ratio = contrast(v(vars, fg), backdrop);
            if (ratio < 4.5) failures.push(`${pos.toFixed(2)} ${fg} on glass ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
