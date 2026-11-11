# Final test plan

One list, in order, for your Windows PC (cmd.exe). Part A gets the database and the demo ready, part
B runs every automatic check, part C is a 15-minute demo you click through yourself. Write down
anything that does not match the "Pass" line and paste it to me.

Every command block starts from the project folder:

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app"
```

## A. Database, migrations and the demo data

| # | Commands | Pass |
|---|---|---|
| A1 | `docker compose up -d db` (skip if you run PostgreSQL yourself) | `docker compose ps` shows `db` running/healthy |
| A2 | `cd backend` then `.venv\Scripts\activate` then `python manage.py migrate` | Ends with no error. Any of `scheduling 0010`, `0011`, `air 0004`, `0005` not applied yet are applied now. AIR's `0001` creates the `btree_gist` extension; if it says "permission denied to create extension", run once as the database owner: `docker compose exec db psql -U salon -d salon -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"` |
| A3 | Create the demo database once: `docker compose exec db psql -U salon -d salon -c "CREATE DATABASE salon_demo OWNER salon;"` (from the project folder) | `CREATE DATABASE` (or "already exists", which is fine) |
| A4 | In `backend` with the venv active: `set SALON_DB_NAME=salon_demo` then `python manage.py reset_demo --yes` | About a minute. Prints "Building 49 days of history", "live today: ...", "request states: declined by the front desk, declined by the stylist, expired request, payment link expired, Any stylist request, moved by the desk with a sorry note, ..." and "AIR: accepted by AIR, stylist said yes, paid, Any stylist, accepted by AIR, waiting for the stylist", then "Demo ready" and the logins. (The "checked in / in progress today" items appear only during opening hours.) |
| A5 | Same window: `python manage.py runserver` | "Starting ASGI/Daphne ... at http://127.0.0.1:8000/" |
| A6 | Second window: `cd frontend` then `npm run dev` | Vite prints `http://localhost:5173/` |

Demo logins and what each one shows: `docs/START_HERE.md` (top). Password: `Demo-Pass-2026!`.

For the demo, customers sign in with an emailed code while the app runs in debug mode. Read it at
http://localhost:5173/dev/mailbox, or start the server with `set SALON_CUSTOMER_OTP=false` in that
window to skip the code (on your PC only; `deploy_check` refuses that setting for production).

## B. Automatic checks (in this order)

| # | Commands | Pass |
|---|---|---|
| B1 | `cd backend`, venv active, database running: `pytest` | `0 failed`. A few `skipped` are fine (a shift helper skips close to midnight). These ran on SQLite here; on PostgreSQL the race, encryption-at-rest, Argon2, backup and WebSocket tests also run, which is the point of this run. |
| B2 | `ruff check .` and `ruff format --check .` (in `backend`) | "All checks passed!" and "... files already formatted" |
| B3 | `python manage.py check` | "System check identified no issues" |
| B4 | Production settings: copy your production values into a separate window (`set SALON_DEBUG=false`, a real `SALON_SECRET_KEY`, `SALON_FIELD_KEY`, `SALON_ALLOWED_HOSTS`, `SALON_CORS_ORIGINS=https://...`, `SALON_FRONTEND_URL=https://...`, `SALON_API_DOCS=false`, a strong `SALON_DB_PASSWORD`), then `python manage.py deploy_check` | "deploy_check passed (2 warning(s))": the two warnings are the in-process cache and channel layer (fine for one server process). With `SALON_DEBUG=true` it fails on purpose. |
| B5 | `cd frontend`: `npm run lint` | No output, exit code 0 |
| B6 | `npm run typecheck` and `npm run typecheck:e2e` | No output |
| B7 | `npm run format:check` | "All matched files use Prettier code style!" |
| B8 | `npm test` | Every test file passes. Last sandbox run: 945 passed; the few that could not run there (AIR popup, AIR Activity, chat widget, photos, repo stats) must pass on your PC. |
| B9 | `npm run build` | Ends with "built in ...s". It first refreshes `src/generated/repo-stats.json` (that file then shows as changed in git; commit it). |
| B10 | From the project folder (venv not needed, the script activates it): `scripts\e2e.cmd` | "E2E PASSED". This runs every Playwright project: `chromium` (all desktop tests: full workflow, axe, basic a11y, AIR widget and dashboard, splash, tour, page images, image quality, sidebar, mobile 375, Zenotians) and the five mobile projects. The first run takes a while (it builds the `alankar_e2e` database). |
| B11 | Only the accessibility scan, if B10 failed there: `cd frontend`, activate `..\backend\.venv\Scripts\activate`, then `npx playwright test e2e/axe.e2e.ts e2e/basic-a11y.e2e.ts --project=chromium --reporter=line` | All passed |
| B12 | Only the mobile matrix: `npx playwright test --project=mobile-320 --project=mobile-360 --project=mobile-390 --project=tablet-768 --project=landscape-844 --reporter=line` | All passed. Screenshots in `frontend\mobile-screens\<role>\<route>-<device>.png` (git-ignored). A failure lists every page and problem. |
| B13 | Image quality: `npx playwright test e2e/image-quality.e2e.ts --project=chromium --reporter=line`, then `npm run images:budget` | The Playwright test passes. `images:budget` is EXPECTED to exit 1 today (35 photo/width combinations are scaled up more than 1.25x) until better source photos are added; the table it prints should match docs/IMAGE_QUALITY.md. |
| B14 | Dependency audit (internet): `scripts\audit.cmd` | pip-audit: "No known vulnerabilities found". npm audit (production): "found 0 vulnerabilities". Do NOT run `npm audit fix --force` (it upgrades major versions); paste the findings to me instead. |
| B15 | Secrets: `git ls-files | findstr /i "\.env"` | Only the three `.env.example` files |

After a Playwright failure: `cd frontend` then `npm run e2e:report` opens the report with screenshots.

## C. 15-minute manual demo

Use three browser windows so the roles do not share a sign-in: a normal window, a private
(InPrivate/Incognito) window, and a second browser (or a second profile). Everything below uses the
demo database from part A.

**0:00 Visitor: logo splash and Meera tour (1.5 min).** Private window, http://localhost:5173.
- Pass: the Alankar "A" draws, fills and glides into the navbar (about 2 seconds, Skip works); it
  shows once per browser session. The hero animates in after it. Meera's invite appears; start
  the tour and step through (Next, Back, Escape closes). With Windows "Animation effects" off there
  is no splash and no motion.

**1:30 Customer books with a named stylist (2 min).** Window 2: sign in as
`reception@demo.example.com` (Receptionist tab) so a person is at the desk. Window 1: sign in as
`rohan@demo.example.com` (Customer tab). Book → a Salon service → choose **Rahul** → a time on a day
Rahul works (not Tuesday) → Send request.
- Pass: the "Request sent" screen says it goes to the front desk and the stylist and is confirmed only
  when both accept. My bookings shows the request as waiting.
- Window 2 (receptionist) → Appointments → the request → Accept. Window 3: sign in as
  `rahul@demo.example.com` → Requests → Accept.
- Pass: Rohan's My bookings shows "Accepted by our front desk", the timeline, and a Pay button.

**3:30 Customer chooses "Any stylist" (1.5 min).** Window 1: sign out, sign in as
`lakshmi@demo.example.com` → Book → a Salon service → stylist **"Any available stylist (AIR picks one
who is free)"** → a time → Send.
- Pass: My bookings says "Stylist: <first name>, assigned by AIR" (usually Arun, who has the fewest
  bookings). The receptionist sees "Customer chose any stylist" and the history. Accept at the desk;
  sign in as that stylist (`arun@demo.example.com`) and accept.

**5:00 AIR covers the desk, payment link and payment (2.5 min).** Window 2: the receptionist
**signs out** (AIR covers whenever no receptionist is signed in; the admin can also force it in
Settings → AIR with a reason). Window 1: sign in as `arjun@demo.example.com` and send a request
for a named stylist (for example Kiran, Spa, not Wednesday). Or use the chat bubble and type the
service, a day, a time and "with Kiran"; AIR asks for anything missing, then Send request.
- Pass: within a few seconds (refresh My bookings) it says "Accepted by AIR, our virtual
  receptionist (the front desk was closed)". It is NOT confirmed yet.
- Stylist (`kiran@demo.example.com`) → Requests → Accept. Pass: Arjun gets the payment link (My
  bookings → Pay, and the email in http://localhost:5173/dev/mailbox); the link time is 45 minutes.
- Pay → the simulated gateway → success. Pass: the booking shows Confirmed only now; nothing real is
  charged.

**7:30 Sorry notes (1.5 min).** Window 2: sign in as `reception@demo.example.com` → Schedule (or
Appointments) → a scheduled booking → Move to another time, pick a reason category → Save.
- Pass: that customer's bell, My bookings card and the dev mailbox show the apology with the new
  time and the reason category only (never a private note). Cancelling works the same way and says a
  refund needs the admin's approval when money was paid. Also seeded: one booking already moved by
  the desk.

**9:00 Receptionist sign-in: AIR popup and Activity graphs (2 min).** Still window 2 (or sign out and in).
- Pass: the AIR popup appears once per sign-in with the summary since the last session (requests
  AIR accepted, links sent and paid, "Any stylist" assignments, needs-you items); Play reads it
  aloud with the browser's voice, Mute is remembered, Escape closes, the reopen button brings it back.
- Menu → AIR Activity: needs-you list (Claim, Resolve), number tiles compared with the period before,
  charts each with a sentence, a data table and CSV, the activity list with masked phones and Undo
  (Undo refuses a paid booking).

**11:00 Admin (2.5 min).** Window 3: sign in as `owner@demo.example.com`.
- Dashboard (shop statistics for a date range), Staff (four stylists with their weekly hours and a
  day off each), Inventory (two products low on stock), Payroll (last month paid), Ratings, Reports,
  Audit Log (every step above is there), Chatbot insights, AIR Activity, Settings → AIR (desk cover
  ON, the optional AI service OFF, "API key configured: no").
- Pass: the admin has no Appointments or Schedule page (by design).

**13:30 For Zenotians on a phone (1.5 min).** Any window: press F12, then Ctrl+Shift+M (device
toolbar), pick iPhone 14 (or another phone), open http://localhost:5173/zenotians and reload.
- Pass: no sideways scrolling; the sidebar opens as a drawer; the page assembles from the left once;
  About me, The project, How it maps to Zenoti, A day at Alankar, Quality, Security, Limitations
  (AIR row: optional, off by default, payments and texts simulated, no real phone calls), Try the
  demo and Contact all open. No "Aviatrix" anywhere. Buttons are easy to tap; form fields do not zoom.

**15:00 Done.** If anything differed from a "Pass" line, note the step number and what you saw.
