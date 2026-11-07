import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(process.cwd(), 'src/pages/zenotians');
const css = readFileSync(join(dir, 'zenotians-type.css'), 'utf8');
const sources = readdirSync(dir)
  .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f))
  .map((f) => ({ f, text: readFileSync(join(dir, f), 'utf8') }));

/** The rules of the stylesheet, without @font-face and @media wrappers flattened away. */
function rules(): { selector: string; body: string }[] {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { selector: string; body: string }[] = [];
  for (const m of flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

describe('For Zenotians typography', () => {
  it('is scoped: every selector starts with .zen-type, so no other page changes', () => {
    const rs = rules().filter((r) => !/^(from|to|\d+%)$/.test(r.selector));
    const offenders = rs
      .flatMap((r) => r.selector.split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('.zen-type'));
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/(^|\n)\s*(html|body|:root)\b/);
  });

  it('reaches the page only through the For Zenotians layout (a lazy route)', () => {
    const layout = sources.find((s) => s.f === 'ZenotiansLayout.tsx')!.text;
    expect(layout).toContain("import './zenotians-type.css'");
    expect(layout).toContain('zen-stage zen-type');
    const others = sources.filter((s) => s.f !== 'ZenotiansLayout.tsx');
    expect(others.filter((s) => s.text.includes('zenotians-type.css'))).toEqual([]);
    const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(main).not.toContain('zenotians-type');
  });

  it('uses the application fonts: no @font-face and no font family of its own', () => {
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/font-family/);
    expect(css).not.toMatch(/Lora|Work Sans|Fraunces|Zen Text|Zen Display/);
    for (const { f, text } of sources) expect(text, f).not.toMatch(/@fontsource|woff/);
    const pkg = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(pkg).not.toContain('@fontsource');
  });

  it('sets the reading size (16 px phone, 17 px larger) and a 1.6 line height', () => {
    expect(css).toMatch(/\.zen-type \{[^}]*font-size: 1rem[^}]*line-height: 1\.6;/);
    expect(css).toMatch(/@media \(min-width: 641px\) \{\s*\.zen-type \{\s*font-size: 1\.0625rem/);
    expect(css).toMatch(/\.zen-type p \{\s*max-width: 68ch/);
  });

  it('sets the heading scale', () => {
    expect(css).toMatch(/\.zen-type h1 \{[^}]*clamp\(2rem, 3\.4vw, 2\.75rem\)/);
    expect(css).toMatch(/\.zen-type h2 \{[^}]*clamp\(1\.6rem, [^)]*, 1\.85rem\)/);
    expect(css).toMatch(/\.zen-type h3:not\(\.text-sm\) \{[^}]*clamp\(1\.2rem, [^)]*, 1\.3rem\)/);
  });

  it('makes card text and links 16 px, and removes wide letter-spacing', () => {
    expect(css).toMatch(/\.zen-type \.text-sm \{\s*font-size: 1rem/);
    expect(css).toMatch(/\.zen-type \*,\s*\.zen-type h1 \{\s*letter-spacing: normal/);
  });

  it('has no text smaller than 14 px in the stylesheet', () => {
    const sizes = Array.from(css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)).map((m) =>
      m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]),
    );
    expect(sizes.length).toBeGreaterThan(8);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    for (const m of css.matchAll(/clamp\(([\d.]+)rem/g))
      expect(Number(m[1]) * 16).toBeGreaterThanOrEqual(14);
  });

  it('has no text smaller than 14 px in the page sources (text-xs, text-[10..13px])', () => {
    const bad: string[] = [];
    for (const { f, text } of sources) {
      for (const m of text.matchAll(
        /text-xs\b|text-\[(\d+(?:\.\d+)?)px\]|fontSize[:=]\s*['"{]?(\d+)/g,
      )) {
        const px = m[1] ?? m[2];
        if (m[0] === 'text-xs' || (px && Number(px) < 14)) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps sentence case without changing any words', () => {
    expect(css).toMatch(/\.zen-type \.uppercase \{\s*text-transform: none/);
  });
});
