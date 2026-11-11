# Mobile audit: every page on phones and tablets

Static review of the frontend code (no browser was available while writing this), the fixes made,
and the automated checks you run (`frontend/e2e/mobile-matrix.e2e.ts`). Widths covered: 320, 360,
390 and 768 px portrait, plus 844 x 390 landscape. Features, wording, colours and backend logic
were not changed.

## 1. Inventory

### 1.1 Routes (from `shared/policy.json`; the test reads the same file, so new pages are included)

| Role | Route | In the mobile matrix |
| --- | --- | --- |
| visitor | `/` | yes |
| visitor | `/salon` | yes |
| visitor | `/spa` | yes |
| visitor | `/beauty-parlor` | yes |
| visitor | `/login` | yes |
| visitor | `/register` | yes |
| visitor | `/zenotians` | yes |
| visitor | `/zenotians/about/summary` | yes |
| visitor | `/zenotians/about/education` | yes |
| visitor | `/zenotians/about/projects` | yes |
| visitor | `/zenotians/about/experience` | yes |
| visitor | `/zenotians/about/skills` | yes |
| visitor | `/zenotians/about/certifications` | yes |
| visitor | `/zenotians/about/achievements` | yes |
| visitor | `/zenotians/about-zenoti` | yes |
| visitor | `/zenotians/project` | yes |
| visitor | `/zenotians/mapping` | yes |
| visitor | `/zenotians/day` | yes |
| visitor | `/zenotians/decisions` | yes |
| visitor | `/zenotians/quality` | yes |
| visitor | `/zenotians/security` | yes |
| visitor | `/zenotians/limitations` | yes |
| visitor | `/zenotians/questions` | yes |
| visitor | `/zenotians/demo` | yes |
| visitor | `/zenotians/contact` | yes |
| visitor | `/forgot-password` | yes |
| visitor | `/reset-password` | yes |
| visitor | `/accept-invite` | yes |
| visitor | `/403` | yes |
| visitor | `/privacy` | yes |
| visitor | `/terms` | yes |
| visitor | `/cancellation-policy` | yes |
| visitor | `/unsubscribe` | yes |
| customer | `/customer-dashboard` | yes |
| customer | `/customer/book` | yes |
| customer | `/customer/appointments` | yes |
| customer | `/customer/chat` | yes |
| customer | `/customer/waitlist` | yes |
| customer | `/customer/packages` | yes |
| customer | `/customer/memberships` | yes |
| customer | `/customer/wallet` | yes |
| customer | `/customer/shop` | yes |
| customer | `/customer/orders` | yes |
| customer | `/customer/invoices` | yes |
| customer | `/customer/profile` | yes |
| customer | `/customer/pay/:id` | no: needs a record id (see overlays and flows) |
| customer | `/customer/chat/:id` | no: needs a record id (see overlays and flows) |
| customer | `/customer/orders/:id` | no: needs a record id (see overlays and flows) |
| customer | `/customer/notifications` | yes |
| receptionist | `/dashboard` | yes |
| receptionist | `/air-activity` | yes |
| receptionist | `/appointments` | yes |
| receptionist | `/schedule` | yes |
| receptionist | `/customers` | yes |
| receptionist | `/pos` | yes |
| receptionist | `/orders` | yes |
| receptionist | `/memberships` | yes |
| receptionist | `/cash-close` | yes |
| receptionist | `/inventory` | yes |
| receptionist | `/my-hours` | yes |
| receptionist | `/customers/:id` | no: needs a record id (see overlays and flows) |
| receptionist | `/orders/:id` | no: needs a record id (see overlays and flows) |
| receptionist | `/profile` | yes |
| receptionist | `/notifications` | yes |
| stylist | `/my-day` | yes |
| stylist | `/requests` | yes |
| stylist | `/my-appointments` | yes |
| stylist | `/my-schedule` | yes |
| stylist | `/chat` | yes |
| stylist | `/earnings` | yes |
| stylist | `/my-appointments/:id` | no: needs a record id (see overlays and flows) |
| stylist | `/chat/:id` | no: needs a record id (see overlays and flows) |
| stylist | `/profile` | yes |
| stylist | `/notifications` | yes |
| admin | `/dashboard` | yes |
| admin | `/customers` | yes |
| admin | `/staff` | yes |
| admin | `/ratings` | yes |
| admin | `/work-hours` | yes |
| admin | `/staff-summary` | yes |
| admin | `/payroll` | yes |
| admin | `/services` | yes |
| admin | `/pos` | yes |
| admin | `/orders` | yes |
| admin | `/memberships` | yes |
| admin | `/inventory` | yes |
| admin | `/content` | yes |
| admin | `/marketing` | yes |
| admin | `/packages` | yes |
| admin | `/package-requests` | yes |
| admin | `/gift-cards` | yes |
| admin | `/waitlist` | yes |
| admin | `/reports` | yes |
| admin | `/chatbot-insights` | yes |
| admin | `/air-activity` | yes |
| admin | `/settings` | yes |
| admin | `/audit-log` | yes |
| admin | `/security` | yes |
| admin | `/customers/:id` | no: needs a record id (see overlays and flows) |
| admin | `/orders/:id` | no: needs a record id (see overlays and flows) |
| admin | `/profile` | yes |
| admin | `/notifications` | yes |
The public division pages `/salon`, `/spa` and `/beauty-parlor` are in the visitor list. Pages
for one record (`/customer/pay/:id`, `/customer/chat/:id`, `/customer/orders/:id`,
`/customers/:id`, `/orders/:id`, `/my-appointments/:id`, `/chat/:id`) need a real id: they share
the layouts and components checked here and are reached by the existing flow tests
(`full-workflow.e2e.ts`, `z-chat-photos.e2e.ts`); they are not in the matrix.

### 1.2 Overlays, flows and states

| Item | Where | In the matrix |
| --- | --- | --- |
| Public menu drawer | `Navbar.tsx` (below 1024 px) | yes (visitor overlays) |
| App menu drawer (the sidebar on phones and tablets) | `AppShell.tsx`, `Drawer.tsx` | yes (customer flow) |
| Chat widget (AI help) | `ChatWidget.tsx` | yes (visitor overlays) |
| AIR popup (receptionist) | `components/air/Air.tsx` (bottom sheet on phones) | yes (receptionist) |
| AIR Activity page | `/air-activity` (receptionist, admin) | yes (routes) |
| Meera guided tour | `components/tour/Tour.tsx` | yes (customer flow) |
| Logo splash | `components/brand/Splash.tsx` | yes (held with `alankar-splash = hold`) |
| Logo loader | `LogoLoader.tsx` (only shows on slow loads) | no: needs a slowed network; see `loading-states.e2e.ts` |
| Booking flow steps | `/customer/book` service, time (details, review) | service and time steps |
| Payment page | `/customer/pay/:id` | no (needs an id; full-workflow test) |
| Modals (checkout, invoice, new customer, cancel...) | `components/ui/Modal.tsx` | shared component fixed; opened per page by hand |
| Notifications panel, display settings, profile menu | `NotificationBell.tsx`, `DisplaySettings.tsx`, `ProfileMenu.tsx` | reviewed in code |
| Zenotians pages | `/zenotians/...` | yes (visitor routes) |
| Settings pages | `/settings` (admin), `/customer/profile` | yes (routes) |

## 2. What was wrong and what was fixed

### 2.1 Shared (affects every page)

| Problem | Fix |
| --- | --- |
| The viewport meta had no `viewport-fit=cover`, so every `env(safe-area-inset-*)` already in the code was 0 on notched iPhones | `index.html`: `viewport-fit=cover`, plus `interactive-widget=resizes-content` so Android resizes the page for the keyboard instead of covering the focused field and the submit button |
| Form fields used 13 px text: iPhones and iPads zoom the page when a field is focused | `control-styles.ts` (Input, Select, Textarea, PasswordInput, Glass inputs): 16 px below 1024 px, 13 px on desktop. Same for the raw inputs in `ChatWidget`, `DeskBookingDrawer`, `PlacementDrawer` and `SchedulePage` |
| Buttons were 32 px (`sm`) and 40 px (`md`), icon buttons 40 px: under the 44 px touch target | New `.touch-target` (index.css): at least 44 x 44 px on touch screens only (`pointer: coarse`), so desktop layouts keep their compact sizes. Added to buttons, icon buttons, glass buttons, filter chips, tabs, dropdown items, accordion headers, sidebar and navbar rows, appearance switch, footer links, the AIR "needs you" links and the division page "clear filters" button |
| `100vh` full-height layouts are taller than the visible screen on phones (browser bars) | `body`, `PublicLayout`, `AppShell` and the sidebar height use `dvh` (with a `vh` fallback for old browsers); `Modal` uses `90dvh` |
| Floating controls could sit under the notch or the home bar | The bell and the phone menu button in `AppShell` respect the top and side safe areas; the menu button is 44 px; `Modal` keeps its bottom edge above the home bar; `Drawer` pads for the notch and the home bar; the tour card on phones sits above the home bar. (Chat button, AIR button and popup, splash Skip and the navbar already did) |
| Long words (emails, ids, links) could push a page sideways | `body { overflow-wrap: break-word }`; footer email `break-all` |
| Flex children with long text could not shrink (`min-width: auto`) | `min-w-0` on the text columns in `ChatbotInsightsPage`, `ConversationView`, `BookPage` service rows, `ServiceCard`, `CheckoutModal`, `CommandBar` rows, `OrderBits`, the AIR popup bubbles and the public `<main>` |
| Landscape phones enlarged text by themselves | `text-size-adjust: 100%` |
| A focused field could end up under the sticky navbar or the keyboard | `scroll-padding-top: 5rem; scroll-padding-bottom: 6rem` on `html` |

### 2.2 Per page

| Page(s) | Found | Fixed |
| --- | --- | --- |
| All public pages (home, divisions, login, register, policies, 403, unsubscribe, reset, invite) | shared items above; footer links 20 px tall | shared fixes; footer links 44 px on touch |
| Zenotians pages | comparison table already scrolls in a labelled region; sidebar already a drawer | none needed beyond shared |
| Customer: book (all steps), appointments, pay, wallet, shop, orders, invoices, packages, memberships, waitlist, chat, profile | 13 px fields (zoom), small chips and tabs | shared fixes |
| Desk: appointments, schedule, customers, POS, orders, memberships, cash close, inventory, my hours | date field on the schedule was 36 px and 13 px; date fields in the booking and placement drawers 13 px | 44 px and 16 px on touch |
| Admin: settings | shop phone field had no `type`, so phones showed a letter keyboard | `type="tel"` |
| Admin: inventory suppliers | supplier phone field had no `type` | `type="tel"` |
| Admin: audit log | "By (email)" filter showed a letter keyboard | `inputMode="email"` (a partial email still filters) |
| Admin: content, Zenotians editor | email and link fields showed a letter keyboard | `inputMode="email"` / `inputMode="url"` (no browser validation added, so stored values that are not full URLs still save) |
| Admin: inventory purchase orders | the order-lines table had no scroll container (could widen the page at 320) | wrapped in a focusable, labelled region that scrolls sideways on its own |
| AIR Activity | "needs you" links 36 px | 44 px on touch; charts already use `ResponsiveContainer` and have data tables |
| Stylist pages | shared items | shared fixes |

### 2.3 Checked and already fine

Tables (`ui/Table`, heatmap, Zenotians comparison) scroll inside focusable, labelled regions.
Charts resize to their container and each has a data table. Modals are bottom sheets on phones
(`items-end` below 640 px) and trap focus; the AIR popup is a bottom sheet on phones; the sidebar
is a drawer with an overlay below 1024 px; the bell panel and display settings are capped to the
screen width. Phone, email and code fields elsewhere already had `type`, `inputMode` and
`autoComplete`. Images use the photo-slot rules (portrait/mobile slots, srcset) and are
`max-width: 100%`. Animations use transform and opacity and respect reduced motion.

## 3. Automated checks (you run them)

`frontend/e2e/mobile-matrix.e2e.ts`, five projects in `playwright.config.ts` (device descriptors
without `defaultBrowserType`, run in Chromium): `mobile-320` (iPhone SE), `mobile-360` (Android
360 x 740), `mobile-390` (iPhone 14), `tablet-768` (iPad Mini portrait), `landscape-844`
(844 x 390). The default `chromium` project ignores this file.

For every route and every role: no horizontal overflow
(`document.scrollingElement.scrollWidth <= innerWidth`), no tappable element under 44 x 44,
no serious or critical axe violation, and a full-page screenshot at
`frontend/mobile-screens/<role>/<route>-<device>.png` (ignored by git). Overlays and flows: public
and app menu drawers, chat widget, logo splash, booking steps, the tour and the AIR popup. The
splash is skipped with the session flag `alankar-splash-seen` (and held on screen only for its own
screenshot). Problems are collected per page and listed together.

Touch-target exceptions (not counted): links inside running text (WCAG 2.5.8 inline), a checkbox
or radio whose label is at least 44 px tall, the "Skip to content" link, chart internals,
anything inside `aria-hidden` or `inert`, and anything marked `data-touch-exempt` (none today).

## 4. Could not be checked without a browser

Real rendering at each width, the on-screen keyboard over fields on real iOS and Android, glass
contrast over each photo, blur or sharpness of photos on real screens, layout shift, landscape
notch padding, and pages that need a record id. The matrix covers most of this when you run it;
screenshots show the rest. Any element it reports as smaller than 44 px or overflowing is listed
by page in the test output.
