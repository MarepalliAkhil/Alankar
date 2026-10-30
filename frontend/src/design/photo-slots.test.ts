import { describe, expect, it } from 'vitest';
import { PHOTO_SLOTS, pickPhoto } from '../../vite-plugins/photo-slots.js';
import { art, photoSources } from './art';

describe('photo slot resolution', () => {
  it('prefers webp, then jpg, then jpeg, then png', () => {
    const all = ['salon-hero.png', 'salon-hero.jpeg', 'salon-hero.jpg', 'salon-hero.webp'];
    expect(pickPhoto('salon-hero', all)).toBe('salon-hero.webp');
    expect(pickPhoto('salon-hero', all.slice(0, 3))).toBe('salon-hero.jpg');
    expect(pickPhoto('salon-hero', all.slice(0, 2))).toBe('salon-hero.jpeg');
    expect(pickPhoto('salon-hero', all.slice(0, 1))).toBe('salon-hero.png');
  });

  it('ignores letter case and other slots', () => {
    expect(pickPhoto('spa-hero', ['SPA-HERO.PNG'])).toBe('SPA-HERO.PNG');
    expect(pickPhoto('spa-hero', ['Spa-Hero.Jpg', 'spa-hero.png'])).toBe('Spa-Hero.Jpg');
    expect(pickPhoto('spa-hero', ['spa-hero-old.png', 'spa-background.webp'])).toBeNull();
    expect(pickPhoto('spa-hero', ['spa-hero.gif', 'spa-hero.bmp'])).toBeNull();
  });

  it('falls back to the artwork when no photo exists', () => {
    expect(photoSources(art.parlorHero, [])).toBeNull();
    expect(photoSources(art.parlorHero, ['salon-hero.png'])).toBeNull();
  });

  it('serves WebP with the JPG as the fallback for older browsers', () => {
    expect(
      photoSources(art.shopBackground, ['shop-background.webp', 'shop-background.jpg']),
    ).toEqual({ src: '/photos/shop-background.jpg', webp: '/photos/shop-background.webp' });
    expect(photoSources(art.shopBackground, ['shop-background.webp'])).toEqual({
      src: '/photos/shop-background.webp',
      webp: null,
    });
    expect(photoSources(art.shopBackground, ['shop-background.png'])).toEqual({
      src: '/photos/shop-background.png',
      webp: null,
    });
  });

  it('has the slot sizes from the brief', () => {
    for (const slot of ['salon-hero', 'spa-hero', 'parlor-hero', 'shop-background']) {
      expect(PHOTO_SLOTS[slot]).toEqual({ width: 1920, height: 1080 });
    }
    for (const slot of ['salon-background', 'spa-background', 'parlor-background']) {
      expect(PHOTO_SLOTS[slot]).toEqual({ width: 1600, height: 1000 });
    }
    // Every registered image slot has a photo slot with the same size.
    for (const entry of Object.values(art)) {
      expect(PHOTO_SLOTS[entry.photo]).toEqual({ width: entry.width, height: entry.height });
    }
  });
});
