# ZenFlow: Master Project Notes (everything discussed, from the beginning)

Compiled from the full conversation. This is the single reference to clarify before rebuilding from scratch with a paid Claude subscription.
Status key: **LOCKED** (you decided it), **PROPOSED** (my suggestion, you haven't confirmed), **OPEN** (needs your answer, see Section 15).

---

## 1. Vision and goal

- **Product:** ZenFlow, an original full-stack salon and spa operations platform. **LOCKED**
- **Name:** "ZenFlow" only (no "AI" in the name). Tagline: *Book smarter. Serve faster. Grow automatically.* **LOCKED**
- **Inspiration:** the general workflow of salon-management software such as Zenoti. **LOCKED**
- **Naming rule:** never use Zenoti's name, logo, UI, screenshots, text or code in the product, repo, domain or emails. In outreach say: "Inspired by Zenoti's salon-management workflow." **LOCKED**
- **Goal:** a polished prototype for a portfolio and demo: 2 to 3 minute demo video + GitHub repo + resume, used to reach out to the Zenoti team for feedback. **LOCKED**
- **Owner:** Akhil Marepalli, B.Tech CSE student (full-stack developer).
- **After the core works:** add "wow factor" features to impress Zenoti team members (Section 12). **LOCKED**

## 2. The workflow (the plan) **LOCKED**

1. **Customer** registers/logs in and books an appointment. The booking is a **Request** with preferred service, date/time and optional stylist.
2. **Receptionist (or admin)** sees the request as a **card**, assigns stylist + final time + room, and the appointment becomes **Scheduled**.
3. Customer and the assigned stylist get a **Zen Chat** card (chat unlocks only after assignment).
4. Customer taps "I'm here" (a flag). **Receptionist** checks the guest in.
5. **Stylist** starts and completes the service (only on their own checked-in appointments).
6. **Receptionist/admin** checks out in POS: invoice, payment. Stock is deducted, stylist commission and tip are credited, loyalty points are added, customer gets a receipt and can rate.
7. **Admin** approves refunds and manages everything else.

## 3. Roles and strict permissions **LOCKED**

If it isn't listed for a role, that role cannot do it (no menu item, no button, route blocked, backend rejects it).

### Customer
- **Menu:** Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile.
- **Can:** register/login, edit profile (allergies, preferences), submit booking requests, cancel own request/appointment (policy window), request reschedule (flag), tap "I'm here" (flag), chat with assigned stylist only, view own invoices, tip, rate/review, loyalty/packages/memberships/gift cards/referral, change password, request account deletion.
- **Cannot:** assign staff/times, change status, see other customers or staff data, chat with receptionist/admin, access any staff page.

### Receptionist
- **Menu:** Dashboard, Appointments, Schedule, Customers, POS / Billing, Cash Close, Inventory (view only).
- **Can:** see all requests/appointments as cards; assign or reject requests; create direct/walk-in/phone appointments; reschedule, reassign, resize, cancel, mark no-show, check-in; handle customer reschedule/cancel requests; waitlist; block time; reminders; print day schedule; manage customers (register, search, edit, notes, tags, merge duplicates); billing (invoice, coupons, packages, memberships, gift cards, loyalty redemption, GST, tip, split payment, hold/resume, receipts, sell packages/memberships/gift cards, **request** refund, daily cash close); view inventory and raise reorder requests; clock in/out.
- **Cannot:** Zen Chat (no access), start/complete a service, approve refunds, edit staff/services/pricing, marketing, full reports, settings, audit log, delete customers.

### Stylist (barber/therapist)
- **Menu:** My Day, My Appointments, My Schedule, Zen Chat, Earnings.
- **Can:** see only appointments assigned to them (never Requested ones, never others'), as cards with guest details and allergy alerts; **Start** and **Complete** service on own checked-in appointments (notes, products used, upsell suggestions for checkout); clock in/out, availability toggle, request break/leave; chat with own customers; view earnings (commission, tips, reviews).
- **Cannot:** create/edit/assign/reschedule/cancel/check-in/no-show any appointment; see billing, other stylists, unassigned customers; any admin/receptionist page.

### Admin (owner)
- **Menu:** Dashboard, Appointments, Schedule, Customers, Staff, Services, POS / Billing, Inventory, Marketing, Reports, AI Assistant, Settings (Business, Users & Roles, Audit Log, Security).
- **Can:** everything the receptionist can, plus: invite/create staff, roles, working hours, breaks, skills, commission %, enable/disable, unlock, reset password, leave approvals, attendance, payroll summary; catalogue (services, categories, prices with reason, packages, memberships, gift cards, coupons, loyalty rules, rooms, GST, tip presets); approve/reject refunds, price override, all invoices; full inventory (suppliers, purchase orders, adjustments, transfers, audits); marketing; reports and exports; AI insights; settings, audit log, 2FA; anonymize/delete customers.
- **Cannot:** Zen Chat (protects stylist-customer privacy), start/complete services.

> Changes vs the original PDF: the PDF let receptionists use Zen Chat and let customers "chat with assigned staff" generally. Now chat is **customer and assigned stylist only**.

## 4. Appointment lifecycle **LOCKED**

| From | To | Allowed |
|---|---|---|
| none | Requested | Customer (online); receptionist/admin may create directly as Scheduled |
| Requested | Scheduled (assign stylist, time, room) | Receptionist, Admin |
| Requested | Rejected/Cancelled | Receptionist, Admin; Customer (own) |
| Scheduled | Scheduled (reschedule/reassign/resize) | Receptionist, Admin |
| Scheduled | Checked-in | Receptionist, Admin |
| Checked-in | In-progress | Assigned Stylist only |
| In-progress | Completed | Assigned Stylist only |
| Scheduled/Checked-in | Cancelled | Receptionist, Admin; Customer (own, by policy) |
| Scheduled | No-show | Receptionist, Admin |
| Completed | Paid (via invoice) | Receptionist, Admin |

Customer flags (do not change status): `arrived`, `reschedule_requested` (+ preferred time), `cancel_requested`.

## 5. Visibility and notifications **LOCKED**

| Data | Customer | Receptionist | Stylist | Admin |
|---|---|---|---|---|
| Requested appointments | own | all | none | all |
| Scheduled/active appointments | own | all | only assigned | all |
| Customer profiles | self | all | only inside own appointment card | all |
| Invoices | own | all | none | all |
| Chat threads | own with their stylist | none | own with their customers | none |
| Earnings | none | none | own | all |

| Event | Recipients |
|---|---|
| Request submitted | Receptionists, Admin |
| Assigned/Scheduled | Customer, assigned Stylist |
| Rejected | Customer (reason) |
| Rescheduled/reassigned | Customer, old and new Stylist |
| Arrived flag, reschedule/cancel request | Receptionists, Admin |
| Checked-in | Assigned Stylist |
| Service completed | Receptionists, Admin ("Ready for checkout") |
| Payment completed | Customer (receipt), Stylist (commission + tip) |
| Refund requested | Admin; decision -> requester |
| Low stock / reorder request | Admin |
| Chat message | The other participant only |

## 6. Zen Chat rules **LOCKED**

- Participants: customer and assigned stylist only.
- Opens when the receptionist assigns the stylist. One thread per customer-stylist pair (history kept, messages tagged by appointment).
- UI: a grid of **person cards** (stylist sees customers, customer sees stylists) with avatar, name, appointment chip, last message, unread badge. **Clicking a card opens that conversation.**
- Real-time via WebSockets. Messages encrypted at rest. Quick replies. AI suggested replies (later).

## 7. Pages and routes

- **Public:** `/login` (staff), `/customer/login`, `/customer/register`, `/forgot-password`, `/reset-password`, `/accept-invite`.
- **Customer:** `/customer-dashboard`, `/customer/book`, `/customer/appointments`, `/customer/chat`, `/customer/invoices`, `/customer/profile`.
- **Receptionist and admin:** `/dashboard`, `/appointments` (cards), `/appointments/new`, `/appointments/:id`, `/schedule` (drag-and-drop), `/customers`, `/customers/:id`, `/pos`, `/pos/invoice/:id`, `/cash-close`, `/inventory`, `/inventory/:id`.
- **Admin only:** `/staff`, `/staff/:id`, `/services`, `/marketing`, `/reports`, `/ai-assistant`, `/settings`, `/users-roles`, `/audit-log`, `/security`.
- **Stylist:** `/my-day`, `/my-appointments`, `/my-schedule`, `/chat`, `/earnings`.
- Post-login home: admin `/dashboard`, receptionist `/dashboard` (or `/schedule`), stylist `/my-day`, customer `/customer-dashboard`.

Key page flows: Login -> role home; Dashboard -> Appointments/Customers/Staff/Inventory/Reports; Appointment card -> details -> customer profile -> POS -> invoice; Schedule block -> details; Customers -> profile -> Book/Invoice; Staff -> profile; POS -> invoice -> payment; Inventory -> product details -> stock adjustment.

## 8. UI and design system **LOCKED**

- **Style:** real iOS 26 "Liquid Glass" + spatial (visionOS-like) UI in **white and violet**, light mode only.
- **Wallpaper:** white to `#F6F2FF` with blurred violet orbs (`#8B5CF6`, `#7C3AED`, `#C4B5FD`, `#A5B4FC`, a touch of soft pink) and light grain. Glass needs colour behind it, otherwise it looks like flat white cards.
- **Glass material:** fill ~34% white (regular), ~72% (dense for tables/forms/calendar/chat), blur 32px, saturate 190%, gradient specular border, inner highlight, violet-tinted shadow `0 10px 40px rgba(91,33,182,0.16)`. Fallbacks for reduced transparency and unsupported browsers.
- **Colours:** primary `#7C3AED` (hover `#6D28D9`, light `#8B5CF6`, soft `#EDE9FE`); text `#1E1B4B`, secondary `#5B5675`; success `#22C55E`, warning `#F59E0B`, danger `#EF4444`, indigo `#6366F1`. Status capsules: Scheduled violet, Checked-in indigo, In-progress amber, Completed green, Cancelled grey, No-show red.
- **Shapes:** cards 28px, nested 20px, floating sidebar 36px (inset 16px), buttons/chips/toolbars capsule, inputs 18px, modals/sheets 36px.
- **Layout:** floating glass sidebar (staff) with sliding active bubble, floating pill toolbar, floating top navbar (customer), floating bottom tab bar (mobile). Content scrolls under floating bars so blur shows.
- **Spatial/motion:** depth layers z0 to z4; cards tilt toward cursor with glare; lift on hover, press on click; magnetic primary buttons; parallax orbs (mouse and scroll); depth page transitions with shared layout (card grows into detail); staggered spring entrances; count-up numbers; drawn checkmark and sparkle burst on success; sliding segmented thumbs; draggable sheets on touch; cursor spotlight.
- **Performance rules:** animate only transform/opacity (filter sparingly); about 8 or fewer backdrop-blur surfaces per screen; `will-change` only while animating; tilt/parallax off on touch and with reduced motion; target 60fps.
- **Type:** SF Pro / Inter. **Icons:** lucide-react thin. **Currency:** INR (₹), GST 18% default. **Seed data:** Indian salon (staff Rahul, Arun, Kiran, Priya; services Haircut, Beard Trim, Hair Spa, Facial, Manicure...).
- Every button/tab/filter must exist and work; loading, empty and error states on every page; responsive; AA contrast; body text only on dense glass.

## 9. Tech stack **LOCKED unless noted**

- **Frontend:** React 18 + Vite + **TypeScript** + Tailwind CSS + React Router + Axios + @tanstack/react-query + framer-motion + @dnd-kit (schedule) + Recharts + lucide-react + date-fns + zod.
- **Backend:** Django 5 + Django REST Framework + SimpleJWT + Django Channels (Daphne) + drf-spectacular + django-filter + django-cors-headers.
- **Database:** SQLite for development, PostgreSQL for production (Neon or Supabase). **PROPOSED:** start on PostgreSQL from day one to avoid migration surprises.
- **AI:** hybrid. Rule-based engine always works; local Ollama (`llama3.2:3b`, `all-minilm`) with a vector store (FAISS/Chroma) for chat/RAG/insights; automatic fallback to rules; no paid API keys.
- **Testing:** pytest + pytest-django (backend), vitest (frontend), Playwright (end-to-end).
- **Architecture idea that worked:** a frontend "mock engine" behind `src/api/*` that mirrors the real API, so pages could be built first; later only the api layer changes. **PROPOSED for the rebuild:** build the real backend first or in lockstep, so rules live in one place.

## 10. Security and encryption

- Passwords: Argon2. Lock 15 minutes after 5 failed logins. Generic error messages.
- JWT access (15 min) + rotating refresh in httpOnly, Secure, SameSite cookies; CSRF double-submit; never in localStorage.
- Role permission **and** object ownership on every endpoint.
- Staff accounts created only by admin via invite. Customers self-register (OTP step, simulated).
- Optional TOTP 2FA for admin. Audit log for logins, role/price changes, refunds, invites, exports.
- **Field-level encryption** (AES-256-GCM) for phone, allergies, notes, chat bodies; blind index (HMAC) for phone search; per-thread chat keys (HKDF). Keys only in `.env`.
- **Honest note on "end-to-end encryption":** true E2EE (server cannot read) conflicts with receptionist-side features and AI suggested replies. With chat now limited to customer and stylist, true E2EE for Zen Chat becomes more feasible, but it is a trade-off. **OPEN (Q7).**
- Rate limits on auth and chat; security headers; secrets never committed.

## 11. Database (entities and key rules)

- **Identity:** User, StaffInvite, LoginAttempt, AuditLog.
- **People:** Customer, Staff, StaffSkill.
- **Scheduling:** ServiceCategory, Service, Room, WorkingHours, Break, Leave, Attendance, Appointment, WaitlistEntry.
- **Money:** Invoice, InvoiceItem, Payment, Refund, Coupon, Package, Membership, GiftCard, LoyaltyTransaction, CommissionRecord, CashClose.
- **Stock:** Supplier, InventoryItem, PurchaseOrder, PurchaseOrderLine, StockMovement, ServiceProductUsage.
- **Engagement:** ChatThread (customer+stylist pair), ChatMessage, Campaign, Notification, Feedback.
- **Appointment fields (new model):** customer, services, preferred stylist/date/slot, assigned stylist, start/end, room, status (requested/scheduled/checked_in/in_progress/completed/cancelled/no_show/rejected), flags (arrived, reschedule/cancel requested), source (online/walk_in/phone), notes, risk score.
- **Rules:** overlap-safe booking with `transaction.atomic` + `select_for_update` and a 409 response with nearest slots; paid invoices immutable (corrections via Refund); stock is a ledger (StockMovement); checkout is one atomic transaction (invoice, payment, stock, commission, loyalty, balances).

## 12. Features and wow factor

- **Core modules (8):** booking, CRM, staff, POS/billing, inventory, marketing, analytics/reports, AI features; plus drag-and-drop schedule and Zen Chat.
- **Drag-and-drop schedule rules:** drag to empty slot = reschedule; drag to another staff column = reassign; occupied target = conflict warning; PATCH on drop; revert on conflict; validate hours, leaves, breaks, overlaps, room availability.
- **Wow ideas (after core works):** AI receptionist that books from natural language (rules + Ollama), gap filler (cancellation -> offer slot to waitlist), no-show risk + overbooking suggestion, Cmd+K command palette, live salon-floor view, smart upsell at checkout, real-time schedule sync across receptionists, Liquid Glass refraction (SVG displacement, Chrome only), optional libsodium E2EE chat, one-click demo mode.

## 13. Deployment (decide later) and demo

- **Plan:** Vercel (frontend), Render or Railway (Django + Daphne for WebSockets), Neon/Supabase (PostgreSQL), Cloudinary/Supabase Storage (images), no AI API keys (Ollama on a VPS, or rule-based fallback).
- **Cookie note:** cookie auth across Vercel and Render needs a shared parent domain or a reverse proxy.
- **Demo flow:** owner logs in -> customer books a request -> receptionist assigns on the schedule -> stylist and customer chat -> stylist completes -> receptionist checks out -> stock drops, commission updates -> owner asks the assistant "Which service earned most this month?".
- **Outreach email (template):** introduces Akhil, says ZenFlow is an original prototype inspired by Zenoti's workflow, asks for 10 minutes of feedback, attaches demo video, GitHub, resume. Fill phone/LinkedIn/GitHub/live demo links.

## 14. What happened during the build attempts (lessons for the rebuild)

1. Phase 0 only produced a health-check page, which felt like "nothing". **Fix:** make the first milestone visible (real shell, login, one working flow).
2. Pages were created as **placeholders** (a title and white card) with no layout. **Fix:** a "no placeholder" gate and per-page definitions of done.
3. The glass looked like flat white cards. **Fix:** colourful wallpaper + lower fill + specular edges.
4. Permissions drifted (chat available to every role; stylists seeing too much). **Fix:** one policy file plus tests that assert allowed AND denied actions.
5. Huge prompts and free-tier models caused cut-off runs, half-written files and a **blank page**; a provider returned 502/503 overload errors. **Fix:** smaller tasks, commit before each task, a React ErrorBoundary, a paid plan with a strong model.
6. The agent used TypeScript, which we kept.
7. Role-by-role build (customer first) is the chosen way to keep quality high.

## 15. OPEN decisions: please answer these (recommended default in brackets)

1. **Purpose:** portfolio/demo prototype only, or a product you might later sell to real salons? [Demo-grade first; design so it could grow.]
2. **Scope of business:** single salon, or multi-branch / multi-tenant? [Single salon.]
3. **Booking model:** only request-then-assign, or also let admins turn on instant booking for customers? [Request-then-assign only, as planned.]
4. **Customer contact with reception:** customers can't chat with reception. Should they see a salon phone number / "Call salon" button? [Yes, a call button only.]
5. **Payments:** mock payments only, or add Razorpay test mode for UPI/card? [Mock first, Razorpay test mode as a wow add-on.]
6. **Messages (WhatsApp/SMS/email):** simulated, or integrate a real provider later? [Simulated.]
7. **Encryption:** field-level encryption + TLS (practical) vs true E2EE for Zen Chat (libsodium)? [Field-level now, E2EE chat as a later wow add-on.]
8. **AI:** rules only for the demo, or also local Ollama for the video? [Hybrid: rules + Ollama if your laptop can run it.]
9. **Database:** PostgreSQL from day one? [Yes.]
10. **Platforms:** responsive web only, or also a PWA (installable)? [Responsive web + PWA later.]
11. **Policies:** cancellation window (24h?), no-show fee, tip split rules, commission basis (% of service only?). [24h window, no fee, tip 100% to stylist, commission on service total.]
12. **Staff visibility:** should stylists see customer phone numbers? [No, only name, allergies, notes, history.]
13. **Languages/regions:** English only, ₹, GST 18%? Any Telugu/Hindi UI later? [English, ₹, GST.]
14. **Privacy/compliance:** treat India's data-protection rules (DPDP Act) as a design input (consent text, data export/delete)? [Yes, lightweight: consent checkbox, export, delete.]
15. **Timeline:** when do you want the demo video done? [Set a date; plan phases backward from it.]
16. **Tooling choice:** which Claude tool will you build with? (see below) [Claude Code.]

## 16. Tooling and subscription (for the rebuild)

- **Claude Cowork** is Anthropic's agent for knowledge work in the Claude desktop app (works on folders and files). **Claude Code** is the developer tool for building software (terminal, desktop app Code tab, or editor extensions). Both run on the same paid subscription and draw from the same usage pool. For a full-stack app, **Claude Code is the better fit**; Cowork is better for documents, research and file tasks (for example turning these notes into a PDF or deck). **PROPOSED.**
- Check current plans and limits at claude.com/pricing before buying. Agentic building uses usage much faster than chat, so a heavier plan may be needed during intense build weeks.
- Recommended repo setup: `CLAUDE.md` at the root with these locked decisions and rules (stack, roles, workflow, design tokens, security, "no placeholders", "tests for allowed and denied permissions"); a `docs/` folder with this file; Git commit before and after every task; small tasks with acceptance checks; plan first, then implement.

## 17. Proposed rebuild plan (role by role, vertical slices)

0. **Setup:** repo, `CLAUDE.md`, backend + frontend scaffold, PostgreSQL, tests, ErrorBoundary, glass + motion foundation (design system page).
1. **Auth and policy:** custom user/roles, invite flow, cookie JWT, lockout, audit log, policy file shared by frontend and backend, permission tests.
2. **Customer slice (first):** register/login/OTP, home, booking request, my appointments (cards), invoices, profile/wallet, chat (customer side). Real backend + UI together.
3. **Receptionist slice:** request cards, assign drawer, schedule drag-and-drop, check-in, customers, POS, cash close.
4. **Stylist slice:** my appointments cards, start/complete, my day, schedule, Zen Chat (stylist side), earnings.
5. **Admin slice:** staff, services/catalogue, inventory, marketing, reports, settings, audit, security, refunds.
6. **Cross-role hardening:** end-to-end test of the full workflow with four users, permission matrix tests, performance pass.
7. **Wow factor and demo mode**, then **deployment**.
Each slice ends with: tests green, no placeholders, button-by-button audit, commit.

## 18. Files produced earlier (now superseded by this document)

`ZENFLOW_KILO_PROMPTS.md`, `ZENFLOW_FRONTEND_PAGE_PROMPTS.md`, `ZENFLOW_GLASS_AND_OPERATIONS_PROMPTS.md`, `ZENFLOW_STRICT_ROLE_WORKFLOW_PROMPTS.md`, `ZENFLOW_CUSTOMER_PHASE_PROMPTS.md`. Reuse their design and prompt text where helpful, but where they conflict with this document (for example chat access, request-then-assign), this document wins.

---

# UPDATE 1: Role picker, mandatory ratings, payroll, Staff Summary

Where this section conflicts with sections above, **this section wins**. Status key as before: LOCKED = you decided it, PROPOSED = my default, OPEN = needs your answer.

## 19. Entry and authentication flow **LOCKED**

1. The first screen (`/`) is a **role picker**: "Who are you?" with four large spatial glass cards: Customer, Stylist, Receptionist, Admin.
2. **Customer** card -> `/customer/login` with two tabs: **Sign in** and **Create account** (registration by email, OTP step, simulated).
3. **Stylist, Receptionist, Admin** cards -> a role-specific **Sign in only** page (`/stylist/login`, `/reception/login`, `/admin/login`). No register tab, no sign-up link, and the sign-up endpoint is not reachable for these roles.
4. Staff accounts exist only because the **admin created and invited them** (invite link -> set password).
5. **The role picker is only a convenience. The server decides the role.** The login request carries the selected role; the server checks the account's real role and rejects a mismatch with a generic message ("Email or password is incorrect for this role"), never revealing which role the account has. Registration always forces `role = customer` on the server.
6. After login: customer -> `/customer-dashboard`, stylist -> `/my-day`, receptionist -> `/dashboard`, admin -> `/dashboard`.
7. Keep: Argon2, lockout after 5 failed attempts, cookie JWT, CSRF, rate limits, optional admin 2FA, audit log of logins.
8. **Receptionist work sessions** (for pay): every successful login opens a `WorkSession`; logout, or an auto-logout after 15 minutes of inactivity, closes it (Section 22).

## 20. Mandatory stylist rating **LOCKED** (details PROPOSED)

- Only the **customer** can rate, only from the **customer side**, only for a **Completed and paid** appointment of their own, **one rating per appointment**, enforced by the server.
- Rating = 1 to 5 stars for the stylist (**required**) + optional comment (comment required when 1 or 2 stars, with quick reason tags such as "Late", "Rushed", "Not as requested", "Hygiene").
- **How "mandatory" is enforced:** when an appointment is paid, a pending rating is created. The customer sees a **blocking "Rate your stylist" sheet** on their next visit to Home or My Appointments, and **cannot submit a new booking request until all pending ratings are done**. Reminder notification at payment and after 24 hours.
- Ratings are **immutable** after submission. Nobody (stylist, receptionist, admin) can edit or delete a rating.
- **Dispute handling:** admin can mark a rating "under review" or "excluded" with a written reason (audited). Excluded ratings are left out of the pay formula and graphs, and both the original rating and the reason remain visible in the audit trail.
- If a customer never returns to rate, the visit still counts as a completed task but is shown as "unrated" and is not guessed or defaulted.
- The stylist sees their own average, trend, distribution and comments **without customer identity**.

## 21. Stylist pay **LOCKED** (formula PROPOSED, all numbers configurable by admin)

Pay is based on **tasks completed** and **customer rating**. Admin runs payroll.

```
Stylist pay for a period =
    SUM over completed and paid tasks of task_payout(service)
    x rating_multiplier(period average rating)
  + tips (100% to the stylist, outside the multiplier)
  + optional base salary (default 0)
  +/- manual adjustments by admin (reason required, audited)
```
- `task_payout(service)`: a flat rupee amount per completed task set per service by admin (fallback: the stylist's commission % of the service price).
- `rating_multiplier` default bands on the average of **rated** visits in the period (only if at least 5 ratings, otherwise 1.00):
  | Average | Multiplier |
  |---|---|
  | 4.5 and above | 1.20 |
  | 4.0 to 4.49 | 1.10 |
  | 3.5 to 3.99 | 1.00 |
  | 3.0 to 3.49 | 0.90 |
  | below 3.0 | 0.80 and flagged for admin review |
- Fairness guards: bands not raw averages, minimum rating count, excluded/disputed ratings, trend shown to admin so one bad week is visible as such.

## 22. Receptionist pay and job decision **LOCKED** (formula PROPOSED)

```
Receptionist pay for a period =
    SUM of worked hours (from WorkSessions) x hourly rate
  + optional overtime (hours beyond the daily limit x multiplier, default off)
  +/- manual adjustments by admin (reason required, audited)
```
- Hours come from **login to logout**, with **auto-logout after 15 minutes of inactivity** so hours aren't inflated. Admin can correct a session with a reason (audited).
- **Admin decides whether the receptionist keeps the job**, using data the app shows (decision support, never automatic):
  - hours worked and on-time rate (late logins vs the assigned shift)
  - booking requests handled and **average response time** (request -> assignment)
  - check-ins and checkouts processed, revenue processed
  - cash-close accuracy (difference between expected and counted cash)
  - refund requests raised, no-show rate on assignments
- **Performance Review** record per period: metrics snapshot, notes, decision **Continue / Put on notice / Deactivate account**, decided by, date. Deactivation disables the account immediately; history is kept. Every step is audited.

## 23. Payroll workflow (admin) **LOCKED**

1. Admin opens `/payroll`, chooses a period.
2. System generates **draft payroll items** per employee (stylists from tasks + ratings, receptionists from hours) with a breakdown.
3. Admin reviews, adds adjustments (with reason), **Approves**, then **Marks paid** (mock payment).
4. Each employee sees their own **payslip** (stylist in Earnings, receptionist in "My Hours & Pay"). Payslip PDF/print view.
5. All steps audit-logged. **Note:** this is a pay-calculation tool. Statutory items (PF, ESI, TDS, professional tax) are not included in the prototype.

## 24. New and changed pages

| Page | Route | Who | What |
|---|---|---|---|
| Role picker | `/` | everyone | choose Customer / Stylist / Receptionist / Admin |
| Role sign-in pages | `/customer/login`, `/stylist/login`, `/reception/login`, `/admin/login` | by role | customer: sign in + create account; others: sign in only |
| **Staff Summary** (new) | `/staff-summary` | admin only | graphs and performance for stylists and receptionists (below) |
| **Payroll** (new) | `/payroll` | admin only | generate, adjust, approve, pay, payslips |
| My Hours & Pay (new) | `/my-hours` | receptionist | own sessions, hours, punctuality, payslips |
| Earnings (extended) | `/earnings` | stylist | tasks, rating trend and distribution graphs, comments, payslips |
| Rate your stylist (new sheet) | on `/customer-dashboard` and `/customer/appointments` | customer | blocking mandatory rating; also blocks new bookings until done |

**Menu changes:** Admin adds **Staff Summary** and **Payroll**. Receptionist adds **My Hours & Pay**. Stylist keeps **Earnings** (now with graphs and payslips). Customer menu unchanged (the rating is a gate, not a menu item).

### Staff Summary page (`/staff-summary`, admin only)
- Header: period selector (week/month/quarter/custom), compare-to-previous toggle, Export CSV/PDF.
- **Overview tab:** KPI cards (total payroll cost, active stylists, average stylist rating, total tasks completed, total receptionist hours), charts: payroll cost by role, tasks per week, rating trend.
- **Stylists tab:** leaderboard cards (avatar, tasks, average rating, estimated pay), charts: tasks completed per stylist and over time, rating trend lines, rating distribution (1 to 5 stacked bars), pay breakdown (task pay, rating adjustment, tips), revenue per stylist, repeat-customer rate. Click a card for a drill-down (recent ratings with comments, flagged ratings, disputes).
- **Receptionists tab:** hours per day (bar), on-time vs late logins, requests handled and average response time, check-ins/checkouts processed with revenue, cash-close variance, refund requests; **Performance Review panel** with the decision buttons and required notes; session log with correction option.
- The admin Dashboard gets a small "Staff snapshot" widget linking here.

## 25. Data model additions

- `Rating`: appointment (unique), customer, stylist, stars, comment, reason_tags, status (active/under_review/excluded), excluded_reason, created_at. Immutable fields.
- `PendingRating` (or a status on Appointment): created on payment, cleared on rating.
- `WorkSession`: user, login_at, logout_at, end_reason (logout/idle/admin_correction), corrected_by, correction_reason.
- `ShiftSchedule`: user, weekday, start, end (for punctuality).
- `PayRule`: task payout per service, rating bands and multipliers, min ratings, hourly rate per receptionist, overtime settings, idle timeout.
- `PayrollPeriod`, `PayrollItem`: employee, period, components JSON (tasks, multiplier, tips, hours, adjustments), totals, status (draft/approved/paid), approved_by, paid_at.
- `PerformanceReview`: employee, period, metrics snapshot, decision (continue/notice/deactivate), notes, decided_by, decided_at.
- All of the above are written to the audit log on change.

## 26. Policy and test rules for the new features

- Only `customer` can create a Rating; only for their own paid appointment; one per appointment; no role can edit or delete one. Tests for each denied case.
- Only `admin` can read payroll for others, run/approve/pay payroll, edit PayRules, record Performance Reviews, view Staff Summary. Stylist sees only own earnings/payslips and rating data; receptionist sees only own hours/payslips.
- Role-picker mismatch returns the generic error; sign-up for any role other than customer is impossible.
- Booking requests are rejected by the server when the customer has pending ratings.
- Payroll math has unit tests (task pay, each rating band, minimum ratings, tips outside the multiplier, hours with idle auto-logout, adjustments).

## 27. How Zenoti handles this (research summary) and what we do differently

- Zenoti has a **consumer mobile app and web booking**, and a **staff-facing mobile app**, both account-based. The staff app limits guest information to the business premises using geofencing, and staff can see payroll information and tips in their apps.
- Guest messaging in Zenoti appears to be **centralized at the salon level** (a shared text-messaging inbox with the guest's message history, with guest phone numbers hidden from staff). Standard automated messages cover booking confirmation, reminders (24 hours and 2 hours before), no-show, and a thank-you with a feedback prompt after the invoice closes.
- I did not find a feature where a guest messages an individual stylist directly. **Direct customer-to-stylist chat is our own design** and a good "wow" differentiator. Trade-off: with a shared salon inbox the business keeps the client relationship if a stylist leaves; with private chats the history stays between customer and stylist. **OPEN (R9).**

## 28. New OPEN decisions (recommended default in brackets)

- **R1.** Stylist base salary on top of task pay? [No, optional field, default 0.]
- **R2.** Task payout model: flat rupee per service, or percentage of service price? [Flat per service, with percentage as fallback.]
- **R3.** Rating bands and minimum rating count as in Section 21? [Yes, admin-editable.]
- **R4.** Rating comment required for 1 or 2 stars? [Yes.]
- **R5.** Unrated visits after 7 days: count the task, skip the rating? [Yes.]
- **R6.** Receptionist: hourly rate, overtime on or off, idle timeout 15 minutes? [Hourly, overtime off, 15 minutes.]
- **R7.** Do receptionists have fixed shifts (for lateness tracking)? [Yes, admin sets shifts.]
- **R8.** Should the stylist see rating comments? [Yes, anonymous.]
- **R9.** Should admin have a logged "break-glass" view of a chat for dispute resolution (reason required, audited)? [No for now; chat stays private.]

---

# UPDATE 2: Alankar public website, payment-link booking, chatbot, Zenotians page

Where this section conflicts with anything above, **this section wins**. Status key as before.

## 29. Shop, brand and public website **LOCKED**

- The application is the website and management system of **one unisex shop named "Alankar"** (spelling as the owner wrote it) with three divisions: **Salon** (hair), **Spa** (massage and body wellness), **Beauty Parlor** (skin, makeup, bridal, nails, waxing and similar). Single shop, single tenant.
- Customers see the shop brand "Alankar". The platform name (ZenFlow or a later name) appears only on the "For Zenotians" page and a small "Powered by" line. Both names live in the brand config files only. "Zen Chat" is renamed **Stylist Chat** in the UI.
- The app **opens on the public home page**, never on login or register.
- **Navbar:** shop title (acts as the Home button), **Salon**, **Spa**, **Beauty Parlor**, **Book Now** (button), **Login** (all roles; the Login page has tabs Customer / Stylist / Receptionist / Admin), **Register** (customers only), and, set apart on the side, **For Zenotians**. After a customer logs in, Login/Register are replaced by an avatar menu: My Appointments, Stylist Chat, Invoices, Profile, Logout. Staff who log in go to their own dashboards (the public site shows them a "Go to dashboard" button).
- **Home page:** hero, about Alankar, three division cards, achievements (animated counters), a promo video slot (video added later by the owner), the team (stylist name, photo, specialization, average rating; customer-safe data only), reviews drawn from real ratings, offers, gallery, FAQ, and a footer with address, map link, phone with Call button, hours, social links, plus Privacy, Terms and Cancellation policy links.
- **Info cards open as popup sheets** ("envelopes") with more details and a Book now button.
- **Division pages** (`/salon`, `/spa`, `/beauty-parlor`): a grid of service cards (photo, name, short info, duration, "from ₹X incl. GST", suitable for), filters Men / Women / Kids / Unisex, search, category chips. Clicking a card opens the **booking sheet** (below).
- **All public content comes from the database** and is edited by **admin only** (Settings -> Website content and Services): about text, achievements, contact details, hours, hero/video, services with photos, stylist profiles, offers, FAQ and chatbot knowledge entries. No hard-coded shop content in components.
- Mobile first. Use only photos the owner owns or has licences for; clearly marked placeholders until then. Optional Telugu/English toggle later.

## 30. Booking and payment-link flow **LOCKED** (details PROPOSED)

1. Guest browses freely. Tapping **Book** while logged out sends them to Login/Register, then **back to the same booking sheet** with choices kept.
2. **Booking sheet** (logged-in customer): service (prefilled) + variant (for example hair length: short / medium / long, each with its own price and duration), add-ons, **preferred date and time slot**, **stylist choice** (only stylists qualified for that service, plus "Any available"), contact details (name, phone, email prefilled and editable), notes and allergies, coupon, a clear **price summary** (from-price, GST included, amount payable online after confirmation), consent to the cancellation policy. Button: **Send booking request**.
3. Status **Requested**. The receptionist or admin sees a request card and **Confirms** it: assigns stylist, final time and room (or adjusts the time), or **Rejects** it with a reason.
4. On confirm, status **Awaiting payment**: the slot is held and a **payment link is emailed** to the customer.
5. Customer opens the link, reviews the booking and **pays online**. On success the status becomes **Scheduled**, a receipt is sent, and the customer and the assigned stylist get Stylist Chat.
6. If the link expires unpaid, the hold is released, the status becomes **Payment expired**, the receptionist is notified and may resend a link or re-confirm.
7. The rest of the lifecycle is unchanged: Checked-in -> In-progress -> Completed -> invoice settled. At checkout the prepayment is applied: extras and tip are collected, any overpayment is refunded (admin approves refunds as before).
- **Simulated services in v1:** the "email" is stored in an in-app Mail Outbox and shown on a dev "Mailbox" page and in the console; the payment page is a mock gateway page (success/fail buttons). Real email (SMTP) and a real gateway (for example Razorpay test mode) can be added later.
- **Defaults (editable by admin):** prepay the full listed amount (a deposit % setting exists); link and slot hold valid 6 hours (shorter if the appointment is within 24 hours); free cancellation at least 24 hours before -> automatic refund record; later cancellation -> no refund unless admin approves.
- **Customer actions after booking:** My Appointments cards (reschedule request, cancel by policy, "I'm here", Stylist Chat, pay now if awaiting payment, resend link, rate after service).

## 31. Revised lifecycle and notifications

`requested -> awaiting_payment -> scheduled -> checked_in -> in_progress -> completed` (invoice then settled); also `rejected`, `payment_expired`, `cancelled`, `no_show`.

| Step | Allowed roles |
|---|---|
| Requested | Customer (online); receptionist/admin may also create directly |
| Requested -> Awaiting payment (confirm and assign) | Receptionist, Admin |
| Requested -> Rejected | Receptionist, Admin |
| Awaiting payment -> Scheduled | Customer pays (system, on payment success) |
| Awaiting payment -> Payment expired | System (timer); receptionist can resend or re-confirm |
| Scheduled -> Checked-in, No-show, reschedule/reassign | Receptionist, Admin |
| Checked-in -> In-progress -> Completed | Assigned stylist only |
| Cancel | Receptionist, Admin; Customer (own, by policy) |

Visibility change: a **stylist sees an appointment only once it is Scheduled** (paid). Stylist Chat opens at Scheduled.
New notifications: payment link sent (customer); payment received (customer receipt, receptionist, assigned stylist); payment expired (receptionist, customer); refund processed (customer).

## 32. "AI Alankar Intelligence" chatbot **LOCKED** (owner-chosen name)

- A floating button in the **corner** of the public site and the customer area; click toggles a glass chat panel (open, minimise, close). Hidden inside staff dashboards in v1. The panel title is exactly **AI Alankar Intelligence**. (The owner chose this name; the "no AI in names" rule applies to the shop, platform, routes and code, not to this feature's label.)
- It answers **only from the application's own data**, with **no external API keys and no paid service**:
  - Guests: shop info, services and prices, stylists, hours, location, policies, how booking and payment work, FAQs, and "log in to see your appointments".
  - Logged-in customers: all of the above plus **their own** appointments (status, time, stylist, payment link state), history, invoices, loyalty points, and how-to guidance for each step.
- **How it works (hybrid, no keys):** a rule-based intent classifier + keyword retrieval (BM25-style) over an admin-editable **knowledge base** (FAQs, policies, service catalogue, hours, contact) + **tool functions** that read the requesting user's own records through the normal permission layer. Optional: a local Ollama model (no key) used only to phrase answers from retrieved facts; if Ollama is off or slow, rule-based replies are used.
- **Rules:** answers must be grounded in retrieved data. If it does not know, it says so and offers the Call button or the contact details. It never reveals other users' data, staff phone numbers, commissions or internal notes. User text can never change permissions (prompt-injection safe). Actions are limited to **links and prefilled forms** (View appointment, Pay now, Open booking sheet for this service) and safe operations that require an explicit confirm button, following the same policy as the UI.
- UI: suggestion chips ("My next appointment", "How do I pay?", "Cancellation policy", "Services for men"), typing indicator, buttons inside replies, keyboard accessible, does not cover mobile CTA buttons.
- Tests: never returns another user's data; unknown questions give the fallback; no outbound requests to non-app origins; works with Ollama disabled.

## 33. "For Zenotians" page **LOCKED** (content pending)

- A page at `/zenotians`, linked from the navbar as a set-apart item. The owner will specify the content later; build the route, layout shell and an admin-editable content area now. This is the one intentional exception to the "no placeholder pages" rule, and it must be marked clearly as content-pending in `docs/PROGRESS.md`.
- **Superseded by section 36 (Update 4): the full specification is built as Task 10.**

## 34. Data model additions

`ServiceCategory.division` (salon/spa/parlor); `Service` gains gender (men/women/kids/unisex), description, media, tags, from_price, active; `ServiceVariant` (service, label, price, duration delta); `ServiceAddon`; `SiteContent` (key, JSON value: about, achievements, contact, hours, video, home cards); `KnowledgeEntry` (question/topic, answer, tags, active); `PaymentLink` (appointment, token hash, amount, expires_at, status, sent_at, paid_at); `Payment` gains type `prepayment`; `MailOutbox` (to, subject, body, link, sent_at, simulated); optional `ChatbotSession` (user, messages, retention-limited). `Appointment` status values updated as in Section 31, plus `awaiting_payment_until`.

## 35. Effect on plan and new defaults

- Added work: public site, content management, variants, payment-link flow, chatbot, Zenotians shell: about 8 to 10 extra working days at the owner's pace. A 2 to 3 month build on Pro still holds.
- Defaults to confirm later: full prepayment; 6-hour hold; 24-hour free cancellation with automatic refund; simulated email and payment first; chatbot visible to guests and customers only; Alankar spelling as written.


---

# UPDATE 3: No LLMs anywhere; chatbot algorithm

**LOCKED (owner decision): no Ollama, no LLM, no hosted AI service and no API keys anywhere in the product.** This overrides every earlier mention of Ollama, "hybrid AI", or local models (sections 9, 12, 19-32 and the earlier prompt files).

- The "AI Alankar Intelligence" chatbot is a **deterministic question-understanding engine**: normalize -> spell-correct (shop vocabulary) -> stem -> canonicalize (synonym and phrase tables, the "rephrase") -> entities -> weighted intent scoring -> BM25 knowledge search -> grounded answer from templates, catalogue, knowledge base and the user's own records. Full specification: `docs/CHATBOT_ALGORITHM.md`. Tested reference code: `reference/chatbot_reference/` (standard library only, 16 tests).
- Other "smart" features are also deterministic: admin insights = SQL aggregations + templates; no-show risk = rule-based score; suggested replies in Stylist Chat = keyword-to-template suggestions; review-reply generator = templates by rating and keywords; service recommendations = rules on tags, audience and division.
- The chatbot improves through the admin: unanswered questions are logged (anonymous, normalized) and the admin adds knowledge entries and synonyms.
- Realistic accuracy: about 75 to 90% on brand-new questions on day one, rising as knowledge is added; it says "I'm not sure" instead of guessing.
- The chatbot panel title remains exactly "AI Alankar Intelligence" (owner-chosen); nothing else in the product uses the word "AI".

---

# UPDATE 4: "For Zenotians" page specification (Task 10) **LOCKED**

## 36. "For Zenotians" page (Task 10)

Route stays `/zenotians`. This replaces the "content pending" shell of section 33 and the old
"8b / Task 9" slot: the page is built as **Task 10**, after the product itself works. The route and
shell from Task 0 stay until then.

**Layout:** a left sidebar (a top tab strip on small screens) with these sections, in this order:

1. **Overview**: who I am, what this project is, and a short "start here" for a reviewer.
2. **About me**: the resume, shown as sections: Header (name, role, location, links), Summary,
   Education, Skills, Projects, Certifications.
3. **The project**: what the platform does, the four roles, a short tour of the main flows.
4. **How it maps to Zenoti**: a table or cards of salon-software capabilities and where each one
   lives in this project (booking, schedule, POS, inventory, payroll, ratings, reports, and so on),
   including what is simulated or left out.
5. **Engineering decisions**: why the choices were made (request-then-assign booking with row
   locking and 409 plus nearest slots, role isolation from one policy file, field-level encryption
   with blind index, stock as a ledger, immutable invoices, no LLMs with a deterministic chatbot,
   audit log, tests).
6. **Try the demo**: demo sign-in details for each role (from the seeded demo accounts, shown only
   when the demo mode is on) and links to open the app as each role.
7. **Contact**: email, GitHub, LinkedIn and a short note on what the owner is looking for.

**Content rules:**
- **About me comes only from the resume the owner provides.** Never invent or embellish a job,
  degree, skill, date or number. Until the owner provides the resume, the About me section shows a
  clearly marked "content pending" state (this stays the one allowed placeholder, listed in
  `docs/PROGRESS.md`).
- About me, Overview, Contact and the other text blocks are stored in the database and edited by
  the **admin only** (Settings or a Zenotians editor, decided in Task 5/10). No hard-coded personal
  content in components. Resume sections are structured records (header, summary, education
  entries, skill groups, project entries, certification entries) with a sort order and a visible
  toggle, so a section with no data is hidden.
- The text is plain text with simple formatting only (no HTML from the editor), so it cannot inject
  scripts. Links are checked to be http(s) or mailto.

**Look and feel:** inspired by the clean, light look of Zenoti's own site (soft neutral background,
white cards with thin borders, generous spacing, a calm accent colour, left navigation), but **not a
copy**: no Zenoti logo, wordmark, images, text or code, and no exact reproduction of their layout.
Colours, radii and spacing come from `frontend/src/design/tokens.ts` like every other page, so the
stage 2 redesign can restyle it. The sidebar is keyboard accessible, the active section follows the
scroll position, each section has a stable URL hash (`/zenotians#about-me`), and the page works
on a phone.

**Footer note (always visible on this page):** "Independent portfolio project, not affiliated with
Zenoti."

**Never:** use another company's logo or wordmark, imply endorsement or affiliation, or show a
fabricated testimonial or metric. Statements about the project (test counts, features) must match
what is actually built; the page reads them from `docs/PROGRESS.md`-style facts kept in the
database content, edited by the admin, not guessed.

**Definition of done (Task 10):** sidebar and all seven sections work; About me renders from the
database and is admin-editable with an audit entry per change; empty sections are hidden; the footer
note is present; tests for allowed and denied edits (only the admin can edit; the public can read);
keyboard and phone checks; `docs/PROGRESS.md` updated, with the content-pending marker removed once
the owner's resume is loaded.
