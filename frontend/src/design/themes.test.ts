import { describe, expect, it } from 'vitest';
import { contrastReport } from './contrast';
import { MODES, THEMES, contrast, mixHex, themes } from './themes';
import { resolvedColors, themeStylesheet, themeVariables, tokens } from './tokens';

describe('themes', () => {
  it('has the five themes in light and dark', () => {
    expect(THEMES).toEqual(['brand', 'salon', 'spa', 'parlor', 'staff']);
    for (const theme of THEMES) {
      for (const mode of MODES) expect(themes[theme][mode].color.background).toMatch(/^#/);
    }
  });

  it.each(THEMES.flatMap((t) => MODES.map((m) => [t, m] as const)))(
    '%s / %s meets WCAG AA for every pair the components use, glass included',
    (theme, mode) => {
      const failures = contrastReport(theme, mode).filter((row) => !row.pass);
      expect(failures.map((f) => `${f.use}: ${f.ratio.toFixed(2)}`)).toEqual([]);
    },
  );

  it('overrides only token names that exist in the base', () => {
    for (const theme of THEMES) {
      for (const mode of MODES) {
        for (const key of Object.keys(themes[theme][mode].color)) {
          expect(Object.keys(tokens.color), `${theme}/${mode}: ${key}`).toContain(key);
        }
        for (const key of Object.keys(themes[theme][mode].glass)) {
          expect(Object.keys(tokens.glass), `${theme}/${mode}: glass ${key}`).toContain(key);
        }
      }
    }
  });

  it('writes one stylesheet with a rule per theme and mode', () => {
    const css = themeStylesheet();
    expect(css).toContain(':root{');
    expect(css).toContain('[data-theme="spa"][data-mode="dark"]{');
    expect(css).toContain('color-scheme:dark;');
    expect(themeVariables('salon', 'dark')['--color-primary']).toBe('#D4A853');
    expect(resolvedColors('salon', 'light').success).toBe(tokens.color.success);
  });

  it('applies the stylesheet so a theme attribute changes the variables', () => {
    const tag = document.getElementById('design-tokens');
    expect(tag?.textContent).toContain('[data-theme="parlor"][data-mode="light"]');
    expect(document.documentElement.dataset.theme).toBeTruthy();
  });

  it('mixes colours for the scroll-driven hero', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 1)', 0.5)).toBe(
      'rgba(128, 128, 128, 0.5)',
    );
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});
