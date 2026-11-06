# Design audit (Task 15A): why the UI looks machine-made

Feedback received: "The UI looks monotone, and it is very evident that it was created with an AI tool."
This audit lists what we found in the running app, with the "before" screenshots in
`docs/ui-screenshots/t15-before-*` (public pages and all 12 customer pages at 375, 768 and 1280 px, light).
Nothing here is a bug; every item is a pattern that makes the product look templated.

## 1. The patterns, and where they show

| # | Pattern | Where it shows | Why it reads as machine-made |
|---|---------|----------------|------------------------------|
| 1 | **One glass card for everything.** Same translucent white fill, same blur, same 24 px radius, same soft violet shadow. | Every page; `t15-before-home-1280-light`, `t15-before-c-dashboard-1280-light` | A single surface treatment gives no hierarchy: a service, a price, a warning and a page header all look equally important. Glassmorphism is also the default "polished" look of generated UIs. |
| 2 | **The same card grid on every page.** Home divisions, featured services, offers, steps, team, stats, the customer menu: all are 3 equal cards in a row. | Home, division pages, customer home | Equal columns, equal heights, equal spacing: no focal point, no rhythm. |
| 3 | **Default violet.** The neutral theme is `#7C3AED` on a lavender page with soft gradient orbs. | Customer portal, login, register, Zenotians page | The most common "AI product" colour. The three divisions have their own colours but only as a tint of the same card. |
| 4 | **One typeface.** Inter at three weights for headings, body, prices and buttons. | Everywhere | No display voice, so no brand. Division pages feel like the same page with a different tint. |
| 5 | **Uniform radii.** `24px` cards, `14px` inputs, pills for every button and tag. | Everywhere | The three divisions (editorial salon, calm spa, expressive parlor) cannot differ in shape language. |
| 6 | **Icon in a pale circle.** A stock line icon in a soft tinted circle above or beside every title. | Steps, offers, division cards, empty states | Instantly recognisable template pattern. The icons are generic (Lucide), with no shop-specific drawing. |
| 7 | **Centred hero, then a card section for every topic.** Hero panel, then "About", "Our divisions", "Featured services", numbers, "How booking works", "Meet the team", "Questions", "Ready when you are". | `t15-before-home-1280-light` | Eight sections of the same height and weight. The page has no story, and the hero does not say in five seconds what the shop is (a headline "Look good. Feel calm." says nothing concrete). |
| 8 | **Big empty gap under the hero.** The scroll-reveal sections stay invisible until scrolled to, so a first look is a screen of blank space. | Home at 1280 | Looks broken and unfinished. |
| 9 | **Generic marketing wording.** "Look good. Feel calm.", "Ready when you are", "Pick a service / We confirm / Pay the link / Visit and rate", "Your account overview and shortcuts", "Your menu", "Available" badges. | Home, customer home, steps | Short, tidy, and could be any business. Nothing mentions an Indian salon, the actual flow (a stylist approves your booking), or what the customer does next. |
| 10 | **Menu cards that repeat the sidebar.** The customer home is 11 identical cards, each "Available" and "Open". | `t15-before-c-dashboard-1280-light` | It is a second menu, not a home. The customer cannot see what matters: the next visit, what needs paying, what needs rating. |
| 11 | **Uniform spacing rhythm.** Every section uses the same `gap-2xl` and `py-2xl`. | Home, division pages | Even spacing between unequal ideas is what makes a layout feel generated. |
| 12 | **Tables that break on phones.** Invoices is a 3-column table cut off at the right edge at 375 px; long lists have no grouping. | `t15-before-c-invoices-375-light`, `t15-before-c-appointments-375-light` (15,000 px tall) | Pages were never designed for 375 px, only made to "not overflow the page". |
| 13 | **Flat photo use.** One background photo per division, same crop, behind everything. Service cards reuse the same division photo for every service. | Division pages | Looks like stock art. No photo leads a layout. |
| 14 | **No motion language.** One fade-up reveal and one hover lift on every card. | Everywhere | Same micro-interaction on everything. |
| 15 | **Staff portals share the customer look.** Same glass, same violet, same radii. | Receptionist, stylist, admin | Data screens need density and clear states, not frosted panels. |

## 2. What is already good (keep)

- The token system (`src/design/tokens.ts`, `themes.ts`): one place for colour, radius, shadow, blur, motion; light and dark; WCAG AA tests.
- Reduced motion and reduced transparency support, the one-sidebar shell (Task 14), the photo slot system.
- Honest, short copy in many places (prices include GST, cancellation window).

## 3. Root causes

1. Identity lives in colour only. Type, shape, pattern, motion and layout are identical in every theme.
2. Pages are assembled from one card component, so layout variety was never possible.
3. Copy was written once by feature, not by voice.

## 4. What changes (see `DESIGN_DIRECTION.md`)

Identity moves into the tokens: each theme now carries its own **type pair, corner shapes, motion curve and ornament pattern**.
The home page and division pages get different layouts per section. The customer pages get a consistent header, mobile cards and a real home.
The detailed list of customer-page problems is in `CUSTOMER_UI_FIXES.md`.
