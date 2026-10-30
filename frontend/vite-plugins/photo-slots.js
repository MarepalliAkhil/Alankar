// Task 11: the photo slots, shared by the app (src/design/art.ts), the photo manifest plugin and
// the `npm run photos:check` / `npm run photos:optimize` scripts. Plain JavaScript so Node can
// run it without a build step.

/** Accepted photo formats, in order of preference (the first one found wins). */
export const PHOTO_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png'];

/** Every photo slot: the base file name in public/photos and the size it is shown at. */
export const PHOTO_SLOTS = {
  'salon-hero': { width: 1920, height: 1080 },
  'spa-hero': { width: 1920, height: 1080 },
  'parlor-hero': { width: 1920, height: 1080 },
  'shop-background': { width: 1920, height: 1080 },
  'salon-background': { width: 1600, height: 1000 },
  'spa-background': { width: 1600, height: 1000 },
  'parlor-background': { width: 1600, height: 1000 },
};

/** Photos above this size slow the page down; photos:check warns about them. */
export const MAX_PHOTO_BYTES = 200 * 1024;

/**
 * The file to use for a slot from a list of file names: `<base>.webp`, then `.jpg`, `.jpeg`,
 * `.png` (any letter case). Returns null when none exists, so the artwork is used.
 */
export function pickPhoto(base, files) {
  const lower = new Map(files.map((name) => [name.toLowerCase(), name]));
  for (const ext of PHOTO_EXTENSIONS) {
    const found = lower.get(`${base}.${ext}`.toLowerCase());
    if (found) return found;
  }
  return null;
}
