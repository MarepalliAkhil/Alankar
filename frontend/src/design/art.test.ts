import { describe, expect, it } from 'vitest';
import { art, photoFor } from './art';

// Every artwork file's text, read at build time (no Node APIs needed).
const sources = import.meta.glob('../assets/art/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('artwork registry', () => {
  it.each(Object.entries(art))('%s is described, sized and under 200 KB', (_, slot) => {
    expect(slot.description.length).toBeGreaterThan(40);
    expect(slot.width).toBeGreaterThan(0);
    expect(slot.height).toBeGreaterThan(0);
    expect(slot.photo).toMatch(/^[a-z-]+$/);
    if (!slot.decorative) expect(slot.alt.length).toBeGreaterThan(5);
    for (const file of Object.values(slot.files)) {
      const text = sources[`../${file}`];
      expect(text, file).toBeTruthy();
      expect(new TextEncoder().encode(text).length, file).toBeLessThan(200 * 1024);
      // Original, self-contained artwork: no embedded or linked raster images, no text.
      expect(text).not.toMatch(/<image|<text|href="http/);
    }
  });

  it('uses a photo with the slot name when the owner adds one, in any allowed format', () => {
    expect(photoFor(art.spaBackground, [])).toBeNull();
    expect(photoFor(art.spaBackground, ['spa-background.webp'])).toBe(
      '/photos/spa-background.webp',
    );
    expect(photoFor(art.spaBackground, ['salon-background.jpg'])).toBeNull();
  });
});

it('every artwork file is registered in art.ts', () => {
  const registered = Object.values(art).flatMap((slot) => Object.values(slot.files));
  for (const file of Object.keys(sources)) expect(registered).toContain(file.replace('../', ''));
});
