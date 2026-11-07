# Image quality

Why the photos looked soft or blurry, what was changed, and what only you can still fix (better source photos). Numbers come from `npm run images:budget` (run in `frontend/`) and from the contrast test `src/design/hero-contrast.test.ts`. Nothing here was measured in a browser: see "Not run" at the end.

## Real causes of the blur (before this work)

| #   | Cause                                                                                                      | Number                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | A permanent CSS blur on every page background                                                              | 10 px on customer pages, 14 px on staff pages, plus a 1.06 scale                 |
| 2   | A tiny placeholder layer was never removed after the real photo loaded, so the soft layer stayed on top    | placeholder about 18 px wide stretched to the window                             |
| 3   | The home background zoomed in while scrolling                                                              | up to 1.10                                                                       |
| 4   | The booking header zoomed its photo                                                                        | 1.5                                                                              |
| 5   | Landscape-only files (960 and 1920/1600 px wide) were stretched over tall phone windows                    | a 390x844 phone at 3x needs 1170x2532; the covers were scaled about 1.3x or more |
| 6   | The optimizer capped each file at 200 KB, which forced quality to about 40                                 | visible blocks and smearing                                                      |
| 7   | No original photos are kept, so the files are already compressed sources (largest 1920x1080 and 1600x1000) | nothing larger to build sharper variants from                                    |

## What changed

- The optimizer now makes 640, 1080, 1600 and 2400 px wide WebP files (never larger than the original), quality 78, with a tiny placeholder. `srcset` and `sizes` are written inside each `<source>`.
- The sharp picture replaces the placeholder as soon as it loads. No page background has a blur filter. Staff data-heavy screens may use at most 4 px.
- Zoom and parallax are at most 1.06, start only after the picture has loaded, and are off on phones and with reduced motion. The home zoom and booking header zoom were lowered (the booking header is now 1).
- Portrait or landscape is chosen by screen shape (`(orientation: portrait) and (max-width: 900px)`), never by device name. One shared hook (`viewport-image.ts`) follows rotation live and only one of the two pictures is downloaded.
- Optional portrait slots: `shop-background-mobile`, `salon-background-mobile`, `spa-background-mobile`, `parlor-background-mobile`. Without one, the landscape picture is shown in a short band (40% of the window height), so the scale stays at or below 1.25.
- Salon, Spa and Parlor division pages use ONE shared hero component (`DivisionHero`): one picture, glass card on the left, per-division focus points in `photo-focus.json`, real category chips from the service data.

## Image budget (output of `npm run images:budget`)

Rule: cover scale (how much a picture is enlarged to fill its box, in device pixels) must be at most 1.25. The command exits with 1 if anything is over.

### Slots and variants

| Slot              | Source (original)                                  | Variants (width x height, size, bits per pixel) | Portrait photo                           |
| ----------------- | -------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| shop-background   | no original kept; largest file below is the source | 960x540 34 KB 0.54bpp; 1920x1080 133 KB 0.53bpp | none (landscape photo in the short band) |
| salon-background  | no original kept; largest file below is the source | 960x600 25 KB 0.36bpp; 1600x1000 71 KB 0.37bpp  | none (landscape photo in the short band) |
| spa-background    | no original kept; largest file below is the source | 960x600 13 KB 0.19bpp; 1600x1000 35 KB 0.18bpp  | none (landscape photo in the short band) |
| parlor-background | no original kept; largest file below is the source | 960x600 19 KB 0.26bpp; 1600x1000 53 KB 0.27bpp  | none (landscape photo in the short band) |
| salon-hero        | no original kept; largest file below is the source | 960x540 25 KB 0.39bpp; 1920x1080 80 KB 0.32bpp  | none (landscape photo in the short band) |
| spa-hero          | no original kept; largest file below is the source | 960x540 28 KB 0.45bpp; 1920x1080 99 KB 0.39bpp  | none (landscape photo in the short band) |
| parlor-hero       | no original kept; largest file below is the source | 960x540 19 KB 0.31bpp; 1920x1080 67 KB 0.27bpp  | none (landscape photo in the short band) |

### Cover scale per device (1.00 = sharp, limit 1.25)

| Slot                     | iphone-portrait | iphone-landscape | pixel-portrait | pixel-landscape | ipad-portrait | laptop-1x | laptop-2x | desktop-1x |
| ------------------------ | --------------- | ---------------- | -------------- | --------------- | ------------- | --------- | --------- | ---------- |
| shop-background (page)   | 0.94            | 1.32 !           | 0.88           | 1.24            | 0.87          | 0.83      | 1.67 !    | 1.00       |
| shop-background (home)   | 1.00            | 1.40 !           | 0.93           | 1.31 !          | 0.93          | 0.88      | 1.77 !    | 1.06       |
| salon-background (page)  | 1.01            | 1.58 !           | 0.95           | 1.49 !          | 1.02          | 0.90      | 1.80 !    | 1.20       |
| salon-background (home)  | 1.07            | 1.68 !           | 1.01           | 1.58 !          | 1.09          | 0.95      | 1.91 !    | 1.27 !     |
| spa-background (page)    | 1.01            | 1.58 !           | 0.95           | 1.49 !          | 1.02          | 0.90      | 1.80 !    | 1.20       |
| spa-background (home)    | 1.07            | 1.68 !           | 1.01           | 1.58 !          | 1.09          | 0.95      | 1.91 !    | 1.27 !     |
| parlor-background (page) | 1.01            | 1.58 !           | 0.95           | 1.49 !          | 1.02          | 0.90      | 1.80 !    | 1.20       |
| parlor-background (home) | 1.07            | 1.68 !           | 1.01           | 1.58 !          | 1.09          | 0.95      | 1.91 !    | 1.27 !     |
| salon-hero               | 0.94            | 1.44 !           | 0.88           | 1.25 !          | 0.87          | 0.75      | 1.50 !    | 1.00       |
| spa-hero                 | 0.94            | 1.44 !           | 0.88           | 1.25 !          | 0.87          | 0.75      | 1.50 !    | 1.00       |
| parlor-hero              | 0.94            | 1.44 !           | 0.88           | 1.25 !          | 0.87          | 0.75      | 1.50 !    | 1.00       |

### Flagged

- shop-background (page) on iphone-landscape: x1.32 (shop-background.webp 1920x1080, window); needs about 2540x1170
- shop-background (page) on laptop-2x: x1.67 (shop-background.webp 1920x1080, window); needs about 2880x1800
- shop-background (home) on iphone-landscape: x1.40 (shop-background.webp 1920x1080, window); needs about 2540x1170
- shop-background (home) on pixel-landscape: x1.31 (shop-background.webp 1920x1080, window); needs about 2380x1080
- shop-background (home) on laptop-2x: x1.77 (shop-background.webp 1920x1080, window); needs about 2880x1800
- salon-background (page) on iphone-landscape: x1.58 (salon-background.webp 1600x1000, window); needs about 2540x1170
- salon-background (page) on pixel-landscape: x1.49 (salon-background.webp 1600x1000, window); needs about 2380x1080
- salon-background (page) on laptop-2x: x1.80 (salon-background.webp 1600x1000, window); needs about 2880x1800
- salon-background (home) on iphone-landscape: x1.68 (salon-background.webp 1600x1000, window); needs about 2540x1170
- salon-background (home) on pixel-landscape: x1.58 (salon-background.webp 1600x1000, window); needs about 2380x1080
- salon-background (home) on laptop-2x: x1.91 (salon-background.webp 1600x1000, window); needs about 2880x1800
- salon-background (home) on desktop-1x: x1.27 (salon-background.webp 1600x1000, window); needs about 1920x1080
- spa-background (page) on iphone-landscape: x1.58 (spa-background.webp 1600x1000, window); needs about 2540x1170
- spa-background (page) on pixel-landscape: x1.49 (spa-background.webp 1600x1000, window); needs about 2380x1080
- spa-background (page) on laptop-2x: x1.80 (spa-background.webp 1600x1000, window); needs about 2880x1800
- spa-background (home) on iphone-landscape: x1.68 (spa-background.webp 1600x1000, window); needs about 2540x1170
- spa-background (home) on pixel-landscape: x1.58 (spa-background.webp 1600x1000, window); needs about 2380x1080
- spa-background (home) on laptop-2x: x1.91 (spa-background.webp 1600x1000, window); needs about 2880x1800
- spa-background (home) on desktop-1x: x1.27 (spa-background.webp 1600x1000, window); needs about 1920x1080
- parlor-background (page) on iphone-landscape: x1.58 (parlor-background.webp 1600x1000, window); needs about 2540x1170
- parlor-background (page) on pixel-landscape: x1.49 (parlor-background.webp 1600x1000, window); needs about 2380x1080
- parlor-background (page) on laptop-2x: x1.80 (parlor-background.webp 1600x1000, window); needs about 2880x1800
- parlor-background (home) on iphone-landscape: x1.68 (parlor-background.webp 1600x1000, window); needs about 2540x1170
- parlor-background (home) on pixel-landscape: x1.58 (parlor-background.webp 1600x1000, window); needs about 2380x1080
- parlor-background (home) on laptop-2x: x1.91 (parlor-background.webp 1600x1000, window); needs about 2880x1800
- parlor-background (home) on desktop-1x: x1.27 (parlor-background.webp 1600x1000, window); needs about 1920x1080
- salon-hero on iphone-landscape: x1.44 (salon-hero.webp 1920x1080, hero); needs about 2540x1560
- salon-hero on pixel-landscape: x1.25 (salon-hero.webp 1920x1080, hero); needs about 2380x1360
- salon-hero on laptop-2x: x1.50 (salon-hero.webp 1920x1080, hero); needs about 2880x1410
- spa-hero on iphone-landscape: x1.44 (spa-hero.webp 1920x1080, hero); needs about 2540x1560
- spa-hero on pixel-landscape: x1.25 (spa-hero.webp 1920x1080, hero); needs about 2380x1360
- spa-hero on laptop-2x: x1.50 (spa-hero.webp 1920x1080, hero); needs about 2880x1410
- parlor-hero on iphone-landscape: x1.44 (parlor-hero.webp 1920x1080, hero); needs about 2540x1560
- parlor-hero on pixel-landscape: x1.25 (parlor-hero.webp 1920x1080, hero); needs about 2380x1360
- parlor-hero on laptop-2x: x1.50 (parlor-hero.webp 1920x1080, hero); needs about 2880x1410

### Replacement photos needed

- shop-background: 2880x1800 or larger
- salon-background: 2880x1800 or larger
- spa-background: 2880x1800 or larger
- parlor-background: 2880x1800 or larger
- salon-hero: 2880x1410 or larger
- spa-hero: 2880x1410 or larger
- parlor-hero: 2880x1410 or larger

Meera pictures: 34 files (assumed stage 300x375 CSS px).
Zenoti leader photos: none (initials are shown).

RESULT: 35 picture/device combinations are over 1.25x.

### Reading the table

- Portrait phones (iPhone and Pixel portrait, iPad portrait) and the laptop at 1x and desktop at 1x are fine, because the band fallback keeps the scale near or under 1.25.
- What fails: phones turned sideways (landscape), a laptop with a 2x (retina) screen, and the home backgrounds on a 1920x1080 desktop.
- The cause is the source files, not the code. Nothing larger exists, so the optimizer cannot make bigger variants.

## Replacement photos needed (exact slot, minimum size)

Put the originals (do not pre-compress them) in `frontend/public/photos/` with the slot name, then run `npm run photos:optimize`.

| Slot                                              | Minimum size | Why                                                                                                                               |
| ------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| shop-background                                   | 2880x1800    | laptop at 2x; iPhone landscape needs about 2540x1170                                                                              |
| salon-background                                  | 2880x1800    | same                                                                                                                              |
| spa-background                                    | 2880x1800    | same                                                                                                                              |
| parlor-background                                 | 2880x1800    | same                                                                                                                              |
| salon-hero, spa-hero, parlor-hero                 | 2880x1410    | laptop at 2x; the hero is full-bleed and 520 to 760 px tall                                                                       |
| shop-background-mobile (optional)                 | 1290x2796    | portrait phones; 1080x1920 is only a minimum and is still flagged at about 1.32 on an iPhone-sized window (needs about 1170x2540) |
| salon-, spa-, parlor-background-mobile (optional) | 1290x2796    | same                                                                                                                              |

Leader photos (For Zenotians) are not used; initials are shown. No photo of any real person was downloaded, copied or generated.

## Division hero contrast (measured over the real photos)

Method: the 32x18 average-colour grid of each hero (`photo-stats.json`), the left-only scrim and the glass composited over every cell under the card area, then the contrast ratio of the writing colour. Targets: 3:1 for the headline, 4.5:1 for body text and buttons. The numbers below are the worst cell. A unit test fails if any drops under 4.5.

| Division | Light mode | Dark mode |
| -------- | ---------- | --------- |
| Salon    | 7.59:1     | 11.96:1   |
| Spa      | 5.38:1     | 7.00:1    |
| Parlor   | 9.73:1     | 6.30:1    |

Glass is 8 to 14% white in light mode and 14 to 22% in dark mode, with a 10 to 16 px backdrop blur on the card only (not on the photo). With "Reduce transparency" (the app setting or the system setting) the card becomes solid in the theme colours with no blur; that fallback is also tested at 4.5:1.

## Lesson: `naturalWidth` with `srcset` is density-corrected

The first version of the browser test read `img.naturalWidth` and failed everywhere with numbers equal to the screen width ("389px wide, needs 1170px" on an iPhone). That was the test measuring the wrong thing. For an `<img>` with `srcset` w-descriptors and `sizes`, `naturalWidth` is the file's pixel width divided by the chosen candidate's density, so it always equals the slot's CSS width. It says nothing about the pixels downloaded.

The test now takes `img.currentSrc` (or, for a CSS background, the URL the browser really requested, which resolves an `image-set`), creates a new `Image()` with ONLY that URL (no `srcset`, no `sizes`), awaits `decode()`, and uses that `naturalWidth` as the real pixel width. The rule is unchanged: the real width must be at least 95% of the smaller of the pixels needed (box width x device pixel ratio) and the widest file offered.

A failure message shows the URL, the real width of the chosen file, the container width, the device pixel ratio, the needed width and the widest file offered. Every run also prints and attaches (HTML report, `chosen-files-<page>-<shape>`) which file name was chosen for each picture, so you can see which variant each shape got.

How to read a failure:

- Real width is below needed, and the widest offered is also below needed: the source photos are too small (see the replacement list above) or `npm run photos:optimize` was not run on larger originals. This is the budget table's finding, not a code bug.
- Real width is below needed, but a larger candidate was offered: the `sizes` attribute is wrong for that slot (too small a width, so the browser picked a small file) or the `srcset` is missing the larger candidate.
- The chosen file is a tiny placeholder: the placeholder was never replaced by the sharp picture.

## Other pages reviewed (Part 4)

- Home scrolling background: uses the shared hook and the same srcset. Only the current layer is mounted on a portrait phone. Zoom 1.06 at most, off on phones.
- Booking pages: header zoom 1.5 lowered to 1. The sheet and drawer rules were not changed beyond that.
- For Zenotians: body text 17 px (18 px on large screens), menu links at least 44 px tall, leader cards in one column on phones.

Seen but not fixed (listed only, as asked):

- The older `-960` files in `frontend/public/photos/` are no longer used. After `npm run photos:optimize` you can delete them.
- SVG labels in the Zenotians diagrams were raised to 14 px; check `/zenotians/project`, `/day` and `/mapping` for crowding on a phone.
- 35 picture and device combinations are still over 1.25 until the replacement photos above exist.

## Tests written

Unit (run in vitest): budget maths, srcset and sizes, no blur filters in the CSS, placeholder removal, mobile slot versus band, hero height is `clamp(520px, 78dvh, 760px)`, chips come from real category data, contrast numbers, reduced transparency, the overflow rule, the portrait query string, the hook and the missing-mobile fallback.

Browser (`e2e/image-quality.e2e.ts`): iPhone and Pixel, portrait and landscape, and 1280 desktop, over home, /salon, /spa, /beauty-parlor, a booking page, /zenotians and its leaders page. Each checks for no sideways scroll, that each picture is at least as many pixels wide as the screen needs (or the widest file it was offered), and no blur filter. Screenshots go to `docs/ui-screenshots/`. The booking page test signs in with its own context, so its pixel ratio is 1.

## Not run

I could not run a browser, Playwright, `npm run build` or the optimizer here (there are no original photos). The unit tests were run in a separate sandbox copy of the project; the browser tests are written but have never been run.
