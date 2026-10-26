# CLAUDE.md: Alankar (salon, spa & beauty parlor): public website + management platform (platform working name: ZenFlow)

Read this file at the start of EVERY session, then read `docs/PROGRESS.md` to see what is done and what is next. Full details live in `docs/MASTER_NOTES.md` (single source of truth). If this file and the notes disagree, the notes win; tell me about the conflict.

## 0. What we are building
An original full-stack platform for salons, spas and barbershops. Four roles: customer, receptionist, stylist (barber/therapist), admin. Built as a portfolio/demo prototype to show the Zenoti team. Never use another company's name, logo, UI, text or code. Build in two stages: (1) all ideas working with a BASIC UI, (2) later a custom "extraordinary" UI designed by the owner. Never use the word "AI" in the shop name, platform name, routes or code identifiers. ONE exception chosen by the owner: the customer chatbot is named exactly "AI Alankar Intelligence". The admin insights page is called "Alankar Intelligence"; suggestions are called "Smart suggestions". See docs/MASTER_NOTES.md Update 2 (sections 29 to 35), which OVERRIDES anything below that conflicts.

## 1. Branding rule (rename-proof)
The product name, tagline and logo text live ONLY in `frontend/src/config/brand.ts` and `backend/core/brand.py`. Never type the product name in components, routes, titles, emails or tests; import it. Use neutral names for folders, packages, env keys and DB (for example `salon-app`, `SALON_*`).

## 2. Stack (do not change without asking)
- Frontend: React 18 + Vite + TypeScript + Tailwind + React Router + @tanstack/react-query + Axios + zod + Recharts + lucide-react + date-fns + @dnd-kit (schedule) + framer-motion (used lightly in stage 1).
- Backend: Django 5 + Django REST Framework + SimpleJWT (cookie auth) + Django Channels (Daphne) + drf-spectacular + django-filter + django-cors-headers + argon2-cffi + cryptography + pyotp.
- Database: PostgreSQL from day one (docker-compose provided; if Docker is unavailable use a local Postgres install). No SQLite.
- Tests: pytest + pytest-django, vitest, Playwright (end-to-end). Lint: ruff, eslint, prettier.
- Ask before adding any other dependency and say why.

## 3. Workflow (the plan)
1. Guest browses the public site, logs in/registers when booking, and submits a booking REQUEST from a service booking sheet (service + variant, preferred date/time, stylist choice, contact details, price summary).
2. Receptionist/admin sees a request CARD, confirms it (assign stylist + time + room) -> AWAITING PAYMENT; a payment link is emailed (simulated in v1).
2b. Customer pays online (mock gateway in v1) -> SCHEDULED. Stylist Chat unlocks between customer and the assigned stylist. If the link expires, status becomes payment_expired and the slot is released.
3. Customer taps "I'm here" (flag). Receptionist checks the guest in.
4. Stylist starts and completes the service (own checked-in appointments only).
5. Receptionist/admin checks out in POS (invoice, payment). Stock deducted, stylist task pay + tip credited, loyalty points added, receipt sent.
6. Customer MUST rate the stylist (blocks new booking requests until done).
7. Admin approves refunds, runs payroll, reviews staff performance.

Lifecycle: requested -> awaiting_payment -> scheduled -> checked_in -> in_progress -> completed (invoice then settled; the online prepayment is applied at checkout); also rejected, payment_expired, cancelled, no_show. A stylist sees an appointment only once it is scheduled. Who may trigger each step: see docs/MASTER_NOTES.md section 4. Customer flags (no status change): arrived, reschedule_requested, cancel_requested.

## 4. Roles and menus (STRICT: if an action is not listed for a role, the role cannot do it)
- Customer menu: Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile.
- Receptionist menu: Dashboard, Appointments, Schedule, Customers, POS / Billing, Cash Close, Inventory (view), My Hours & Pay. NO chat.
- Stylist menu: My Day, My Appointments, My Schedule, Zen Chat, Earnings.
- Admin menu: Dashboard, Appointments, Schedule, Customers, Staff, Staff Summary, Payroll, Services, POS / Billing, Inventory, Marketing, Reports, Concierge, Settings (Business, Users & Roles, Audit Log, Security). NO chat.
- Entry: first screen is a ROLE PICKER (Customer, Stylist, Receptionist, Admin). Customer: sign in or create account (email, OTP step simulated). Stylist/Receptionist/Admin: SIGN IN ONLY. Staff accounts are created only by admin invite. The server verifies the real role; a mismatch returns a generic error. Registration always forces role = customer.
- Chat: customer and their assigned stylist ONLY. No receptionist/admin access. UI = grid of person cards; clicking a card opens that conversation.

## 4A. Public website, navigation and entry (OVERRIDES the entry and customer-menu lines above)
- The app OPENS ON THE PUBLIC HOME PAGE (never on login). Public routes: /, /salon, /spa, /beauty-parlor, /login, /register, /zenotians, policy pages.
- Navbar: shop title (Home button), Salon, Spa, Beauty Parlor, Book Now, Login (tabs: Customer / Stylist / Receptionist / Admin), Register (customers only), and a set-apart "For Zenotians" item. Logged-in customers see an avatar menu: My Appointments, Stylist Chat ("Zen Chat" is renamed Stylist Chat), Invoices, Profile, Logout. Staff go to their own dashboards after login.
- Shop = "Alankar": unisex, three divisions (Salon = hair, Spa = massage/wellness, Beauty Parlor = skin/makeup/bridal/nails/waxing). Single tenant.
- ALL public content (about, achievements, contact, hours, services, variants, photos, stylist profiles, FAQ, chatbot knowledge) is stored in the database and edited by ADMIN ONLY. No hard-coded shop content in components.
- Booking requires login. A logged-out Book click goes to login/register and returns to the same booking sheet. Prices show as "from X incl. GST"; payment link is emailed after the receptionist confirms.
- Chatbot "AI Alankar Intelligence": corner floating toggle for guests and customers; answers only from the app's own data (knowledge base + the user's own records), NO external API keys and NO LLM of any kind (no Ollama, no hosted models, no ML libraries). It is a deterministic engine specified in docs/CHATBOT_ALGORITHM.md with a tested reference implementation in reference/chatbot_reference/. Port it into backend/chatbot/. Unknown -> honest fallback with contact details; never exposes other users' data.
- "For Zenotians" page: route /zenotians, content provided by the owner later (the only allowed placeholder; mark it content-pending in docs/PROGRESS.md).

## 5. ROLE ISOLATION (critical)
A logged-in user sees only the menu, pages, buttons and data defined for their role. Nothing from another role may be visible, reachable by URL, or returnable by the API.
- Menus and route guards come from ONE policy source shared in spirit by frontend and backend (frontend `src/policy/policy.ts`, backend permission classes mirroring it).
- Hide forbidden actions; do not just disable them.
- Every API query is scoped to the caller (customer: own records; stylist: assigned only).
- Public IDs are UUIDs. Use role-specific serializers (customer-safe, stylist-safe; customers never get staff phone, commission or schedule).
- For every role write tests for allowed AND denied actions, including direct URL access and direct API calls with other users' IDs.

## 6. Ratings, payroll and performance
- Only the customer can rate, only their own paid appointment, once per appointment, 1-5 stars required, comment required for 1-2 stars. Immutable. Admin may mark under_review/excluded with a reason (audited). Pending ratings block new booking requests.
- Stylist pay = sum of per-task payout (set per service) x rating multiplier (bands: >=4.5: 1.20; 4.0-4.49: 1.10; 3.5-3.99: 1.00; 3.0-3.49: 0.90; <3.0: 0.80 + flag; needs >=5 rated visits else 1.00) + tips (100% to stylist). Admin-editable PayRules. Optional base salary default 0.
- Receptionist pay = worked hours (login to logout, auto-logout after 15 min idle, admin correction with reason) x hourly rate. Admin sees performance graphs and records Performance Reviews (Continue / Put on notice / Deactivate). Decision support only, never automatic.
- Payroll: admin generates draft -> adjusts -> approves -> marks paid (mock) -> payslips. Statutory deductions (PF, ESI, TDS) are out of scope for the prototype.
- Admin page "Staff Summary" shows graphs for stylists and receptionists; stylists see their own graphs in Earnings; receptionists see own hours in My Hours & Pay.

## 7. Security and encryption
Argon2 passwords; lock 15 min after 5 failed logins; generic auth errors; JWT access (15 min) + rotating refresh in httpOnly Secure SameSite cookies; CSRF double-submit; never store tokens in localStorage; rate limits on auth and chat; optional admin TOTP 2FA; AuditLog for logins, role/price changes, refunds, invites, exports, rating exclusions, payroll steps, reviews. Field-level encryption (AES-256-GCM) for phone, allergies, notes, chat bodies, with an HMAC blind index for phone search and per-thread chat keys (HKDF). Keys only in `.env`; never commit secrets; provide `.env.example`. Paid invoices are immutable (corrections via Refund). Stock is a ledger (StockMovement). Appointment create/reschedule uses `transaction.atomic` + `select_for_update` + overlap check, returning 409 with 3 nearest slots on conflict. Checkout is one atomic transaction.

## 8. UI rules (stage 1 = basic but swappable)
- Stage 1 look: clean white + violet "glass" with simple blur surfaces. Keep it basic; the custom redesign comes later.
- SWAPPABLE DESIGN SYSTEM: all colours, radii, shadows, blur, spacing, fonts and motion values live in `frontend/src/design/tokens.ts` (+ CSS variables). All pages use shared components from `src/components/ui`. NO inline styles, NO hard-coded colours or radii inside pages. Redesign must be possible by changing tokens/components only.
- Tokens (initial): primary #7C3AED, hover #6D28D9, soft #EDE9FE; text #1E1B4B; success #22C55E, warning #F59E0B, danger #EF4444; status colours: Scheduled violet, Checked-in indigo, In-progress amber, Completed green, Cancelled grey, No-show red. Currency INR, GST 18%. Seed data: Indian salon.
- Every page needs loading, empty and error states; every button must work; responsive; AA contrast; a top-level ErrorBoundary so a crash never shows a blank page.
- Performance: animate only transform/opacity; few simultaneous backdrop blurs; respect reduced motion.
- Appointments for receptionist/admin/stylist/customer are shown as CARDS where specified (request cards, my appointments, chat person cards).

## 9. Defaults for open decisions (EDIT THESE if you disagree)
Single salon (no multi-tenant); request-then-assign only; mock payments; simulated WhatsApp/SMS/email; field-level encryption (true E2EE chat is a later add-on); NO LLMs or Ollama anywhere in the product: every "smart" feature (chatbot, suggestions, insights, no-show risk, review replies) is a deterministic algorithm; PostgreSQL; responsive web (PWA later); cancellation window 24h, no no-show fee, tips 100% to stylist; stylists cannot see customer phone numbers; English, INR, GST; lightweight consent/export/delete for privacy; customers see a "Call salon" button but cannot chat with reception; stylist sees ratings and comments anonymously; no admin access to chats.

## 10. Engineering rules (how you work)
1. PLAN FIRST for any task bigger than a small fix: state the plan in a few lines, then implement.
2. One small task at a time. Do not start the next task until this one meets its Definition of Done.
3. Definition of Done: tests written and passing (including DENIED-permission tests); lint and type checks pass; app builds; no console errors; no placeholder pages ("coming soon" is a failure); every button on the touched pages works; docs/PROGRESS.md updated.
4. After each task: run the app, check the feature in the browser, summarise files changed and how to run/test, then commit with a clear message.
5. Never rewrite working code unrelated to the task. Prefer small diffs. If a file is large, edit it, don't regenerate it.
6. If anything is ambiguous or conflicts with the notes, ask me one clear question instead of guessing.
7. Keep a record in `docs/PROGRESS.md`: done, in progress, next, decisions made, known issues.

## 11. Build order (role by role, vertical slices)
0 Setup + tokens + base components + public site shell (navbar, home skeleton) + ErrorBoundary. 1 Auth (Login tabs by role), policy, invites, audit. 2 Public website + catalogue content + booking sheet + customer slice (payment-link flow). 3 Receptionist slice. 4 Stylist slice + Zen Chat. 5 Admin slice (staff, services, inventory, marketing, reports, settings). 6 Ratings, work sessions, payroll, Staff Summary. 7 Cross-role hardening + Playwright full workflow. 8 AI Alankar Intelligence chatbot (port reference/chatbot_reference, no LLMs) + wow features (gap filler, command palette, live floor, demo mode). 8b For Zenotians page content (owner supplies). 9 Deployment. Then stage 2: custom UI.
