import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_MOBILE_QUERY } from '../../vite-plugins/photo-slots.js';

const css = readFileSync(join(process.cwd(), 'src/design/index.css'), 'utf8');

describe('pictures stay sharp (static CSS checks)', () => {
  it('has no permanent blur on page backgrounds or heroes', () => {
    // The only blur filters left on pictures: the tiny preview while loading (removed once the
    // photo has loaded) and the light 4 px blur on data-heavy staff screens.
    const filters = Array.from(css.matchAll(/([^{}]+)\{[^{}]*(?<![-\w])filter:\s*blur\(([\d.]+)px\)/g)).map(
      (m) => ({ selector: m[1]!.trim(), px: Number(m[2]) }),
    );
    const onPictures = filters.filter((f) =>
      /art-|page-backdrop|home-|division-hero|zen-photo/.test(f.selector),
    );
    for (const f of onPictures) {
      const placeholder = /::before/.test(f.selector) && !/data-blur/.test(f.selector);
      const staff = /data-blur='strong'/.test(f.selector);
      expect(placeholder || staff, `unexpected blur on ${f.selector}`).toBe(true);
      if (staff) expect(f.px).toBeLessThanOrEqual(4);
    }
    expect(css).not.toMatch(/\.page-backdrop \.art-photo,[^{]*\{[^}]*blur\(10px\)/);
  });

  it('removes the loading preview once the sharp photo has loaded', () => {
    expect(css).toMatch(/\.art-frame\[data-loaded='true'\]::before\s*\{\s*display:\s*none/);
  });

  it('keeps the home zoom at 6% at most, after load, off on phones and with reduced motion', () => {
    const keyframes = css.match(/@keyframes home-zoom \{[\s\S]*?\n\}/)![0];
    const scales = Array.from(keyframes.matchAll(/scale\(([\d.]+)\)/g)).map((m) => Number(m[1]));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.06);
    expect(css).toMatch(
      /\.home-layer\.is-current:has\(\.art-frame\[data-loaded='true'\]\) \.home-zoom \{\s*animation: home-zoom/,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\) \{\s*\.home-layer\.is-current:has\([^)]*\)[^{]*\{\s*animation: none/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.home-layer\.is-current:has\([^)]*\)[^{]*\{\s*animation: none/,
    );
  });

  it('shows the landscape photo in a short band on portrait phones, with the same query as the app', () => {
    expect(css).toContain(`@media ${PORTRAIT_MOBILE_QUERY} {`);
    expect(css).toMatch(/\.art-frame\[data-band='true'\] \{[^}]*height:\s*40dvh/);
  });
});
