# Image slots and photos

Every large picture on the site (the home hero, the division pages, the staff portals) is an
**image slot**. Each slot has original generated artwork as a fallback, and can show your own
photo instead.

## Which picture a slot shows

For every slot, in this order:

1. **An image set by the admin in the content editor** (Settings → Website content → Home hero
   "Image URL"). Today only the home hero has this field; it replaces the Salon stage picture.
2. **A photo file in `frontend/public/photos/`** named after the slot. Accepted formats, in order
   of preference: **`.webp`, `.jpg`, `.jpeg`, `.png`** (upper or lower case). If several exist,
   the first in that order is used. When a `.webp` has a `.jpg` (or `.jpeg`/`.png`) next to it, the
   browser gets the WebP and the JPG is the fallback for browsers without WebP.
3. **The generated artwork** (`frontend/src/assets/art/`, light and dark versions).

## The slots

| Slot (file name)    | Size shown  | Where                                                         |
| ------------------- | ----------- | ------------------------------------------------------------- |
| `salon-hero`        | 1920 x 1080 | Home hero, Salon stage                                        |
| `spa-hero`          | 1920 x 1080 | Home hero, Spa stage                                          |
| `parlor-hero`       | 1920 x 1080 | Home hero, Beauty Parlor stage                                |
| `shop-background`   | 1920 x 1080 | Behind the staff portals (receptionist, stylist, admin)       |
| `salon-background`  | 1600 x 1000 | Behind the Salon page, and its card on the home page          |
| `spa-background`    | 1600 x 1000 | Behind the Spa page, and its card on the home page            |
| `parlor-background` | 1600 x 1000 | Behind the Beauty Parlor page, and its card on the home page  |

The sizes live in one place, `frontend/vite-plugins/photo-slots.js`, shared by the app and the
two scripts below. Pictures are always cropped to fill their frame from the centre (cover fit), so
keep the important part of a photo near the middle.

## Adding photos (Windows, cmd.exe, from the `frontend` folder)

```
copy C:\path\to\my-salon.png public\photos\salon-hero.png
npm install
npm run photos:optimize
npm run photos:check
```

- **`npm run photos:optimize`** moves each original into `frontend/photos-originals/` (not
  committed: it is in `.gitignore`), resizes it to its slot size with a centre crop, and writes
  `<slot>.webp` and `<slot>.jpg` into `public/photos/`, each under 200 KB. It also writes
  `public/photos/placeholders.json`: a tiny blurred preview per photo, shown while the full photo
  loads. Run it again whenever you add or replace a photo; it always works from the original.
  It uses `sharp`, a development-only package (`npm install` adds it); nothing is added to what
  the browser downloads.
- **`npm run photos:check`** lists each slot with the file it uses, its size in pixels and its
  weight, and warns when a photo is over 200 KB, smaller than the recommended size, or a
  different shape.
- Plain PNG/JPG files work without optimising, but large ones make the site slow to load.

## How it works (and why there are no 404 errors)

Vite cannot import files from `public/` in JavaScript, and asking the browser for a photo that
may not exist would log a 404 for every empty slot. Instead a small Vite plugin
(`frontend/vite-plugins/photo-manifest.js`) reads the list of files in `public/photos/` when the
site is built, and while `npm run dev` runs. The app picks each slot's file from that list with
one shared helper (`pickPhoto` in `vite-plugins/photo-slots.js`, used through
`photoSources` in `src/design/art.ts` and the `ArtImage` component), so it only ever requests
photos that exist.

- **`npm run dev`**: adding, replacing or removing a photo reloads the page by itself. If it does
  not (some Windows folders do not report changes), stop and restart `npm run dev`.
- **`npm run build`**: the list is read at build time, so rebuild after changing photos.

## Readability

Text never sits on a photo without a veil in the theme's background colour:

- Home hero: a medium veil (`photoOverlay`) and all text on dense glass cards.
- Division pages and staff portals: a strong veil (`backdropOverlay`, 88%).

`src/design/photo-contrast.test.ts` checks every theme in light and dark against the worst
possible photo pixels (pure black and pure white): body and secondary text stay at WCAG AA
(4.5:1) or better. Screenshots with the owner's photos are in `docs/ui-screenshots/photo-*.png`.
