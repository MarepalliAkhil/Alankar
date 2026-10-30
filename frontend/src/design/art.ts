/**
 * Task 11: every image slot in the app, in one place.
 *
 * Each slot has generated, original artwork (SVG, drawn by scripts/generate_art.py from simple
 * shapes: no people, faces, logos, brand names or copied artwork) in a light and a dark version,
 * and a photo slot. If the owner puts a photo with the slot's name in frontend/public/photos/
 * (.webp, .jpg, .jpeg or .png -- picked in that order), that photo is used instead, and the
 * artwork stays as the fallback. Slot sizes live in vite-plugins/photo-slots.js (shared with the
 * photos:check and photos:optimize scripts). See docs/IMAGE_SLOTS.md.
 */
import parlorDark from '../assets/art/parlor-glow-dark.svg';
import parlorLight from '../assets/art/parlor-glow-light.svg';
import salonDark from '../assets/art/salon-studio-dark.svg';
import salonLight from '../assets/art/salon-studio-light.svg';
import spaDark from '../assets/art/spa-calm-dark.svg';
import spaLight from '../assets/art/spa-calm-light.svg';
import shopDark from '../assets/art/shop-arches-dark.svg';
import shopLight from '../assets/art/shop-arches-light.svg';
import { PHOTO_SLOTS, pickPhoto } from '../../vite-plugins/photo-slots.js';
import type { Mode } from './themes';

export interface ArtSlot {
  /** What the picture shows (for the README and the design-system page). */
  description: string;
  /** Decorative pictures are hidden from screen readers; meaningful ones have `alt`. */
  decorative: boolean;
  alt: string;
  /** The photo that replaces the artwork when present: public/photos/<photo>.(jpg|webp|png). */
  photo: string;
  /** Recommended photo size in pixels (the artwork is drawn at the same ratio). */
  width: number;
  height: number;
  art: Record<Mode, string>;
  /** Source files, relative to frontend/src (for the size check in art.test.ts). */
  files: Record<Mode, string>;
}

export const art = {
  salonBackground: {
    description:
      'Salon background: an empty styling studio at night with arched mirrors, pendant lamps, light beams and an art-deco fan, in navy with gold and copper.',
    decorative: true,
    alt: '',
    photo: 'salon-background',
    ...PHOTO_SLOTS['salon-background'],
    art: { light: salonLight, dark: salonDark },
    files: {
      light: 'assets/art/salon-studio-light.svg',
      dark: 'assets/art/salon-studio-dark.svg',
    },
  },
  spaBackground: {
    description:
      'Spa background: still water with ripples, a lotus outline, stacked stones, drifting leaves and soft waves, in sage and sand.',
    decorative: true,
    alt: '',
    photo: 'spa-background',
    ...PHOTO_SLOTS['spa-background'],
    art: { light: spaLight, dark: spaDark },
    files: { light: 'assets/art/spa-calm-light.svg', dark: 'assets/art/spa-calm-dark.svg' },
  },
  parlorBackground: {
    description:
      'Beauty Parlor background: soft drifting petals, a five-petal flower, champagne bokeh, sparkles and a sweeping brush stroke, in blush, rose and champagne gold.',
    decorative: true,
    alt: '',
    photo: 'parlor-background',
    ...PHOTO_SLOTS['parlor-background'],
    art: { light: parlorLight, dark: parlorDark },
    files: {
      light: 'assets/art/parlor-glow-light.svg',
      dark: 'assets/art/parlor-glow-dark.svg',
    },
  },
  salonHero: {
    description:
      'Home hero, Salon stage: the night styling studio (same artwork as the Salon background until a photo is added).',
    decorative: true,
    alt: '',
    photo: 'salon-hero',
    ...PHOTO_SLOTS['salon-hero'],
    art: { light: salonLight, dark: salonDark },
    files: {
      light: 'assets/art/salon-studio-light.svg',
      dark: 'assets/art/salon-studio-dark.svg',
    },
  },
  spaHero: {
    description:
      'Home hero, Spa stage: still water, lotus and stones (same artwork as the Spa background until a photo is added).',
    decorative: true,
    alt: '',
    photo: 'spa-hero',
    ...PHOTO_SLOTS['spa-hero'],
    art: { light: spaLight, dark: spaDark },
    files: { light: 'assets/art/spa-calm-light.svg', dark: 'assets/art/spa-calm-dark.svg' },
  },
  parlorHero: {
    description:
      'Home hero, Beauty Parlor stage: petals, bokeh and a brush stroke (same artwork as the Beauty Parlor background until a photo is added).',
    decorative: true,
    alt: '',
    photo: 'parlor-hero',
    ...PHOTO_SLOTS['parlor-hero'],
    art: { light: parlorLight, dark: parlorDark },
    files: {
      light: 'assets/art/parlor-glow-light.svg',
      dark: 'assets/art/parlor-glow-dark.svg',
    },
  },
  shopBackground: {
    description:
      'Shop background (staff portals and brand pages): three softly lit arches in gold, sage and rose in a violet room.',
    decorative: true,
    alt: '',
    photo: 'shop-background',
    ...PHOTO_SLOTS['shop-background'],
    art: { light: shopLight, dark: shopDark },
    files: { light: 'assets/art/shop-arches-light.svg', dark: 'assets/art/shop-arches-dark.svg' },
  },
} satisfies Record<string, ArtSlot>;

export type ArtId = keyof typeof art;

/**
 * The owner's photo for a slot, if one is in public/photos: `<photo>.webp`, then `.jpg`, `.jpeg`,
 * `.png` (any letter case). Null means the generated artwork is used.
 */
export function photoFor(slot: ArtSlot, available: readonly string[]): string | null {
  const match = pickPhoto(slot.photo, available);
  return match ? `/photos/${match}` : null;
}

/**
 * What the browser gets for a slot's photo: the chosen file, and when that is a WebP with a JPG
 * (or JPEG/PNG) next to it, the WebP as the preferred source and the other as the fallback
 * <img> for browsers without WebP. Null means the artwork is used.
 */
export function photoSources(
  slot: ArtSlot,
  available: readonly string[],
): { src: string; webp: string | null } | null {
  const chosen = pickPhoto(slot.photo, available);
  if (!chosen) return null;
  if (!/\.webp$/i.test(chosen)) return { src: `/photos/${chosen}`, webp: null };
  const fallback = pickPhoto(
    slot.photo,
    available.filter((name) => !/\.webp$/i.test(name)),
  );
  return fallback
    ? { src: `/photos/${fallback}`, webp: `/photos/${chosen}` }
    : { src: `/photos/${chosen}`, webp: null };
}
