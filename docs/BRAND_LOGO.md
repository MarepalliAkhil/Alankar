# Alankar logo: splash, home button, loader, favicon

## Files

| What | Where |
| --- | --- |
| Original logo (never edited) | `frontend/public/brand/alankar-logo.svg` |
| Logo shapes for React (generated from the SVG) | `frontend/src/components/brand/alankar-logo-paths.ts` |
| The mark in `currentColor` | `frontend/src/components/brand/AlankarLogo.tsx` |
| Logo + wordmark home button (navbar and sidebar) | `frontend/src/components/brand/BrandLink.tsx` |
| Where the logo goes (one constant) | `frontend/src/config/logoHome.ts` (`LOGO_HOME`) |
| Splash | `frontend/src/components/brand/Splash.tsx` (mounted in `PublicLayout`) |
| Intro-phase store | `frontend/src/intro/introPhase.ts` |
| Bubbling A loader | `frontend/src/components/brand/LogoLoader.tsx`, `frontend/src/hooks/useDelayedLoading.ts` |
| Motion CSS | `frontend/src/components/brand/brand.css` |
| Favicon | `frontend/index.html` (`rel="icon" type="image/svg+xml"`) |

### The SVG

`alankar-logo.svg` is a traced picture (VTracer): `width`/`height` 1024 and **no viewBox**,
29 flat-colour paths, 27 colours (a near-white background square, 16 teal shades, 10 pale tints
from anti-aliasing), no gradients, filters, embedded images or text, and no separate outline and
fill groups. The component keeps the 19 teal shapes (the background square and the pale specks
are dropped) and uses a cropped viewBox `156 156 712 712`, so the mark is one colour
(`currentColor`) and follows light and dark themes. The four big shapes (letter, leaf, flame)
are the outline layer of the splash; all 19 make the filled layer. If the logo file changes,
regenerate `alankar-logo-paths.ts` instead of editing it by hand.

## Intro-phase store (`intro/introPhase.ts`)

Phases, in order: `splash` -> `navbar` -> `hero` -> `tour`. Components gate only when they START:

- the navbar logo is hidden in its reserved place during `splash` (no layout shift), and the
  wordmark slides out when `navbar` is reached;
- the hero entrances (home `Reveal`, the Zenotians reveal `useZenReveal`) start at `hero`; the
  Zenotians reveal holds `hero` until its intro is done (`holdHero`), at most 2.5 s;
- Meera's first-run tour invitation (`TourProvider`) starts at `tour`.

Without a splash the store starts at `tour`, so nothing waits. The AIR popup (receptionists, in
the signed-in area) is not gated at all, and the splash never runs there.

## Splash

- Plays on the FIRST public page of a browser session (home, login, register, salon, spa, parlor,
  zenotians, policies, 404...). Never when the session starts on a staff or customer address
  (anything in `shared/policy.json`).
- Once per session: `sessionStorage["alankar-splash-seen"]`, read and written in try/catch. If
  storage is blocked it shows at most once per page load.
- Timing (`SPLASH` in `Splash.tsx`): outline draw 900 ms (stroke-dasharray from each path's
  `getTotalLength()`), fill fade 400 ms, then it waits for `document.fonts.ready` and the hero
  picture's `decode()` (never past the cap), then the A glides to the navbar logo (FLIP,
  transform only, 600 ms) while the overlay fades. Hard cap 3 s.
- Skip: click or tap anywhere, Escape, or the Skip button (first Tab stop). Resizing or turning
  the device ends it at once.
- The page renders underneath (`#root` is `inert` and `aria-hidden` while it is up). Screen
  readers hear only a polite "Welcome to Alankar".
- Reduced motion (system setting): no splash, the logo is simply in the navbar. The overlay has a
  solid background, so reduced transparency is fine.

### Switching the splash off (demos)

- One browser: in DevTools run `localStorage.setItem('alankar-splash', 'off')` (remove it to
  turn the splash back on).
- Everywhere: set `SPLASH_ENABLED = false` in `frontend/src/intro/introPhase.ts`.
- See it again in the same tab: `sessionStorage.removeItem('alankar-splash-seen')` and reload,
  or open a private window.
- Automated browsers (Playwright, `navigator.webdriver`) never see it unless
  `localStorage['alankar-splash'] = 'force'` (only `e2e/splash.e2e.ts` does this).

## The logo as home button

`BrandLink` on every public page (navbar, left) and at the top of the one sidebar for all roles.
Visitors and customers go to `/`; staff go to their own dashboard (`LOGO_HOME` in
`config/logoHome.ts`). Its accessible name is "Alankar home" and starts with the visible text
(the wordmark plus a visually hidden " home"; `aria-label` only when the sidebar is collapsed).
44 px target, visible focus ring, small hover and press motion only without reduced motion,
smaller on phones, safe-area insets respected.

### Renaming the wordmark

Change `logoText` in `frontend/src/config/brand.ts` (and `backend/core/brand.py` for emails).
The link name becomes "<new name> home" automatically.

## Logo loader (bubbling A)

`LogoLoader` (`small`, `medium`, `full-page`; `role="status"`, polite "Loading"): the filled A
with a gentle pulse and four bubbles rising and fading (transform and opacity only). Reduced
motion: the still A with a soft fade. `useDelayedLoading(loading)` shows it only after 300 ms
and then keeps it at least 500 ms; `LoaderSlot` reserves its 20 px space so nothing shifts.

Used ONLY where there was no loading animation: the "Loading services..." lines of the home
division sections, "Loading hours and address..." in the home hero, and "Loading..." in the
customer's AI-help privacy card. Route fallbacks (`DelayedLoader`, already animated), skeletons
(`LoadingState`, `Skeleton*`), button spinners, the boot spinner in `index.html`, and the Meera
and AIR animations are unchanged.

## Favicon and head

`index.html` points the favicon at `/brand/alankar-logo.svg` (`image/svg+xml`). The existing
`theme-color` meta stays (the app updates it to the theme's background at runtime). There is no
512 px PNG yet: export `frontend/public/brand/alankar-logo-512.png` to add an apple-touch-icon and
a web-manifest icon for phone home screens.
