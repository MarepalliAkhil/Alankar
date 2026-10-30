/**
 * Task 11: every image slot in the app, in one place.
 *
 * Each slot has generated, original artwork (SVG, drawn by scripts/generate_art.py from simple
 * shapes: no people, faces, logos, brand names or copied artwork) in a light and a dark version,
 * and a photo slot. If the owner puts a photo with the slot's name in frontend/public/photos/
 * (.jpg, .jpeg, .webp or .png), that photo is used instead, and the artwork stays as the fallback.
 * Every file must stay under 200 KB.
 */
import parlorDark from '../assets/art/parlor-glow-dark.svg';
import parlorLight from '../assets/art/parlor-glow-light.svg';
import salonDark from '../assets/art/salon-studio-dark.svg';
import salonLight from '../assets/art/salon-studio-light.svg';
import spaDark from '../assets/art/spa-calm-dark.svg';
import spaLight from '../assets/art/spa-calm-light.svg';
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
    width: 1600,
    height: 1000,
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
    width: 1600,
    height: 1000,
    art: { light: spaLight, dark: spaDark },
    files: { light: 'assets/art/spa-calm-light.svg', dark: 'assets/art/spa-calm-dark.svg' },
  },
  parlorBackground: {
    description:
      'Beauty Parlor background: soft drifting petals, a five-petal flower, champagne bokeh, sparkles and a sweeping brush stroke, in blush, rose and champagne gold.',
    decorative: true,
    alt: '',
    photo: 'parlor-background',
    width: 1600,
    height: 1000,
    art: { light: parlorLight, dark: parlorDark },
    files: {
      light: 'assets/art/parlor-glow-light.svg',
      dark: 'assets/art/parlor-glow-dark.svg',
    },
  },
} satisfies Record<string, ArtSlot>;

export type ArtId = keyof typeof art;

/** The owner's photo for a slot, if one is in public/photos (any allowed extension). */
export function photoFor(slot: ArtSlot, available: readonly string[]): string | null {
  const match = available.find((name) => name.replace(/\.[^.]+$/, '') === slot.photo);
  return match ? `/photos/${match}` : null;
}
