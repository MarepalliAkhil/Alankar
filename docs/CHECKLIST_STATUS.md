# Alankar: checklist status (final audit)

Updated 2026-11-11 ("Final audit and finish"). Every row was checked against the code and the test
files, not against PROGRESS.md. This replaces the audit of 2026-11-06/08.

## How I checked, and what the statuses mean

**What ran this time (on your PC's copy, inside the Linux helper, SQLite instead of PostgreSQL):**

- Backend pytest, app by app: `air` (all passed; 9 skipped because they need PostgreSQL), `core`,
  `chatbot`, `website`, `accounts`, `people`, `scheduling`, `notifications`, `shop`, `inventory`,
  `waitlist`, `billing`, `wallet`, `chat`. Every failure seen falls into one of five sandbox
  limits, and each one passes only on PostgreSQL or Windows:
  1. raw SQL with UUIDs on SQLite (encrypted-at-rest checks such as
     `test_send_request_stores_snapshot_encrypted_and_emails`, `test_profile_read_and_update`,
     `test_register_creates_customer_with_encrypted_phone`, `test_delivery_details_are_encrypted_at_rest`);
  2. races that need real row locks (`test_concurrency_8b.py` four tests, two in
     `test_online_pricing.py`, `test_two_bookings_for_the_last_bottle_only_one_gets_it`, two in
     `shop/tests/test_shop.py`, `test_two_people_receiving_at_once_never_book_more_than_ordered`);
  3. the sandbox's MD5 hasher instead of Argon2 (`test_passwords_use_argon2_first`,
     `test_user_defaults_to_customer_with_uuid_and_argon2`, `test_a_correct_production_setup_has_no_errors`,
     `test_create_admin_command`);
  4. a crypto shim and no PostgreSQL (`test_ciphertext_is_bound_to_context_and_tamper_evident`,
     `test_database_is_postgresql`, `test_backup.py` cannot import psycopg);
  5. WebSocket tests (`chat/tests/test_chat.py` seven, `test_photos.py` two) need a newer asyncio.
- ruff check and ruff format on the whole backend: clean (after the fixes in section 4).
- ESLint on the whole frontend (`--max-warnings 0`): clean. `tsc --noEmit` for the app and for `e2e/`: clean.
  Prettier `--check .`: clean.
- `deploy_check` with production-like values: passed with 2 warnings (in-process cache and channel layer).
- Frontend vitest: last full run on 2026-11-10 (mobile task, Linux copy): 945 passed; the only
  failures were environmental (`axe-core` missing in that copy for `Air.test.tsx`,
  `ChatWidget.test.tsx`, `AirActivityPage.test.tsx`; photos not copied for `HomeBackdrop`, `art`,
  `image-budget`; `repo-stats` needs the scripts folder). No frontend source logic changed since.

**Not run here:** PostgreSQL, Playwright (including axe in a browser and the mobile matrix),
`npm run build`, `npm audit`, `pip-audit` (no registry access), and anything seen in a browser.

**Statuses**

- **DONE**: code + tests, and the tests ran here and passed (backend on SQLite, frontend in a Linux
  copy), apart from the sandbox limits above. Never seen in a browser unless a row says so.
- **UNVERIFIED**: code and tests exist but the check could not run here (PostgreSQL-only, Playwright,
  browser, or a real AI key).
- **PARTIAL**: part of it is built, or it needs something only you can supply.
- **NOT STARTED**: no code.

## 1. Summary counts

| Status | Count |
|---|---|
| DONE | 83 |
| UNVERIFIED | 15 |
| PARTIAL | 6 |
| NOT STARTED | 11 |
| **Total** | **115** |

Test files counted on 2026-11-11 (`def test_` / `it(`; parametrised cases run more): backend 1,276
(accounts 161, air 279, billing 166, chat 56, chatbot 65, core 92, inventory 16, notifications 4,
people 116, scheduling 128, shop 26, waitlist 19, wallet 81, website 67); frontend unit 713 in 72
files; end-to-end 102 in 18 files.

## 2. Full checklist

### Foundation and the original tasks

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| T0 | Docs and project setup | DONE | the project rules file, docs/MASTER_NOTES.md, START_HERE.md, PROGRESS.md | none |
| T1 | Backend skeleton (Django, DRF, Channels) | DONE | core/tests (test_foundation, test_health, test_policy, test_sweep) ran | PostgreSQL-only checks (limit 3/4) |
| T2 | Auth, roles, sessions, OTP, two-factor | DONE | accounts/tests (161) ran; 2 sandbox failures (limits 1, 3) | none |
| T3 | Catalogue and desk customers | DONE | scheduling/tests test_catalogue_admin, test_desk_customers ran | none |
| T4 | Booking engine, slots, 409 + nearest times | DONE | scheduling/tests ran | Race tests on PostgreSQL (limit 2) |
| T5 | Billing, POS, invoices, payroll, work hours | DONE | billing (166), people/test_payroll, accounts/test_work_hours ran | Race tests (limit 2) |
| T6 | Wallet, gift cards, packages, memberships | DONE | wallet/tests (81) ran | none |
| T7 | Public chatbot "AI Alankar Intelligence" (engine, API, widget, admin insights) | DONE | chatbot/tests (65) ran incl. test_accuracy (130/143, 67/91) | none |
| T8 | Frontend customer, desk, stylist, admin pages | DONE | pages/*.test.tsx ran 2026-11-10 | Browser |
| T8.5-1 | Gift card codes visible | DONE | wallet tests ran | none |
| T8.5-2 | Shop and Orders | DONE | shop/tests (26) ran; 3 sandbox failures (limits 1, 2); pages/shop.test.tsx | Races on PostgreSQL |
| T8.5-3 | Coupons and online money engine | DONE | billing/tests test_online_pricing, test_private_coupons ran | 2 race tests (limit 2) |
| T8.5-4 | Products in appointment booking | DONE | scheduling/tests/test_booking_products ran | 1 race test (limit 2) |
| T8.5-5 | Package codes, cancellation requests, Packages page, code step, settings | DONE | wallet tests; pages/wallet.test.tsx | none |
| T8.5-6 | Memberships: cancel, renew, buy again | DONE | wallet tests; pages/memberships.test.tsx | none |
| T8.5-8 | Menus, policy, chatbot knowledge, shop settings | DONE | policy/policy.test.ts; core/tests/test_policy.py ran | none |
| T9 | For Zenotians page | DONE | pages/zenotians*.test.tsx; website/tests/test_zenotians.py ran | Browser |
| T10 | Admin assistant ("Alankar Intelligence" for the admin) | NOT STARTED | No code (no learn_daily, briefing, plans, commands) | Whole task (section 3) |
| T11a | Theme, glass, display settings, loader, skeletons | DONE | design/themes.test.ts, tokens.test.ts, ui/theming.test.tsx | Browser |
| T11b | Scroll-driven home hero | DONE | home/HomeHero.test.tsx | Browser; e2e home-hero |
| T11c-g | Division looks, portals, staff screens, admin restyle | UNVERIFIED | Page tests pass; quality is visual | Your eyes in a browser |
| T11h | Full-page backgrounds, transparent navbar and footer | DONE | design/page-background.test.ts | Browser |
| T11i | Type scale, controls, layouts | DONE | design/tokens.test.ts | Browser |
| T12 | Deployment | NOT STARTED | deploy_check passes with production-like values; nothing is hosted | Hosting (section 3) |
| T13A-1 | Dual approval (desk AND stylist) | DONE | scheduling/tests/test_dual_approval.py ran | none |
| T13A-2 | Decline by either side | DONE | test_dual_approval.py ran | none |
| T13A-3 | Expiry and reminders | DONE | test_request_expires_before_the_visit_and_the_job_is_safe_to_run_twice etc. ran | none |
| T13A-4 | Tentative slot hold | DONE | test_pending_request_holds_the_stylists_slot_and_decline_frees_it ran | none |
| T13A-5 | Customer messages (in-app, mail, text) and privacy | DONE | notifications tests, test_notifications_are_private_to_their_owner ran | none |
| T13A-6 | Stylist's private reason hidden from the customer | DONE | test_the_private_reason_is_visible_only_to_the_desk_and_that_stylist ran | none |
| T13A-7 | Stylist Requests inbox | DONE | pages/stylist.test.tsx | Browser |
| T13B-1 | Admin has no appointments or schedule | DONE | test_admin_cannot_reach_appointments_or_schedule ran | none |
| T13B-2 | Stylist calendar and portal pages | DONE | test_stylist_calendar_shows_only_their_own_bookings ran | none |
| T13C | Sorry notes on staff slot changes | DONE | scheduling/tests (10 sorry-note tests) ran | none |
| T13D | Remember-me trusted devices | DONE | accounts/tests/test_trusted_devices.py ran; components/customer/TrustedDevices.test.tsx | none |
| T14A-1 | One left sidebar for all roles | DONE | layout/Sidebar.test.tsx, policy.test.ts | Browser (e2e sidebar) |
| T14A-2 | Profile dropdown with only Profile and Log out | DONE | layout tests | none |
| T14B | Admin shop statistics | DONE | billing/tests/test_shopstats.py ran; pages/admin-dashboard.test.tsx | none |
| T15-1 | Design direction | UNVERIFIED | docs/DESIGN_DIRECTION.md, DESIGN_AUDIT.md | A visual judgement |
| T15-2 | Customer page fixes | UNVERIFIED | docs/CUSTOMER_UI_FIXES.md; page tests pass | Browser |
| T15-3 | Guided tour (Meera) | DONE | tour/Tour.test.tsx, poses.test.tsx | Browser; e2e tour |
| T16A-E | Future vision removed, Limitations, Story page, FAQ moved to QA_PREP, QA_PREP and PRESENTATION_NOTES | DONE | zenotians.test.tsx; docs present | none |
| T17 | Fixes, one menu, home background, header images, Meera | DONE | page tests, page-background.test.ts, Meera.test.tsx | Browser |
| T17-am | Real photos only, one photo per section, glass recipe, Meera pictures | DONE | design/art.test.ts, photo-slots.test.ts, photo-contrast.test.ts | Better source photos (row IMG-2) |
| M-16 | 16 Meera poses in tour, tips, My bookings | DONE | poses.test.tsx, meera-moments.test.tsx | Real pose pictures where missing |
| M-DEF | meera.png default fallback | DONE | Meera.test.tsx | none |
| NEW-1 | Admin bell (own notifications only) | DONE | notifications/tests/test_admin_notifications.py ran | none |
| NEW-2 | Booking submitted screen | DONE | booking.test.tsx | Browser |
| NEW-3 | Meera celebrates only when confirmed | DONE | meera-moments.test.tsx | none |
| NEW-4 | Brand name Alankar from config | DONE | App.test.tsx; core/tests/test_foundation.py | none |

### Zen Chat photos

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| PH-1 | jpg, png, webp only, size and dimension limits | DONE | chat/tests/test_photos.py ran | none |
| PH-2 | EXIF/GPS stripped | DONE | test_exif_and_gps_are_stripped_and_the_picture_is_reencoded ran | none |
| PH-3 | Encrypted storage | DONE | test_the_database_row_holds_no_readable_image_bytes ran | none |
| PH-4 | Tags, captions, reference badge | DONE | test_caption_and_tag_validation ran | none |
| PH-5 | Deletion and 30-day retention | DONE | test_retention_wipes_photos_thirty_days_after_the_thread_closes_and_is_idempotent ran | none |
| PH-6 | WebSocket carries ids only | UNVERIFIED | test_websocket_refuses_desk_and_admin_and_announces_photos_by_id_only, test_the_live_socket_cannot_carry_a_photo | Limit 5: run on PC |
| PH-7 | Chat photo UI | DONE | pages/chat-photos.test.tsx | e2e z-chat-photos |
| PH-8 | Denied access and rate limits | DONE | test_other_customers_and_stylists_cannot_fetch_or_delete_a_photo etc. ran | none |

### For Zenotians and the November briefs

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| Z-1 | Sidebar and sections (grouped, icons, accordion) | DONE | zenotians-sidebar.test.tsx (17) | Browser |
| Z-2 | Repo stats on the page | DONE | scripts/repo-stats.mjs, generated/repo-stats.test.mjs | Regenerated by `npm run build` (prebuild) |
| Z-3 | Two sections removed, old URLs redirect | DONE | zenotians.test.tsx; website/tests/test_zenotians.py ran | none |
| Z-4 | Five Zenoti leaders | DONE | zenotians-leaders.test.tsx; test_zenotians.py ran | Optional leader photos (only with permission) |
| Z-5 | Page-scoped type sizes | DONE | pages/zenotians/typography.test.ts | Browser |
| Z-6 | Aviatrix removed (seed + data migration 0007) | DONE | zenotians-sidebar.test.tsx "no Aviatrix"; test_zenotians.py ran | none |
| U-ANIM | Zenotians entrance animation | DONE | pages/zenotians/reveal.test.tsx (21) | Browser |
| B2-1 | Glass recipe | DONE | design/photo-contrast.test.ts | Browser |
| B2-2 | Mobile images (portrait/landscape slots) | DONE | ArtImage.responsive.test.tsx, viewport-image.test.tsx | Browser |
| B2-3 | Division hero for Salon, Spa, Parlor | DONE | home/DivisionHero.test.tsx, hero-contrast.test.ts | Browser |
| B2-4 | Zenotians sidebar scrollbar test | DONE | zenotians-sidebar.test.tsx | none |
| IMG-1 | Image optimizer, srcset, budgets | DONE | scripts/photos-optimize.mjs, design/image-budget.test.ts | none |
| IMG-2 | Every cover photo within budget | PARTIAL | `npm run images:budget` reports 35 over-scaled combinations (docs/IMAGE_QUALITY.md) | Larger source photos from you, then `npm run photos:optimize` |
| IMG-3 | Image-quality browser test | UNVERIFIED | e2e/image-quality.e2e.ts | Playwright |
| LOAD | Load test files (locust) | UNVERIFIED | backend/loadtest/*, docs/LOAD_TEST.md; ruff clean | Run on PC with PostgreSQL |
| U-12 | The 12 usability fixes (brief A) | NOT STARTED | No code or notes for it | Your brief, if still wanted |

### AIR (Alankar Intelligence Receptionist)

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| AIR-1 | Foundation: desk cover, AIR as a limited actor, holds, payment-link lifecycle, append-only AIActionLog, undo | DONE | air/tests: test_cover, test_policy, test_holds_and_links, test_handover_and_log ran | none |
| AIR-1b | PostgreSQL exclusion constraints and real races on holds | UNVERIFIED | air/migrations/0001 (btree_gist); 9 PostgreSQL-only tests skipped here | pytest on PostgreSQL |
| AIR-2 | Optional AI layer: adapter, orchestrator, redaction, consent, caps, breaker; OFF by default | DONE | air/tests/test_llm.py, test_admin_api_and_off.py ran (fake provider) | none |
| AIR-2b | Real provider and AI-mode accuracy | UNVERIFIED | scripts/air_live_eval.py | Your key; never needed for the demo |
| AIR-3 | Customer chat (rules: English, Hinglish, Telugu in English letters), orders, talk to a person | DONE | test_chat_flow, test_customer_side, test_orders, test_eval ran (54/55, 41/45) | Frontend: row AIR-3f |
| AIR-3f | Chat widget, consent card, callback panel (frontend) | UNVERIFIED | ChatWidget.test.tsx, AiHelpCard.test.tsx, CallbackPanel.test.tsx; e2e air-widget | `npm test` on PC; Playwright |
| AIR-4 | Statistics, needs-you, AIR Activity (backend) | DONE | air/tests/test_desk_stats.py (45) ran | none |
| AIR-4f | AIR Activity page, receptionist popup, spoken summary (frontend) | UNVERIFIED | Air.test.tsx, air-data.test.ts, AirActivityPage.test.tsx; e2e air-dashboard | `npm test` on PC (needs axe-core); Playwright |
| AIR-5 | Desk cover for booking-form requests (bug fix), sweeper, diagnose command, status endpoint | DONE | air/tests/test_desk_cover.py ran | none |
| AIR-6 | AIR pose pictures | PARTIAL | 13 poses present; `air.webp` (default) missing, idle pose is the fallback | Your default AIR picture |
| WHO | Who accepted my request, timeline, sorry notes everywhere | DONE | air/tests/test_who_accepted.py (30) ran; booking.test.tsx (timeline, sorry note) | Browser |
| ANY | "Any stylist": rules pick a free stylist, hold, reassign up to 2 times, staff reassign, history | DONE | air/tests/test_any_stylist.py ran (2 PostgreSQL-only skipped); booking.test.tsx | Races on PostgreSQL |
| LOGO-1 | Logo splash, navbar home button, loader, favicon | DONE | components/brand/brand.test.tsx (23) | Browser |
| LOGO-2 | Phone home-screen icon | DONE | public/brand/alankar-logo-180.png and -512.png (rendered from the SVG this pass), apple-touch-icon in index.html | none |
| LOGO-3 | Splash browser checks (CLS, axe) | UNVERIFIED | e2e/splash.e2e.ts (fixed 2026-11-10 from your run) | Playwright re-run |
| X-POL | policy.json deny-by-default, every endpoint as every role | DONE | core/tests/test_policy.py, test_sweep.py ran | none |
| X-LOCK | No LLM code outside AIR | DONE | Re-grepped 2026-11-11: no openai/anthropic/ollama/torch/sklearn/langchain imports; the only provider URL is backend/air/llm/providers.py; no such package in requirements or package.json | none |

### The admin assistant (Task 10) and other large items

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| AI-A | Scope and refusal | NOT STARTED | none | Build |
| AI-B | learn_daily | NOT STARTED | none | Build |
| AI-C | Question answering over shop data for the admin | PARTIAL | Public chatbot answers shop questions; nothing for admin data | Build |
| AI-D | 25+ business rules | PARTIAL | Public engine has 42 intents; the admin rules do not exist | Build |
| AI-E | Plans | NOT STARTED | none | Build |
| AI-F | Daily briefing for the admin | PARTIAL | The receptionist's AIR spoken summary exists (air/briefing.py); no admin briefing | Build |
| AI-G | Commands with confirmation | NOT STARTED | none | Build |
| AI-H | Assistant UI | NOT STARTED | none | Build |
| AI-I | Assistant tests | NOT STARTED | none | Build |
| AI-J | Chatbot accuracy report, tuning and holdout sets | DONE | chatbot/tests/test_accuracy.py ran | none |
| IMG-AI | Optional image AI | NOT STARTED | none (real photos only rule) | Your decision |

### Mobile, demo, quality, operations

| ID | Item | Status | Evidence | Missing |
|---|---|---|---|---|
| MOB-1 | Mobile fixes: safe areas, 16 px fields, 44 px touch targets, dvh, wrapping | DONE | docs/MOBILE_AUDIT.md; vitest 2026-11-10; ESLint/tsc clean | Browser |
| MOB-2 | Mobile Playwright matrix (5 devices, every route and role) | UNVERIFIED | e2e/mobile-matrix.e2e.ts | Playwright on PC |
| DEMO | One-command demo: every role, services, stylists with weekly hours, products, every request state, AIR activity | DONE | core/demo.py, core/demo_story.py; core/tests/test_demo.py (4, incl. the new test_the_demo_shows_every_request_state_shifts_and_air) ran | none |
| SEC-1 | No secrets in repo or bundle; .env ignored; .env.example complete with empty secrets | DONE | git grep for key patterns (only a fake test key); `.env` and `backend/.env` ignored; three .env.example files | none |
| SEC-2 | Production settings and deploy_check | DONE | DEBUG defaults to false; Secure, HttpOnly, SameSite cookies; HSTS; deploy_check passed (2 warnings) | Run again with your real production .env |
| SEC-3 | npm audit and pip-audit | UNVERIFIED | no registry access here | Commands in docs/FINAL_TEST_PLAN.md |
| LINT | ruff, ESLint, TypeScript, Prettier | DONE | All clean on 2026-11-11 | none |
| BUILD | `npm run build` | UNVERIFIED | not run here | Your PC |
| E2E | Playwright desktop suite and axe (O-3 axe, O-4 sidebar phone, O-5 chat photos, O-6 full workflow) | UNVERIFIED | 18 e2e files; your last run had 6 failures, all fixed on 2026-11-10 | Re-run on PC |
| O-1 | Weekly-hours test weekday-agnostic | DONE | people/tests/test_admin_team.py ran | none |
| O-2 | DB teardown warning | PARTIAL | conftest.py fixtures; documented in PROGRESS | Check on PostgreSQL |
| O-7 | Resume TODOs | NOT STARTED | Only you can supply them | Your input |
| CLN | Repo cleanup | DONE | Section 4 | none |

## 3. Large items left (not started on purpose)

| Item | One-line scope | Estimate |
|---|---|---|
| T10 Admin assistant ("Alankar Intelligence" for the admin), AI-A to AI-I | Rule-based admin chat over shop data: scope and refusal, 25+ business rules, question answering, plans, commands that ask for confirmation and are audited, UI, tests, accuracy report | 4 to 6 working days |
| learn_daily + daily briefing | A nightly job that recomputes per-service and per-stylist baselines and an admin morning summary (counts only), reusing AIR's briefing template style | 1.5 to 2 days (after T10) |
| T12 Deployment | Hosting for Django + Daphne + PostgreSQL (with btree_gist) and the static frontend, HTTPS, a shared cache and channel layer (Redis), backups, monitoring | 2 to 3 days plus your hosting accounts |
| Optional image AI | Not designed; it would break the "real photos only" rule, so it needs a decision first | Decision first, then 2+ days |
| U-12 Usability fixes (brief A) | The 12 findings from your separate brief | About 1 to 2 days once you send it |
| IMG-2 Better photos | Replace low-resolution source photos and re-run the optimizer | Your photos, then 30 minutes |

## 4. Cleanup and fixes in this pass

- Deleted (obvious junk, with your delete approval): the stray root file
  `k cover for booking-form requests, sweeper, diagnostics, status box"` (a pasted `git diff --stat`)
  and `backend/air/tests/test_zz_dbg.py` (an empty debugging file I left in AIR task 2).
- Not deleted, your decision (not obviously generated):
  - `frontend/src/hooks/useScrollProgress.ts` (nothing imports it),
  - `frontend/src/pages/public/ZenotiansPage.tsx` (nothing imports it; the page lives in `pages/zenotians/`),
  - `frontend/photos-originals/_sheet.png` (722,923 bytes).
- No TODO/FIXME, debug prints or `console.log` in app code (CLI scripts and one e2e summary print on purpose).
- ruff: `shop` and `notifications` added to the known first-party packages; imports sorted in 21
  files; 5 long lines wrapped; `air/tests/*` allowed to redefine pytest fixtures like the other test
  folders. Prettier: `src/generated/` is now ignored (the photo-stats check compares exact text).

## 5. Docs made true

- PRESENTATION_NOTES, QA_PREP (questions 7, 8, 27), ENGINEERING_DECISIONS: AIR's holds DO use
  PostgreSQL exclusion constraints (btree_gist); bookings use row locks; the LLM is optional and off.
- MASTER_NOTES (deployment plan, UPDATE 3, demo flow) and PROJECT_SETUP: notes that the "no
  LLM" rule was narrowed for AIR only, and that there is no admin assistant.
- The For Zenotians seed was already true (AIR off by default, simulated payments and texts, no real
  phone calls, measured numbers, no admin assistant) and was not changed. "Aviatrix" now appears only
  in the data migration that removes it, the tests that check it is gone, and PROGRESS history.

## 6. Things only you can do

- Run docs/FINAL_TEST_PLAN.md on your PC and paste any failures.
- git commit and push (and add a remote: `git remote -v` prints nothing).
- Photos: better source photos, `air.webp`, any missing Meera poses.
- Decide on the large items in section 3.
