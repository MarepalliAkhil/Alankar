import { describe, expect, it } from 'vitest';
import { HOME_PHOTOS, PHOTO_SLOTS } from '../../vite-plugins/photo-slots.js';
import { art, photoFor, resolveSlot, smallerSources } from './art';

const BASE = [
  'salon-hero',
  'spa-hero',
  'parlor-hero',
  'shop-background',
  'salon-background',
  'spa-background',
  'parlor-background',
];
const BASE_ORDER = [
  'shop-background',
  'salon-background',
  'spa-background',
  'parlor-background',
  'salon-hero',
  'spa-hero',
  'parlor-hero',
];
const ALL_BASE_PHOTOS = BASE.flatMap((name) => [`${name}.webp`, `${name}.jpg`]);

describe('image slot registry', () => {
  it.each(Object.entries(art))('%s is described and sized', (_, slot) => {
    expect(slot.description.length).toBeGreaterThan(40);
    expect(slot.width).toBeGreaterThan(0);
    expect(slot.height).toBeGreaterThan(0);
    expect(slot.photo).toMatch(/^[a-z0-9-]+$/);
    if (!slot.decorative) expect(slot.alt.length).toBeGreaterThan(5);
  });

  it('uses a photo with the slot name when the owner adds one, in any allowed format', () => {
    expect(photoFor(art.spaBackground, [])).toBeNull();
    expect(photoFor(art.spaBackground, ['spa-background.webp'])).toBe(
      '/photos/spa-background.webp',
    );
    expect(photoFor(art.spaBackground, ['salon-background.jpg'])).toBeNull();
  });

  it('has no drawn artwork: no slot carries an SVG or illustration', () => {
    for (const slot of Object.values(art)) {
      expect(Object.keys(slot)).not.toContain('art');
      expect(Object.keys(slot)).not.toContain('files');
    }
  });
});

describe('the owner photos', () => {
  it('has the four main pictures (Alankar reception, salon, spa, parlor) and the three heroes', () => {
    expect(Object.keys(PHOTO_SLOTS).filter((k) => !k.startsWith('meera'))).toEqual(BASE_ORDER);
    expect(HOME_PHOTOS).toEqual([
      'shop-background',
      'salon-background',
      'spa-background',
      'parlor-background',
    ]);
  });

  it('a photo resolves to itself, and a PNG original is accepted too', () => {
    const own = resolveSlot(art.shopBackground, ALL_BASE_PHOTOS);
    expect(own?.kind).toBe('own');
    expect(own?.crop).toEqual({ position: '50% 50%', zoom: 1 });
    expect(resolveSlot(art.spaBackground, ['spa-background.png'])?.src).toBe(
      '/photos/spa-background.png',
    );
  });

  it('offers the 960 px copy to small screens when it exists', () => {
    const all = [...ALL_BASE_PHOTOS, 'salon-background-960.webp', 'salon-background-960.jpg'];
    const r = resolveSlot(art.salonBackground, all)!;
    expect(r.webp).toBe('/photos/salon-background.webp');
    expect(smallerSources(r, all)).toEqual({
      src: '/photos/salon-background-960.jpg',
      webp: '/photos/salon-background-960.webp',
    });
    expect(smallerSources(r, ALL_BASE_PHOTOS)).toEqual({ src: null, webp: null });
  });

  it('with none of the photos present nothing resolves (a plain gradient is shown)', () => {
    expect(resolveSlot(art.shopBackground, [])).toBeNull();
    expect(resolveSlot(art.salonHero, [])).toBeNull();
  });
});
