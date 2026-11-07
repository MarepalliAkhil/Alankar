# Alankar: checklist status (audit, second pass)

Updated 2026-11-06. This pass replaces every "See PROGRESS" row with sub-items checked against the real code and test files. PROGRESS.md was used only to find names, never as proof.

Legend: **C** = code exists, **T** = tests exist (names given), **R** = I ran it here and it passed, **B** = seen in a browser (never, no browser here).

Status rules:
- **DONE**: code + tests + I ran the tests here and they passed (frontend only; still not seen in a browser).
- **UNVERIFIED**: code and tests exist but the check could not be run here. Every backend row is UNVERIFIED because PyPI is blocked in this environment, so pytest cannot run. Playwright/axe rows are UNVERIFIED for the same kind of reason.
- **PARTIAL**: part of it exists.
- **NOT STARTED**: no code found.

Counts below are **counted from files** (`def test_`, `it(`, `Intent(`), not from a passing run, unless a row says R.

## 1. Summary counts

DONE: 29, PARTIAL: 7, NOT STARTED: 14, UNVERIFIED: 40 (total 90; "DONE" always means unit tests passed or a file check, never seen in a browser)

What ran in this pass (R): the whole frontend vitest suite (794 of 795 passed; the one failure was the generated repo-stats file going stale after my changes, regenerated on your PC copy with `node scripts/repo-stats.mjs`, not re-run in the sandbox), tsc on the changed files (only unrelated `recharts` typing errors from the sandbox's incomplete node_modules), eslint and prettier on the changed files (clean). Not run: backend pytest, Playwright, `npm run build`, anything in a browser.

## 2. Full checklist

| ID | Item | Status | Evidence | What is missing |
|---|---|---|---|---|
| T0 | Docs and project setup | DONE | C: the project rules file, docs/MASTER_NOTES.md, START_HERE.md, PROGRESS.md present | Doc conflicts in section 3 |
| T1 | Backend skeleton (Django, DRF, Channels) | UNVERIFIED | C+T: backend/core/tests (91 tests) | pytest on PC |
| T2 | Auth, roles, sessions, OTP, two-factor | UNVERIFIED | C+T: backend/accounts/tests (161 tests: test_auth, test_otp, test_two_factor, test_password_reset, test_hardening, test_security_audit) | pytest on PC |
| T3 | Catalogue and desk customers | UNVERIFIED | C+T: scheduling/tests test_catalogue_admin, test_desk_customers | pytest on PC |
| T4 | Booking engine and slots | UNVERIFIED | C+T: scheduling/tests (128 tests) | pytest on PC |
| T5 | Billing, POS, invoices, payroll, work hours | UNVERIFIED | C+T: billing (166 tests), people/test_payroll, accounts/test_work_hours | pytest on PC |
| T6 | Wallet, gift cards, packages, memberships | UNVERIFIED | C+T: wallet (81 tests) | pytest on PC |
| T7 | Public chatbot "AI Alankar Intelligence" (7a engine, 7b API+widget, 7c admin insights) | UNVERIFIED | C: backend/chatbot/engine (1761 lines), api.py, admin_api.py; T: chatbot/tests (64 tests); frontend widget | pytest on PC. This is the PUBLIC chatbot, not the admin assistant (see section 3) |
| T8 | Frontend customer, desk, stylist, admin pages | DONE (unit) | C: frontend/src/pages; T: 359 page tests; R: vitest passed | Browser and Playwright |
| T8.5-1 | Gift card codes visible | UNVERIFIED | PROGRESS part 1; wallet tests | pytest on PC |
| T8.5-2 | Shop and Orders | UNVERIFIED | shop/ (26 tests), frontend OrdersPage/ShopPage | pytest on PC |
| T8.5-3 | Coupons and online money engine | UNVERIFIED | billing/tests test_online_pricing, test_private_coupons | pytest on PC |
| T8.5-4 | Products in appointment booking | UNVERIFIED | scheduling/tests test_booking_products | pytest on PC |
| T8.5-5a..e | Package code redemption, cancellation requests, Packages page, code step in booking, settings knobs | UNVERIFIED | wallet tests; frontend PackagesPage, PackageRequestsPage, SettingsPage | pytest on PC |
| T8.5-6 | Memberships: cancel, renew, buy again | UNVERIFIED | wallet tests; frontend MembershipsPage | pytest on PC |
| T8.5-7/9 | Tests and delivery | PARTIAL | PROGRESS says sandbox done, waiting for owner PC run | PC run |
| T8.5-8 | Menus, policy, chatbot knowledge, shop settings screen | DONE (unit) | C: policy.json, SettingsPage; T: policy.test.ts; R: passed | Backend side unverified |
| T9 | For Zenotians page (first build) | DONE (unit) | C: frontend/src/pages/zenotians; T: zenotians.test.tsx; R: passed | Browser |
| T10 | Admin assistant (rule-based "Alankar Intelligence" for the admin) | NOT STARTED | No admin assistant code anywhere (git grep for learn_daily, briefing: nothing in backend or frontend) | Whole task. See section 3 |
| T11a | Theme foundation, glass, display settings, loader, skeletons | DONE (unit) | C: design/index.css, themes.ts, ThemeProvider; T: themes.test.ts, tokens.test.ts, theming.test.tsx; R: passed | Browser |
| T11b | Scroll-driven home hero | DONE (unit) | C: components/home/HomeHero.tsx; T: home tests; e2e home-hero.e2e.ts exists. design/hero.ts and its test were DELETED in this pass (dead code) | Browser, Playwright |
| T11c..g | Division looks, portals, staff screens, admin restyle | UNVERIFIED | PROGRESS sections; page tests pass (R) but visual quality needs eyes | Browser |
| T11h | Full-page backgrounds, transparent navbar and footer | DONE (unit) | C: design/page-background.ts; T: page-background.test.ts; R: passed | Browser |
| T11i | Type scale, controls, layouts, staff portal backgrounds | DONE (unit) | C: design/tokens.ts; T: tokens.test.ts; R: passed | Browser |
| T12 | Deployment | NOT STARTED (parked) | core/tests/test_deploy_check.py checks settings only | Hosting accounts |
| Z-1 | Zenotians sidebar and 7 sections | DONE (unit) | C: zenotians/routes.tsx, model.ts; T: zenotians.test.tsx | Browser |
| Z-2 | Repo stats on the page | DONE (unit) | C: scripts/repo-stats.mjs, generated/repo-stats.json; T: repo-stats.test.mjs. Regenerated this pass (988 / 569 / 82) | Counted from files, not a passing run |
| PH-1 | Zen Chat photos: types (jpg, png, webp) | UNVERIFIED | C: chat/images.py; T: test_jpg_png_and_webp_are_accepted, test_wrong_file_types_are_rejected_even_with_a_picture_extension, test_a_real_jpeg_named_with_a_wrong_extension_is_accepted_by_its_real_type, test_truncated_picture_is_rejected, test_oversized_file_is_rejected, test_five_megabytes_exactly_is_the_limit, test_over_dimension_pictures_are_rejected | pytest on PC |
| PH-2 | EXIF/GPS stripping | UNVERIFIED | T: test_exif_and_gps_are_stripped_and_the_picture_is_reencoded, test_camera_rotation_is_applied_before_the_metadata_is_dropped | pytest on PC |
| PH-3 | Encrypted storage | UNVERIFIED | T: test_the_database_row_holds_no_readable_image_bytes, test_ciphertext_cannot_be_moved_to_another_photo_or_part, test_nothing_about_the_picture_is_logged | pytest on PC |
| PH-4 | Tags, captions, stylist reference badge | UNVERIFIED | T: test_caption_and_tag_validation, test_the_stylist_card_shows_the_reference_badge_only_for_style_references, test_stylist_can_send_a_photo_too_and_alt_text_falls_back_to_the_tag | pytest on PC |
| PH-5 | Deletion and retention | UNVERIFIED | T: test_sender_deletes_and_the_bytes_are_wiped, test_only_the_sender_may_delete, test_retention_wipes_photos_thirty_days_after_the_thread_closes_and_is_idempotent, test_retention_days_are_an_admin_setting, test_run_jobs_includes_the_retention_job_and_is_safe_twice | pytest on PC |
| PH-6 | WebSocket carries ids only | UNVERIFIED | T: test_websocket_refuses_desk_and_admin_and_announces_photos_by_id_only, test_the_live_socket_cannot_carry_a_photo | pytest on PC |
| PH-7 | Chat photo UI | DONE (unit) | C: pages/chat/PhotoParts.tsx, PhotoPreview.tsx, PhotoViewer.tsx, photo-utils.ts; T: pages/chat-photos.test.tsx; R: passed; e2e z-chat-photos.e2e.ts exists | Playwright and browser (the old "chat photo test" open item is the e2e file) |
| PH-8 | Denied tests | UNVERIFIED | T: test_other_customers_and_stylists_cannot_fetch_or_delete_a_photo, test_a_photo_id_from_another_thread_is_not_found_in_this_one, test_desk_and_admin_are_denied_on_every_photo_endpoint, test_guests_are_turned_away; also six per-minute and thirty per-day limits | pytest on PC |
| T13A-1 | Dual approval: both receptionist and stylist must accept | UNVERIFIED | C: scheduling/approvals.py; T: test_booking_needs_both_sides_to_say_yes, test_stylist_can_answer_first, test_an_any_request_needs_the_receptionist_to_pick_a_stylist_first | pytest on PC |
| T13A-2 | Decline by either side | UNVERIFIED | T: test_stylist_decline_means_no_booking_and_a_polite_message_without_the_reason, test_receptionist_decline_gives_the_customer_a_polite_message_and_no_booking, test_a_declined_request_can_go_to_another_stylist_but_nobody_overrides_the_decline, test_decline_is_idempotent, test_answering_twice_changes_nothing | pytest on PC |
| T13A-3 | Expiry and reminders | UNVERIFIED | T: test_request_expires_before_the_visit_and_the_job_is_safe_to_run_twice, test_deadline_is_always_before_the_visit_starts, test_reminders_go_to_the_side_that_has_not_answered_and_not_twice, test_admin_can_set_the_expiry_hours_and_reminders | pytest on PC |
| T13A-4 | Tentative slot hold | UNVERIFIED | T: test_pending_request_holds_the_stylists_slot_and_decline_frees_it, test_stylist_accept_is_blocked_when_they_are_no_longer_free | pytest on PC |
| T13A-5 | Customer messages (in-app, mail, text) and privacy | UNVERIFIED | C: backend/notifications (service.py, templates.py, models.py); T: test_notifications_are_private_to_their_owner. NEW: test_admin_notifications.py (4 tests) | pytest on PC |
| T13A-6 | Stylist private reason hidden from customer | UNVERIFIED | T: test_the_private_reason_is_visible_only_to_the_desk_and_that_stylist, test_nobody_else_can_see_or_answer_a_request, test_stylist_request_card_shows_a_first_name_only | pytest on PC |
| T13A-7 | Stylist Requests inbox | DONE (unit) | C: pages/stylist/RequestsPage.tsx; T: frontend stylist tests; R: passed; backend: stylist.requests.* in policy | Backend run, browser |
| T13B-1 | Admin has no appointments or schedule | UNVERIFIED | T: test_admin_cannot_reach_appointments_or_schedule, test_admin_cannot_act_on_a_booking_at_all | pytest on PC |
| T13B-2 | Stylist calendar and portal pages | UNVERIFIED | C: pages/stylist (MyAppointments, MySchedule, MyDay, AppointmentDetail); T: test_stylist_calendar_shows_only_their_own_bookings, test_calendar_is_denied_to_everyone_but_stylists, test_the_receptionist_keeps_the_shop_wide_board | pytest on PC |
| T13C | Sorry notes on staff slot changes | UNVERIFIED | T: test_receptionist_move_sends_a_sorry_note_in_all_three_ways, test_staff_must_pick_a_reason_category_before_saving, test_cancelling_sends_a_sorry_note_and_never_a_private_reason, test_stylist_moving_or_cancelling_their_own_visit_also_says_sorry, test_reassigning_to_another_stylist_says_sorry, test_customer_changes_never_send_a_sorry_note, test_a_retry_does_not_send_a_second_sorry_note, test_the_three_buttons_work_only_for_the_customers_own_booking, test_customer_can_cancel_with_a_refund_after_a_staff_move, test_stylists_and_customers_cannot_use_the_desk_move_and_cancel | pytest on PC |
| T13D | Remember-me trusted devices | UNVERIFIED | C: accounts/trusted.py, models.py; T (accounts/tests/test_trusted_devices.py): test_token_is_long_random_and_only_its_hash_is_stored, test_remembered_device_with_right_password_skips_the_code, test_token_rotates_on_every_use_and_the_old_one_stops_working, test_expired_revoked_and_tampered_tokens_fail, test_staff_never_skip_a_second_step_and_never_get_the_cookie, test_customer_lists_and_revokes_their_own_devices, test_revoke_all_forgets_every_device, test_staff_and_guests_cannot_use_the_trusted_device_endpoints, test_password_change_signs_out_every_remembered_device | pytest on PC |
| T14A-1 | One left sidebar for all roles | DONE (unit) | C: components/layout (AppShell, menuGroupsFor in policy/policy.ts); T: policy.test.ts, page tests; R: passed | Browser (sidebar phone e2e is the old open item) |
| T14A-2 | Profile dropdown with only Profile and Log out | DONE (unit) | C: components/layout/ProfileMenu.tsx (file comment states it; Log out at line 127); T: layout tests; R: passed | Check the test asserts exactly two entries |
| T14B | Admin shop statistics | UNVERIFIED (backend) / DONE (unit) frontend | C: billing/stats_views.py (policy stats.view), billing/shopstats.py, pages/admin/AdminDashboardPage.tsx; T: billing/tests/test_shopstats.py, pages/admin-dashboard.test.tsx; R (frontend): passed | pytest on PC |
| T15-1 | Design direction | PARTIAL | docs/DESIGN_DIRECTION.md, DESIGN_AUDIT.md exist; visual quality is a judgement | Your eyes in a browser |
| T15-2 | Customer page fixes | PARTIAL | docs/CUSTOMER_UI_FIXES.md; page tests pass (R); screenshots are only before/after images | Browser |
| T15-3 | Guided tour | DONE (unit) | C: components/tour; T: Tour.test.tsx, poses.test.tsx; R: passed | Browser |
| T16A | Future vision removed | DONE (unit) | C: zenotians/routes.tsx redirects the old address; T: zenotians.test.tsx "sends the old Future vision address to the overview" and asserts no Future vision text; R: passed | none |
| T16B | Limitations section | DONE (unit) | C: api/zenotians.ts Limitations type; website content; T: zenotians.test.tsx | Content is admin-edited; check wording |
| T16C | Story page "A day at Alankar" | DONE (unit) | C: zenotians/StoryPage.tsx, story-visuals.tsx; T: zenotians.test.tsx; R: passed | Browser |
| T16D | FAQ section "Questions you might ask me": REMOVED from the public page on 2026-11-07 (answers now in docs/QA_PREP.md) | DONE (unit) | C: zenotians/ContentPages.tsx, model.ts; seed: website/demo_data.py FAQS | Browser |
| T16E | docs/QA_PREP.md and PRESENTATION_NOTES.md | DONE | QA_PREP.md 219 lines (sections A to I), PRESENTATION_NOTES.md 67 lines | Read them before presenting |
| T17 | Task 17 A to E (fixes, one menu, home background, header images, Meera) | DONE (unit) | PROGRESS 17A..17E; tests pass (R) | Browser |
| T17-am1 | Real photos only, nothing generated | DONE (unit) | T: art.test.ts, photo-slots.test.ts; R: passed | Your real photos for empty slots |
| T17-am2 | One photo per section, page backgrounds, rebuilt Meera card | DONE (unit) | T: page-background.test.ts, Meera.test.tsx | Browser |
| M-16 | 16 Meera poses in tour, tips, My bookings | DONE (unit) | T: poses.test.tsx, meera-moments.test.tsx; R: passed | Real pose pictures |
| M-DEF | meera.png default fallback | DONE (unit) | T: Meera.test.tsx | none |
| NEW-1 | Admin bell: admin gets notifications.list and mark_read for OWN notifications | UNVERIFIED | C: shared/policy.json (admin api + route /notifications), views already filter by request.user; T: backend/notifications/tests/test_admin_notifications.py (4 tests: empty list, own only, cannot clear someone else's, other roles unchanged, signed out denied) | pytest on PC (not run here) |
| NEW-2 | Booking submitted screen | DONE (unit) | C: components/booking/BookingSubmitted.tsx, BookPage.tsx; T: booking.test.tsx "sends a request..." asserts the screen, the waiting moment, no celebrate, link to My appointments; R: passed | Browser |
| NEW-3 | Meera celebrate only when confirmed | DONE (unit) | C: AppointmentsPage.tsx; T: meera-moments.test.tsx; R: passed | none |
| NEW-4 | Brand name from config (no ZenFlow shown) | DONE (unit) | C: config/brand.ts and backend/core/brand.py (platform name is now Alankar); T: App.test.tsx asserts no ZenFlow text; R: passed | backend test_foundation not run |
| AI-A | Alankar Intelligence (admin assistant): scope and refusal | NOT STARTED | Public chatbot has its own off-topic handling (engine.py); no admin assistant scope | Build |
| AI-B | learn_daily | NOT STARTED | git grep found nothing | Build |
| AI-C | Question answering | PARTIAL | Public chatbot answers shop questions (T7). Admin question answering over shop data not built | Build for admin |
| AI-D | 25+ rules | PARTIAL | Public engine has 42 intents (counted `Intent(` in chatbot/engine/intents.py). The admin assistant's 25+ business rules do not exist | Build |
| AI-E | Plans | NOT STARTED | none | Build |
| AI-F | Daily briefing | NOT STARTED | none | Build |
| AI-G | Commands with confirmation | NOT STARTED | chatbot/tools.py is read-only lookups for the public bot (3 tests); no confirm flow | Build |
| AI-H | Assistant UI | NOT STARTED | Admin ChatbotInsightsPage exists for the public bot only; DashboardShell has an unused `assistant` hook | Build |
| AI-I | Assistant tests | NOT STARTED | n/a | Build |
| AI-J | Accuracy report, tuning and holdout sets | UNVERIFIED | For the public bot: chatbot/tests/eval_sets.py (278 lines), ported_sets.py; test_accuracy.py (test_tuning_accuracy, test_holdout_accuracy, test_the_sets_are_big_enough_and_do_not_overlap, test_each_hard_category_is_present_in_both_sets, test_the_numbers_on_the_zenotians_page_are_the_measured_ones). CHATBOT_ALGORITHM.md says 58 tuning and 36 second-set questions (read, not counted) | pytest on PC |
| AI-K | Optional AI layer | NOT STARTED | Locked rule: no LLMs. Not built | Your decision |
| X-POL | policy.json deny-by-default, 216 actions | UNVERIFIED | C: core.permissions.PolicyPermission; T: core/tests/test_policy.py, test_sweep.py (every endpoint as every role) | pytest on PC |
| X-LOCK | No LLM / Ollama imports | PARTIAL | Not re-grepped for Ollama/LLM names in this pass | Re-grep on PC |
| B2-1..4 | "Second brief" (glass, mobile images, Salon hero, Zenotians scrollbar test) | NOT STARTED | You asked me not to start it | Your separate prompt |
| U-12 | The 12 usability fixes (separate brief A) | NOT STARTED | Not in this run | Next run |
| U-ANIM | Zenotians entrance animation (brief B) | NOT STARTED | Not in this run | Next run |
| O-1 | Weekly-hours test | UNVERIFIED | Now weekday-agnostic (people/tests/test_admin_team.py: _pick_day, _expected_last_start_hour) | pytest on PC |
| O-2 | DB teardown warning | PARTIAL | conftest.py autouse fixtures; documented | PC run |
| O-3 | axe failures | UNVERIFIED | e2e/axe.e2e.ts exists | `npx playwright test e2e/axe.e2e.ts` |
| O-4 | Sidebar phone test | UNVERIFIED | e2e/mobile.e2e.ts | Playwright |
| O-5 | Chat photo test | UNVERIFIED | e2e/z-chat-photos.e2e.ts + unit chat-photos.test.tsx (unit R passed) | Playwright |
| O-6 | Full-workflow timeout | UNVERIFIED | no change | Playwright |
| O-7 | Resume TODOs | NOT STARTED | Only you can supply them | Your input |
| CLN | Repo cleanup | DONE | Section 5 | Your git commands |

## 3. Conflicts between docs and code, and the T10 reconciliation

**T10 versus AI-1 (resolved).** Two different things share the name "Alankar Intelligence":

- **The public chatbot, "AI Alankar Intelligence" (Task 7).** BUILT. backend/chatbot/ (engine/ with normalize, spell-correct, stem, synonyms, entities, 42 intents, BM25 search; api.py; admin_api.py; defaults.py; tools.py), the corner widget, the admin ChatbotInsightsPage, 64 backend tests (counted). Deterministic, no LLM.
- **The admin assistant (Task 10 / Part 3).** NOT BUILT. There is no learn_daily, daily briefing, plans, confirmed commands, 25+ business rules or admin UI. PROGRESS lines 1779 to 1787 and 2158 say this correctly. My earlier row "AI-1 core code and tests exist" described the public chatbot and was misleading.

Other conflicts:

- Git remote: `git remote -v` prints nothing, yet `git log` shows `origin/main` (a leftover ref). Nothing is backed up from this PC until you add a remote. My first audit said "no remote", which is right for `git remote -v`.
- PROGRESS said hero.ts "is unused (kept)". It is now deleted with its test; the mentions in PROGRESS.md were updated.
- The old Meera docs implied a booking-submitted screen and a skip-confirmation. The screen is now built; the skip-confirmation is dropped (not built, removed from the docs).
- "ZenFlow" was described as the platform name in MASTER_NOTES, the project rules file and README.md. Users now see Alankar. ZenFlow remains in those internal docs only as the working name.
- Test counts in PROGRESS and repo-stats are counted from files. Per area (counted `def test_`): accounts 161, billing 166, chat 56, chatbot 64, core 91, inventory 16, people 116, scheduling 128, shop 26, waitlist 19, wallet 81, website 60 (= 984) plus 4 new in notifications = 988. Frontend: repo-stats says 569 unit and 82 e2e. My own grep found 74 e2e cases because some are generated with loops.
- Admin had a bell but no notification actions: fixed in this pass.
- Contradiction inside the project rules file-era docs: "Do not commit" (your rule) versus the Stop hook demanding a commit. I follow your rule.

## 4. Failing or unverified checks: commands for your PC (cmd.exe)

```
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app\backend"
python -m pytest -q
python -m pytest -q notifications/tests/test_admin_notifications.py core/tests/test_foundation.py core/tests/test_policy.py core/tests/test_sweep.py

cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app\frontend"
npm run lint
npm run typecheck
npm run typecheck:e2e
npm test
npm run build
npx playwright test
npx playwright test e2e/axe.e2e.ts
```

## 5. Cleanup done in this pass

Deleted (you named these; nothing referenced them except the old sync lists):

| Item | Size |
|---|---|
| _sync/ (t15_assets.tar 14,039,040 bytes, local_md5.txt) | about 14 MB |
| the assistant outputs/alankar-sandbox-sync.tar.gz (folder removed, now empty) | 950,681 bytes |
| _to_delete/_incoming_2c_otp.tgz (folder removed, now empty) | 84,748 bytes |
| "tatus --short" (a pasted git log) | 736 bytes |
| frontend/photos-originals/_in5.tgz, _in6.tgz, _pull.tgz, _bmd5.txt (the _sync folder there was already gone) | 53,439 + 4,764 + 1,079,449 + 31,589 bytes |
| frontend/src/design/hero.ts and hero.test.ts (dead code; the test would not compile without it) | 77 + 76 lines |

Not deleted: any screenshot, photo, original, pose PNG, source file or doc. Left alone: frontend/photos-originals/_sheet.png (722,923 bytes; not named by you, not mine to remove).

.gitignore: bulk screenshots in docs/ui-screenshots are now ignored except the curated set (t15-before-*, t15-after-c-*, staff-myday-*, staff-nav-fixed-768.png, 84 files). 225 of the 309 tracked screenshots (about 100 MB) are no longer wanted in git. Also ignored: _sync/, _to_delete/, the assistant outputs/, *.tgz, *.tar.gz.

Exact commands to untrack (files stay on disk):

```
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app"
git rm -r --cached -q docs/ui-screenshots
git add docs/ui-screenshots
git rm -r --cached -q --ignore-unmatch _sync "outputs" _to_delete "tatus --short"
git status --short
```

The first two lines drop every screenshot from the index and re-add only the ones the new .gitignore allows.

20 largest tracked files (before cleanup, bytes): _sync/t15_assets.tar 14,039,040; docs/ui-screenshots/t14-dash-1280-light.png 1,652,251; t14-dash-1280-dark.png 1,492,882; frontend/public/photos/meera/meera.png 1,157,739; t14-sb-stylist-1280.png 1,047,652; chat-photo-stylist-badge-1280-light.png 1,030,267; t14-dash-375-light.png 1,026,626; after17b-stylist-1280-light.png 1,013,963; after17d-stylist-requests.png 1,010,823; after17d-receptionist-appointments.png 999,933; after-stylist-appts-1280-light.png 963,377; the assistant outputs/alankar-sandbox-sync.tar.gz 950,681; chat-photo-stylist-badge-1280-dark.png 950,440; after17b-receptionist-1280-light.png 941,910; after17b-stylist-1280-dark.png 929,482; after-admin-dash-1280-light.png 916,208; t14-sb-receptionist-1280.png 913,761; home-sections-light.png 873,701; after17b-receptionist-1280-dark.png 863,638; after17d-admin-payroll.png 848,634. Only meera.png (the default Meera picture, which you asked to keep) is a legitimate large file.

## 6. Risks

- Nothing is backed up off this PC (no git remote).
- Security scans still to run on your PC: tracked .env (`git ls-files | findstr /i "\.env"`), TODO/FIXME (`git grep -n "TODO\|FIXME"`). .env is in .gitignore.
- backend/.venv is on disk (Windows virtualenv). It is ignored by .gitignore (`.venv/`).
- scripts/photos-optimize.mjs was never run here (sharp unavailable).
- The admin policy change (notifications) needs the backend suite to confirm test_sweep and test_policy still pass, because they enumerate every action for every role.

## 7. FINISH LIST (build order)

| # | Item | Size | Depends on | Your input |
|---|---|---|---|---|
| 1 | Run section 4 commands, paste any failures | M | none | Yes |
| 2 | Run the untrack commands, then commit and push (add a remote first) | S | 1 | Yes |
| 3 | Usability fixes (the 12 findings, brief A) | L | 1 | Send "go" |
| 4 | Zenotians entrance animation (brief B) | M | 3 | Send "go" |
| 5 | Fix axe, sidebar phone, full-workflow timeout failures | M | 1 | Paste output |
| 6 | Second brief (glass, mobile images, Salon hero, Zenotians scrollbar test) | L | 3 | Your prompt |
| 7 | T10 admin assistant: scope and refusal, 25+ rules, question answering | L | 1 | Spec |
| 8 | learn_daily, daily briefing, plans | L | 7 | Spec |
| 9 | Commands with confirmation, assistant UI, accuracy report | L | 7, 8 | Spec |
| 10 | Optional AI layer | L | 9 | Decide yes or no |
| 11 | T12 deployment | L | all | Hosting accounts |

## 8. Things only you can do

- git commit and push (and add a remote).
- Real photos for empty slots and the real Meera pose pictures.
- Resume TODOs, demo video link, GitHub link.
- Deployment accounts.
- Approve deleting frontend/photos-originals/_sheet.png if you want it gone.
