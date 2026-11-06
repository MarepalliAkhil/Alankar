/**
 * Every picture slot in the app, in one place: the owner's real photos only.
 *
 * Seven photos exist: the Alankar reception (shop-background), salon-, spa- and parlor-background,
 * and the three heroes. A photo with the slot's name in frontend/public/photos/ is used as is
 * (a 960 px copy `<name>-960.webp` is offered to small screens); an image the admin sets in the
 * content editor wins over it. A slot with no photo shows a plain themed gradient: there is no
 * drawn artwork anywhere. See docs/IMAGE_SLOTS.md.
 */
import { PHOTO_SLOTS, pickPhoto } from '../../vite-plugins/photo-slots.js';

/** The four pictures of the home page, in the order of its four sections. */
export type HomeChapter = 1 | 2 | 3 | 4;
export const HOME_CHAPTERS: readonly HomeChapter[] = [1, 2, 3, 4];

export interface ArtSlot {
  /** What the picture shows (for the docs and the design-system page). */
  description: string;
  /** Decorative pictures are hidden from screen readers; meaningful ones have `alt`. */
  decorative: boolean;
  alt: string;
  /** The slot's own photo: public/photos/<photo>.(webp|jpg|jpeg|png). */
  photo: string;
  /** Recommended photo size in pixels. */
  width: number;
  height: number;
}

const base = (photo: string, description: string): ArtSlot => ({
  description,
  decorative: true,
  alt: '',
  photo,
  ...PHOTO_SLOTS[photo],
});

const baseSlots = {
  salonBackground: base(
    'salon-background',
    'Salon background: a night styling studio with a gold-lit round mirror, a leather barber chair and a dark navy wall.',
  ),
  spaBackground: base(
    'spa-background',
    'Spa background: stacked stones and a lotus on a grey dish, olive-green wall, soft light.',
  ),
  parlorBackground: base(
    'parlor-background',
    'Beauty Parlor background: rose petals, blush powder and a makeup brush on pink marble.',
  ),
  salonHero: base(
    'salon-hero',
    'Home hero, Salon stage: a barber studio with two chairs and tall gold-lit arched mirrors.',
  ),
  spaHero: base(
    'spa-hero',
    'Home hero, Spa stage: a massage bed with towels, candles and stones in a sage-green room.',
  ),
  parlorHero: base(
    'parlor-hero',
    'Home hero, Beauty Parlor stage: a blush-pink vanity with a round bulb-lit mirror and flowers.',
  ),
  shopBackground: base(
    'shop-background',
    'Shop background (staff portals and brand pages): the Alankar reception and styling floor with the shop sign, bright and airy.',
  ),
};

export const art = baseSlots;
export type ArtId = keyof typeof art;

export interface Crop {
  /** CSS object-position, e.g. "70% 40%". */
  position: string;
  /** 1 = the whole photo; larger = a closer crop. */
  zoom: number;
}
export interface Sources {
  src: string;
  webp: string | null;
}
export interface Resolved extends Sources {
  kind: 'own';
  /** The photo slot whose file is used. */
  from: string;
  crop: Crop;
}

const CENTRE: Crop = { position: '50% 50%', zoom: 1 };

/**
 * The owner's photo for a slot, if one is in public/photos: `<photo>.webp`, then `.jpg`, `.jpeg`,
 * `.png` (any letter case). Null means the slot has no photo of its own.
 */
export function photoFor(slot: ArtSlot, available: readonly string[]): string | null {
  const match = pickPhoto(slot.photo, available);
  return match ? `/photos/${match}` : null;
}

/**
 * What the browser gets for a photo name: the chosen file, and when that is a WebP with a JPG
 * (or JPEG/PNG) next to it, the WebP as the preferred source and the other as the fallback <img>
 * for browsers without WebP. Null when there is no such photo.
 */
export function photoSources(
  slot: Pick<ArtSlot, 'photo'>,
  available: readonly string[],
): Sources | null {
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

/**
 * The about-960 px wide copies of a resolved photo (`<photo>-960.webp` / `.jpg`), written by
 * `npm run photos:optimize`, for phones and small windows. Null parts mean there is no copy.
 */
export function smallerSources(
  resolved: Pick<Resolved, 'from' | 'src' | 'webp'>,
  available: readonly string[],
): { src: string | null; webp: string | null } {
  const base = `${resolved.from}-960`;
  const want = (ext: RegExp) => {
    const name = available.find(
      (file) => file.toLowerCase().startsWith(`${base}.`) && ext.test(file),
    );
    return name ? `/photos/${name}` : null;
  };
  const webp = resolved.webp || /\.webp$/i.test(resolved.src) ? want(/\.webp$/i) : null;
  const src = /\.webp$/i.test(resolved.src) ? webp : want(/\.(jpe?g|png)$/i);
  return { src, webp: resolved.webp ? webp : null };
}

/** The picture for a slot: its own photo, or null (a plain themed gradient is shown). */
export function resolveSlot(slot: ArtSlot, available: readonly string[]): Resolved | null {
  const own = photoSources(slot, available);
  return own ? { ...own, kind: 'own', from: slot.photo, crop: CENTRE } : null;
}
