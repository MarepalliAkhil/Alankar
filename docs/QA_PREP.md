# QA_PREP: forty questions you may be asked about Alankar

Prepared for the walk-through of the For Zenotians page. Answers are written in the first person so they can be said aloud. Everything here comes from the code, the tests or the docs in this repository; the file named after each answer is where to look. Where I could not check something in the build environment it says **verify before presenting**.

How to use it: read the short answer first, then the follow-up if the person keeps pushing. If you do not know, say "I have not measured that" and point to the Limitations page. That is a better answer than a guess.

Numbers move. Run `node scripts/repo-stats.mjs` (or `npm run build` in `frontend`) before presenting and quote what it prints. At the time of writing: 69 pages, 259 API endpoints, 1,543 automated tests (984 backend, 496 front-end unit, 63 end-to-end), 96 migrations, 43 screens scanned for accessibility, 4 roles. Chatbot accuracy: 130 of 143 (90.9%) on the tuning set, 67 of 91 (73.6%) on the holdout set, measured on 5 November 2026.

---

## A. Architecture

**1. Give me the architecture in thirty seconds.**
A Django 5 and Django REST Framework server with PostgreSQL, and a React 18 + TypeScript front end built with Vite. Four roles (customer, receptionist, stylist, admin) are defined in one JSON file, `shared/policy.json`, which both sides read: the front end builds menus and route guards from it, and the server maps every API action to it and denies anything it does not know. Sign-in uses cookies (not local storage). Live chat uses Django Channels.
*Where:* `shared/policy.json`, `backend/core/policy.py`, `frontend/src/policy/policy.ts`.

**2. Why one policy file instead of checking permissions in each view?**
Because the failure I was worried about was a role seeing something it should not, and that failure hides in the places nobody looked. With one file, a test can walk every endpoint as a guest and as each role and fail if an endpoint has no policy entry. An endpoint with no known action is denied by default.
*Follow-up: "So a new endpoint is safe automatically?" It is denied automatically, which is safe but not useful: the developer must add it to the file. The sweep test fails until they do.*
*Where:* `backend/core/tests/test_sweep.py`.

**3. Why PostgreSQL and not SQLite?**
The booking rules depend on row locks and real transactions, and I wanted the tests to run on the database I would deploy on. SQLite would have hidden the concurrency behaviour I was trying to prove.
*Where:* `backend/scheduling/booking.py`, `backend/billing/tests/test_concurrency_8b.py`.

**4. Why is the page content stored in the database?**
Because the shop owner should be able to edit public content and the For Zenotians page without a developer. Content blocks have draft, publish and an audit entry. The For Zenotians page is one such block, so I (as the admin) can fix a sentence without a deploy.
*Follow-up: "Then how do you know the claims stay true?" A test checks that every code pointer on the page is a real file, and that the accuracy numbers equal a fresh measurement. Free-text claims are checked by me, which is a weakness; see question 40.*
*Where:* `backend/website/content_admin.py`, `backend/website/tests/test_zenotians.py`.

**5. Why a modular monolith and not microservices?**
One shop, one team, one database. Splitting would add network failure modes and no benefit I could show. The Django apps (accounts, scheduling, billing, chat, chatbot, inventory, people, website, core) are the seams I would cut along if I ever had to.
*Where:* `backend/` folder layout.

---

## B. Booking concurrency and dual approval

**6. How do you prevent double booking?**
Creating or moving a booking runs in one transaction that locks the stylist and room rows with `select_for_update` and checks for overlap. A clash returns HTTP 409 with the three nearest free times. A pending request already holds its slot, so nobody else can take it while the shop decides.
*Where:* `backend/scheduling/booking.py`; test `test_two_desks_cannot_confirm_overlapping_visits_for_one_stylist`.

**7. Why not a database exclusion constraint?**
It needs the `btree_gist` extension, which an ordinary database user cannot install, and I did not want the project to require a privileged database role. So row locks do the job, and a read-only integrity command reports any overlap that slipped through. That is a deliberate trade-off, and I say so on the Engineering decisions page.
*Where:* `backend/core/integrity.py`.
*Follow-up: "So there is no database-level guarantee?" Correct. The guarantee is in the application's locked transaction plus the integrity check. A direct SQL write that bypassed the application could create an overlap.*

**8. Explain the two-yes approval.**
A booking request carries two answers, one for the front desk and one for the stylist. Each can accept or decline. Only when both have accepted does it move to awaiting payment and a payment link goes out. The receptionist can pick the stylist for an "any stylist" request and can hand a request to another stylist, but can never accept on the stylist's behalf.
*Where:* `backend/scheduling/approvals.py`, `backend/scheduling/tests/test_dual_approval.py`.

**9. What if the stylist never answers?**
The request expires after the approval window (24 hours unless the admin changes it). The side that has not answered is reminded after 2 hours and after 12 hours, and the slot is released on expiry. The expiry job is safe to run twice (there is a test for that).
*Follow-up: "What runs the job?" A management command that must be scheduled, for example every five minutes. **Nothing schedules it in this repository**, because there is no deployment. Without the scheduler, requests would not expire.*
*Where:* `backend/scheduling/approvals.py` (`expire_requests`), `docs/OPERATIONS.md`.

**10. Two receptionists act at the same moment. What happens?**
The second one waits on the row lock, then re-checks and sees the slot is taken or the answer has already been recorded. Answering twice changes nothing (idempotent), and a stylist's accept is blocked if they are no longer free. These cases have tests.
*Where:* `test_answering_twice_changes_nothing`, `test_stylist_accept_is_blocked_when_they_are_no_longer_free`, `test_the_same_visit_billed_from_two_desks_makes_one_invoice`.

**11. The stylist declines. What does the customer see, and what does the stylist's reason do?**
The customer gets a kind note (in the app, by email and by simulated text) and a button that opens the booking form with the service and options already filled in. The stylist's reason is private: only that stylist and the front desk can read it. The customer never sees it. Nobody can override a decline; the request can be handed to another stylist, which is a new answer from that stylist.
*Where:* `test_stylist_decline_means_no_booking_and_a_polite_message_without_the_reason`, `test_the_private_reason_is_visible_only_to_the_desk_and_that_stylist`.

---

## C. Security and privacy

**12. How is data protected at rest?**
Contact phone, allergies, notes and chat messages and photos are encrypted with AES-256-GCM, tied to their column. Phone search uses a keyed hash (a blind index), so the number is not stored in the clear. Chat uses a key derived per conversation. Passwords use Argon2.
*Where:* `backend/core/crypto.py`, `backend/core/fields.py`, `backend/chat/models.py`.

**13. Where is the key, and who can read the data?**
The key is in the server's settings file (`.env`), which is not committed. Whoever has the key and the database can read those fields. This is not end-to-end encryption, and I do not claim it is. The admin has no chat screen, but that is a rule of the application, not a technical barrier.
*Where:* `backend/core/crypto.py`; Limitations → Encryption.

**14. Someone steals a customer's trusted device. What can they do?**
"Remember this device" skips the emailed sign-in code for 30 days on one browser and nothing else. The password is always checked first, and sensitive actions ask for a fresh code. The browser holds a random 256-bit token; the server keeps only its hash and rotates it on every use, and an old token coming back cancels that device. What I cannot do is notice the theft before the token is used or expires.
*Follow-up: "So with the password and the device, they are in?" Yes, for ordinary actions. Sensitive actions still need a code from the customer's mailbox.*
*Where:* `backend/accounts/trusted.py`, `backend/accounts/stepup.py`, `backend/accounts/tests/test_trusted_devices.py`.

**15. Brute force and lockout.**
Five failed attempts lock the account for 15 minutes, and auth endpoints are rate limited. The cost is that anyone who knows an email address can lock that person out for 15 minutes by typing wrong passwords. I list that on the Limitations page rather than hide it.
*Where:* `backend/accounts/lockout.py`.

**16. Do staff have two-factor authentication?**
Only the admin can add an authenticator-app code. Receptionists and stylists sign in with a password alone. That is a gap, listed as out of scope.
*Where:* Limitations → Sign-in. (**Note:** an older line in `docs/PROGRESS.md` for Task 13D says staff always get the emailed code; the code does not do that. Trust the code and the Limitations page; correct the progress note.)

**17. What did security testing actually find?**
Among others: a forged forwarding header that bypassed every rate limit, a staff invite that survived the person's deactivation, a banner link that could carry `javascript:`, reset links that two simultaneous clicks could both use, and access tokens that outlived a password change. Each was fixed and has a test.
*Where:* `docs/SECURITY.md`, `backend/accounts/tests/test_hardening.py`.

**18. How do you handle customer data rights?**
A customer can download their data or ask to be anonymized (invoice amounts are kept). Chat photos are wiped 30 days after a conversation closes, or at once when the sender deletes one. Audit logs are never removed. I am not a lawyer; this is not a statement of legal compliance in any country.
*Where:* `backend/people/privacy.py`, `backend/chat/images.py`, `backend/core/jobs.py`.

**19. Are there dependency vulnerabilities?**
At the audits of 28 and 29 October 2026, Django and Django REST framework were upgraded to fixed versions. Still open at that date: Twisted (via Daphne) with no stable fix yet, and react-router, zod and the dev tools vite and vitest, whose fixes are breaking major upgrades. **Verify before presenting:** run `scripts/audit.sh` again; the state will have moved.
*Where:* `docs/SECURITY.md`, `scripts/audit.sh`.

---

## D. Testing

**20. How many tests do you have, and how do you know the number is right?**
The count comes from `scripts/repo-stats.mjs`, which counts test functions in the repository (pytest `def test_`, Vitest `it`/`test`, Playwright `test`). A test fails if the stored `repo-stats.json` is out of date. It counts test functions, not test runs: a parametrized test counts once.
*Where:* `scripts/repo-stats.mjs`, `frontend/src/generated/repo-stats.test.mjs`.

**21. Do the tests cover denied actions, or only the happy path?**
Both, by design: every role has tests for allowed and denied actions, including direct URL access and direct API calls with other people's ids. The sweep test walks every endpoint as a guest and as each role.
*Where:* `backend/core/tests/test_sweep.py`.

**22. Did you test accessibility?**
axe-core scans 43 listed screens for WCAG 2.1 A and AA violations in the end-to-end suite. An automated scan finds only part of the problems a person would; I have not tested with real screen readers. **Verify before presenting:** axe cannot run in the build sandbox; run `npx playwright test` on your machine and quote the real result. The last full run I saw had failures that I had since tried to fix, and I have not seen a passing run.
*Where:* `frontend/e2e/axe.e2e.ts`, `frontend/e2e/pages.ts`.

**23. Which browsers and devices did you test?**
Chromium at 1280 × 900, plus phone-width checks at 375 pixels. Not Firefox, not Safari, not real phones.
*Where:* `frontend/playwright.config.ts`; Limitations → Browsers.

---

## E. Chatbot and assistants

**24. Why is the chatbot not an LLM?**
Because it answers about a customer's own bookings, invoices and points, and I wanted every answer to be explainable, testable and incapable of drifting into another person's data. It is a deterministic rule engine: it answers only from the shop's own content and the signed-in person's own records, and when it does not know it says so and gives the shop's contact details. The cost is flexibility, and the accuracy numbers show that cost.
*Follow-up: "Isn't that just a worse product?" For open conversation, yes. For a salon front desk question with a known answer, a wrong or invented answer is worse than "I don't know, here is the phone number".*
*Where:* `docs/CHATBOT_ALGORITHM.md`, `backend/chatbot/engine/`.

**25. How accurate is it?**
On questions I wrote myself: 130 of 143 (90.9%) on the set it was tuned on, and 67 of 91 (73.6%) on a holdout set kept apart from the tuning, measured on 5 November 2026. The holdout is the honest number, and it is also written by me, so real customers will likely do worse.

**26. How do I know those accuracy numbers are real?**
They sit on the page next to a test that measures them again and fails if they differ. So the page cannot drift from the code. What it cannot tell you is how the bot does on real customers' questions; I have not measured that.
*Where:* `backend/chatbot/tests/test_accuracy.py` (`test_the_numbers_on_the_zenotians_page_are_the_measured_ones`).
*Follow-up: "Isn't tuning on 143 questions and testing on 91 more still small?" Yes. Both sets are small and written by one person.*

**27. Is there an admin assistant?**
No. The admin side has shop statistics and a list of questions the bot could not answer. I do not describe any assistant feature as planned.
*Where:* Limitations → The chatbot and the admin side.

**28. Can the chatbot leak another customer's data?**
It reads the signed-in customer's own records only, and a guest gets only public content. Tests cover a customer seeing only their own records, a guest or stranger seeing none, and prompt-injection style questions leaking nothing. These tests were passing in my last backend run; re-run them before presenting.
*Where:* `backend/chatbot/tests/test_api.py` (`test_a_customer_sees_their_own_records_and_a_guest_or_stranger_does_not`, `test_prompt_injection_cannot_reach_other_peoples_data`), `backend/chatbot/tests/test_engine.py` (`test_user_sees_only_own_data`, `test_injection_leaks_nothing`).

---

## F. Payments and notifications (simulated)

**29. Are the payments real?**
No. Online payments go through one simulated gateway that approves or declines and returns a MOCK reference; nothing is charged. At the desk, the receptionist records cash, card or UPI after the money has changed hands. Refunds are approved by the admin and recorded; they do not send money anywhere.
*Where:* `backend/billing/tender.py`, `backend/billing/refunds.py`.

**30. Are emails and texts real?**
Every email is saved in an outbox and sent by SMTP only if a mail server is configured; otherwise it stays on the machine. Text messages are written to a table and never sent. There is no WhatsApp code at all (an earlier draft of the page implied otherwise; it was corrected).
*Where:* `backend/core/mail.py`, `backend/notifications/service.py`.

**31. Why can invoices not be edited?**
A paid invoice is never edited; a correction is a refund approved by the admin. Stock is a ledger of movements so every quantity can be explained from history. A rating is immutable and feeds the stylist's pay multiplier.
*Where:* `backend/billing/models.py`, `backend/inventory/models.py`.

---

## G. Scaling and deployment

**32. How many users can it handle?**
I do not know. I have not run a load test, so I make no claim. What I measured: tests fix the number of database queries behind the main lists, and two desks acting together are tested. On the demo database the shop-statistics page took 61 queries and 0.1 to 0.3 seconds in one run in the build environment. **Verify before presenting:** that is a single sandbox run, not a benchmark.
*Where:* `backend/core/tests/test_query_counts.py`.

**33. Could you run two server processes?**
Not safely as it stands. Rate limits and live chat keep their state in the memory of one process, and Redis is not set up. Moving that state out is the first scaling task.
*Where:* `docs/SECURITY.md`; Limitations → Load and scale.

**34. Is it deployed?**
No. It runs on a developer machine with PostgreSQL. There are commands for timed jobs, backup, restore into a new database, an integrity check and a production-settings check. HTTPS, a backup schedule, monitoring and alerts are not set up.
*Where:* `docs/OPERATIONS.md`, `backend/core/deploycheck.py`.

---

## H. Product and the Zenoti mapping

**35. Why a single shop?**
One shop keeps every rule checkable: one set of prices, stylists and rooms, one cash close. Multi-branch adds questions about who sees which branch, how stock moves and how staff are shared. I would rather show one flow that works end to end and say so.
*Where:* Limitations → One shop only.

**36. How does this map to Zenoti, and what are you not claiming?**
The mapping table pairs twelve workflows with what I built and what is out of scope. I only used public information from Zenoti's own site, each with its link and the date I checked it. I make no claim about how Zenoti is built internally. The project is independent and not affiliated with Zenoti.
*Where:* the How it maps to Zenoti page; `backend/website/zenotians_seed.py`.

**37. Could a real shop use this today?**
No. It has no live deployment, no real payment gateway or messaging, no load test and some open dependency advisories. It shows how the workflow and safeguards fit together; it is not a finished product.

---

## I. What I would do differently

**38. What would you change first?**
Three things, in order: put the timed jobs (expiry, reminders, clean-up) under a real scheduler with monitoring, because a request never expiring is the most likely real-world failure; move rate limits and chat state out of process memory; and add two-step sign-in for receptionists and stylists.

**39. What was the biggest mistake in the build?**
Documentation drifting from the code. I found a stale line in `docs/SECURITY.md` claiming there are no file-upload endpoints (chat photos exist) and a progress note claiming staff always get the emailed code (they do not). That is why the Zenotians page now has tests that tie pointers and numbers to reality.
*Where:* `docs/SECURITY.md`, `docs/PROGRESS.md`.

**40. What claim on your page is hardest to check?**
The free-text ones. A test proves a file exists and a number matches, but it cannot prove a sentence about behaviour is true. I checked each sentence against the code when I wrote it; the sentences marked **verify before presenting** in these notes are the ones I could not re-run in my environment.

---

### Quick list: verify before presenting

1. Run `npx playwright test` including `axe.e2e.ts` on your machine; quote the actual pass/fail. (Not run in the sandbox.)
2. Re-run `scripts/audit.sh`; dependency advisories change daily.
3. Re-run `node scripts/repo-stats.mjs` and quote its numbers, not the ones in this file.
4. Re-run `backend/chatbot/tests/test_accuracy.py`; quote its numbers if they differ.
5. The "61 queries, 0.1 to 0.3 seconds" figure is one sandbox run, not a benchmark.
6. Zenoti facts were read on 30 October 2026; re-check the links before quoting them.
7. Your own reasons for choosing this stack are yours to state; the page gives only what the code shows.
8. Confirm the For Zenotians page loads from your own seeded database after `python manage.py migrate`.
