# Progress

## Status
- Task 0 (scaffold and foundation): DONE (verified on the owner's PC, 2026-10-26).
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
- (nothing)

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

## Next
- Task 2: public website content + catalogue + booking sheet + customer slice (payment link).
  Owner addition to Task 2: real email sending (SMTP), spec:
  - Settings read EMAIL_HOST, EMAIL_PORT, EMAIL_USE_TLS, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD,
    DEFAULT_FROM_EMAIL from backend/.env; `.env.example` entries with placeholders only.
  - If SMTP is configured: invite, password-reset and (later) payment-link emails are sent for
    real with the same templates; a copy is always saved in MailOutbox. If not configured:
    behaviour stays exactly as now (simulated, dev mailbox).
  - Send only after the DB transaction commits (transaction.on_commit), never inside it.
  - On send failure: the invite stays valid, the failure is written to the audit log, the
    admin sees "Email could not be sent. Copy the link instead" with a Copy link button, and
    there is a "Resend invite" action.
  - Admin sees each invite's status: sent, failed, accepted or expired.
  - Management command `send_test_email --to <address>`.
  - Tests: SMTP configured (Django locmem backend), SMTP failure, no SMTP configured. The invite
    token must never appear in the audit log or in error messages.
  - README section "Set up real email" for Gmail (2-Step Verification + 16-character App
    password, smtp.gmail.com:587 TLS, ~500 emails/day limit, never commit .env or share the
    app password). Normal email service: no AI involved, no-LLM rule unaffected.
  - Open question for Task 2: copying an invite link in production mode conflicts with the
    Task 1 rule "invite links work only when SALON_DEBUG=true"; decide when real email lands.
- Small task after the booking flow works: simulated customer OTP shown in the dev mailbox.

## Temporary exceptions (owner-approved)
- Planned menu items show an informative empty state (name, what it will do, the task it
  arrives in) via `PlannedPage`. Remove each one as its task is built. Status lives in
  `shared/policy.json` (`status: planned|available`).

## Known issues
- "For Zenotians" page content is pending from the owner (the one allowed placeholder; the
  page shows a "content on its way" notice and is marked `data-content-pending`).
- `npm audit` reports 12 advisories in dev-only tooling; review separately.
- Footer has no policy links yet (policy pages come with the public website in Task 2).
