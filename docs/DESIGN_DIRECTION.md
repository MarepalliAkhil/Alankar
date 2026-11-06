# Design direction (Task 15A)

One shop, three divisions that should not feel like one template, and two calm themes for the neutral shop and the staff.
Everything below lives in `frontend/src/design/` (tokens, themes) and `frontend/src/components/ui/`, so the whole app changes through tokens and shared components, not page by page.

## How it is wired

- `themes.ts` has, per theme, colours (light and dark) **and an `identities` entry**: display and body font, heading weight and tracking, four corner radii, two ornament shapes (`--shape-leaf`, `--shape-arch`), motion durations and curve, and an ornament pattern (`--ornament-mask`, `--ornament-size`, `--ornament-opacity`).
- `tokens.ts` writes those as CSS variables on `[data-theme][data-mode]`. Tailwind classes (`rounded-card`, `font-display`, `duration-base`, `ease-brand`) and the utilities `.shape-leaf`, `.shape-arch`, `.ornament`, `.tabular` read them. A page inside `<ThemeScope theme="spa">` therefore turns into the spa without knowing it.
- `h1`, `h2`, `h3` use the theme's display face, weight and tracking (`index.css`); card and list titles (`h4` and smaller) stay in the body face so data screens stay compact.

## Fonts (self-hosted, Open Font License)

The sandbox and the owner's computer could not reach the npm registry during this task, so the font files are vendored in `frontend/src/assets/fonts/` (Latin subset plus the rupee sign, WOFF, about 330 KB for all five families; licence texts beside them) and declared in `src/design/fonts.css`. There are no runtime requests to any CDN and `font-display: swap` keeps text visible while a font loads.
All five families exist as npm packages, so this can be switched without any design change once the registry is reachable:
`npm install @fontsource/crimson-pro @fontsource/lora @fontsource/instrument-sans @fontsource/work-sans @fontsource/poppins`, then replace the `@font-face` blocks with `import '@fontsource/lora/400.css'` and so on (same family names).

| Theme | Display | Body and UI | Why |
|---|---|---|---|
| Salon | **Crimson Pro** 400/700 (italic for emphasis) | Instrument Sans | A bookish, high-contrast serif at large sizes reads as editorial and confident; a clean grotesque keeps prices and buttons crisp. |
| Spa | **Lora** 400/700 (italic) | Work Sans | Lora's brush-drawn curves are gentle; Work Sans is a soft, humanist sans for body text. |
| Parlor | **Poppins** 500/700 | Poppins | Round, friendly and a little playful; used bold and tight for display, regular for text. |
| Brand (home, login, customer) | Instrument Sans 600 | Instrument Sans | One firm, neutral face for the shop itself. |
| Staff | Instrument Sans 600 with tabular numbers | Instrument Sans | Calm and dense. Numbers align in tables. |

## Salon: editorial and confident

- **Colour:** charcoal, navy ink, warm gold and copper (existing "Midnight Studio" values; light mode is warm paper with near-black ink for contrast).
- **Type:** Crimson Pro at 56 to 96 px for headings, tight leading (1.02), italic for one emphasised word per heading. Instrument Sans for everything else.
- **Shape:** sharp 6 px cards and 4 px inputs, pill buttons. Sharp and soft corners are mixed on purpose: hard frames, round actions.
- **Layout:** asymmetric 7/5 splits, numbered sections ("01 Cuts"), photography leading, captions overlapping the frame edge, hairline rules.
- **Pattern:** thin diagonal hairlines (`ornament`, 24 px tile).
- **Motion:** crisp and quick (90 to 260 ms, expo-out), clip-path wipes for images.
- **Icons:** scissors, comb, mirror.

## Spa: calm and organic

- **Colour:** sage, sand and clay (existing "Sage Calm").
- **Type:** Lora, regular weight, generous leading (1.2); Work Sans body.
- **Shape:** pebble cards (36 px radius), arch-top images (`shape-arch`), soft 22 px inputs.
- **Layout:** lots of whitespace, single column rhythm with an occasional offset image, centred quotes, long line spacing.
- **Pattern:** concentric ripple rings (120 px tile) at 10 % opacity.
- **Motion:** slow and breathing (420 to 700 ms, ease-in-out), gentle float on hover, nothing snappy.
- **Icons:** lotus, stones, leaf.

## Parlor: warm and expressive

- **Colour:** raspberry, blush and champagne gold (existing "Rose Glow").
- **Type:** Poppins 700 at tight tracking for display, 400 for text.
- **Shape:** leaf corners (`shape-leaf`: 40 px / 8 px alternating), 28 px cards, 16 px inputs, scalloped section edges.
- **Layout:** lively blocks of different sizes, tilted badges, big price numerals, overlapping frames.
- **Pattern:** a four-petal flower tile (88 px) at 12 % opacity.
- **Motion:** springy (`cubic-bezier(0.34, 1.4, 0.64, 1)`, 140 to 420 ms), small bounces on press.
- **Icons:** flower, brush, bangle.

## Neutral shop theme and staff theme

- **Brand (home, login, register, customer portal):** warm paper `#FAF6EF`, aubergine `#4A2C7A` and amber `#B45309` instead of default violet on lavender. 20 px cards. Dark mode keeps the same hues.
- **Staff (receptionist, stylist, admin):** cool paper, steel-blue ink `#1D4E89`, teal accent. 12 px cards, 8 px inputs, quick 90 to 150 ms motion, no ornament, tabular numerals. Stronger hierarchy: one H1, quiet section titles, and consistent hover, focus, disabled and selected states from the shared components. Data density comes from the tighter radii and spacing, not from smaller text.

## Icon set

`components/ui/AlankarIcon.tsx`: 15 icons drawn for the shop on one 24 px grid, 1.6 stroke, round caps and joins, no fill, no emoji: `scissors, comb, mirror, lotus, stones, leaf, flower, brush, bangle` (the three divisions) and `search, calendar, approve, door, rupee, star` (the six steps of a visit). Functional controls (menu, close, chevrons) keep Lucide, which is only used at the same 1.6 stroke where it sits beside the set.

## Illustration and pattern style

No clip-art and no stock illustrations: ornament is a single-colour mask pattern per theme (above), painted in the theme's `primaryLight` at 8 to 12 %, and the photography slots (admin upload, `public/photos`, generated art) lead the layouts.

## Motion language

Per theme (table above). Common rules: transform and opacity only, `prefers-reduced-motion` shows the final state with no movement, no animation longer than 700 ms, nothing loops.

## Spacing rhythm

Sections no longer share one gap. The home page alternates **tight** (24 to 32 px), **regular** (64 px) and **airy** (112 px) vertical rhythm; division pages use their own scale (salon tight and structured, spa airy, parlor mixed). App screens keep the 4, 8, 16, 24, 32, 48 scale from the tokens.

## Copy

Short, warm, specific to a salon in India, and only claims the product does (see `CUSTOMER_UI_FIXES.md` for the app wording). Examples: "Hair, skin and a quiet hour." instead of "Look good. Feel calm."; "Your stylist says yes to the time" instead of "We confirm"; prices always "incl. GST". Opening hours, address and phone come from the shop settings; nothing is invented.
