import { CONTRAST_PAIRS, composite, contrast, themes, type Mode, type ThemeName } from './themes';
import { resolvedColors } from './tokens';

export interface ContrastRow {
  use: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

/**
 * Every text/background pair the components use, for one theme and mode, plus text on glass
 * (normal and dense) laid over the darkest and lightest colours of the theme's artwork.
 * Used by the design-system page and enforced by themes.test.ts.
 */
export function contrastReport(theme: ThemeName, mode: Mode): ContrastRow[] {
  const c = resolvedColors(theme, mode);
  const t = themes[theme][mode];
  const rows: ContrastRow[] = CONTRAST_PAIRS.map(({ fg, bg, min, use }) => {
    const ratio = contrast(c[fg], c[bg]);
    return { use, fg, bg, ratio, min, pass: ratio >= min };
  });
  rows.push({
    use: 'Danger button',
    fg: 'onPrimary',
    bg: 'dangerStrong',
    min: 4.5,
    ratio: contrast(c.onPrimary, c.dangerStrong),
    pass: contrast(c.onPrimary, c.dangerStrong) >= 4.5,
  });
  for (const [label, fill] of [
    ['glass', t.glass.fill],
    ['dense glass', t.glass.fillDense],
  ] as const) {
    for (const [where, art] of [
      ['darkest', t.artRange[0]],
      ['lightest', t.artRange[1]],
    ] as const) {
      const backdrop = composite(fill, art);
      for (const fg of ['text', 'textMuted'] as const) {
        const ratio = contrast(c[fg], backdrop);
        rows.push({
          use: `${fg === 'text' ? 'Text' : 'Secondary text'} on ${label} over the ${where} artwork`,
          fg,
          bg: `${label} over ${art}`,
          ratio,
          min: 4.5,
          pass: ratio >= 4.5,
        });
      }
    }
  }
  return rows;
}
