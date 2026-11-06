# PRESENTATION_NOTES: talking through Alankar for the Zenoti team

Two versions: a ten-minute talk (section 1) and a two-minute version (section 2). Everything said here is backed by the code, the tests or the For Zenotians page. Items marked **verify before presenting** could not be re-run in my build environment; check them on your machine first.

Alankar is an independent portfolio project, not affiliated with Zenoti. Say so in the first minute.

## 0. Before you start (five minutes, the day before)

1. Run `node scripts/repo-stats.mjs` in the repository root and write down the numbers it prints. At the time of writing: 4 roles, 69 pages, 259 API endpoints, 1,543 automated tests (984 backend, 496 front-end unit, 63 end-to-end), 96 migrations, 43 screens scanned for accessibility. Quote the fresh ones, not these.
2. Run `python manage.py migrate` in `backend` so the For Zenotians page has its new sections, and `python manage.py seed_demo` if the demo database is empty.
3. Run `npx playwright test` and `npm test` in `frontend`. **Verify before presenting:** quote the real pass or fail. Do not say "all tests pass" unless you have just seen it.
4. Open every page of the Zenotians section once in the browser at laptop width and at phone width (375 px).
5. Have the four demo logins ready (customer, receptionist, stylist, admin) in separate browser profiles or private windows. All demo emails are on example.com.
6. Close anything with real personal data.

## 1. The ten-minute talk

| # | Time | Slide / screen | What to say | Demo |
|---|------|----------------|-------------|------|
| 1 | 0:00 – 0:45 | Overview (`/zenotians`) | "I built a working salon, spa and beauty-parlor platform, called Alankar, in order to understand the kind of problems your product solves. It is independent, not affiliated with Zenoti, and it uses only public information about you." | Show the overview and the stat tiles. |
| 2 | 0:45 – 1:30 | About me | One sentence on background, taken from the resume text on the page. Do not add claims that are not on the page. | Open About me → Summary. |
| 3 | 1:30 – 3:00 | A day at Alankar | "Four fictional people, seven chapters: Priya asks for a slot, Rahul and Meera both say yes, Meera once declines, payment is simulated, a visit is checked out, a rating is locked and affects pay, and Suresh reads the dashboard." | Press Play for 90 seconds, or step with the arrow keys. Pause on chapter 3 to show the kind decline message. |
| 4 | 3:00 – 4:00 | The project | Four roles, one policy file, the booking lifecycle with the two-yes approval, the stack. | Show the roles and lifecycle diagrams. |
| 5 | 4:00 – 5:15 | Live demo, short | Sign in as the customer, request a slot; switch to the receptionist and the stylist and accept; show the status move. | Use the real app, not the page. Keep it to one booking. |
| 6 | 5:15 – 6:15 | How it maps to Zenoti | "Twelve workflows. The third column is not marketing: it is what is out of scope, and each row links to the Limitations page." | Click one limitation link. |
| 7 | 6:15 – 7:30 | Engineering decisions | Pick three: the single policy file, two yeses and no double booking (row locks, 409 with three nearest times, no exclusion constraint and why), deterministic algorithms and no AI. | Point to the code pointer chips. |
| 8 | 7:30 – 8:30 | Quality evidence and Security | The test counts from the stats script, the measured chatbot accuracy (130/143 tuning, 67/91 holdout, 5 Nov 2026), AES-256-GCM fields, the immutable invoice, the audit log, and what testing found. | Show the accuracy cards. |
| 9 | 8:30 – 9:30 | Limitations | Read two honestly: no load test, and simulated payments and messages. Mention that axe and the browsers tested are limited to Chromium. | Scroll the Limitations page. |
| 10 | 9:30 – 10:00 | Questions you might ask me / Contact | "Here are the questions I expect; I would rather you ask the hard ones." | Open Questions, then Contact. |

Timing rules: if the demo runs long, drop slide 2 and shorten slide 8. Never drop Limitations.

## 2. The two-minute version

1. (20 s) "Alankar is a working salon platform I built on my own: four roles, one policy file, 69 pages and 259 API endpoints behind it. It is independent of Zenoti and uses only public facts about you."
2. (40 s) Open A day at Alankar and press Play on chapters 1 to 3: a request needs two yeses, and a decline is handled kindly with no double booking.
3. (30 s) "It is tested: [stats script number] automated tests, a measured chatbot accuracy of 90.9% on the tuning set and 73.6% on a holdout I wrote myself, and no AI in it by design."
4. (20 s) Open Limitations: "It is a prototype. Payments and messages are simulated, there is one shop, and I have not load tested it."
5. (10 s) "Questions? The hard ones are on the page."

## 3. Numbers you may quote, and where each comes from

| Number | Source | Status |
|--------|--------|--------|
| Roles, pages, endpoints, tests (split), migrations, accessibility screens | `node scripts/repo-stats.mjs` → `frontend/src/generated/repo-stats.json` | Re-run the day before. A test fails if the stored file is stale. |
| 130 of 143 (90.9%) tuning set; 67 of 91 (73.6%) holdout | `backend/chatbot/tests/test_accuracy.py`, measured 5 Nov 2026 | A test re-measures and fails on any difference. Both sets are written by me. |
| 49 days of demo history | `backend/core/demo.py` | Fictional data only. |
| Approval window 24 h, reminders at 2 h and 12 h | `backend/scheduling/approvals.py` | Admin-editable. Needs a scheduled job to take effect. |
| Lockout after 5 failed logins for 15 minutes; remembered device 30 days | `backend/accounts/lockout.py`, `backend/accounts/trusted.py` | In code. |
| 61 queries, 0.1 – 0.3 s for the stats page | One sandbox run | **Verify before presenting**, or leave it out. It is not a benchmark. |
| Zenoti facts (founding, offices, investors, leadership) | Zenoti's public pages, read on 30 Oct 2026, with links on the About Zenoti page | **Verify before presenting**: re-open each link. |

## 4. Verify before presenting (the full list)

- The latest Playwright and axe results on your machine (not runnable in my environment).
- Dependency advisories: re-run `scripts/audit.sh`.
- The stats script output and the accuracy test, as above.
- The Zenoti facts and their links.
- Your own reasons for the stack and your own history: only what is on the resume text.
- That your demo database is migrated and that the For Zenotians page loads at 375, 768 and 1280 px in light and dark.

## 5. Things not to say

- Do not say it is "production ready", "secure" in absolute terms, or "scalable". It has no load test and no live deployment.
- Do not say any payment, email or text message is real.
- Do not describe any AI feature as coming. There is none, by design.
- Do not claim knowledge of Zenoti's internals.
