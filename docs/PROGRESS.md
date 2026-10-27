# Progress

## Status
- Task 3 (receptionist slice: 3a requests/schedule, 3b check-in/walk-ins/customers, 3c POS/stock/
  refunds/cash close/inventory view, 3d work sessions/idle sign-out/My Hours & Pay): DONE. Verified
  on the owner's PC (2026-10-27): tests, lint, typecheck, build and the browser walkthroughs passed.
- Task 4a (stylist day, appointments, schedule, earnings): IMPLEMENTED in the build sandbox,
  waiting for the owner's PC run (migrate, seed_demo, pytest, npm test, walkthrough below).
  Sandbox: pytest all passed (45 new stylist tests), ruff clean, vitest 171 passed, eslint,
  typecheck, prettier clean (the production build could not run in the sandbox: run
  `npm run build`).
- Task 4a: DONE. Verified on the owner's PC (2026-10-27).
- Task 4b (Zen Chat): IMPLEMENTED in the build sandbox, waiting for the owner's PC run (migrate,
  pytest, npm test, walkthrough below). Sandbox: pytest all passed (25 new chat tests incl.
  WebSockets), ruff clean, vitest 192 passed, eslint, typecheck, prettier clean (the production
  build could not run in the sandbox: please run `npm run build`).
- Next: Task 5 (admin slice).
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
  KnowledgeEntry = FAQ now, chatbot knowledge in Task 8).
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
- Single-process dev uses the in-memory channel layer. For deployment (Task 9) switch
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
- Task 10 (planned, spec in MASTER_NOTES section 36): "For Zenotians" page with a left sidebar
  (Overview, About me as a resume, The project, How it maps to Zenoti, Engineering decisions, Try
  the demo, Contact). The owner must supply the resume before About me can be filled.
- "For Zenotians" page content is pending from the owner (the one allowed placeholder; the
  page shows a "content on its way" notice and is marked `data-content-pending`).
- `npm audit` reports 12 advisories in dev-only tooling; review separately.
