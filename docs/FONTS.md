# For Zenotians fonts

The For Zenotians pages (`/zenotians/...`) use the application's own fonts, the same families as the rest of the app (`--font-display` for headings and `--font-sans` for text, from the theme in `src/design`). An earlier page-only pairing (Lora headings with Work Sans text) was removed: nothing on this page loads a font of its own any more.

## What is page-specific: sizes only

`src/pages/zenotians/zenotians-type.css` is imported only by `ZenotiansLayout.tsx` (a lazy route). Every selector starts with `.zen-type` (checked by `typography.test.ts`), so no other page changes. The wrapper class sits on the page stage and on the phone menu drawer (which is rendered outside the page).

| Thing | Size |
|---|---|
| Body text | 16 px on a phone, 17 px from 641 px up, line height 1.6, paragraphs at most 68 characters wide |
| Sidebar links, card text | 16 px |
| Small labels | 14 px (nothing is smaller) |
| h1 | `clamp(2rem, 3.4vw, 2.75rem)` |
| h2 | `clamp(1.6rem, 2.2vw, 1.85rem)` |
| h3 | `clamp(1.2rem, 1.7vw, 1.3rem)` |

Letter-spacing is normal everywhere on the page, and capitals-only styling is switched off (sentence case); no words were changed.

## The fonts in `src/assets/fonts`

`lora-*.woff` and `work-sans-*.woff` (and their licence texts) were added for the removed pairing. Nothing uses them now. They are not loaded by any page (a font file that no `@font-face` points at is never requested), and were left in place because deleting your files needs your say-so. You can delete the five Lora and Work Sans `.woff` files and `Lora-OFL.txt` / `WorkSans-OFL.txt` yourself. No npm package was added for them, so there is no package to remove.
