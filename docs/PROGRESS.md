# Progress

## Status
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

## Temporary exceptions (owner-approved)
- Planned menu items show an informative empty state (name, what it will do, the task it
  arrives in) via `PlannedPage`. Remove each one as its task is built. Status lives in
  `shared/policy.json` (`status: planned|available`).

## Known issues
- "For Zenotians" page content is pending from the owner (the one allowed placeholder; the
  page shows a "content on its way" notice and is marked `data-content-pending`).
- `npm audit` reports 12 advisories in dev-only tooling; review separately.
