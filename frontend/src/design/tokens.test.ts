import { describe, expect, it } from 'vitest';
import { cssVariables, kebab, tailwindTheme, tokens } from './tokens';

/** Every CSS variable name referenced as var(--name) anywhere inside a theme value. */
function collectVarNames(value: unknown): string[] {
  if (typeof value === 'string') {
    const match = value.match(/^var\((--[a-z0-9-]+)\)$/);
    return match ? [match[1]] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectVarNames(item));
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectVarNames(item));
  }
  return [];
}

describe('design tokens', () => {
  it('uses the agreed initial palette', () => {
    expect(tokens.color.primary).toBe('#7C3AED');
    expect(tokens.color.primaryHover).toBe('#6D28D9');
    expect(tokens.color.primarySoft).toBe('#EDE9FE');
    expect(tokens.color.text).toBe('#1E1B4B');
  });

  it('turns camelCase keys into kebab-case CSS variable names', () => {
    expect(kebab('primaryHover')).toBe('primary-hover');
    const vars = cssVariables();
    expect(vars['--color-primary']).toBe('#7C3AED');
    expect(vars['--color-primary-hover']).toBe('#6D28D9');
    expect(vars['--status-checked-in-bg']).toBe(tokens.status.checkedIn.bg);
    expect(vars['--radius-card']).toBe(tokens.radius.card);
  });

  it('only points Tailwind at CSS variables that exist', () => {
    const defined = new Set(Object.keys(cssVariables()));
    const referenced = collectVarNames(tailwindTheme);
    expect(referenced.length).toBeGreaterThan(20);
    for (const name of referenced) {
      expect(defined.has(name), `missing CSS variable ${name}`).toBe(true);
    }
  });
});
