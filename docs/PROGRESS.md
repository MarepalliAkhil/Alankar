# Progress

## Status
- Task 8 (8a security review, 8b data and reliability, 8c browser tests, 8d README and demo data): IMPLEMENTED in the
  build sandbox, waiting for the owner's PC run (commands in "Task 8: owner run and walkthrough" at the end).
  Not DONE until the owner says "passed". Next after that: Task 9 onward (see the task list).
- Task 7 (AI Alankar Intelligence chatbot: 7a engine and data, 7b API and widget, 7c admin Chatbot insights and
  accuracy evaluation) and the follow-up (full "tell me about <service>" answers, seeded descriptions, admin
  "Services without description"): DONE. Verified on the owner's PC and pushed (2026-10-30). **Task 7: DONE.**
  Migrations added: chatbot 0001, accounts 0023. Accuracy (developer-written questions, not real customers):
  tuning 120/130, holdout 63/78, see "Task 7 follow-up: accuracy report (rerun)" below.
  Next: Task 8 (hardening, reliability, Playwright full-workflow test, README and demo data).
- Task 6 (ratings, work sessions, payroll, Staff Summary) is split 6a..6c (owner-approved plan). One sub-task at a
  time; wait for "passed". Task 6a (admin Ratings overview and moderation, stylist pay breakdown): DONE. Verified on the owner's PC
  (2026-10-28). Tasks 6b (Work Hours, shifts, receptionist pay) and 6c (payroll runs, payslips, Staff Summary,
  Performance Review): DONE. Verified on the owner's PC and pushed (2026-10-29). **Task 6: DONE.**
  Next: Task 7 (chatbot), see the task list below.
- Task 5 (admin slice, 5a to 5e): DONE. Verified on the owner's PC and pushed (2026-10-28). Next: Task 6.
- Task 3c (POS, stock ledger, loyalty, refunds, cash close, Inventory view): DONE. Verified on the
  owner's PC (2026-10-27), including the refund flow for paid bookings cancelled by the desk.
  Sandbox: pytest all passed, ruff clean, vitest 154 passed, eslint, typecheck, prettier clean
  (the production build could not run in the sandbox; please run `npm run build`).
- Task 3b (check-in, walk-in and phone bookings, customers): IMPLEMENTED in the build sandbox,
  waiting for the owner's PC run (migrate, pytest, npm test, walkthrough below).
- Task 3a (requests inbox, schedule, desk actions, pay settings): DONE. Verified on the owner's PC
  (2026-10-27): tests, lint, typecheck, build and the browser walkthrough passed.
- Task 2c (invoices + mandatory rating) and customer email-OTP: IMPLEMENTED in the build sandbox,
  waiting for the owner's PC run (migrate, pytest, npm test, npm run build, walkthrough below).
  Sandbox: pytest 216 passed, ruff clean, vitest 112 passed, eslint, typecheck, prettier clean.
- Task 0 (scaffold and foundation): DONE (verified on the owner's PC, 2026-10-26).
- Task 2b (booking flow): DONE. Verified on the owner's PC (2026-10-27): booking request, confirm,
  payment-link email, mock payment and receipt emails working. Sandbox: pytest 163 passed, ruff
  clean, vitest 101 passed, eslint, typecheck, prettier clean.
- Task 2a (real email + catalogue/site content in the database + public website): DONE.
  Verified on the owner's PC (2026-10-26): migrate, seed_demo, pytest 122 passed, ruff, eslint,
  typecheck; real Gmail sending confirmed (send_test_email + staff invites); admin sign-in OK.
  vitest timeouts raised (asyncUtilTimeout 5 s, testTimeout 20 s) for the slower Windows run;
  vitest 75 passed in the build sandbox. EMAIL_HOST_PASSWORD spaces are stripped.
- Task 1 (auth and policy): DONE. Verified on the owner's PC (2026-10-26): pytest 99 passed,
  ruff clean, vitest 65 passed, eslint, typecheck and build OK; browser run of every flow.

## Task list (renumbered by the owner, 2026-10-29)
- Tasks 1 to 6: DONE (6a, 6b, 6c verified on the owner's PC and pushed).
- Task 7: "AI Alankar Intelligence" chatbot (7a port and data, 7b API and widget, 7c admin insights and accuracy). No LLMs.
- Task 8: hardening and the Playwright full-workflow test with four users.
- Task 9: "For Zenotians" page design (MASTER_NOTES section 36), including the About me resume section.
- Task 10: admin assistant that handles things with commands. Rule-based, no LLM, same permissions and audit log as the
  admin screens, asks for confirmation before any change.
- Task 11: stage 2, the owner's custom UI design.
- Task 12: to be decided later. Deployment is not assigned to any task yet; candidate for 8 or 12.

## Decisions
- Defaults in CLAUDE.md section 9 and MASTER_NOTES section 28 are assumed accepted until changed.
- Brand: both names live only in `frontend/src/config/brand.ts` and `backend/core/brand.py`.
  Customers see "Alankar". "ZenFlow" appears only on /zenotians and in a small "Powered by ZenFlow" line.
- Entry: the app opens on the public home page. The role picker is only the tabs on /login
  (MASTER_NOTES Update 2 wins over the "role picker renders" line in START_HERE).
- No LLMs or Ollama anywhere. Chatbot = deterministic engine (docs/CHATBOT_ALGORITHM.md).
  Old Ollama mentions in MASTER_NOTES are void.
- Custom user model (`accounts.User`: UUID id, unique email, role default "customer") created in
  Task 0 so later migrations never need a user-model swap. Login rules come in Task 1.
- API is deny-by-default (`IsAuthenticated`); public endpoints opt in with `AllowAny`.
- Settings come from environment variables; `backend/.env` is loaded by a small stdlib helper
  (`core/env.py`), so no extra dependency (python-dotenv) was added.
- `psycopg[binary]` added as the PostgreSQL driver (required by the PostgreSQL choice).
- Design tokens: `tokens.ts` is the single source; `applyTokens()` writes CSS variables at startup
  and Tailwind's colours/radii/shadows are REPLACED by token-backed values (no stock palette).
  ESLint blocks inline `style` everywhere and hex/rgba literals in pages and layouts.
- "Book Now" (no service picked yet) goes to `/login?role=customer&intent=book`.
  After Task 1/2 a signed-in customer continues to the booking sheet.
- Division descriptions in `config/divisions.ts` are structural; real catalogue content moves to
  the database in Task 2.
- `/design-system` is a dev-only route (not in production builds).
- Login/Register forms validate with zod and call `/api/auth/login/` and `/api/auth/register/`.
  Those endpoints arrive in Task 1; until then the forms show an honest "not available" error.
- Django's own admin is mounted at /django-admin/ only when SALON_DEBUG=true (developer tool).
- Task 1 decisions:
  - ONE policy file `shared/policy.json` lists every API action, public routes, and per role:
    home, menu (label, path, description, task, status) and allowed API actions. Backend
    `core.permissions.PolicyPermission` enforces it (views without a known action are denied;
    a test fails if any endpoint is undeclared); the frontend imports the same JSON for menus
    and route guards (`src/policy/policy.ts`).
  - Login is by email; `username` = lower-cased email. Login body carries the role tab; a
    wrong tab, wrong password, unknown email or inactive account all return the same 401.
  - Lockout: 5 failures for one email within 15 min lock that email for 15 min (also for
    unknown emails, so lockout reveals nothing). Auth endpoints are rate limited (20/min per IP).
  - JWT in httpOnly cookies: access 15 min (path /api/), refresh 7 days rotating + blacklisted
    (path /api/auth/). CSRF double-submit enforced on every unsafe API request. The SPA renews
    the session every 12 min; `GET /api/auth/session/` returns `{user|null}` with 200 so guests
    see no 401 noise.
  - The user is re-read on every request: deactivation (or a role change) takes effect on the
    next request; deactivation also revokes all refresh tokens.
  - Registration returns the same 201 message whether or not the email exists (an existing
    owner gets a simulated "someone tried to register" email). Phone is AES-256-GCM encrypted
    with an HMAC blind index (`SALON_FIELD_KEY`, HKDF-derived keys, `.env` only).
  - Staff invite: creates an inactive account with no usable password, 72 h link, only the
    SHA-256 hash of the token is stored. Password reset: customers only, 1 h, single use,
    hashed token, generic response, revokes sessions.
  - Simulated email goes to `MailOutbox`; `/api/dev/mailbox/` and the invite link endpoints
    answer 404 unless SALON_DEBUG=true (owner request). Password-reset confirm is not
    dev-gated (its link is only visible in the dev mailbox anyway until real email exists).
  - Audit log: register, login success/failure (with reason), lockout, logout, invite
    sent/accepted, role change (model signal, any code path), staff deactivate/reactivate,
    password reset requested/done. Admin sees the latest entries on the Staff page.
  - First admin: `python manage.py create_admin --email ... --name "..."`.
  - Customer OTP at registration: deferred (owner) to a small task after the booking flow.

## Local setup notes
- Docker PostgreSQL runs on host port 55432 (5432/5433 are taken by other PostgreSQL installs on the owner's PC).
- Owner uses Command Prompt (cmd): activate venv with `.venv\Scripts\activate.bat`.

## Done
- Starter kit committed (git initialised).
- Task 0: scaffold and foundation.
  - backend/: Django 5 + DRF, apps (accounts, people, scheduling, billing, inventory, chat,
    marketing, core), /api/health/, /api/schema/ + /api/docs/, Channels/Daphne ASGI, CORS,
    Argon2, pytest + pytest-django (12 tests), ruff config, `.env.example`.
  - docker-compose.yml (PostgreSQL 16) + root `.env.example`.
  - frontend/: Vite + React 18 + TS + Tailwind, brand config, design tokens + CSS variables,
    base components (Button, ButtonLink, IconButton, Input, PasswordInput, Select, Checkbox,
    Card, Badge, StatusBadge, Avatar, Modal, Drawer, Toast, Tabs, Table, EmptyState,
    ErrorState, Skeleton/LoadingState, Spinner), /design-system page, public layout with
    navbar + footer, routes /, /salon, /spa, /beauty-parlor, /login (4 role tabs),
    /register (customers only), /zenotians, /403, 404, ErrorBoundary + Suspense fallback,
    vitest tests (routing, login tabs, register validation, ErrorBoundary, ui components, tokens).
  - README.md with Windows run instructions.

## In progress
- Nothing in progress. Next: Task 2c (invoices + rating gate) and the customer OTP; plan to be approved.

## Done (Task 1 details)
- Task 1: auth and policy.
  - Backend: register, login (role tabs), session/me, refresh, logout, CSRF, lockout, rate
    limits, password reset, staff invites + accept, staff list/deactivate/reactivate, audit
    list, dev mailbox, create_admin; models AuditLog, LoginAttempt, LoginLock, StaffInvite,
    PasswordResetToken, MailOutbox, CustomerProfile (encrypted phone); 99 tests.
  - Frontend: SessionProvider (+ silent refresh), RequireRole guard, StaffLayout and
    CustomerShell with menus from the policy, role home pages, admin Staff page (invite,
    deactivate/reactivate, audit), login/register wired, forgot/reset password, accept invite,
    dev mailbox, customer avatar menu; 65 tests.

## Task 2 split (owner-approved)
- 2a (this step): real email (SMTP) + catalogue and site content in the database (demo seed)
  + public website from the database.
- 2b (done): booking sheet, booking requests, confirm (receptionist/admin API), payment link,
  mock gateway, expiry, My Appointments cards, Profile. Payment-link emails use the 2a mailer.
- 2c (after Task 3 checkout exists): customer invoices and the mandatory rating gate.
- Small task after the booking flow works: simulated customer OTP shown in the dev mailbox.

## Task 2a decisions
- Real email when EMAIL_HOST is set in backend/.env (and EMAIL_HOST_PASSWORD if a user is set);
  otherwise simulated exactly as in Task 1. Every email is saved in MailOutbox with a status
  (simulated / queued / sent / failed) and a secret-free error (exception type + SMTP code).
- Delivery runs in transaction.on_commit, never inside the transaction.
- Invite email failure: invite stays valid, audit `email_failed` (no token/link), the API
  returns the one-time link only in that response so the admin can "Copy link"; "Resend
  invite" issues a new link (old one stops working) and a new 72 h expiry. Invite statuses:
  sent / failed / accepted / expired (+ delivery email | dev_mailbox).
- Owner decision: invite links work when SALON_DEBUG=true OR real email is configured; the dev
  mailbox stays debug-only.
- `python manage.py send_test_email --to <address>` checks the SMTP setup.
- Catalogue in `scheduling` (ServiceCategory, Service, ServiceVariant, ServiceAddon; prices INR
  incl. GST; from-price = cheapest active variant). Public team profiles in
  `people.StylistProfile` (customer-safe; `user` links a profile to a stylist account later).
  Website content in new app `website` (SiteContent keyed JSON, Achievement, Offer,
  KnowledgeEntry = FAQ now, chatbot knowledge in Task 7).
- `python manage.py seed_demo` loads DEMO content (Indian-salon services and prices, 4 team
  profiles, contact/hours/policies/FAQ). Demo address/phone are clearly placeholders.
  Achievements, offers, ratings and reviews are NOT seeded: they come only from the owner or
  from real activity. Home "numbers" show real counts (services, team members, divisions).
- Until the admin content screens (Task 5) exist, content is edited in the developer-only
  Django admin (/django-admin/, SALON_DEBUG=true).
- Public read-only API `/api/public/...` (site, categories, services, service, team, pages),
  all declared as public actions in shared/policy.json. New public routes: /privacy, /terms,
  /cancellation-policy.

## Task 2b decisions
- New data: `Appointment` (service/price/duration snapshot, preferred and assigned stylist, room,
  encrypted contact phone, notes and allergies, customer flags arrived / reschedule_requested /
  cancel_requested), `AppointmentEvent` (status history), `Room` (seed_demo adds 7 demo rooms),
  `PaymentLink` (token hash only), `Payment` (mock), `Refund`. Customer profile gained
  allergies + preferences (encrypted).
- Booking rules live in SiteContent key `booking` with defaults (Admin edits them in Task 5):
  15-minute slot grid, 60 min minimum lead, 60 days ahead, weekly shop hours (Mon-Sat 10-20,
  Sun 10-18), hold 6 h, prepayment 100%, free cancellation 24 h, GST 18%.
- Flow: customer sends a REQUEST (no time is held) -> receptionist/admin confirms with stylist,
  time and room -> AWAITING PAYMENT (slot held) + payment link email -> mock gateway pays ->
  SCHEDULED + receipt email. Reject needs a reason (emailed). Unpaid past the deadline ->
  PAYMENT EXPIRED, slot released, customer emailed; the desk can confirm again or reject.
- Hold = 6 hours, but never later than 30 minutes before the visit (minimum 15 minutes).
- Overlaps are checked per stylist and per room, with `atomic` + `select_for_update`; a clash
  returns 409 with the 3 nearest free times. Expiry runs on every read and via
  `python manage.py expire_payments` (schedule it every few minutes in production).
- Only the newest payment link works; the customer may resend (once a minute) and the desk may
  resend. The link token is stored hashed and never written to the audit log.
- Customer actions per state: cancel (free before the 24 h window: refund recorded; inside the
  window it becomes a "cancel request" flag for the desk), I'm here (same day only),
  reschedule request (a flag with a preferred time; the desk handles it in Task 3).
- Stylists see nothing until Task 4 (they have no booking or appointment API access).
- Policy: new actions for booking, my.*, desk.* and auth.password_change; param route
  `/customer/pay/:id`; the Appointments menu for receptionist/admin is now "available" as a
  simple request list (Task 3 replaces it with full cards and the schedule board).
- Password change: `POST /api/auth/password/change/` (current password required, other sessions
  signed out, new cookies for this one, audited).
- Times are shown in the shop time zone (Asia/Kolkata) whatever the device says.

## Task 2b: owner browser walkthrough (to verify on the PC)
1. Sign in as customer, open Salon, click a service, Book this service. Pick a time, tick the
   policy box, Send booking request. A "Requested" card appears in My Appointments.
2. Sign in as receptionist (other browser or private window) -> Appointments -> Confirm ->
   choose stylist, room, time -> Confirm and send payment link. Open the dev mailbox
   (/dev/mailbox) or your inbox for the link.
3. Customer: My Appointments -> Pay now (or the emailed link) -> "Simulate failed payment"
   (hold stays) -> Pay. The card becomes Scheduled and a receipt email arrives.
4. Try Reject (reason required), Resend link, Cancel, I'm here, Reschedule, Profile and
   Change password.

## Task 2c + OTP decisions
- OTP: customers get an emailed 6-digit code at registration AND on every sign-in. Staff sign-in
  is unchanged. Code is stored hashed (HMAC), valid 10 min, 5 wrong tries, single use, resend
  after 60 s, max 5 codes/hour. Wrong/expired answers are one generic message.
- OTP runs only when it can be delivered (SMTP configured or debug dev mailbox); otherwise it is
  skipped so nobody is locked out. `SALON_CUSTOMER_OTP=false` in `.env` turns it off.
- Unverified accounts: `User.email_verified_at` is empty until the registration code is entered.
  A password alone never starts a customer session while codes are in force; an unverified
  customer who signs in is sent the REGISTER code (the server picks the purpose and rejects any
  other, like a wrong code, without using a try), and entering it verifies the email and signs
  in. Booking requests are also refused (403 `email_unverified`) for an unverified customer when
  codes are in force (defence in depth for sessions started while codes were off).
  Older customers from before this change are unverified too and verify once at next sign-in.
- Invoice (INV-YYYY-NNNNN) is created by `billing.checkout.checkout` (Task 3c POS) in one atomic
  transaction, applies the online prepayment, and is immutable afterwards. The dev-only
  `complete_demo_visit` command was removed in 3c.
- Rating: pending rating created at billing; stars 1-5, comment required for 1-2 stars, tags,
  immutable once submitted. While any is pending the server refuses new booking requests
  (403 code `ratings_pending`); the UI shows the "Rate your stylist" card on Home, My
  Appointments and the booking page (inline card, never a trap). Reminder after 24 h:
  `python manage.py send_rating_reminders`. Public stylist ratings stay hidden until Task 6.

## Task 2c + OTP: owner browser walkthrough (to verify on the PC)
1. Register a new customer: a 6-digit code appears in /dev/mailbox (or your inbox). Enter it.
2. Sign out, sign in again as that customer: code step again. Try a wrong code (generic error).
3. Staff sign-in (admin/receptionist) still has no code step.
4. Book, confirm as receptionist, pay (as in 2b), check the guest in, then bill in POS / Billing (3c).
5. Customer: Home / My Appointments show "Rate your stylist"; Book is held until rated.
   Rate (try 2 stars without a comment: it is refused), then booking opens again.
6. Invoices menu: the invoice with GST and prepaid amount; View and Print.

## Task 3 split (owner-approved)
3a requests and schedule; 3b check-in, walk-ins, customers; 3c POS, stock ledger, cash close;
3d work sessions and My Hours & Pay. Each waits for the owner's "passed".

## Task 3a decisions
- Receptionist menu shows only built items (Dashboard, Appointments, Schedule); the rest return
  as 3b to 3d are built. Admin also gets Schedule.
- Desk actions: confirm (assign stylist, time, room; 409 plus 3 nearest slots), reject with
  reason, resend payment link, move (scheduled or awaiting payment), cancel with reason,
  no-show (only after the start time), dismiss customer flags. All audited.
- Paid cancellations and no-shows create pending-approval refunds; the admin decides. Money is
  never moved automatically.
- Staff may book and move inside the customer lead time (only the past is excluded).
- Schedule day view uses @dnd-kit (mouse, touch and keyboard) plus a "Move to..." button on each
  card. Run `npm install` in frontend to fetch @dnd-kit/core.
- Admin-only: hourly rate per receptionist (Staff page) and POS discount cap (default 20%),
  both audited. `complete_demo_visit` was replaced by the POS in 3c and removed.
- Dragging could not be exercised in the build sandbox (no npm registry); drop maths, Move to...
  and rendering are tested. Please check real dragging in the browser.

## Task 3a: owner browser walkthrough (to verify on the PC)
1. Receptionist: Appointments shows request cards; confirm one via the drawer (stylist, time, room).
2. Confirm a clashing time: a message plus nearest free times appear.
3. Schedule: drag a card to another slot/stylist; also try keyboard (Space, arrows, Space) and "Move to...".
4. Cancel with a reason (empty reason refused); mark no-show on a past visit; dismiss a customer flag.
5. Admin Staff page: set a receptionist hourly rate and the discount cap; check the Audit entries.
6. Dashboard shows "Today at the desk".

## Task 3b decisions
- Check-in: a scheduled visit can be checked in on the day of the visit only (shop time zone).
  Audited. The "customer is here" flag stays a flag; the receptionist's check-in is the status change.
- Walk-in and phone bookings (receptionist or admin, for an existing customer): go straight to
  scheduled (or checked in when the guest is here now), no online prepayment, settled at checkout in
  3c. Same overlap check as a confirmed request: a clash returns 409 plus the 3 nearest free times.
  Staff are not blocked by the customer's unrated visits (that rule is for online booking requests).
- Customers: search by name or email (partial) or a full 10-digit mobile number (exact, through the
  blind index; partial phone search is not possible by design). The list never includes staff.
- Registering a customer at the desk needs a name, email and mobile number (email is needed for
  receipts). The account has no password; the customer claims it with "Forgot password". Duplicate
  email returns 409. Edits (name, phone, allergies, preferences) and notes are audited; the audit
  log stores only which fields changed, never the values.
- Notes are encrypted at rest. Each note has an audience: front-desk notes are returned to the
  receptionist and admin; "stylist only" notes (written in the stylist slice) are never returned by
  the desk API. Customers never see any note.
- Menu: Customers added for the receptionist (and now live for the admin).

## Task 3b: owner browser walkthrough (to verify on the PC)
1. Receptionist: Customers shows everyone; search by name, by email, by full mobile number.
2. Register customer (name, email, mobile). You land on the profile. Try the same email again: refused.
3. On a profile: Edit details (phone change makes the new number searchable), add a note, see visit history.
4. Book a visit (walk-in): pick service, time, stylist; tick "check them in" for today. Book the same
   stylist and time again: a clash shows nearest free times.
5. Appointments > Scheduled: a visit booked for today has Check in. Tomorrow's visit does not.
6. As a customer, book online, pay (as in 2b), then as receptionist check that visit in on its day.
7. Stylist and customer accounts cannot open /customers (403 page).

## Task 3c decisions
- Prices include GST. Receptionist discount is capped (default 20%); the admin may go higher. Any
  discount needs a reason. GST is the part of each line after discount (price x rate / (100 + rate)).
- Loyalty: 1 point per Rs. 100 paid (points used excluded), 1 point = Rs. 1, at most 50% of a bill.
  Tip is separate, untaxed, 100% to the stylist. Split payments (cash/card/UPI, simulated) must add up
  to bill + tip. Settings are not admin-editable yet.
- Stock only changes through StockMovement ledger rows; a sale beyond stock is refused (409 "Only N
  in stock"). Ledger, loyalty entries, invoices and cash closes are immutable. Refunds do not restock.
- Excess online prepayment (bill lower than what was paid) creates a pending refund for the admin.
- Refunds: receptionist requests, admin approves (choosing how the money returns) or rejects with a
  reason; an admin refund is processed at once. Cap = prepaid + paid at counter minus other refunds.
- Cash Close is receptionist-only (admin has none). Expected cash = cash taken that day minus cash
  refunds processed that day; a difference needs a note; one close per day, never a future day.
- Inventory is view-only for the receptionist; the admin Inventory page arrives in Task 5.
- Run `python manage.py seed_demo` again to get the 14 demo products with opening stock.
- `complete_demo_visit` command removed (the POS replaces it).

## Task 3c: owner browser walkthrough (to verify on the PC)
1. Backend: `python manage.py migrate`, then `python manage.py seed_demo` (adds products).
2. Customer books and pays online; receptionist confirms and checks the guest in (Appointments).
3. Receptionist > POS / Billing: the guest is under "Ready to bill". Click Bill.
4. Add a product (stock shown), try a 30% discount (refused, cap 20%), 10% with a reason (accepted),
   add a tip, split the payment between cash and UPI; "Complete bill" stays disabled until the
   amounts match. Complete: the invoice opens; Print works.
5. Inventory (view): the product count dropped by what you sold; low-stock items are flagged.
6. Try to bill more than the stock: the message says "Only N ... in stock".
7. Invoices tab: search by number or name. Open an invoice > Request refund (amount up to refundable).
8. Admin > POS / Billing > Refunds tab: approve (choose cash/card/UPI) or reject (reason needed).
9. Receptionist > Cash Close: today's cash, card and UPI; count the drawer; a wrong count needs a
   note; sign off; the day becomes read-only. The admin has no Cash Close.
10. Customer: the invoice shows in Invoices and a new "Rate your stylist" card appears.
11. Customer and stylist accounts cannot open /pos, /cash-close or /inventory (403 page).

## Task 3d decisions
- A WorkSession row is written for receptionists only (admin, stylist and customer have none). It
  starts at sign-in and ends at sign-out; signing in again elsewhere closes the older one.
- Idle rule (server-side, 15 minutes, `SALON_IDLE_MINUTES`): only real clicks/keys count. The page
  pings `/api/auth/activity/` at most once a minute; background refreshes and polling do not count.
  After 15 idle minutes every request (and token refresh) is refused, the session ends at the LAST
  ACTIVITY (idle time is not paid) and the receptionist must sign in again. The page warns one
  minute before ("Stay signed in") and shows a notice on the login page.
- Pay = worked seconds x hourly rate (set by the admin on the Staff page), rounded to paise. It is
  an ESTIMATE until payroll (Task 6) approves it. A missing rate shows "Not set yet", hours still count.
- An open session counts only up to its last activity. Months are by sign-in date (shop time zone).
- Admin corrections: API only for now (`GET /api/staff/<id>/hours/`, `POST
  /api/staff/work-sessions/<id>/correct/` with start, end and a reason). They are audited, shown to
  the receptionist as "Corrected by admin", cannot overlap another session, cannot be in the future
  or longer than 16 h. The screens for them arrive with Staff Summary / Payroll (Task 6).
- Receptionists signed in before this update must sign in once more (they have no open session).

## Task 3d: owner browser walkthrough (to verify on the PC)
1. Backend: `python manage.py migrate`. Admin > Staff: make sure the receptionist has an hourly rate.
2. Sign in as the receptionist. Menu now has My Hours & Pay: it shows "On the clock" for this session.
3. Work for a few minutes, sign out, sign in again: two rows; the first says "Signed out".
4. Idle test without waiting 15 minutes: in backend/.env add `SALON_IDLE_MINUTES=2`, restart the
   backend, and change nothing on the page for 2 minutes. (The page itself still waits 15 minutes
   for its own warning; the server will refuse the next click: you are sent to the login page.)
   Remove the line again afterwards.
5. Hours and pay: check Today, This month, rate and Estimated pay = hours x rate. Change the month.
6. Customer, stylist and admin accounts cannot open /my-hours (403 page).

## Task 4a: decisions
- A stylist profile links to one account and an account to one profile (tested). Accepting a
  stylist invite creates a hidden (non-public) profile; `python manage.py link_stylist --email X
  --profile Rahul` links an existing team profile instead (audited).
- Stylists see only their own scheduled, checked-in, in-progress and completed visits. Requested,
  unpaid, cancelled and no-show visits are hidden. Visit cards show the guest's first name only;
  no phone, email, price or payment ever appears in a stylist response (tested).
- Start (checked in -> in progress) and Complete (services really done + optional note). Only done
  services are billed and counted for pay. A removed service shows on the POS card, the checkout
  and the invoice ("Service change"), and the front desk sees the note. If the online prepayment
  is more than the new total, the existing admin-approved refund is created for the excess.
- Pay: task payout is a flat amount per service (`seed_demo` sets 30% of the price) scaled by the
  share done. Rating multiplier is 1.00 below 5 ratings; bands 4.5=1.20, 4.0=1.10, 3.5=1.00,
  3.0=0.90, below=0.80. Earnings are labelled Estimated until payroll approval (Task 6).
- Days off cannot overlap scheduled, checked-in or in-progress visits; the stylist sees the
  visits and is told to ask the front desk to reschedule first. Approval is in Task 6.
- Not yet wired: per-stylist `weekly_hours` in the booking engine (admin edits it in Task 5/6).
- The stylist "Zen Chat" menu item is hidden until Task 4b.

## Task 4a: owner browser walkthrough (to verify on the PC)
1. Backend: `python manage.py migrate`, then `python manage.py seed_demo` (fills task payouts).
2. Admin > Staff: invite a stylist and accept the link, or run `link_stylist` for Rahul.
3. As the receptionist: confirm a booking for that stylist with an add-on, pay it, check the guest in.
4. As the stylist: My Day shows the visit (first name only). Start it, then Complete it with the
   add-on unticked and a note.
5. As the receptionist: POS shows "Ready for checkout", "Not done" and the note; bill it; the
   invoice shows "Service change".
6. As the stylist: Earnings shows Estimated, the per-task row and "Not enough ratings yet (n of 5)".
7. My Schedule: ask for days off over a day with a visit: you see the visit and are told to ask
   reception to reschedule first. Pick a free day: the request is sent; Withdraw works.
8. Customer, receptionist and admin cannot open /my-day (403 page).

## Task 4b: decisions
- One thread per customer-stylist pair (history kept; each message is tagged with the visit it was
  sent about). A thread appears once a visit between them is scheduled or later (paid), stays open
  while a visit is scheduled / checked in / in progress, and turns read-only 7 days after the last
  completed visit. A new scheduled visit reopens the same thread. Cancelled, rejected, unpaid or
  expired visits never open a thread.
- Receptionist and admin have no chat access anywhere: policy denies every chat API action, and the
  WebSocket refuses their connection (tested). A thread that is not yours is a plain 404.
- Live: Django Channels (Daphne). The socket is `/api/ws/chat/<thread id>/` (under /api/ so the
  httpOnly sign-in cookie is sent; no token in the URL). The browser Origin must match
  ALLOWED_HOSTS. Membership, the thread state and the account's active flag are re-checked on
  connect AND on every message, typing signal and read receipt. Refused sockets close with 4403.
- Sent / delivered / read ticks, typing indicator, automatic reconnect with backoff (missed messages
  are re-fetched), and a REST fallback for sending while the socket is down.
- Messages are AES-256-GCM encrypted at rest with a key derived per thread (HKDF over the master
  key with the thread id), bound to the thread by the GCM associated data. Message text is never
  logged (tested). Plain text only: control characters removed, max 1000 characters, 20 messages
  per minute per account; the screen shows text escaped (no markup is ever interpreted).
- Policy: new actions chat.threads.list / messages.list / messages.send / messages.read and
  chat.ws.connect / chat.ws.send, granted to customer and stylist only; a new `websocket` section
  in shared/policy.json lists the WebSocket route (a test checks it against config/asgi.py).
- UI: person cards (avatar, first name for guests, appointment chip, last message, unread badge)
  under stylist menu "Zen Chat" (/chat) and customer "Stylist Chat" (/customer/chat), plus a
  "Message <stylist>" link on My Appointments cards.
- Single-process dev uses the in-memory channel layer. For deployment (task not assigned yet, see Task 12) switch
  CHANNEL_LAYERS to Redis so several workers share messages.
- Open question left as agreed: true end-to-end encryption (server cannot read) is a later add-on.

## Task 4b: owner browser walkthrough (to verify on the PC)
1. Backend: `python manage.py migrate`, restart `python manage.py runserver` (it serves WebSockets
   through Daphne). Frontend: `npm run dev`.
2. Have a paid, scheduled visit between a customer and your linked stylist (as in the 4a walkthrough).
3. Customer (browser 1): My Appointments shows "Message <stylist>". Open it, send a message.
4. Stylist (browser 2, another profile or private window): Zen Chat shows a card with an unread
   badge, the visit chip and the last message. Open it: message appears, customer sees the double tick
   turn blue (read). Type: the other side sees "is typing…".
5. Stop the backend for a few seconds: the badge says Reconnecting…; start it again: it goes back
   to Live and missed messages appear.
6. Receptionist and admin: no chat menu item, and /chat and /customer/chat show the 403 page.
7. Closing: in the Django shell or admin, a completed visit older than 7 days makes the thread
   read-only ("This conversation is read-only now").

## Temporary exceptions (owner-approved)
- Planned menu items show an informative empty state (name, what it will do, the task it
  arrives in) via `PlannedPage`. Remove each one as its task is built. Status lives in
  `shared/policy.json` (`status: planned|available`).

## Known issues
- Task 9 (planned, spec in MASTER_NOTES section 36): "For Zenotians" page with a left sidebar
  (Overview, About me as a resume, The project, How it maps to Zenoti, Engineering decisions, Try
  the demo, Contact). The owner must supply the resume before About me can be filled.
- "For Zenotians" page content is pending from the owner (the one allowed placeholder; the
  page shows a "content on its way" notice and is marked `data-content-pending`).
- `npm audit` reports 12 advisories in dev-only tooling; review separately.

## Task 5a: decisions
- Admin Staff page: "Edit details" drawer per stylist (display name, title, bio, photo link,
  divisions, services they can do, weekly working hours, show/hide on the public Team page). A
  stylist with no team profile can be linked to an unlinked one. Receptionist hourly rate stays
  inline in the table. Every change is audited (STAFF_PROFILE_UPDATED) with old and new values.
- Weekly hours and approved days off are now enforced by the booking engine: the slot list, online
  confirm, reschedule and desk bookings all refuse times when the stylist is not working. A day not
  set by the admin follows the salon's hours; "Day off" blocks that weekday.
- Days off: the admin approves or declines (a reason is needed to decline). Approving over booked
  visits shows them and needs "Approve anyway"; the visits stay booked and the desk moves them.
  The desk schedule lists stylists who are off. The stylist gets a simulated email.
- Deactivating a stylist locks them out at once and removes them from the public Team page.
- New admin page Services (/services): tabs Services, Categories, Rooms. Divisions (Salon, Spa,
  Beauty parlor) are fixed and not editable. Services carry price, minutes, audience, a GST rate of
  their own (empty = the salon rate), the stylist payout per service, options and add-ons.
- Services with visits and rooms in use cannot be deleted, only hidden; categories with services
  cannot be deleted. Changes show on the public site at once. Audited as CATALOGUE_CHANGED.
- Policy: new actions staff.details.read/update/link, staff.daysoff.list/decide, catalogue.read/write,
  admin only. Denial tests for customer, stylist, receptionist and guest on every endpoint.
- Admin menu items not on the 5a to 5d list and not in Task 6: Concierge (Task 7), Users & Roles
  (a Settings sub-page) and live numbers on the admin Dashboard. Owner to decide where they go.
- Migrations: scheduling 0004 (Service.gst_percent), accounts 0011 (audit actions).

## Task 5a: owner browser walkthrough (to verify on the PC)
1. Sign in as admin. Menu > Services is now live. Edit a service price, open the public Services
   page in another tab: the new price shows at once. Hide a service: it leaves the public page.
2. Services > Add a service with an option and an add-on; leave GST empty, then set 5 and check a
   booking quote uses it. Try to delete a service that has visits: it is refused (hide instead).
3. Categories and Rooms tabs: add, rename, hide. A category with services cannot be deleted.
4. Staff > Edit details on a stylist: tick services, set Monday to Day off and Tuesday to own hours
   12:00 to 18:00, save. On the booking page that stylist no longer offers Monday or before 12:00 on
   Tuesday. Untick "Show on the public Team page": they leave the Team page.
5. As that stylist, request days off (My Schedule). As admin, Staff > Days off: approve, or decline
   (a reason is required). Book a visit on a requested day first to see the "Approve anyway" warning.
6. Deactivate the stylist: their open session stops at once and they leave the Team page.
7. Audit: Staff page > Recent security activity shows the changes.

## Task 5b: decisions
- Admin Inventory page (/inventory for the admin; receptionists keep the view-only page): Products
  (add, edit, hide, delete only if never stocked), Stock ledger (per product or all), Suppliers
  (add, edit, hide, delete only if never used). A stock level is never typed in: the product form has
  no stock field and the API refuses `stock`. Levels change only by a ledger row: stock received
  (optional supplier), count adjustment (+/-, reason required) or wastage (reason required). A
  movement that would take stock below zero is refused. Low-stock alert at or below the product's
  level, shown as a banner and a badge. New ledger reasons: wastage, return. Audited: PRODUCT_CHANGED,
  SUPPLIER_CHANGED, STOCK_MOVED (with level after).
- Not built (not on the owner's list): purchase orders, product cost price. Say if you want them.
- Refunds were already the only way to correct a paid invoice (Task 3c: invoice stays immutable,
  receptionist asks, admin decides, reason required, audited). 5b adds: the admin can tick, when
  approving or refunding directly, which products go back on the shelf (ledger row "return" linked to
  the invoice, never more than were sold) and whether to take back loyalty points. Points: the share
  of the earned points in proportion to the amount refunded, never below the customer's balance; if
  the refund empties the invoice, points used as part payment are given back. A decided refund can
  no longer be changed or deleted (model guard). The receptionist cannot choose reversals (400).
  Nothing is reversed unless ticked.
- Cash close review: the admin sees every signed close (POS / Billing > Cash closes), with
  difference, and marks it reviewed once. A close with a cash difference needs a note. The counts
  themselves stay as signed (review is stored separately). Audited: CASH_CLOSE_REVIEWED.
- Settings page (/settings): shop details (address, phone, email, map link, GST number with format
  check; stored with the public contact block), opening hours (drive booking and the public list of
  hours, closed days show as Closed), free-cancellation window, payment hold time, discount cap,
  receptionist idle timeout (5 to 120 minutes; the desk reads it from the server with each activity
  ping), and rating bands with minimum ratings and the flag level (highest first, last band must start
  at 0). Each section saves on its own; changes are audited as SETTINGS_CHANGED with {field: [old, new]};
  saving unchanged values writes no entry. The discount cap moved from the Staff page to Settings.
- Settings audit and security log pages arrive in 5d; Users & Roles is still not on any list.
- Policy: new actions inventory.manage, inventory.stock, cash.close.review, settings.business.read and
  .update (admin only), with denial tests for customer, stylist, receptionist and guest.
- Migrations: billing 0006, inventory 0002, people 0008, accounts 0012 and 0013.

## Task 5b: owner browser walkthrough (to verify on the PC)
1. Admin > Inventory: add a product with opening stock 4 and low-stock level 5: the low-stock banner
   and badge show. Edit it: there is no stock field. Change stock > Stock received 10 (pick a
   supplier): level 14, the Stock ledger tab shows both rows. Try wastage without a reason: refused.
   Try writing off more than is in stock: refused.
2. Suppliers tab: add one, use it in a delivery, then try Delete: refused (Hide works).
3. As receptionist, sell the product at POS. As admin, POS / Billing > Invoices > open the invoice >
   Refund: tick "put back on the shelf 1" and "take back loyalty points", refund. Inventory shows
   the unit back (ledger row "Returned by a customer"). Try putting back more than was sold: refused.
4. Receptionist: sign off the cash close (Cash Close). Admin: POS / Billing > Cash closes > Mark
   reviewed (a note is needed if the count was off). Reviewing twice is refused.
5. Admin > Settings: change the phone and GST number: the public footer shows the new phone at once.
   Close Monday in Opening hours: the public hours list shows "Monday: Closed" and Monday has no
   slots on the booking page. Change the free-cancellation window to 48 and the discount cap to 5:
   the receptionist's checkout cap is 5%. Set the idle timeout to 5: the receptionist is signed out
   after 5 quiet minutes. Change a rating band: Earnings uses it.
6. Staff page > Recent security activity (and the Django audit table) show each change with old and
   new values.

## Task 5c: decisions
- Marketing consent: `CustomerProfile.marketing_opt_in` (default false) with the date of the last
  change. A tick box (unticked) on Register and on the customer Profile page (which shows the date).
  Existing customers count as not opted in. Every change is audited (MARKETING_CONSENT, with where it
  happened: registration, profile or unsubscribe link). Saving other profile details never changes it.
- Website content: hero, about, announcements and the Zenotians page sections are drafts first
  (`SiteContent.draft`). Admin saves a draft, previews it (live preview next to the form and the
  `/api/admin/content/preview/` endpoint), then publishes or discards. Announcements and the
  Zenotians page can also be unpublished (hidden); hero and about cannot be hidden. The public site
  only ever reads published values; announcements also respect their start and end dates and show
  in a strip above the navbar. FAQs (the chatbot's knowledge source) and achievements are edited row by
  row: an unpublished FAQ (`is_active` false) is a draft, hidden from the site and the bot. Image
  fields accept an https link or a site path only. Shop details, hours and GST stay in Settings.
  Audited as CONTENT_CHANGED / CONTENT_PUBLISHED.
- Coupons: code (unique, upper-cased), percent or rupees off, smallest bill, cap in rupees, start and
  end date, total uses, uses per customer, applies to (whole bill, services, products), "can be
  combined", on/off. Typed in at the POS with an Apply button. Rules (one place: `marketing/coupons.py`):
  one coupon per bill; a coupon that is not "can be combined" is refused when the bill has a manual
  discount; a combinable coupon plus a manual discount together must stay inside the receptionist's
  discount cap (the admin has no cap); a coupon on its own is the admin's promotion and is not held
  to the receptionist cap. The coupon is spread over the lines it applies to in proportion to price;
  GST is worked out on the price after the coupon. The usage limits are checked inside the checkout
  transaction with the coupon row locked, so two counters cannot both use the last redemption. The
  invoice records `coupon_code` and `coupon_amount` (the coupon's rupees are inside discount_amount);
  a `CouponRedemption` row is written once and can never be changed or deleted. Receipt and invoice
  show the coupon on its own line.
- Loyalty rules (points per Rs. 100, rupees per point, most of a bill points can pay) are edited on
  the Marketing page; they use the same stored settings as the POS and apply to the next bill.
- Offers (shown on the website) are edited on the Marketing page.
- Campaigns: draft, then send. Simulated email (new outbox kind "marketing") only to active
  customers who opted in; audiences: all, visited in the last 90 days, not visited in 90 days.
  Every message has an unsubscribe note and a signed link (`/unsubscribe?token=...`, works without
  signing in, POST to confirm). Sent campaigns cannot be changed or re-sent; sending to nobody is
  refused. Audited (CAMPAIGN_SENT stores counts, never message text).
- Reports (Recharts bar charts, date range, CSV): revenue by day, by service, by stylist, by
  division; appointments by status; no-shows and cancellations; top customers; product sales.
  Revenue = invoice subtotal (before GST) with GST, total, discounts, tips next to it; a bill is
  shared over its lines in proportion to their price, service lines go to the service, its division and
  its stylist, product lines go to "Retail" (no stylist). So every split adds up to the invoice
  subtotal exactly (tested). Refunds are shown on the day they were paid, not subtracted. Appointment
  reports use the visit date. Ranges are at most 366 days. CSV cells that start with = + - @ are
  prefixed with an apostrophe so a spreadsheet cannot run them. CSV downloads are audited.
- Policy: new actions content.read/edit/publish, marketing.manage, marketing.send, reports.view (admin
  only) and public.unsubscribe; route /unsubscribe is public. New admin menu item "Website"
  (/content); Marketing and Reports are now available. Denial tests for customer, stylist,
  receptionist and guest cover every new endpoint.
- Migrations: accounts 0014 and 0015, billing 0007, core 0005, marketing 0001, people 0009,
  website 0002. New dependency: recharts (package.json; run `npm install`). The sandbox could not
  reach the npm registry, so the chart itself could not be rendered here: the chart is isolated in
  one file (`components/charts/BarChartView.tsx`) and the tests replace it with a labelled box.
- Not built (not on the list): scheduled/automatic campaigns, real SMS/WhatsApp, per-customer
  coupons, reports by hour or by payment method.

## Task 5c: owner browser walkthrough (to verify on the PC)
1. Register a new customer with the marketing box ticked, and another with it unticked. Profile shows
   the box and the date. Untick and save on one: the date changes.
2. Admin > Website: change the banner headline. The home page does not change until you press Publish.
   Save draft, look at the preview, Publish: the home page changes. Edit again and Discard draft.
3. Announcements: add a notice, save, publish: a strip appears on every public page. Hide from site:
   it disappears. Set an end date in the past: it does not show.
4. FAQs: add a question (it is a draft), publish it: it shows on the home page FAQ. Hide it again.
5. Admin > Marketing > Coupons: create SAVE10 (10%, one use per customer). At POS, bill a visit and
   Apply coupon SAVE10: its own line shows and the total drops. Try a second bill for the same
   customer: refused. Make a receptionist discount of 5% and apply SAVE10: refused unless the coupon is
   "can be combined".
6. Loyalty: change points per Rs. 100 to 2; the next bill shows double points.
7. Campaigns: New campaign > Save draft > Send. It reaches only opted-in customers (see Dev mailbox, or
   the Mail outbox); the message has the unsubscribe link. Open the link, press Unsubscribe me: the
   customer's Profile box is now unticked and a second campaign no longer reaches them.
8. Admin > Reports: pick each report, change the dates, Download CSV. The Revenue by day total equals
   the sum of the invoices in POS / Billing for those days.
9. Receptionist, stylist and customer: none of Website, Marketing or Reports is in their menu, and the
   URLs /content, /marketing and /reports show the "not allowed" page.

## Task 5d: decisions
- Audit Log (admin, /audit-log): filters for action, "by" email, free text, date range; 50 per page;
  details shown with secrets masked (any key containing password, token, secret, code, hash, otp,
  authorization, cookie or key, at any depth). The old `/api/audit/` list is masked the same way.
  CSV download is a separate endpoint (policy `audit.export`), cells are protected against spreadsheet
  formulas, capped at 20,000 rows, and each download is itself audited (`audit_exported`).
- Security (admin, /security), three tabs:
  1. Sign-ins & locks: failed sign-ins and lock-outs in the last 7 days, most-failed emails, the recent
     failures with IP, and the accounts locked now with an Unlock button (audited `lock_cleared`).
  2. Staff sessions: every live (not expired, not revoked) refresh session of admin, stylist and
     receptionist accounts. "Sign out this session" blacklists that refresh token, ends a
     receptionist's work session, and is audited (`session_revoked`). You cannot sign out your own
     session from here (use Sign out). The session id shown is the token's jti, never the token.
  3. Data requests: see below.
- Known limit, documented on the page: a receptionist is cut off at once (their work session is
  closed). Other staff keep the access cookie for up to 15 minutes (its lifetime) but cannot renew it.
- Data requests: the customer asks on Profile > Your data (download my data, or delete my account).
  One waiting request per kind; the customer can cancel while it waits. The admin completes or
  declines (a reason is required to decline). Every step is audited (`data_requested`,
  `data_request_decided`, `data_exported`, `customer_anonymized`).
  - Export: after approval the customer can download a JSON file for 7 days. It is built fresh from the
    database each time and is not stored. It contains the account, profile, bookings, invoices,
    loyalty and ratings. It leaves out staff-only notes and chat messages.
  - Delete = anonymize: name, email, phone, allergies, preferences, staff notes, chat messages, rating
    comments, marketing consent, mail-outbox copies and sign-in history are removed or replaced; the
    account is deactivated with no usable password and its refresh tokens are revoked. Invoices and
    amounts stay, with the name "Deleted customer". Not allowed while the customer has an open booking
    or a refund waiting for a decision; the admin sees the reason and the request stays pending.
  - After anonymizing, the request keeps only the label "Deleted customer", never the email.
- Policy: new actions audit.export, security.view, security.unlock, security.sessions.revoke,
  datarequests.list, datarequests.decide (admin) and my.datarequests.list/create/cancel/download
  (customer). A crawl test now walks every `/api/admin/` URL and checks that customers, stylists,
  receptionists and guests are refused on every method.
- Users & Roles is still not on any list (unplaced).

## Task 5d: owner browser walkthrough (to verify on the PC)
1. Admin > Audit Log: entries appear newest first. Filter by action "Login failed", by a date range,
   by text (an email). Page through with Next/Previous. No password, code or token text is visible.
2. Download CSV: a file opens in Excel; a new "Audit log downloaded" entry appears at the top.
3. Sign out, then fail the password 5 times for one customer email. Sign in as admin > Security:
   the count goes up, that email shows under Locked accounts. Press Unlock: they can sign in again,
   and the Audit Log shows "Locked account unlocked".
4. Sign in as a receptionist in a second browser window. Admin > Security > Staff sessions lists them.
   Press Sign out this session: the receptionist's window returns to the sign-in page at its next
   click, and their My Hours shows the session closed. Your own row says "This is you" with no button.
5. As a customer (Profile > Your data): Request my data. The button disables and shows "Waiting for the
   salon". Cancel request, then ask again.
6. Admin > Security > Data requests: Approve download. The customer now sees Download my data and gets
   a JSON file. The Audit Log shows the request, the decision and the download.
7. Customer with an open booking asks for deletion: admin sees the warning, and Delete the account
   shows the reason and changes nothing.
8. Customer with only finished visits: Delete the account > Confirm. The customer cannot sign in. In
   POS / Billing their old invoices remain, named "Deleted customer". If they still appear in the Customers
   list, it is as "Deleted customer" with no phone or notes.
9. Receptionist, stylist and customer: no Audit Log or Security in their menus; /audit-log and /security
   show the "not allowed" page.

## Task 5e-1: decisions
- New apps `wallet` (packages, membership plans, gift cards, sales) and `waitlist`. Policy actions, menu items
  (admin: Packages & Plans, Gift Cards, Waitlist; customer: My Wallet, Waitlist) and audit actions were added.
- One payment path: `billing/tender.py` charges (simulated) for everything sold online; at the counter the
  receptionist picks cash, card or UPI. Every sale makes an immutable `Sale` (SAL-YYYY-nnnnn) which cash close
  includes in the till expectation. Declined online payments create nothing.
- Packages: price is shared over the sessions by list price (paise rounded down) to give each session a value.
  A session is used at checkout and becomes an invoice-level non-cash line (`InvoiceCredit`), so an invoice
  always adds up: total = online prepayment + package/membership credit + loyalty + payments (incl. gift card).
  The session ledger (`PackageEntry`) is append-only. Admin can refund the unused sessions (not after expiry) at
  their share of the price, or put a used session back with a reason.
- Memberships: a percentage off every bill (optionally on products) and optional free sessions per period.
  The member discount comes off first, the manual discount on what is left. One open membership per customer
  (database constraint). Cancel keeps the benefits until the period ends. Renewal is manual and simulated.
  Plan terms are copied at joining, so later edits never change current members.
- Gift cards: 20-character codes from a 32-letter alphabet without look-alike characters (100 bits), made with
  `secrets`. Only an HMAC hash and the last 4 characters are stored: the code is shown once to the buyer (counter
  or online) and emailed to the recipient (simulated mail). A lost code means the admin cancels the card and sells
  a new one. Lists, API and audit log show only the last 4. Wrong codes are limited to 5 per user and 10 per IP
  per 15 minutes (429, audit entry "Gift code locked"); the error never says whether a code exists.
  The balance is the sum of an append-only ledger; redemption locks the card row, so two payments at once can
  never overspend. Gift cards pay at the counter (method "gift_card", can be split) and in the online booking
  payment (all or part; the rest goes through the test gateway; if the gateway fails nothing is taken from the
  card). A cancelled booking or a refund of a gift-card payment returns the money to the card (an expired card gets
  30 extra days). Failed-guess counts are written outside the main transaction so a rollback never erases them.
- GST on package, membership and gift-card sales is recognised when the sessions are used on an invoice (a gift
  card is a voucher, not a sale of services), so the sale receipt carries no GST line.
- Waitlist: a customer asks for a service (and optionally a stylist) inside a time window; at most 5 open
  requests. When a booking is cancelled, rescheduled away or a payment hold expires, the first matching person (by
  join order) gets the slot for `waitlist_offer_minutes` (default 15, Settings > Booking rules). The hold is real:
  pending offers count as busy for everyone else. Accept books the slot (awaiting payment, like any booking) under
  a row lock; two accepts at once book it only once. An unanswered or declined offer moves to the next person;
  the person goes back to waiting (never offered the same slot twice). A rejected request frees nothing because a
  request holds no slot. Real SMS/WhatsApp stays out of scope: offers are emailed through the simulated mailbox.
- Privacy (5d) now also removes a deleted customer's waitlist entries and blanks buyer/recipient details on their
  sales and gift cards; the data export includes their wallet. Item 9 (delete/anonymize) is covered by the 5d
  tests, including the "blocked while a visit is open" test.
- Known limits: the member discount is not counted against the receptionist's discount cap; invoices paid with a
  package/membership session are not cash-refunded (the admin puts the session back instead).
- Test fix outside 5e: `move_to_today` in scheduling/tests/test_desk_customers.py failed between about 22:30 and
  midnight shop time (it put the visit after midnight); it now stays on the same shop day.
- Sandbox results: pytest all passed (about 160 new tests), ruff and migrations check clean; vitest 287 passed
  (21 new), eslint, prettier and typecheck clean (only the known missing-recharts error in the sandbox; the
  production build could not run here, please run `npm run build`).

## Task 5e-1: owner browser walkthrough (to verify on the PC)
1. Admin > Packages & Plans: create a package (for example 3 haircuts for a lower price) and a membership plan
   (10% off, 1 free session, choose the service). Switch one off and on.
2. Receptionist > POS > Sell: sell the package to a customer in cash; sell a gift card of 1000 (buyer name
   "Walk-in", recipient email). The code appears once; copy it. Closing the window never shows it again.
3. Customer > My Wallet: the package shows its sessions left. Buy a membership (test payment) and a second package.
   Try "Simulate failed payment": nothing is bought. Buy a gift card with a recipient email: the code is shown
   once; Admin > Mailbox shows the email with the code.
4. Receptionist: check in that customer's visit, open POS > Bill. Pick "Use a package session" (or the free
   membership session): the service line is paid by the session; products still need payment. Add a gift card
   payment: type the code, Check balance, split with cash. Complete. The invoice shows member discount and credit.
5. Admin > Packages & Plans > Packages sold: see the ledger, Put back the used session with a reason, or Refund
   unused sessions. Sales tab: every sale. Cash close includes the counter sales.
6. Admin > Gift Cards: only the last 4 characters; History shows the ledger; Cancel card needs a reason, and the
   code stops working.
7. Customer: type 5 wrong gift codes (Check balance): the sixth says wait 15 minutes. The Audit Log shows
   "Gift code locked".
8. Customer pays a booking from My Appointments > Pay with the gift card code (part or all).
9. Waitlist: customer A books and pays a slot. Customer B > Waitlist > Join for the same service, window around
   that time. A cancels. B sees "A slot opened... held for you" with minutes left; Take this slot books it
   (awaiting payment). A third customer who joined later is offered the slot if B declines or lets it expire.
   Admin > Waitlist shows everyone; Remove needs a reason. Settings > Booking rules > Waitlist offer hold changes
   the minutes.
10. Receptionist/stylist: no Packages, Gift Cards or Waitlist menus; /packages shows the "not allowed" page.

## Task 5e-2: decisions
- Private coupons: the admin issues a unique code (prefix + 8 random characters) to chosen customers or to a group
  (all / recent / lapsed, only customers who agreed to marketing). Each works for that customer only, once, until
  the last day. Another customer, or a made-up code, gets the same plain "not valid" message. Admin can withdraw an
  unused coupon. Private coupons never appear in the shared coupon list or in campaign coupon choices.
- A private coupon is emailed (simulated mailbox) only to customers who agreed to marketing; every customer can see
  their own in My Wallet > My coupons (`/api/my/coupons/`).
- Deleting an account switches its private coupons off; the data export lists them.
- Campaigns can be scheduled for a date and time (must be at least a minute ahead). A scheduled campaign cannot be
  edited; "Remove schedule" returns it to a draft. Sending is row-locked, so a click and the runner can never both send.
  Run `python manage.py run_campaigns` (for example every minute from Windows Task Scheduler), or press
  "Send due now" on the Campaigns tab. A scheduled campaign with nobody to reach closes with 0 recipients.
- New reports (13 in all, each with CSV): revenue by hour, payments by method (with a reconciliation line:
  bills collected against checkout payments, difference 0.00), busiest hours for visits and for revenue (weekday by
  hour heatmap; every cell shows its number too), packages/memberships/gift cards sold (with gift-card balance still
  owed). Hours are in the shop's local time and use the visit's start time.
- Bug found and fixed by the new tests: locking a campaign that has a coupon failed on the database join.

## Task 5e-2: owner browser walkthrough (to verify on the PC)
1. Admin > Marketing > Private coupons > Issue coupons: name "Thank you", 100 rupees off, last day next month, pick one
   customer by searching their name, Issue. It appears with the code and "Ready to use". Try "All customers who agreed
   to marketing": Admin > Mailbox shows one email per opted-in customer only.
2. Customer (the one chosen) > My Wallet > My coupons shows the code and nothing for others. At POS, type the code on
   that customer's bill: discount applies. Try the same code on another customer's bill: "not valid".
3. After checkout the coupon shows "Used"; Withdraw is not offered. Issue another and Withdraw it: using it fails.
4. Marketing > Campaigns > New campaign, Save. Schedule... pick a time two minutes ahead. It shows "Scheduled" and
   cannot be edited. Remove schedule, then schedule again and wait; press "Send due now" (or run
   `python manage.py run_campaigns`). It becomes Sent and the mailbox has the emails; pressing again sends nothing.
5. Admin > Reports: choose "Revenue by hour of day", "Payments by method" (the line under the title says the
   difference is 0.00), "Busiest hours: visits" and "Busiest hours: revenue" (grid; darker is busier), and
   "Packages, memberships and gift cards". Download CSV for each.
6. Receptionist, stylist: no private-coupon, schedule or report access (direct URLs show "not allowed").

## Task 5e-3: decisions
- Two-step sign-in (optional, admin only, TOTP with any authenticator app). Setup: Admin > Settings > Security >
  "Two-step sign-in" > Turn on: scan the QR (or type the key), enter the 6-digit code, then save the 10 backup codes
  (shown once; stored hashed). Once confirmed, every sign-in asks for a code after the password. A backup code works
  once. A code cannot be used twice (replay refused). Wrong codes count toward the 5-failures lockout.
- The secret is stored encrypted. The QR code is drawn by our own small encoder (`accounts/qr.py`, no new dependency).
- Turning it off or making new backup codes needs the password and a current code.
- Lost phone and codes: another admin can press "Reset" on the Security tab (reason required; signs that admin out,
  emails them, audited). Or on the server: `python manage.py reset_admin_2fa <email>` (audited).
- Purchase orders (Admin > Inventory > Purchase orders): Draft (editable) > Sent (queues an email to the supplier,
  simulated mailbox) > Receive goods (partial allowed; never more than ordered; each receipt writes ledger rows
  with the supplier) > Received. "Close" a part-received order short (reason required) or cancel an unsent one.
  Supplier history shows ordered/received/value and reconciles with the stock ledger.
- A supplier that has orders or received stock can no longer be deleted (409); hide it instead.
- Item 9 (anonymize/delete) was already verified by the 5d tests; not repeated.

## Task 5e-3: owner browser walkthrough
1. Admin > Settings > Security > Two-step sign-in > Turn on. Scan the QR, enter the code, save the codes. Sign out.
2. Sign in as admin: after the password a "Code from your app" step appears. Wrong code: refused. Right code: in.
   Sign out and sign in with a backup code: works once; the same code again fails.
3. Turn off needs password + code. With a second admin, press Reset on the first one; the first signs in with the
   password only.
4. Inventory > Purchase orders > New order: pick supplier, add lines, Save draft, Send. Mailbox shows the email.
   Receive goods for part of it: status "Partly received", Stock page rises. Receive the rest: "Received".
   Another order: send, receive part, Close with a reason. Supplier filter shows the history line.
5. Receptionist/stylist: no Purchase orders or Two-step controls (direct URLs show "not allowed").

## Task 5e-4: decisions
- `core/tests/test_sweep.py` tries every API endpoint as a guest and as each role: anything the policy denies must
  return 403 (401 for guests); anything allowed must never crash (no 5xx).
- Own-data tests for waitlist, offers, membership and wallet; concurrency tests for private coupons, last package
  session and campaign runners (`billing/tests/test_concurrency_5e.py`).
- Reconciliation reports (payments by method, supplier history) have tests that assert difference 0.00.

## Task 6: owner decisions (2026-10-28)
- Punctuality needs a weekly shift editor (built in 6b). No shift = "No shift set". Stylist on time = first appointment
  of the day starts on schedule. Receptionist on time = session starts within the grace period of the shift start
  (default 10 minutes, a setting).
- Rebooking rate = share of the month's completed-visit customers (cancelled and no-show excluded) with another booking
  with the same stylist within 60 days. "Not enough data" below 5 customers in the month.
- Moderation: the stylist only ever sees that a rating is under review (a count). No customer name, comment, stars or
  reason. The original stars stay in the database and in the audit log.
- Payroll adjustments (bonus/deduction) are separate lines on the payslip, never merged into base pay.
- Performance Review is visible to the admin only. No "share with staff" action for now.

## Task 6a: decisions
- New menu item Admin > Ratings (`/ratings`). Payroll (`/payroll`) is now a real page; for 6a it shows the monthly
  stylist pay estimate and breakdown (runs, adjustments and payslips are added in 6c).
- Ratings are never edited or deleted. A rating has a moderation state: Counts / Under review / Excluded, with the
  reason, who and when. Only "Counts" ratings are in the stylist's average, graphs, the pay multiplier and the
  5-ratings minimum. Under review and Excluded look the same to the stylist: one line "N ratings are under review".
  The admin can Put under review (from Counts), Exclude (from Counts or Under review) and Count again (restore).
  Each needs a reason (3 letters or more) and writes an audit entry (`rating_flagged`, `rating_excluded`,
  `rating_restored`) that includes the original stars.
- Admin ratings overview: average, count, month-by-month trend (up/down/steady by 0.2), number under review and
  excluded, "Needs attention" when an average with enough ratings is below the flag level (3.0).
- Stylist pay (admin): same formula as the stylist's Earnings page: task payout (scaled to the services really done)
  x rating multiplier + tips (never multiplied). Breakdown per billed visit: invoice, customer, rating state
  (counted / not rated / not counted under review), base payout, multiplier, payout, tip, total.
  A check line compares tips on invoices with tips in pay (difference 0.00).
- No migrations conflict: `accounts` 0020 (audit actions), `people` 0011 (rating moderation fields).

## Task 6a: owner browser walkthrough (to verify on the PC)
1. Seed or use existing data: a few completed, paid, rated visits (customer rates from My Appointments).
2. Admin > Ratings: each stylist card shows average, count, trend. Open "Comments for <stylist>": stars, comment,
   customer name, service, date; spread of stars; average-by-month graph. There is no delete button.
3. On a 1-star comment press "Put under review", write a reason. The card now says "1 under review". Sign in as that
   stylist > Earnings: "1 rating is under review..." and the average no longer includes it; no comment, name or
   reason is shown. Admin: Exclude, then "Count again": numbers return.
4. Admin > Audit Log: rating_flagged / rating_excluded / rating_restored entries with the reason and original stars.
5. Admin > Payroll: pick the month. Totals, the "difference" check, one card per stylist; "Breakdown for <name>"
   lists every billed visit with the multiplier. With fewer than 5 counted ratings the multiplier is x 1.00.
6. Receptionist, stylist, customer: no Ratings or Payroll menu; direct URLs show "not allowed".

## Task 6b: decisions
- New menu item Admin > Work Hours (`/work-hours`): pick a month; one card per receptionist with hours, monthly pay
  (hours x hourly rate, corrections already applied because the corrected times are the stored times), punctuality and
  how many sessions to check. "Sessions for <name>" opens the session table, the punctuality days and the shift editor.
- Sessions that look wrong are flagged: Very long (over 12 hours), Overlaps another session, Ended by the idle
  sign-out, Still open but idle. A flag is a hint only; nothing changes until the admin corrects a session.
- Correct (Admin only, reason required, audited with old and new times): sign-in and sign-out times; cannot overlap
  another session, cannot end in the future or run over 16 hours. The receptionist sees "Corrected by admin" with
  the reason on My Hours & Pay (they do not see flags). A receptionist cannot correct a session.
- Weekly shifts (Admin only, `shifts_changed` audited): one shift per weekday, none = day off. Used only for
  punctuality. No shifts at all = "No shift set" (no percentage is invented).
- Receptionist on time = first session of the shift day starts no later than shift start + grace. Late = after that
  (minutes late shown). Missed = no session that day, or it started after the shift ended. Days whose shift has not
  started yet are not counted. Grace = Settings > Security > "On-time grace" (default 10 minutes).
- Stylist punctuality (first visit of the day starts within the grace of its booked time) is built in 6c with the
  Staff Summary and Performance Review.
- Migration: `accounts` 0021 (ShiftSchedule, audit action).

## Task 6b: owner browser walkthrough (to verify on the PC)
1. Sign in as a receptionist for a minute and out (creates a session). As admin open Work Hours: the receptionist
   card shows hours, "No shift set".
2. Open "Sessions for ...": Add shift on today's weekday (e.g. 09:00 to 17:00), Save shifts. The punctuality line
   changes to on time / late / missed for the days that have started.
3. Correct a session: change the times, give a reason, Save. Pay and hours update. Sign in as that receptionist:
   My Hours & Pay shows "Corrected by admin" with your reason. Audit Log has `work_session_corrected` with old and
   new times and `shifts_changed`.
4. Settings > Security > On-time grace: change to 30 and save (audit entry shows 10 to 30).
5. Receptionist, stylist, customer: no Work Hours menu; the URL shows "not allowed".

## Task 6c: decisions
- Payroll run: one per month (a second create returns 409). Draft: Recalculate rebuilds the lines from the latest data and
  keeps adjustments. Approve locks every line (a frozen snapshot). After approval nothing is recalculated; corrections are
  new bonus/deduction lines marked "added after approval". Paid runs accept nothing (a correction goes in next month).
  Voiding is draft-only; a voided line stays visible, struck through, and no longer counts. Deductions can't exceed the net.
- Payment is simulated: "Mark as paid" records who/when and an optional reference (max 60 characters). Nothing goes to a bank.
- Stylist line = task pay (after the rating multiplier) with tips as a separate column; receptionist line = hours x rate
  (0 if no rate set). Bonus/deduction are separate payslip lines, never merged into base pay.
- Run checks on screen: tips on invoices vs tips in the run, invoices and visits counted, visits waiting for checkout.
- Payslips: stylist (Earnings page) and receptionist (My Hours & Pay) see only their own, only for approved or paid runs
  (anything else is a 404). Printable with the browser (Print payslip).
- Staff Summary (`/staff-summary`): month or date range (max 366 days; weekly buckets, monthly over 120 days). Team,
  Stylists, Receptionists tabs with Recharts bar and line charts. Revenue is before GST and uses the same allocation as the
  Reports page, so the numbers match "Revenue by stylist".
- Performance Review (same page, admin only): monthly status Continue / Put on notice / Recommend ending the job plus private
  notes, saved once per person and month and updatable. Each save keeps a copy of the indicators. The audit entry records
  the status before/after and the notes length, not the notes. "Recommend ending" does NOT deactivate anyone. No "share with
  staff" action. No overall score.
- Indicator rules (shown under each indicator): ratings good from 4.0, watch from 3.0; punctuality good from 90%, watch from
  70%; rebooking good from 40%, watch from 20%. Rebooking needs at least 5 customers with a completed visit in the month,
  otherwise "Not enough data"; cancelled and no-show visits are left out; visits in the last 60 days may still rebook.
- Migrations: `accounts` 0021 (shifts) and 0022 (payroll/review audit actions), `people` 0012 (payroll and review tables).
- `tsc` may still show the known recharts typing error from earlier tasks.

## Task 6c: owner browser walkthrough (to verify on the PC)
1. As admin open Payroll > Payroll runs. Pick last month (or this month), Create draft run. Each stylist and receptionist
   has a line; "Check: tips on invoices" equals "tips in this run".
2. Open "Payslip for <stylist>": add a Bonus with a reason, then a Deduction. They appear as their own lines under base pay
   and tips. Void one: it is struck through and the net changes back.
3. Recalculate, then Approve run (confirm). Recalculate and Approve disappear. Open a payslip: you can still add a
   correction line; it says "added after approval". Audit Log shows `payroll_*` entries.
4. Mark as paid with a reference. The run is now read-only. Payment is simulated.
5. Sign in as that stylist: Earnings > Payslips shows only that stylist's payslip with separate lines. Print payslip opens the
   print dialog showing only the payslip. Same for a receptionist under My Hours & Pay. A draft run is not visible to them.
6. As admin open Staff Summary: change month, then "A date range"; charts and cards update. Stylists tab: pick a stylist
   (rebooking says "Not enough data" under 5 customers). Receptionists tab: hours chart.
7. Performance Review tab: indicators with their rules. Review a person, choose Put on notice without notes (it asks for
   notes), add notes, Save. Audit Log has `review_saved` without the notes text. Staff cannot open reviews.
8. Receptionist, stylist, customer: no Payroll or Staff Summary menu; the URLs show "not allowed".

## Task 7: decisions
- Engine: ported from reference/chatbot_reference into backend/chatbot/engine (standard library only). Data comes
  from the database: catalogue, prices, durations, hours, contact and team from the real tables; knowledge base from
  built-in entries (chatbot/defaults.py) plus active FAQs (website.KnowledgeEntry). An FAQ tagged `kb:<id>` replaces
  the built-in answer with that id. The engine is cached and rebuilt on any change to services, categories, stylists,
  ratings, site content or FAQs (signals) and at least every 300 s (bulk updates and other processes).
- Aliases (owner answer 1): the existing `Service.tags` field plus default aliases in chatbot/aliases.py. No new
  column; demo_data tags unchanged.
- Personal answers go through `UserTools(user)`, bound to the one logged-in customer. The id the engine passes is
  ignored, so another user's data can not be asked for. Guests get "please log in". Packages, membership and gift-card
  balances reuse `wallet.data.customer_wallet` (which also lapses expired items, same as My Wallet).
- Stylist rating is shown in an answer only when there are at least 5 counted ratings.
- POST /api/chatbot/ask/ is a public policy action (guests and customers). The policy file has no "guests and
  customers but not staff" concept, so staff accounts are refused (403) inside the view; tests cover all three staff
  roles. CSRF applies to guests too (existing global rule). Rate limit: 20 questions per minute per user, or per
  IP address for guests (cache counter, no message text). Behind a proxy the real client IP needs handling at
  deployment (Task 12). Message limit 500 characters. The raw message is never stored or echoed.
- Anonymous log: an unanswered question is stored only as its normalized content words (a key) with a count.
  Messages with digits, "@", links, or more than 8 words are dropped; rows expire after 90 days. A name typed inside a
  question could still end up in a key; admin can dismiss it. Known limitation.
- Insights (7c): admin only (actions chatbot.insights.read / .manage / .test). Add as FAQ creates a website FAQ,
  closes the row, audits it (new audit action `chatbot_question_handled`) and the bot learns it on the next rebuild.
  The test box asks as a guest and logs nothing. The menu item "Concierge" (planned) became "Chatbot insights".
- Only the chatbot's label uses the word "AI" (owner exception in CLAUDE.md).
- Deployment stays unassigned under Task 12 (owner answer 3).
- Not done on purpose: no new dependency, no network call, no ML library.

## Task 7: accuracy report (read the caveats)
The evaluation questions in backend/chatbot/tests/eval_sets.py were written by me (the AI coding assistant), in the
style of real customers (typos, Telugu and Hindi words in English letters, follow-ups, "hair spa" versus "spa").
They are NOT real customer questions, and I knew how the engine works while writing them, so these numbers are
optimistic. Real accuracy will be lower. Check Chatbot insights after launch for real misses.
- Reference sets ported from the earlier project (58 + 36 questions): 100% / 100%. They were used while the rules
  were written, so they count as tuning data and say little.
- TUNING (108 new questions): first run 72.2% (78/108); after general rule changes 90.7% (98/108).
- HOLDOUT (61 new questions, written before tuning started, run once after tuning, never tuned on): 75.4% (46/61).
  The honest gap between the two is the point.
- Tuning changes (all general rules, no question-specific code): synonyms for UPI apps and refund word forms; Hindi
  words (khulta, paisa, wapas); price weight for "rate"; duration weight for "time"; contact, team, booking and
  payment intent weights; a "tomorrow" signal for booking; "pay link" phrase; a rule that keeps the service from the
  previous answer ("how long does it take?"); a rule for short weak same-topic follow-ups ("and on sunday?"); one
  tuning label corrected ("price of spa" is a price list, as in the reference set).
- Tuning misses (10): "number do", "what all do you do", "best service for dry skin" (answered from allergy FAQ),
  "i have a wedding next week what should i book" (read as next appointment), "who does the massages", "can i book
  without logging in" and "how long for refund" (asks which one you mean), "my appointment got cancelled because i did
  not pay", "do you have a membership" (read as my membership), "do you sell cars" (spell-fixed to "card", answers
  with the gift card FAQ).
- Holdout misses (15): "what time do you shut" (shut unknown), "kitne baje tak open ho", "which area are you in",
  "how do i reach the owner", "what do you offer" (read as offers), "hair colour time", "which treatment is good for
  stress", "how many hours before can i cancel", "i cannot come, what do i do", "move my appointment to another day",
  "is your shop hygienic and are tools sterilised", "do i have any booking this week", "haircut price -> and for kids?"
  (answered as a price follow-up, but the reply did not contain the expected Kids' Haircut text; not investigated), "what are your opening hours -> what about sunday" (follow-up
  not recognised), "what is the price of gold" (answered as a price question; should say it does not know).
- Floors in test_accuracy.py (tuning 85%, holdout 70%) are regression guards, not targets. Not fixed on purpose:
  fixing holdout misses now would turn it into tuning data. They are the first candidates for Task 8, using real
  questions from Chatbot insights.

## Task 7: owner browser walkthrough (to verify on the PC)
1. Run migrate and seed_demo (commands in the hand-off). Open the site as a guest: a round "AI Alankar Intelligence"
   button sits bottom right on the home and service pages.
2. Open it (Tab to it and press Enter also works). Click the "Opening hours" chip, then type "price of hair spa", then
   "haircut prise" (typo: "I understood: ..." appears), then "kitna haircut ka". Press Escape: it closes and focus
   returns to the button.
3. Type "when is my next appointment" as a guest: it asks you to log in. Type "spa" or "hair spa vs spa": see the
   "Did you mean" buttons or the right price.
4. Log in as a customer with a booking, ask "my next appointment", "my invoices", "how many points do i have": own data only.
5. Type nonsense ("flurb wibble"): honest fallback with contact details.
6. Log in as admin, receptionist, stylist: no chat button anywhere. As admin open Chatbot insights: the nonsense
   question appears as an anonymous key with a count. Click "Add as FAQ", write an answer, save; ask the bot the same
   question as a guest (after up to 5 minutes, or at once if the FAQ is saved through the app): it answers.
7. In the test box ask "when is my next appointment": it says to log in (no user data). Check the audit log for
   "Unanswered chatbot question added as an FAQ or dismissed".
8. As receptionist or stylist open /chatbot-insights directly: you are sent away (403).

## Task 7 follow-up: "tell me about <service>" (decisions)
- The answer (intent `service_details`) is built only from the service's own database fields, in this order, and a
  line is skipped when its data is empty: (1) description (if empty, the one-line summary, which every service has);
  (2) what is included or the steps: **skipped, the service model has no such field**, nothing is invented; add a field
  later if you want it; (3) "Time:" (one value, or a range when the options differ) and "Price: from Rs X incl. GST."
  followed by the sentence "Prices include GST and may vary with options such as hair length or add-ons.";
  (4) "Suits:" audience (Men, Women, Kids, Everyone (unisex)) and the division; (5) "Offered by:" published team
  profiles linked to the service (first name and specialisation); (6) actions "Book this service"
  (`/customer/book?service=<slug>`, the booking page preselects the service; a guest is asked to log in first) and
  "See similar services" (the division page).
- "I understood: ..." appears only when a spelling was corrected, a synonym or alias was used (for example "gents
  haircut"), or a Hindi/Telugu word had to be translated. It does not appear when the service name was used as is.
- Phrasings that give the same answer (tested): what is / what's / whats X, tell me about X, explain X, details of X,
  X details, describe X, what does X include, is X good for ..., typos, and Hindi/Telugu words in English letters
  (kya hai, ke bare mein batao, gurinchi cheppandi, ante enti). Words added: bare, gurinchi, batao, cheppandi, enti.
  If several services match ("tell me about massage") the bot lists them and asks which one.
- Fixed on the way: "manicure" and "pedicure" were treated as the same word ("nails"), so a question about one listed
  all nail services. They are now separate; "nails" still matches all three.
- Duration and "from" price now use the service options (shortest option), so a service with hair-length options shows
  the range instead of only the base time.
- Seeded descriptions: all 23 demo services have a 2 to 3 sentence factual description (no medical claims, no
  invented policies; durations match the seed). `seed_demo` writes a description only where it is empty, so it fills
  an existing database too and never overwrites the admin's text. The chatbot picks up changes within 5 minutes or
  when the service is saved in the app.
- Admin: Chatbot insights has a new section "Services without description" (active services whose description is
  empty), with a link to Services where the description can be filled in. Test: guest and customer get the same
  public answer (text and actions).
- Not done: a follow-up such as "price of hair spa" then "tell me about it" (no service named in the second question)
  is not understood yet.

## Task 7 follow-up: accuracy report (rerun)
Same caveats as before: questions written by me, not real customers, optimistic. Phrasings for this feature were
also exercised by me while building it (the list in test_details.py), so the new holdout items are NOT blind.
- New questions: 22 tuning + 17 holdout "tell me about <service>" phrasings across 20 services, in English, with
  typos, Hindi and Telugu words. Totals now: TUNING 130 questions, HOLDOUT 78 questions (plus the 94 ported ones).
- TUNING: 120/130 = 92.3% (previous run 98/108 = 90.7%). All 22 new items pass. One regression found by the tuning set
  ("which stylist is good for hair colour" was read as a service explanation) was fixed by excluding stylist words.
- HOLDOUT: 63/78 = 80.8%. The original 61 are unchanged at 46/61 = 75.4% (same 15 misses, listed above; not tuned on);
  the 17 new details items pass 17/17.
- Remaining tuning misses (10) are the same as in the first report. The one holdout miss that changed:
  "which treatment is good for stress" now returns a service explanation instead of a suggestion list; still a miss.
- Floors in test_accuracy.py stay at 85% (tuning) and 70% (holdout).

## Task 7 follow-up: owner browser walkthrough
1. Run `python manage.py seed_demo` (fills the empty descriptions). Open the chat as a guest.
2. Ask "what is hair spa", "tell me about keratin smoothening", "swedish massage kya hai", "describe pedicure",
   "is deep tissue massage good for beginners", "explian head massage". Each shows description, Time, Price (with the
   GST sentence), Suits, Offered by, and the buttons "Book this service" and "See similar services". "I understood"
   appears only for the typo and the Hindi question.
3. Click "Book this service" as a customer: the booking page opens with the service preselected. As a guest it goes
   to login first.
4. Ask "tell me about massage": it lists the massages and asks which one; click one of the suggestions.
5. As admin open Services, clear the description of one service and save; open Chatbot insights: it appears under
   "Services without description". Ask the bot about it: a short answer from the summary. Add the description again.


## Task 8a: security hardening (done in sandbox; see docs/SECURITY.md)
Decisions: CSP for the API is `default-src 'none'`; the SPA CSP is a documented header for the web server (Vite dev needs inline scripts). Rate limits are in-process cache (single process) and documented as a limitation. Invite withdrawal on deactivate chosen over silent keep. Access tokens bound to the password hash.
Found and fixed: forged X-Forwarded-For bypassing throttles; pending invites survived deactivation; `javascript:` banner links; non-race-safe reset/invite links; tokens alive after password change; missing CSP/no-store/limits/log redaction (details in docs/SECURITY.md).
Tests added: `core/tests/test_security_headers.py`, `test_csrf_sweep.py`, `test_deploy_check.py`, `accounts/tests/test_hardening.py`, link tests in `website/tests/test_content_admin.py`.
Not run in sandbox (no internet): `pip-audit`, `npm audit` -> `scripts\audit.cmd` (list results here after the PC run).


## Task 8b: data and reliability (done in sandbox; see docs/OPERATIONS.md)
Decisions: no database exclusion constraint for overlapping bookings (needs the `btree_gist` extension, which an ordinary DB user cannot install; row locks + `check_integrity` instead). Balances stay ledgers (sum of rows), so "never negative" is guaranteed by the row lock and checked by `check_integrity`, not by a column constraint. Restore always goes into a NEW database (never overwrites the live one). Background jobs are one command, `run_jobs`; it purges only expired tokens and sign-in attempts older than 90 days, never audit logs.
Found and fixed: desk invoice list ran one extra query per invoice (refundable amount) and customer "my appointments" ran extra queries per row (chat thread, setting lookups) and "my invoices" did not load credits; all now constant-query.
Added: 5 indexes, 11 check constraints (migrations `*_hardening_indexes_and_checks`), `run_jobs`, `backup_db`, `restore_db`, `check_integrity`.
Tests: `billing/tests/test_concurrency_8b.py` (double checkout, double refund approval, refund over-request, last stock unit, overlapping confirm, double payment, last membership session), `core/tests/test_query_counts.py`, `test_db_constraints.py`, `test_jobs.py`, `test_backup.py`, `test_integrity.py`. Existing tests already cover gift card, package credit, waitlist accept and purchase-receive races.


## Task 8c: browser tests (written and run in the sandbox; first PC run still needed)
Decisions: the e2e suite uses its own throw-away database `alankar_e2e` (`e2e_prepare` refuses any name not ending `_e2e`, so it cannot touch real data), its own API on port 8001 and its own Vite on 5174. Rate limits are lifted only for that test server through env vars; no rule is weakened in code. The shop is opened 00:00-23:59 with zero booking lead time by the fixture, so same-day walk-ins work at any hour (exception: the last ~30 minutes before midnight). Dev tools only: `@playwright/test`, `@axe-core/playwright`.
Files: `frontend/playwright.config.ts`, `frontend/e2e/{full-workflow,basic-a11y,mobile,axe}.e2e.ts`, `helpers.ts`, `pages.ts`; `backend/core/demo.py`; `backend/core/management/commands/e2e_prepare.py`; `scripts/e2e.cmd`, `scripts/e2e.sh`.
Full workflow (4 browser contexts + a second customer): customer books -> desk confirms -> customer pays -> check-in refused on a non-today visit -> role-denial matrix (UI /403 pages and API 401/403) -> second customer gets 404 on someone else's booking/invoice -> desk walk-in + check-in -> stylist start/complete -> POS bill with retail item (INV number, Rs 420.00) -> double billing refused, stock 30 -> 29 -> customer rates 5 stars and sees the invoice -> admin sees audit log, ratings, reports, payroll -> customer cancels the paid future booking and a refund is processed -> logout makes /api/auth/me 401.
Sandbox result: 15/15 workflow steps pass; 12/12 basic-a11y and phone-width (375 px) checks pass (run against the built app in the sandbox's own Chromium). Not runnable in the sandbox: the axe scan (package not installable offline) and the self-starting Vite/Django servers - both are in `npm run e2e` on the PC.


## Task 8d: README, demo reset and demo story (done in sandbox)
Added: `python manage.py reset_demo --yes` (`core/demo.py`, `core/demo_story.py`, `core/management/commands/reset_demo.py`), a complete `README.md`
(Windows and Linux setup, settings table without secrets, tests, browser tests, demo logins, Mermaid diagram, security summary, limitations).
The story: 49 days of history built through the real booking, checkout, rating, purchasing and payroll code with the clock set to each
moment (so invoices, stock ledger, ratings, audit log and payslips agree and are correctly dated). In the sandbox run: 161 visits, 149 billed
(about Rs 1.68 lakh), 130 rated, 7 cancelled, 2 no-shows, a supplier delivery, one breakage, products left at the low-stock level, last month's
payroll approved and paid, one online request, one held slot and three scheduled bookings. `check_integrity` reports nothing wrong on it.
Tests: `core/tests/test_demo.py` (refuses without `--yes`, refuses a non-demo database name, story is fictional, consistent and healthy).

## Task 8: decisions
- `reset_demo` wipes a whole database, so it needs `--yes` and a database name containing `demo` (or ending `_e2e`); any other name needs `--really-wipe <name>`. Chosen over a prompt because it must also work in scripts.
- Demo emails: while the story is built, real SMTP is forced off, so nothing leaves the machine even if Gmail is configured. All demo addresses are `*@demo.example.com`.
- Demo customers meera/vikram/anita/sameer can be asked to rate before booking online (real rule); divya and karthik are the "new" customers for trying online booking.
- Browser tests use their own DB (`alankar_e2e`) and ports (8001, 5174); rate limits are raised by environment variables for that test server only, no rule is weakened in code.
- Same-day e2e steps use an all-day shop fixture, so they are time-independent except in the last ~30 minutes before midnight.
- No database exclusion constraint for overlapping bookings (needs `btree_gist`); row locks plus `check_integrity` instead.
- Rate limits stay in-process (single process); Redis is a deployment task (Task 12).
- Approved dev-only tools added: `@playwright/test`, `@axe-core/playwright` (frontend), `pip-audit` (backend dev requirements). Nothing is added to production dependencies.

## Task 8: vulnerabilities and defects found and fixed (plain list)
1. A forged `X-Forwarded-For` header bypassed every rate limit, including sign-in. Fixed (`NUM_PROXIES`, default 0).
2. A staff invite stayed valid after the person was deactivated, so a deactivated invitee could still activate. Fixed: pending invites are withdrawn.
3. A banner link could be `javascript:` (stored XSS). Fixed with strict link validation.
4. Password reset and invite links could be used twice in a race. Fixed with row locks.
5. Access tokens stayed valid up to 15 minutes after a password change. Fixed (token bound to the password hash).
6. Missing: content security policy, no-store on API responses, request size limits; multipart parsing was on; logs could hold personal data. Fixed.
7. Performance (not security): the desk invoice list, "my appointments" and "my invoices" ran extra queries per row. Fixed; query counts are tested.

## Task 8: owner run and walkthrough (to verify on the PC)
Commands (cmd.exe), after pulling the changes:
```
cd backend
.venv\Scripts\activate
pip install -r requirements-dev.txt
python manage.py migrate
pytest
ruff check .
ruff format --check .
python manage.py deploy_check
python manage.py run_jobs
python manage.py check_integrity
python manage.py backup_db
cd ..\frontend
npm install
npx playwright install chromium
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
cd ..
scripts\audit.cmd
scripts\e2e.cmd
```
Expected: pytest all passed; `deploy_check` warns about debug/HTTPS only on a dev setup; `check_integrity` says "nothing wrong";
`scripts\e2e.cmd` ends with `E2E PASSED` (workflow 15, accessibility, phone width). `scripts\audit.cmd`: copy any finding here.
Demo: create an empty database called `salon_demo` (`SALON_DB_NAME=salon_demo` in `backend\.env`), run `python manage.py reset_demo --yes`, start both servers, then:
1. Sign in as `owner@demo.example.com` (Admin tab, password `Demo-Pass-2026!`): Dashboard and Reports show seven weeks; Ratings shows Rahul highest, Kiran lowest; Payroll has last month paid; Inventory shows low-stock items; Audit log is dated across the weeks.
2. Sign in as `reception@demo.example.com`: Appointments has a new online request and a booking awaiting payment; POS shows invoices.
3. Sign in as `rahul@demo.example.com`: My day and the pay estimate for this month.
4. Sign in as `karthik@demo.example.com`: book a service online; as `meera@demo.example.com` expect a "please rate your recent visit" prompt if a recent visit is unrated.


## Task 8: first owner PC run (2026-10-28) and fixes made from it
Backend: `migrate` applied 2 pending migrations cleanly; `ruff check`/`ruff format --check` clean. `pytest`: 1220 passed, 3 failed, all in `core/tests/test_backup.py`.
- `test_backup_and_restore_round_trip` and `test_restore_refuses_the_live_database_and_existing_names` failed because `pg_dump`/`pg_restore` are not on the owner's PATH (Docker's Postgres *server* image doesn't ship the client tools on the host). Not a code bug: these two tests now `skipif` with a clear reason when the tools aren't found, instead of failing. Added the prerequisite to the README.
- `test_password_is_never_in_the_command_line` failed with `KeyError: 'cmd'` because it only patched `subprocess.run`, not the pg_dump *lookup*; when pg_dump isn't installed, `backup.backup()` raises before subprocess is ever called, so the mock recorder never saw the call. Fixed: the test now also stubs `backup._tool`, so it exercises the same password-redaction path regardless of whether pg_dump is actually installed.
`deploy_check`, `run_jobs`, `check_integrity` all behaved as documented (deploy_check correctly flags a dev `.env` as unsafe for production; check_integrity found nothing wrong). `backup_db` correctly refused with a clear message (no pg_dump on PATH).
`scripts\audit.cmd` ran for the first time (needs internet, could not run in the sandbox) and found real, fixable issues — see docs/SECURITY.md "Dependency audit" for the full detail:
- **Fixed:** `backend/requirements.txt` pinned Django and DRF below their fixed releases; raised to `Django==5.2.17`, `djangorestframework==3.17.2`. This could not be installed or tested in the build sandbox (no internet there) — **run `pip install -r requirements-dev.txt` then the full `pytest` suite before trusting it.**
- **Left as a documented limitation:** `twisted`'s CVEs have no stable fixed release yet (only a release candidate); upgrading to an RC was judged riskier than the CVEs themselves, so it's left to float until a stable fix exists.
- **Left as tracked follow-up work (owner's choice, asked and confirmed 2026-10-28):** `react-router`/`zod` (frontend, production) and `vitest`/`vite` (frontend, dev-only) all have audit findings whose fix is a breaking major-version upgrade. Not attempted in this session; needs its own task with real browser/UI testing, not a same-day patch.
Frontend: `npm test` (vitest): 360 passed, 5 failed (`admin-6c`, `admin-growth`, `admin-ops`, `booking`, `desk` test files), each failing to find an expected element, alongside many background "AggregateError"/XHR console errors on unrelated tests. In my own sandbox, the identical code (no frontend source files changed in Task 8) runs this same suite at 365/365 passed with zero console errors — so this is very likely a Windows-only timing/network quirk (the suite already has a comment and a raised 15s `asyncUtilTimeout` for exactly this class of flakiness on slower/antivirus-scanned Windows machines) rather than a regression from Task 8. Not yet root-caused with certainty; owner asked to re-run `npm test` and report whether the same 5 tests fail every time (which would mean it's worth a deeper look) or it clears on a rerun (which would confirm it's a flake).
`npx playwright install chromium` succeeded (one connection reset, auto-resumed). `npm install` and `ruff`/ESLint-equivalent checks on the backend/frontend all otherwise clean.
Still pending from the owner: a run of `scripts\e2e.cmd` from the repository root (the first attempt used a relative path from inside `frontend`, which doesn't resolve — `scripts\` is a top-level folder, documented more clearly in the README now) and `python manage.py reset_demo --yes`.

## Task 8: second owner PC run (2026-10-28)
Frontend: `npm test` reran clean — **365 passed (365)**, including the 5 that failed on the first run. This confirms the first run's 5 failures were a Windows-only timing/network flake, not a Task 8 regression; no code change needed. `npm run lint`, `npm run typecheck`, `npm run build` all clean/succeeded (`tsc --noEmit && vite build`, 2704 modules). `npm run format:check` flagged one cosmetic warning, `.pytest_cache/README.md` (a Python test-cache file, not a real source file, inside the repo tree) — harmless, not fixed yet, candidate for a `.prettierignore` entry.

`scripts\audit.cmd` ran from the repo root and found, beyond the Task 8a first-run findings:
- **New finding, fixed:** djangorestframework 3.17.2 (the version just pinned from the first audit) itself has 3 CVEs (CVE-2026-114138/114136/114137), fixed in 3.18.2. `backend/requirements.txt` re-pinned to **djangorestframework==3.18.2**. Not installed or tested yet (no internet in the build sandbox) — **run `pip install -r requirements-dev.txt` then the full `pytest` suite again and confirm.** (Django==5.2.17 is unaffected and already confirmed working.)
- `twisted` and the frontend `react-router`/`zod`/`vitest`/`vite` findings are unchanged from the first run — see docs/SECURITY.md, still a documented limitation / tracked follow-up respectively.

`scripts\e2e.cmd` was run from inside `frontend` by mistake ("The system cannot find the path specified") — not a bug, `scripts\` is a top-level folder, not under `frontend`. Still pending: run it from the **repository root** (`cd ..` first, then `scripts\e2e.cmd`).

## Task 8: third owner PC run (2026-10-29)
Backend: `ruff format --check` clean (275 files). `deploy_check` correctly flagged the full list of production-unsafe dev settings (debug on, insecure cookies, no HTTPS/HSTS, dev tools/API docs on) plus Django's own `security.W004/W008/W012/W016/W018` — all expected on a local dev `.env`, not a bug. `run_jobs` and `check_integrity` clean. `backup_db` correctly refused (no pg_dump on PATH, documented limitation). Full `pytest`: **1221 passed, 2 skipped, 0 failed** — confirms djangorestframework 3.18.2 works with zero regressions (two harmless warnings: a Django "can't reach the `postgres` maintenance database" notice, and one test-teardown connection using a bad password from a different test — neither affects correctness).

`scripts\audit.cmd` re-run from the repo root: **Django and djangorestframework now show zero findings** — the 3.18.2 re-pin is confirmed fixed. Only `twisted` (7 CVEs, no stable fix yet) and the frontend `react-router`/`zod`/`vitest`/`vite`/`tinypool` findings remain, both already documented limitations / tracked follow-up (owner's choice, Task 8a).

`scripts\e2e.cmd` still failed with "The system cannot find the path specified" — run again from inside `frontend`. This is the same usage mistake as the second run, not a script bug. Still pending: run it from the **repository root**, e.g. `cd /d "<repo path>"` then `scripts\e2e.cmd` — not merely `cd ..` from inside `frontend` in a terminal that may have changed directory again.

## Task 8: DONE (2026-10-29)
`scripts\e2e.cmd` passed on the owner's PC (run from the repository root). Combined with the earlier confirmed `pytest` (1221 passed, 2 skipped), `npm test` (365 passed), clean lint/typecheck/build, and a clean `pip-audit`/`npm audit` for Django/DRF (only `twisted` and the frontend breaking-upgrade findings remain, both documented limitations/follow-up), Task 8 (8a security, 8b data/reliability, 8c Playwright e2e, 8d README/demo data) is verified end to end on the owner's machine and pushed to `main`.

## Task 8.5: product shop, coupons, packages, memberships (IN PROGRESS, 2026-10-29)
A large feature set, built one numbered part at a time, each committed on its own and verified in
the sandbox before moving on (migrate, pytest, ruff, npm test/lint/typecheck as each part's files
allow). This section is updated as each part lands; it is not DONE until every part is built, the
owner's own PC run (pytest, npm test, lint/typecheck/build) is confirmed, and the final delivery
message (verified / to run / walkthrough / limitations) has gone out.

### Task 8.5: decisions
- **Gift card (and package) code storage.** Gift cards previously stored only a one-way keyed
  hash of the code — "shown once, never again" was a deliberate Task 5e-1 security choice, and
  the plaintext was never kept for cards already issued. Task 8.5 asks the Wallet page to show
  the full code again any time (Show/Hide). These two requirements conflict and the fix changes
  the security model, so I asked rather than picking either side. **Decision (asked, confirmed
  2026-10-29): add a reversible, AES-256-GCM encrypted copy of the code (same scheme already used
  for phone numbers, notes and chat) alongside the existing hash, going forward only.** Cards
  issued before this field existed show "code was only shown once, at purchase" and have no
  Show/Hide button — there is nothing to decrypt for them, since no plaintext was ever stored.
  New gift cards and the new package codes (part 5) both use this. The existing hash-based
  lookup (`code_hash`) is untouched, so no already-issued gift card stops working.
- **Package codes are a new namespace, not reused gift-card plaintext logic.** `wallet/codes.py`
  holds the shared code-generation/mask helpers; `wallet/giftcards.py`'s own `code_hash` function
  was deliberately left untouched (not refactored to take a "purpose" argument) so the hash of an
  already-issued gift card code keeps resolving to the same row. Package code hashing is a
  separate, purpose-scoped function in the same module — the two can never collide or be
  looked up in the wrong table.
- **Package session reservation, not immediate deduction.** The existing `PackageEntry.Reason`
  only had purchased/used/restored/refunded, which assumes immediate, final deduction (POS). Task
  8.5 part 5 needs a reserve-at-request, consume-on-confirm, release-on-reject/expiry/free-window-
  cancel lifecycle for online booking, so I added `reserved`/`consumed`/`released` reasons and an
  `appointment` FK, without touching the existing `used`/`restored` path POS already relies on.
- **Package cancellation/refund is a new, separate flow from the existing admin "refund unused
  sessions" button.** `selling.refund_package` (admin-only, immediate, refunds
  sum(unit_value × remaining) per service) stays exactly as it is for the admin's quick-refund
  case. Task 8.5's customer-initiated, pro-rata-of-amount-paid, approval-required cancellation
  flow is new code (`PackageCancelRequest`) rather than a rewrite of the existing path, so nothing
  that currently depends on `refund_package` changes behaviour.
- **A package session consumed at confirm can still be released by a later free cancellation.**
  `confirm()` consumes the reservation right away (so a package-redeemed booking, whose total is
  always Rs. 0, goes straight to `scheduled` with nothing left to pay — see the next decision).
  Consuming is not the same as "spent for good": a customer who then free-cancels within the
  normal cancellation window should get the session back, exactly as a card payment is refunded
  on the same free cancellation. The first version of `wallet/packagecodes.py` treated "consumed"
  as a terminal state and made `release()` a no-op after it, which silently broke that refund for
  three call sites that all rely on `release()` reversing a consumed session: `customer_cancel`
  (free cancellation), and `desk_cancel`/`mark_no_show` when the admin's `no_show_consumes_session`
  setting is off. Fixed before this was shipped, caught by a sandbox test that asserted the
  (wrong) old behaviour and was corrected once the reasoning above was worked through. `release()`
  now only treats an *already-released* reservation as a no-op (so it is still safe to call more
  than once); `consume()` still refuses to run again after either a consume or a release.
- **A package booking's total is always exactly Rs. 0, so it can never reach `awaiting_payment`.**
  The data model is single-service-per-appointment today (Part 4, products added to a booking,
  is not built yet), so redeeming a package code zeroes the whole appointment's price. This means
  `confirm()` always takes its direct-to-`scheduled` branch for a package booking, and the
  `payment_expired` / resend-payment-link paths can never apply to one. Noted rather than
  guarded against, since there is nothing to guard: revisit this once Part 4 lets one appointment
  mix a package-covered service with paid add-on products, at which point a package booking could
  have a non-zero balance and go through `awaiting_payment` like any other.
- **Shop: delivery only, logged-in customers only.** Every order is delivered (no "collect at the
  salon" option), so a full address and a 10-digit Indian mobile are required; the shop pages sit
  in the customer portal (menu "Shop" and "My Orders"), not on the public site. Guests see nothing.
- **Shop: the cart lives in the browser, prices never do.** The cart is only product ids and
  quantities (localStorage, no personal data). Every price, the GST, the delivery charge and the
  total are worked out by the server on `/api/my/shop/quote/` and again inside the order
  transaction; whatever the page sends about money is ignored (tested).
- **Shop: stock is taken when the order is placed, not when it is paid.** Placing an order writes
  `order` stock movements in the same transaction (products locked in id order, so two checkouts
  cannot deadlock or both take the last item -- tested with two threads). An unpaid order holds
  the stock for `payment_hold_minutes` (default 30) and then expires, writing `order_return`
  movements. A cancelled order also returns its stock the same way.
- **Shop: refunds are automatic for cancelled orders.** A customer may cancel while the order is
  waiting for payment or paid-but-not-packed; the admin may cancel any open order with a reason.
  Both refund every successful payment straight away (simulated, `OrderRefund` records). This
  differs from paid *visits*, where a salon cancellation waits for admin approval -- here the
  admin is the one cancelling, so a second approval step would only repeat the same person.
- **Shop: who moves an order along.** Receptionist and admin both mark orders packed -> shipped
  -> delivered (one step at a time, no skipping, tested); only the admin cancels. A shipped order
  can carry a short delivery note (courier and tracking number) the customer sees.
- **Shop settings** (`SiteContent` key `shop`): `delivery_fee` (49), `free_delivery_over` (999),
  `max_quantity_per_order` (10), `payment_hold_minutes` (30). Editable through the existing
  settings mechanism; an admin UI for them comes with part 8.
- **Products:** two new fields, `description` (shown in the shop) and `sold_online` (some products
  stay counter-only), editable in Admin > Inventory.
- **One online money engine, in the specified order** (`billing/online.py`): items -> coupon ->
  membership -> package -> delivery -> gift card last. It is used by the shop (quote, order) and
  the online booking payment. The counter (POS) keeps its existing order (membership, manual
  discount, coupon) so no existing bill changes; the two only differ for a flat coupon combined
  with a membership.
- **A coupon used when paying for a booking online is carried to checkout.** The visit remembers
  the coupon and the membership amount taken off online; at the counter the service line is
  billed at exactly that, so the online payment covers it and nothing more is asked. Typing a
  different coupon at the counter is refused ("one coupon per bill"); products added at the
  counter are not discounted by the online coupon. The redemption row is linked to the invoice.
- **Coupon uses are given back when the booking or order is cancelled** (free customer
  cancellation, salon cancellation, order cancellation or order payment expiry). The redemption
  row stays as a record with `released_at` set and no longer counts toward the coupon's limits.
- **Membership discount now applies to online booking payments.** Members pay the discounted
  amount online; checkout already applied the same discount, so the bill still balances.
- **Delivery charge is decided on the item total before discounts** (so a coupon never makes an
  order lose free delivery).
- **Gift cards pay shop orders too**, at the payment step (used first, the rest through the
  simulated gateway; if the gateway part fails, nothing is taken from the card). A cancelled order
  puts the gift-card part back on the card.
(further decisions are appended below as each part is built)

### Task 8.5 part 1: gift card codes visible (DONE, committed, verified in sandbox)
See the decision above. Built: `code_encrypted` field on `GiftCard` (migration
`wallet/0003_...`); customer `POST /api/my/wallet/gift-cards/<id>/reveal/`
(`my.giftcards.reveal`); admin `POST /api/admin/gift-cards/<id>/reveal/` (`giftcards.reveal`,
audited `gift_card_code_revealed` with the masked code only, never the full code, in the audit
metadata); ledger of uses now included in `GET /api/my/wallet/`. Frontend: Wallet page gift card
rows get Show/Hide + Copy + a History toggle; admin Gift Cards page's history modal gets a
"Reveal full code" button, masked until clicked, hidden entirely for cards with no stored
plaintext. Sandbox-verified: `wallet/tests/test_giftcards.py` (new reveal tests: owner, recipient,
denied stranger, legacy-card 409, admin audit) and the full automated per-role policy sweep
(`core/tests/test_sweep.py`) pass; frontend `wallet.test.tsx` (28 tests, including 5 new ones for
Show/Hide/Copy/ledger/admin-reveal) pass; `ruff check`/`ruff format --check` on the whole backend
and `tsc --noEmit`/`eslint` on the whole frontend are clean (only a pre-existing, unrelated
sandbox gap remains: `recharts` has no type declarations in this sandbox's `node_modules`, which
is a partial/offline npm install artifact here, not something this change touched — it does not
reproduce with a real `npm install` on the owner's PC).

### Task 8.5 part 5a: package-code redemption wired into booking (backend, DONE, committed,
verified in sandbox)
The booking-side half of Part 5 (code issuing + reserve/consume/release + the booking endpoint).
Still to come for Part 5: the customer-initiated cancellation-request flow (`PackageCancelRequest`
business logic, admin "Package requests" screen, admin settings UI), the customer-facing Packages
page, and the package-code-entry step in the booking sheet's frontend.

Built: `wallet/codes.py` (shared code-gen/hash/mask helpers, namespace-separate from
`giftcards.py`, see the decision above); `wallet/packagecodes.py` (`issue_code`, rate-limited
`find_for_service` — 5 wrong attempts per user / 10 per IP per 15 minutes, same shape as gift-card
lockout, independently counted via `CodeAttempt.Kind.PACKAGE` — `reserve`, `consume`, `release`,
`summary_for_appointment`); `PackageEntry.Reason.RESERVED/CONSUMED/RELEASED` and an
`appointment` FK on `PackageEntry` and on `Appointment.package_purchase`
(migrations `wallet/0003_...`, `scheduling/0006_appointment_package_purchase`);
`selling.sell_package` now issues a code on every new purchase (migration-safe: existing
purchases simply have no code until renewed/re-bought, matching the gift-card "legacy" case).
`scheduling/booking.py`: `create_request(..., package_code=...)` looks the code up for the
requested service, zeroes `price_total`/`gst_amount`/`amount_payable` when it resolves, and
reserves the session inside the same atomic block as the appointment row; `confirm()` consumes
it; `reject()`, `expire_due()` (payment-link expiry) and `customer_cancel()` (free cancellation)
release it; `desk_cancel()` and `mark_no_show()` release it only when the admin's
`package_settings()["no_show_consumes_session"]` is turned off (default: stays consumed).
`BookingRequestView`/`BookingRequestSerializer` accept `package_code`; `package_used` (masked
last-4, session label, reserved/consumed/released status — never the full code) is on every
appointment/request card via `_AppointmentBase`.

Sandbox-verified: `python3 manage.py makemigrations scheduling` / `migrate` apply cleanly;
new `wallet/tests/test_packagecodes.py` (16 tests: valid redemption zeroes the price and reserves
a session; the masked code never leaks the plaintext; a wrong code, another customer's code, a
code for the wrong service, an expired package, and a package with no sessions left are all
refused with the right status code (400 for "not valid at all", 409 for a real conflict the
code's own customer is told about); repeated wrong codes are rate-limited (429) and lock out even
the correct code until the window passes; confirm consumes and goes straight to `scheduled`;
reject releases, and the same code can be redeemed again afterwards; a free cancellation after
confirm releases the session (and a second release call does not double-credit it); a desk
cancellation keeps the session by default and releases it when the admin setting is off;
`consume`/`release` are safe no-ops on an appointment with no package reservation at all); the
full `wallet/` suite (86 tests) and `scheduling/` suite (102 tests) pass; the automated per-role
policy sweep (`core/tests/test_sweep.py`, `core/tests/test_policy.py`) passes; `ruff check`/
`ruff format --check` on the whole backend are clean.

### Task 8.5 part 5b: package cancellation requests (backend, DONE, committed, verified in
sandbox)
The customer-initiated, pro-rata-refund cancellation workflow from the decision above. Still to
come for Part 5: the customer-facing Packages page and the admin "Package requests" screen
(frontend), the package-code-entry step in the booking sheet (frontend), and an admin settings UI
for the four `package_settings()` knobs (the knobs themselves already existed from part 5a).

Built: `wallet/cancellation.py` (`estimate_refund`, `request_cancellation`,
`approve_cancellation`, `reject_cancellation`) using the same pro-rata math as the existing admin
quick-refund (`unit_value x remaining`, capped at what is left of the amount paid), minus an
optional `cancellation_fee_percent`, and respecting `refund_window_days` (days since purchase) and
`refund_expired_packages`. A pending request sets `PackagePurchase.cancel_status = pending`, which
`packagecodes.find_for_service` already refused to redeem (part 5a) -- so a package mid-cancellation
cannot be spent on a new booking. Rejecting clears it back to `none` (code works again); approving
zeroes the remaining credits (new `REFUNDED` entries, same reason the existing admin quick-refund
uses) and creates a `SaleRefund`, and sets `cancel_status = cancelled`. New `AuditLog.Action` values
`package_cancel_requested/approved/rejected` (migration `accounts/0024_alter_auditlog_action`).
Customer API: `GET/POST /api/my/wallet/packages/` (standalone packages list, each row carrying its
code's `code_available`/`masked`, ledger, and any pending cancellation request),
`POST .../<id>/reveal/` (Show/Hide, same pattern as gift cards), `GET .../<id>/cancel-estimate/`
(the refund a cancellation would give right now, so the customer sees it before confirming),
`POST .../<id>/cancel-request/`. Admin API: `GET /api/admin/package-cancel-requests/`,
`POST .../<id>/approve/` (`method`, optional `amount` to approve a different figure, `reason`),
`POST .../<id>/reject/` (`reason`). New policy actions: `my.packages.list/reveal/cancel_estimate/
cancel_request` (customer role) and `packages.cancel_requests.read/decide` (admin role only --
receptionist does not get these, matching the existing admin-only `wallet.refund`).

Package purchases cannot yet be bought with a coupon (Part 3 is not built), so there is no coupon
share to reverse in a cancellation yet -- noted in the module docstring to revisit then.

Sandbox-verified: new `wallet/tests/test_package_cancellation.py` (16 tests: the estimate shown
before confirming matches what approving at that figure actually refunds; the estimate correctly
accounts for sessions already used and an admin-set cancellation fee; a second request while one
is pending is refused (409), as is a fully-used package, an expired package by default, and a
request outside an admin-set refund window; a pending request blocks the package's code at
booking and a rejection un-blocks it; a stranger gets a plain 404 for someone else's package
(estimate, request, both); the admin can approve at the estimate or at a different amount, cannot
approve more than what is left of what was paid, cannot decide the same request twice, and
non-admin roles are refused the admin endpoints outright); the full `wallet/` suite (102 tests,
including the new file) and the automated per-role policy sweep both pass; `ruff check`/
`ruff format --check` on the whole backend are clean.

### Task 8.5 part 5c: customer Packages page and admin Package Requests screen (frontend, DONE,
committed, verified in sandbox)
Part 5's frontend half: the standalone customer Packages page and the admin cancellation-request
decision screen from parts 5a/5b. Still open for Part 5: the package-code-entry step in the
booking sheet (frontend) and an admin settings UI for the four `package_settings()` knobs (the
booking integration itself has worked end-to-end since part 5a, just without a UI to type the
code into yet -- the API already accepts `package_code` on a booking request).

Built: `frontend/src/pages/customer/MyPackagesPage.tsx` (new customer menu item "Packages",
`/customer/packages`) -- every package bought, each with its masked code (Show/Hide + Copy, same
pattern as the gift card Wallet section), credits remaining, a usage ledger toggle, and (when
eligible) a "Cancel for a refund" button that opens a modal showing the live estimate before the
customer confirms a reason. `frontend/src/pages/admin/PackageRequestsPage.tsx` (new admin menu
item "Package Requests", `/package-requests`, admin only -- matching the backend's admin-only
`packages.cancel_requests.*` policy actions) -- pending requests with an Approve (money-back
method, optionally a different amount than the estimate, optional note) or Reject (reason) action,
and a Decided section showing the outcome. `frontend/src/api/wallet.ts` gained the matching
request/response types and functions, and `PurchaseRow`/`PackageLedgerRow` now carry the
`last4`/`masked`/`code_available`/`cancel_status`/`pending_cancel_request`/`appointment` fields the
backend has sent since parts 1 and 5a (the existing combined Wallet page's package section does
not read these yet -- it still only shows name/sessions/expiry, unchanged from Task 5e-1).

Sandbox-verified: 8 new tests added to `frontend/src/pages/wallet.test.tsx` (a package's masked
code with Show/Hide/Copy; a package with no stored code offers no Show-code button; the
cancel-request modal shows the live estimate and submits a reason; a package already pending
cancellation hides the Cancel button instead; the admin approves at the estimate, approves at a
typed different amount, rejects with a reason, and a non-admin role is refused the page outright)
-- the full suite (378 tests across 27 files) passes; `tsc --noEmit`, `eslint . --max-warnings 0`
and `prettier --check` on the whole frontend are clean (the one remaining gap is the same
pre-existing, unrelated `recharts` type-declaration sandbox quirk noted in Task 8 and part 1).
One new sandbox-only gap surfaced while verifying this part: `npx vite build` itself fails here
with `native parse not available in shim` from `@rollup/rollup-linux-x64-gnu` -- a native-binary
limitation of this sandbox container, not something this change touched (`tsc --noEmit`, `eslint`
and the full `vitest` suite all run and pass fine without needing that native binary). This needs
confirming on the owner's PC alongside the rest of the "what you must run" commands below.

Menu/route additions (policy.json, part of Part 8's scope but done now since they belong with
their pages): customer menu item "Packages" (`/customer/packages`); admin menu item "Package
Requests" (`/package-requests`). Both tagged `"task": "Task 8e"` -- the policy menu schema's task
labels are validated against a `Task N[letter][-M]` shape (`frontend/src/policy/policy.test.ts`),
which does not accept a literal "Task 8.5", so every Task 8.5 menu/route entry going forward is
tagged "Task 8e" instead.

### Task 8.5 part 5d: package-code-entry step in the booking sheet (frontend, DONE, committed,
verified in sandbox) -- this finishes Part 5 except the admin settings UI for the four
`package_settings()` knobs, which is still open.

The last missing piece of the online-booking side of package redemption: a "4. Package code
(optional)" field in `frontend/src/pages/customer/BookPage.tsx`'s booking sheet, between "Your
details" and the price Summary card. The backend has accepted `package_code` on a booking request
and zeroed the price for a valid one since part 5a; only the UI to type a code in was missing.

Built: `package_code` added to `BookPage.tsx`'s zod schema (optional, max 32 chars so an obviously
wrong paste is caught before a round trip) and local form state; a plain `Input` for it with a
short explanatory line; a note inside the Summary card, shown only while the field is non-empty,
saying the session will be used and nothing will be due if the code is accepted (there is no live
price-preview call for this -- `GET /booking/slots/` only ever prices the service itself, so this
is an honest "if it's valid" note, not a server-confirmed one; the real outcome is decided when the
request is sent, same as every other server-side check on this form). `frontend/src/api/booking.ts`
gained `package_code?: string` on `BookingRequestPayload` and the `PackageUsed`/`package_used`
types the appointment serializers already return (`last4`, `masked`, `session_label`, `status`),
so an appointment card can show which package covered it (not wired into the appointment-card UI
yet -- the type is there for Part 6/7 follow-up, since no spec bullet asked for that card change
specifically for Part 5).

**Task 8.5 decision, recorded here per the standing rule (two reasonable designs would have
changed what you see, and I judged this one so a real bug didn't ship):** writing the submit test
for an already-used/expired package code surfaced that `scheduling/views.py`'s `booking_error()`
maps a package-code conflict to the *same* HTTP 409 status as a just-taken time slot (both can be
"this package is already being cancelled" vs "the slot you picked was just taken" -- unrelated
reasons that happen to share a status code), and the booking sheet's existing error handling
treated *any* 409 as "the slot was just taken", which would have cleared the customer's chosen time
and shown a misleading "pick another time" toast for what is really a bad package code. Rather than
weaken that slot-conflict handling (which is correct for its own case) or silently misreport
package-code problems, I added a `field` attribute to the backend's `BookingError` (and
`PackageCodeError` is now wrapped with `field="package_code"` in `scheduling/booking.py`'s
`create_request()`), which `booking_error()` passes through as a `field` key in the JSON body
alongside the existing `detail`/`code`/`slots` keys -- the HTTP status codes themselves are
unchanged (still 400/409/429 exactly as `wallet/tests/test_packagecodes.py` already asserted), so
no existing test's expectation needed to change. `frontend/src/api/booking.ts` gained
`packageCodeFieldError(error)`, checked first in `BookPage.tsx`'s submit-error handler, before the
slot-conflict branch; when it matches, the server's real message is shown under the Package code
field instead, and the chosen time and suggested-slots state are left untouched.

Sandbox-verified: 2 new tests in `frontend/src/pages/booking.test.tsx` ("sends a package code along
with the request, and shows it will cover the price"; "shows a package code problem under the
field, without treating it as a slot conflict" -- asserts the real server message appears, that
neither the "Nearest free times" list nor the "That time was just taken" toast appears, and that
the previously-picked slot button is still shown selected) -- full frontend suite now 380/380
across 27 files; `tsc --noEmit`, `eslint . --max-warnings 0` and `prettier --check .` all clean
(only the pre-existing unrelated `recharts` type-declaration gap remains, as before). Backend:
`wallet/tests/test_packagecodes.py` (16 tests) still passes unchanged, confirming the `field`
addition didn't touch any status code; full backend suite run app-by-app (`accounts`, `billing`,
`chat`, `chatbot`, `core`, `inventory`, `people`, `scheduling`, `waitlist`, `wallet`, `website` --
`marketing` has no tests) all pass except one pre-existing, date-dependent flake unrelated to this
session's work: `people/tests/test_admin_team.py::test_a_stylists_weekly_hours_limit_the_slots_and_confirmation`
computes "3 days from today" and asserts a fixture stylist's free hours reach 18:00; it fails on
some days of the week depending on the shop's configured hours for that weekday. That file was last
touched in the Task 5a commit (`862ff42`), long before this session, and nothing this session
changed (`scheduling/booking.py`, `scheduling/views.py`, and the frontend booking files) touches
stylist weekly-hours logic or that fixture -- noted here as a pre-existing gap to look at
separately, not fixed as part of Task 8.5. `ruff check .` and `ruff format --check .` are clean
across the whole backend.

### Task 8.5 part 5e: admin settings UI for the four package-cancellation knobs (DONE, committed,
verified in sandbox) -- this closes out Part 5 completely.

The last open item from Part 5: an admin UI for `website.content.package_settings()`'s four knobs
(`refund_window_days`, `cancellation_fee_percent`, `refund_expired_packages`,
`no_show_consumes_session`), which parts 5b/5c already read and act on but had no settings-page
section to change. Followed the existing Settings page's own pattern exactly (one `SiteContent`
key per section, a dedicated serializer, a diffed audit entry) rather than inventing a new one.

Backend: `website/settings_admin.py` gained `PackageSettingsSerializer` (an optional, nullable
`refund_window_days` 1-3650; `cancellation_fee_percent` 0-100; the two booleans), added as a
`packages` section to the existing `SettingsSerializer`/`snapshot()`/`patch()` -- stored the same
way as every other section, under `SiteContent` key `"packages"` (the same key `package_settings()`
already reads), diffed and audited the same way. No new policy action was needed: this rides on the
existing `settings.business.read`/`settings.business.update` actions the Settings page already
uses, so the automated allowed/denied sweep (`core/tests/test_sweep.py`) already covers role access
to it without any change.

Frontend: `frontend/src/api/adminOps.ts`'s `BusinessSettings` gained a `packages` field;
`frontend/src/pages/admin/SettingsPage.tsx` gained a `PackagesSection` (a checkbox to turn the
refund deadline on/off, with the day-count input only shown while it's on; the cancellation-fee
percent; a checkbox to allow refunding an already-expired package; a checkbox for whether a
no-show/late desk-cancellation still consumes the session), following the same `useSection()` /
`Section` plumbing every other settings section already uses (own save button, own audited diff).

Sandbox-verified: `website/tests/test_settings_admin.py` gained 3 tests (reads the package-setting
defaults; sets all four, confirms `package_settings()` picks them up and the audit entry's
before/after values, then clears the deadline back to "no limit" as its own auditable change;
parametrized bad-value rejection for an out-of-range window or fee) -- all pass, plus the full
`website`/`core` apps (role-denial sweep included); `ruff check .` / `ruff format --check .` clean
across the whole backend. `frontend/src/pages/admin-ops.test.tsx` gained 2 tests (turns the
deadline on, fills in all four fields, and asserts the exact payload sent; rejects a fee outside
0-100 without calling the API) -- full frontend suite now 382/382 across 27 files; `tsc --noEmit`,
`eslint . --max-warnings 0` and `prettier --check .` all clean (same pre-existing `recharts` gap
only). **Part 5 (packages: codes at booking, cancellation requests, the customer/admin pages, and
now these settings) is complete.**

Sandbox note on how backend tests were run this session: this sandbox container had been recycled
since the last session segment (a fresh container, same checked-out code) -- Django and the rest of
the backend's installed packages were not on the default Python path, but a working install was
still present at `/home/claude/env/site` (plus a compiled `argon2` extension at
`/home/claude/env/shim`), and Postgres was already running on port 55432 against
`/home/claude/env/pgdata` per `backend/.env`. Backend commands in this sandbox need
`PYTHONPATH=/home/claude/env/site:/home/claude/env/shim` set (`pip install` itself is blocked by
this sandbox's egress policy -- a 403 from the proxy, not a transient error -- so packages could
not be reinstalled the normal way; this working install was the only route to a green backend
suite here). This is a sandbox-environment detail, not anything the owner needs to replicate on
their own PC, where a normal `pip install -r requirements.txt` continues to be correct.

## Bugfix cycle: weekday-dependent test failure + DB password warning (owner-reported, pre-Task-10)

The owner's PC (Windows, Python 3.11) failed one backend test and showed a Postgres warning during
`pytest -q`. Root-caused and fixed both properly, per the owner's explicit step-by-step instructions
(no loosening/skipping/deleting any assertion):

**The reported failure** (`people/tests/test_admin_team.py::test_a_stylists_weekly_hours_limit_the_slots_and_confirmation`):
hard-coded `max(hours(...)) >= 18`, assuming the shop is always open past 18:45 on `today + 3 days`.
The shop's seeded hours close at 20:00 every day except Sunday (18:00); whenever "today" is a
Thursday, `today+3` is a Sunday, and a 45-minute service's last start is 17:15 -- failing
deterministically, not a flake, on exactly 1 weekday out of 7 (today, 2026-10-29, is a Thursday,
which is why it failed on both the sandbox and the owner's PC). Proved with a 7-weekday parametrized
harness (`unittest.mock.patch.object` on `timezone.localdate`/`now`) before touching anything.
Fixed by making the test config-driven and weekday-agnostic: a `_pick_day(min_days_ahead, *, longest)`
helper finds the week's actual longest-hours day instead of assuming `+3`, and a new
`_expected_last_start_hour(day, duration_minutes)` helper computes the expected hour from the shop's
real open/close/step settings instead of a hard-coded `18`. Added a second test,
`test_the_shops_short_hours_day_limits_ravis_slots_too`, that deliberately exercises the shop's
short day (Sunday) on purpose. Also checked the timezone hypothesis the owner raised (bare
`.astimezone()` vs explicit current-timezone): found and fixed the one real occurrence, in
`people/rating_admin.py`'s `_trend()`, to match the rest of the codebase's `astimezone(tz)` pattern --
proved by direct comparison that this was not actually the cause of the reported failure, just a
latent fragility worth fixing anyway.

**Broader sweep** (as instructed, searching for the same pattern elsewhere): ran the entire backend
suite across all 7 simulated weekdays via a temporary pytest plugin. First pass surfaced two more
issues, both now resolved:
- An apparent failure in `people/tests/test_stylist.py` at two offsets turned out to be a bug in the
  *diagnostic harness itself*: it patched both `timezone.localdate` and `timezone.now`, but Django's
  real `localdate()` already resolves through the module's `now()` internally, so the offset was
  being applied twice to `localdate()` and once to `localtime()`/`now()`, producing an artificial
  1-day skew between the two that doesn't exist in real code. Fixed by patching only `timezone.now`
  (confirmed consistent at all 7 offsets afterwards); no test or production code needed changing.
- A genuine second instance of the same class of bug, in
  `accounts/tests/test_work_admin.py::test_the_receptionist_sees_corrected_by_admin_but_not_the_flags`:
  books a session "yesterday" and reads it back filtered by `month={this_month()}` (today's month) --
  which breaks whenever "today" is the 1st of a month, since "yesterday" then falls in the previous
  month. Fixed by querying the month the session actually falls in (`day.strftime("%Y-%m")`) instead
  of assuming it matches today's month; added
  `test_my_hours_is_scoped_to_the_month_asked_for_even_across_a_month_boundary`, which exercises the
  last day of a month on purpose, regardless of what day it actually is when the suite runs.

Verified: the full backend suite (1268 tests after the two new regression tests) passes cleanly at
all 7 simulated weekdays, with zero failures at every offset. The temporary diagnostic files
(`_fake_today_conftest.py`, `_debug_myday.py`, `_diag_weekday.py`) were deleted; they were never part
of the committed suite.

**The DB warning** (`FATAL: password authentication failed for user "salon"` during test-database
teardown, plus a `RuntimeWarning` about the `postgres` maintenance database): investigated via the
owner's connected PC folder. Both `.env` and `backend\.env` on their machine already agree with each
other (`SALON_DB_PASSWORD` matches in both), which rules out a simple file-mismatch and points to the
well-known Docker Postgres gotcha instead: `POSTGRES_PASSWORD`/`POSTGRES_USER` are only applied the
*first* time the image initializes an empty data volume, so if `salon-db-data` was created before the
current password was set, the live role still holds the old one. Separately, `POSTGRES_DB=salon`
means the image never created a `postgres` maintenance database, which is why Django's test runner's
warning-then-fallback happens (harmless, cosmetic). Could not reach the owner's Docker daemon from
this sandbox to directly confirm the live role's password (the remote-devices bridge is an isolated
Linux VM without Docker), so this was documented as the most likely cause with an evidence-gathering
diagnostic first, then the exact safe, non-destructive fix -- see the new **Troubleshooting** section
in `README.md`. No `docker compose down -v`, no data touched; the fix only resets the role's password
and grants `CREATEDB` via the container's trusted local socket.

**Verification run (this sandbox, real date, no faked clock):**
- `ruff check .`: All checks passed!
- `ruff format --check .`: 280 files already formatted
- Backend `pytest` (1268 tests): see below -- confirmed passing as this entry was written; 2 tests in
  `core/tests/test_backup.py` are skipped when `pg_dump`/`pg_restore` are not on PATH (this sandbox
  has them; the owner's Windows/Docker setup likely does not have the Postgres client tools on the
  host PATH, which is exactly why their run showed "2 skipped").
- Frontend `npm test`: 27 files, 382 tests, all passed.
- Frontend `npm run lint`: clean (`eslint . --max-warnings 0`).
- Frontend `npm run format:check`: clean.
- Frontend `npm run typecheck` / `npm run build`: **could not be fully verified in this sandbox** --
  `node_modules/recharts` here is a pre-existing sandbox stub (`"version": "0.0.0-sandbox-stub"`,
  not the real `recharts@2.13.3`), which has no type declarations, so `tsc --noEmit` reports
  `TS7016` on the two chart components (`BarChartView.tsx`, `LineChartView.tsx`) that import it.
  This is an environment artifact (noted in an earlier session too), not a real type error --
  neither chart component was touched this session. Run these two on your own PC, where `npm install`
  pulls the real package, to get a trustworthy result:
  ```bat
  cd frontend
  npm run typecheck
  npm run build
  ```

Next: wait for the owner to confirm `pytest -q` and the DB fix both pass on their PC before Task 10
or any further Task 8.5 work begins.

## Status update (2026-10-29, owner's instruction)
- Synced the sandbox from GitHub `main` (`0803e6e`, "WIP: Task 8 and partial Task 8.5").
- **Task 8.5 is NOT done.** Done: part 1 (gift-card codes) and part 5 (packages). Not done yet:
  part 2 (Shop and Orders), part 3 (coupons), part 4 (products in booking), part 6 (Memberships),
  part 7 (tests), part 8 (policy, menus, chatbot) and part 9 (docs and delivery). Resuming now, in
  that order.
- **Task 10 is NOT done** and is not started.
- **Task 11 (UI redesign) is ON HOLD** until Task 8.5 and Task 10 pass on the owner's PC. The plan
  for it was agreed in outline (themes Midnight Studio / Sage Calm / Rose Glow, glass components,
  scroll-driven 3D hero, staff photo background) and will be restated before work starts.

### Task 8.5 part 2: Shop and Orders (DONE, committed, verified in sandbox)
Backend: new `shop` app (`Address`, `Order`, `OrderLine`, `OrderEvent`, `OrderPayment`,
`OrderRefund`, `OrderSequence`; migrations `shop/0001`, `inventory/0005-0006`, plus new audit
actions and a mail kind). Delivery mobile and address lines are AES-GCM encrypted at rest (tested
against the raw database row). Endpoints: `/api/my/shop/products/`, `/api/my/shop/quote/`,
`/api/my/shop/addresses/[<id>/]`, `/api/my/orders/[<id>/[pay|cancel]/]` (customer) and
`/api/orders/[<id>/[advance|cancel]/]` (receptionist and admin; cancel is admin only). Every state
change is audited (`order_placed`, `order_paid`, `order_advanced`, `order_cancelled`,
`order_expired`) and the customer is emailed. Privacy: data export includes orders and saved
addresses; anonymizing removes the addresses and blanks the delivery details on old orders; an
open order blocks anonymizing. Policy: 15 new actions, customer menu "Shop" and "My Orders",
receptionist/admin menu "Orders".
Frontend: `ShopPage` (category chips, stock badges, quantity steppers, cart panel priced by the
server, checkout with saved or new address and server field errors shown under the right input),
`OrdersPage` and `OrderDetailPage` for the customer (pay with the simulated gateway, cancel,
tracking timeline), and `OrdersPage`/`OrderDetailPage` for the desk (status chips with counts,
search, date range, next-step button, delivery note, admin-only "Cancel with refund").
Tests: `shop/tests/test_shop.py` (43: prices, delivery rules, bad carts, address validation and
encryption, saved addresses and isolation, the whole lifecycle, expiry, cancel rules, staff steps,
filters, role denials, guests, two concurrency tests, privacy) and `src/pages/shop.test.tsx` (10).

### Task 8.5 part 3: coupons and the online money engine (DONE, committed, verified in sandbox)
`billing/online.py` (pure calculation, fixed order, server-side coupon checks via the existing
`marketing/coupons.py` rules). Shop: `/api/my/shop/quote/` and `/api/my/orders/` accept `coupon`
(row-locked when the order is placed so two orders cannot both take its last use, tested with two
threads); orders store coupon and membership amounts; `/pay/` accepts a gift card. Booking:
`GET /api/my/appointments/<id>/payment/?coupon=` returns the step-by-step quote (or the coupon's
problem), `POST` pays with it; checkout carries the coupon over. Migrations: `marketing`
(redemption may point to an appointment or an order, `released_at`), `scheduling`
(`prepay_coupon*`), `shop` (coupon and membership fields), `wallet` (gift card entry for an order
payment). Frontend: coupon box and coupon/membership lines on the checkout summary and on the
booking payment page; gift card fields on the order payment card.
Tests: `billing/tests/test_online_pricing.py` (28: fixed-number engine cases for every step and
combination, every coupon rule, private coupons, shop and booking flows, carry-over to checkout,
coupon given back on cancel, gift card part payment and refund, two concurrency tests), plus 4 new
frontend tests (`shop.test.tsx`, `booking.test.tsx`).
