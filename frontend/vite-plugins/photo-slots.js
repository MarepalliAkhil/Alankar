// The photo slots, shared by the app (src/design/art.ts), the photo manifest plugin and the
// `npm run photos:*` scripts. Plain JavaScript so Node can run it without a build step.
//
// Amendment 2: the owner's real photos only. Four pictures carry the whole site (Alankar
// reception = `shop-background`, `salon-background`, `spa-background`, `parlor-background`); the
// three `*-hero` photos frame the booking and division pages. Nothing is drawn or generated: a
// slot with no photo shows a plain themed gradient. See docs/IMAGE_SLOTS.md.

/** Accepted photo formats, in order of preference (the first one found wins). */
export const PHOTO_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png'];

/** Every photo slot: the base file name in public/photos and the size it is shown at. */
export const PHOTO_SLOTS = {
  'shop-background': { width: 1920, height: 1080 },
  'salon-background': { width: 1600, height: 1000 },
  'spa-background': { width: 1600, height: 1000 },
  'parlor-background': { width: 1600, height: 1000 },
  'salon-hero': { width: 1920, height: 1080 },
  'spa-hero': { width: 1920, height: 1080 },
  'parlor-hero': { width: 1920, height: 1080 },
};

/** The four pictures of the home page, in the order of its four sections. */
export const HOME_PHOTOS = [
  'shop-background',
  'salon-background',
  'spa-background',
  'parlor-background',
];

// Meera, the tour guide, is a set of pictures the owner supplies (3D-style renders). Put
// `meera-<pose>.png|webp|jpg|jpeg` in public/photos/meera/ (or public/photos/).
export const MEERA_POSES = [
  'wave',
  'point',
  'phone',
  'approve',
  'chat',
  'wallet',
  'stars',
  'shield',
  'celebrate',
  'namaste',
  'scissors',
  'calendar',
  'waiting',
  'sorry',
  'gift',
  'package',
];
/** The folder (inside public/photos) where Meera's pictures live. */
export const MEERA_FOLDER = 'meera';
/** Meera pictures are 4:5 portraits, 1024 px tall (a 512 px tall copy `<slot>-512.webp` is made too). */
export const MEERA_SIZE = { width: 820, height: 1024 };
for (const pose of MEERA_POSES) PHOTO_SLOTS[`meera-${pose}`] = { ...MEERA_SIZE };
/**
 * The default Meera picture (public/photos/meera/meera.png): the tour shows it for every pose
 * that has no `meera-<pose>` file of its own, so adding a pose file later needs no code change.
 */
export const MEERA_DEFAULT = 'meera';
PHOTO_SLOTS[MEERA_DEFAULT] = { ...MEERA_SIZE };
/** Meera's pictures may be cut-outs with transparency: kept as WebP, never flattened to JPG. */
export const isTransparentSlot = (slot) => slot === MEERA_DEFAULT || slot.startsWith('meera-');

/** What each slot should show (docs/IMAGE_SLOTS.md and the design-system page). */
export const SLOT_SHOWS = {
  'shop-background':
    'The Alankar reception and styling floor with the ALANKAR sign (home section 1 and every page that is not a division page).',
  'salon-background':
    'A salon: styling chairs, mirrors, warm light (home section 2, salon pages, booking while Salon is chosen).',
  'spa-background':
    'A spa: stones, a lotus, calm green tones (home section 3, spa pages, booking while Spa is chosen).',
  'parlor-background':
    'A beauty parlor: makeup, petals, soft pink (home section 4, parlor pages, booking while Parlor is chosen).',
  'salon-hero':
    'Salon header picture (division page and booking header), a different view from the background.',
  'spa-hero':
    'Spa header picture (division page and booking header), a different view from the background.',
  'parlor-hero':
    'Parlor header picture (division page and booking header), a different view from the background.',
};
const MEERA_SHOWS = {
  wave: 'Meera, the stylist guide, waving hello (welcome).',
  point: 'Meera pointing to the side at something (pick a service, the menu).',
  phone: 'Meera holding a phone showing a booking (the booking step).',
  approve: 'Meera giving a thumbs-up (the request was approved).',
  chat: 'Meera with a chat bubble or a phone, chatting (Zen Chat).',
  wallet: 'Meera holding a wallet or a gift card (pay and save).',
  stars: 'Meera holding five stars or a rating card (rate your visit).',
  shield: 'Meera with a shield or a padlock (stay safe: trusted devices and privacy).',
  celebrate:
    'Meera celebrating with her arms up and confetti (the finale, the booking-sent moment).',
  namaste: 'Meera with palms together in a namaste (chapter 1, welcome at the salon door).',
  scissors: 'Meera holding scissors and a comb (chapter 2, pick a service).',
  calendar: 'Meera holding a calendar (the My bookings tip).',
  waiting: 'Meera holding an hourglass (chapter 3, waiting for the nod; a pending request).',
  sorry: 'Meera with an apologetic look (a declined request, a changed slot).',
  gift: 'Meera holding a gift box (the gift cards tip).',
  package: 'Meera holding a package box (the packages and memberships tip).',
};
for (const pose of MEERA_POSES) SLOT_SHOWS[`meera-${pose}`] = MEERA_SHOWS[pose];
SLOT_SHOWS[MEERA_DEFAULT] =
  'Meera, the default picture: shown in every tour pose that has no meera-<pose> file yet.';

/** Photos above this size slow the page down; photos:check warns about them. */
export const MAX_PHOTO_BYTES = 200 * 1024;

/**
 * The file to use for a slot from a list of file names: `<base>.webp`, then `.jpg`, `.jpeg`,
 * `.png` (any letter case). Returns null when none exists (a plain themed gradient is shown).
 */
export function pickPhoto(base, files) {
  // A file in a sub-folder ("meera/meera-wave.png") counts under its own name; a file straight in
  // public/photos wins over one in a sub-folder.
  const lower = new Map();
  for (const name of files) {
    const key = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
    if (!lower.has(key) || !name.includes('/')) lower.set(key, name);
  }
  for (const ext of PHOTO_EXTENSIONS) {
    const found = lower.get(`${base}.${ext}`.toLowerCase());
    if (found) return found;
  }
  return null;
}
