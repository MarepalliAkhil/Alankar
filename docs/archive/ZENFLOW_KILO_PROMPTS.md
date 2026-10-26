# ZenFlow: Kilo Code Build Prompts (UI + Backend + DB, in phases)

Product: **ZenFlow**, a salon & spa management platform. Tagline: *Book smarter. Serve faster. Grow automatically.*
Original product inspired by general salon-software workflows. Never use the name, logo, text or screenshots of any other company in code, UI or repo.

---

## 0. How to use this file

1. Create the folder `zenflow/` and open it in Antigravity.
2. Create `.kilocode/rules/zenflow.md` and paste **Section 1 (Master Rules)** into it. Check that your Kilo Code version reads project rules from that folder; if not, paste the rules at the start of each prompt.
3. Run phases **in order, one prompt at a time**. Do not combine phases (this protects your free-tier quota and quality).
4. Modes: **Architect** to plan, **Code** to build, **Debug** when something fails.
5. After every phase: run the verification checklist, then `git add . && git commit -m "phase N"`.
6. If the agent breaks something, `git restore .` or revert to the last phase commit.
7. If a free model is weak at long prompts, split a phase into its "Backend" part and its "Frontend" part and run them separately.

**Tools line:** each prompt starts with the tools to use. "Context7" and "SQLite MCP" and "Playwright MCP" are MCP servers you add in the agent's MCP settings. Skip any you don't have and rely on the terminal.

---

## 1. Master Rules (put in `.kilocode/rules/zenflow.md`)

```
PROJECT: ZenFlow, salon & spa management platform (original product).
STACK (do not change without asking): Backend Django 5 + Django REST Framework + Channels (Daphne) + SQLite in dev (PostgreSQL later) ; Frontend React 18 + Vite + Tailwind CSS + React Router + Axios.
Approved extra libraries (state the reason if you add anything else): backend: argon2-cffi, cryptography, pyotp, django-cors-headers, django-filter, drf-spectacular, python-dotenv, pytest, pytest-django, ruff. frontend: @tanstack/react-query, @dnd-kit/core, recharts, lucide-react, date-fns, zod, framer-motion.

ROLES: admin (owner), receptionist, stylist (barber/therapist), customer.
- Staff (admin, receptionist, stylist) are created ONLY by admin via invite. No public staff registration.
- Customers self-register.
- Post-login redirect: admin -> /dashboard, receptionist -> /schedule, stylist -> /my-day, customer -> /customer-dashboard.

SECURITY (mandatory):
- Passwords: Argon2. Lock account 15 minutes after 5 failed logins.
- JWT access (15 min) + rotating refresh stored in httpOnly, Secure, SameSite cookies. Never in localStorage. Use CSRF protection (double-submit token header) for unsafe methods.
- Every endpoint enforces role permission AND object ownership (stylist sees own appointments only, customer sees own data only).
- Field-level encryption (AES-256-GCM via cryptography) for: customer phone, allergies, notes, chat message bodies. Key from .env. Because encrypted fields cannot be searched, store a keyed HMAC "blind index" (e.g. phone_hash) for lookups.
- Chat messages use a per-thread key derived with HKDF from the master key + thread id.
- Optional TOTP 2FA for admin.
- AuditLog records: login success/failure, role change, price change, refund request/approval, staff invite, data export.
- Secrets only in .env (never committed). Provide .env.example.
- Rate-limit login, register, password reset and chat sending.

ENGINEERING RULES:
- One phase at a time. Stop when the phase is done and summarize files changed + how to run + how to test.
- After each change run the server, tests and linters; fix errors before continuing.
- Write pytest tests for auth, permissions, availability, billing, inventory, chat. Frontend: component sanity + Playwright smoke when asked.
- Money uses Decimal. Currency INR (₹). Tax = GST configurable (default 18%).
- Appointment creation/reschedule uses transaction.atomic + select_for_update + overlap check, return HTTP 409 with nearest available slots on conflict.
- Paid invoices are immutable; corrections via Refund records.
- Stock is a ledger (StockMovement). Never edit stock directly.
- Third-party messaging (WhatsApp/SMS/email) and payments are SIMULATED: store a Notification/Payment record and log to console.
- Keep files small and organized by feature. No dead code, no placeholder lorem text where real seed data can be used.

DESIGN SYSTEM, "Liquid Glass" (iOS 26 style), applies to every screen:
- Background: soft blurred gradient wallpaper. Light: base #EAF2FF with blobs #C7D8FF, #E9D5FF, #CFFAFE, hint of pink. Dark: base #0B1220 with blobs #0A84FF, #7C3AED, #06B6D4, #F472B6. Support light and dark mode via a toggle.
- Glass surface: bg rgba(255,255,255,0.55) light / rgba(255,255,255,0.14) dark; backdrop-filter: blur(28px) saturate(180%); border 1px rgba(255,255,255,0.35); inner top highlight inset 0 1px 0 rgba(255,255,255,0.6); shadow 0 8px 32px rgba(15,23,42,0.18).
- Dense glass (for tables, calendar, forms, chat messages): ~80% white opacity for readability. Provide a fallback for prefers-reduced-transparency (solid surfaces).
- Colors: primary #0A84FF, success #30D158, warning #FF9F0A, danger #FF453A, purple #BF5AF2, text #0F172A (secondary #64748B), white text in dark mode.
- Status badge capsules: Scheduled blue, Checked-in purple, In-progress orange, Completed green, Cancelled grey, No-show red.
- Shapes: cards 28px radius, floating sidebar 32px (inset 16px from screen edge), buttons and chips fully rounded capsules, inputs 16px, modals/sheets 36px, avatars circular.
- Typography: -apple-system, "SF Pro Display", Inter, sans-serif. Thin line icons (lucide-react).
- Motion: spring-like 300-450ms, cubic-bezier(0.2,0.8,0.2,1); press scale 0.97; subtle hover lift. Respect prefers-reduced-motion.
- Layout: floating glass sidebar, floating pill top toolbar (page title/breadcrumb, global search, "+ New Appointment", notification bell, chat icon with unread badge, profile menu). Mobile: bottom glass tab bar.
- Sidebar order (admin): Dashboard, Appointments, Schedule, Customers, Staff, Services, POS / Billing, Inventory, Zen Chat, Marketing, Reports, AI Assistant, Settings. Bottom: avatar, name, role, Logout.
- Indian salon seed data: staff Rahul, Arun, Kiran, Priya; services Haircut, Beard Trim, Hair Spa, Facial, Manicure, etc.

DATABASE (entities): Identity: User, StaffInvite, LoginAttempt, AuditLog. People: Customer, Staff, StaffSkill. Scheduling: ServiceCategory, Service, Room, WorkingHours, Break, Leave, Attendance, Appointment, WaitlistEntry. Money: Invoice, InvoiceItem, Payment, Refund, Coupon, Package, Membership, GiftCard, LoyaltyTransaction, CommissionRecord, CashClose. Stock: Supplier, InventoryItem, PurchaseOrder, PurchaseOrderLine, StockMovement, ServiceProductUsage. Engagement: ChatThread, ChatMessage, Campaign, Notification, Feedback.

ROUTES (frontend):
Public: /login (staff), /customer/login, /customer/register, /forgot-password, /reset-password, /accept-invite.
Staff: /dashboard, /appointments, /appointments/new, /appointments/:id, /schedule, /customers, /customers/:id, /staff, /staff/:id, /services, /pos, /pos/invoice/:id, /inventory, /inventory/:id, /chat, /marketing, /reports, /ai-assistant, /settings, /cash-close, /audit-log, /users-roles, /security (2FA).
Stylist: /my-day, /my-schedule, /my-customers, /earnings, plus /chat.
Customer: /customer-dashboard, /customer/book, /customer/appointments, /customer/invoices, /customer/chat, /customer/profile.

REQUIRED PAGE-TO-PAGE FLOWS:
Login -> role redirect. Dashboard -> Appointments / Customers / Staff / Inventory / Reports. Appointments -> Appointment details -> Customer profile -> POS -> Invoice -> Payment; Appointment details -> Chat. Schedule -> drag-and-drop calendar -> Appointment details. Customers -> Customer profile -> Book appointment / Chat / Invoice. Staff -> Staff profile -> Performance / Earnings / Appointments. POS -> Invoice -> Payment. Inventory -> Product details -> Stock adjustment. Zen Chat -> thread -> Customer profile. AI Assistant -> booking / recommendation / business insights.
```

---

## PHASE 0: Project scaffold and tooling

```
TOOLS: Kilo Architect mode then Code mode, Context7 (Django, Vite docs), terminal.

Read the project rules. Create this structure:
zenflow/
  backend/   (Django project "zenflow" with apps: accounts, people, scheduling, billing, inventory, chat, marketing, ai, core)
  frontend/  (Vite React 18 + Tailwind)
  docs/
  .gitignore, README.md

Backend: virtualenv instructions, requirements.txt (pinned versions), settings split by environment, python-dotenv, .env.example (SECRET_KEY, DEBUG, FIELD_ENCRYPTION_KEY, HMAC_KEY, ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, AI_MODE, OLLAMA_BASE_URL), CORS for http://localhost:5173, DRF + drf-spectacular configured, pytest + pytest-django + ruff configured, ASGI with Daphne + Channels (in-memory layer for dev), a /api/health/ endpoint.
Frontend: Vite React, Tailwind configured, React Router, Axios, @tanstack/react-query, lucide-react, path aliases, ESLint + Prettier, .env.example with VITE_API_BASE_URL and VITE_WS_BASE_URL.
Add root README with run commands for both. Start both servers and verify /api/health/ returns OK and the frontend loads.
Acceptance: backend tests run (even if only health test), ruff passes, npm run build passes.
```

---

## PHASE 1: Database models, encryption, seed data

```
TOOLS: Kilo Code mode, Context7 (Django models, cryptography), SQLite MCP (inspect tables), terminal.

Implement all models from the DATABASE list in the project rules, in the proper apps, with migrations.

Key details:
- core: EncryptedTextField (AES-256-GCM, key from FIELD_ENCRYPTION_KEY, random nonce, versioned prefix so keys can rotate), blind-index helper (HMAC-SHA256 with HMAC_KEY) for phone lookups, TimeStampedModel base, AuditLog model + helper audit(user, action, target, metadata).
- accounts: custom User (email login, full_name, phone_encrypted + phone_hash, role in admin/receptionist/stylist/customer, is_active, failed_login_count, locked_until, totp_secret_encrypted, totp_enabled), StaffInvite (token hash, role, expires_at, used_at), LoginAttempt.
- people: Customer (dob, gender, address, notes encrypted, allergies encrypted, loyalty_points, preferred_staff, referral_code, referred_by), Staff (designation, specialization, experience_years, commission_percent, is_available, photo), StaffSkill(staff, service).
- scheduling: ServiceCategory, Service (duration_minutes, buffer_minutes, price, is_active), Room, WorkingHours(staff, weekday, start, end), Break, Leave(status pending/approved/rejected), Attendance(clock_in, clock_out), Appointment(customer, staff, service, room, start_at, end_at, status in scheduled/checked_in/in_progress/completed/cancelled/no_show, source online/walk_in/phone, notes, recurrence_rule nullable, no_show_risk), WaitlistEntry.
- billing: Invoice, InvoiceItem, Payment (method cash/card/upi/wallet, status), Refund (status requested/approved/rejected), Coupon, Package, Membership, GiftCard, LoyaltyTransaction, CommissionRecord, CashClose.
- inventory: Supplier, InventoryItem (reorder_level), PurchaseOrder, PurchaseOrderLine, StockMovement (type in purchase/sale/service_use/adjustment/transfer/audit), ServiceProductUsage.
- chat: ChatThread(customer, staff, appointment, is_resolved), ChatMessage(thread, sender_type, sender, body_encrypted, is_read).
- marketing: Campaign, Notification, Feedback(rating, comment, ai_reply).
Add DB indexes on appointment (staff, start_at), (customer), status; unique constraints where needed.
Create management command seed_demo: 1 admin, 2 receptionists, 4 stylists (Rahul, Arun, Kiran, Priya) with working hours and skills, 5 categories and 15 services, 4 rooms, 25 customers, ~60 appointments across past and future with mixed statuses, 20 inventory items with some low stock, invoices for completed appointments, coupons, packages, 3 chat threads. Print the seeded login credentials.
Tests: encryption round-trip, tampered ciphertext rejected, blind index lookup, model constraints.
Acceptance: migrate + seed_demo succeed; SQLite MCP shows data; ciphertext (not plaintext) in encrypted columns.
```

---

## PHASE 2: Authentication, roles and security (backend)

```
TOOLS: Kilo Code mode, Context7 (DRF, SimpleJWT, pyotp), SQLite MCP, terminal.

Build the auth system per the project rules.
Endpoints: POST /api/auth/register/ (customer only), /login/ (all roles; response sets cookies; returns user + role + redirect path), /logout/, /refresh/ (rotating), GET /me/, POST /forgot-password/ and /reset-password/ (simulated email: store Notification + console log), admin-only POST /api/staff/invites/ (creates invite, simulated email with link), POST /api/auth/accept-invite/ (set password), POST /api/auth/change-password/, admin 2FA: /2fa/setup/, /2fa/verify/, /2fa/disable/ (TOTP via pyotp; login requires code for admin when enabled).
Implementation: custom cookie-based JWT authentication class (SimpleJWT tokens in httpOnly Secure SameSite cookies), CSRF double-submit check on unsafe methods, Argon2 hasher, lockout after 5 failed attempts for 15 minutes with LoginAttempt records, throttling on auth endpoints, generic error messages (no user enumeration).
Permissions: IsAdmin, IsReceptionist, IsStylist, IsCustomer, IsStaffRole, and object-level ownership mixin. Write a reusable role-permission map used by all later apps.
Audit log every login success/failure, invite, password change, 2FA change.
Tests: register, login per role, lockout, refresh rotation, cookie flags, CSRF enforcement, invite flow, forbidden role access, ownership, 2FA.
Acceptance: all tests pass; curl login sets httpOnly cookies; Swagger docs show endpoints.
```

---

## PHASE 3: Frontend foundation and Liquid Glass design system

```
TOOLS: Kilo Architect then Code mode, Playwright MCP (screenshots), Context7 (Tailwind, React Router), terminal.

Build the frontend foundation. Do not build feature pages yet.
1. Tailwind theme tokens from the DESIGN SYSTEM rules (colors, radii, shadows, blur, fonts) + CSS variables for light/dark and a theme toggle (persist in localStorage, the only thing allowed there).
2. Animated gradient wallpaper background component.
3. Reusable components with the glass look: GlassCard, DenseGlassCard, Button (primary/secondary/ghost/danger, capsule), IconButton, Input, Select, DatePicker, Textarea, Toggle, Checkbox, Chip, StatusBadge (the 6 statuses), Avatar, StatCard, Tabs, Table (sortable, selectable, pagination), Modal, Drawer (slide-over), Toast, Tooltip, Dropdown menu, EmptyState, Skeleton loaders, Stepper, SearchBar, DateRangePicker, ConfirmDialog.
4. Layouts: StaffLayout (floating glass sidebar with role-based items, floating pill top toolbar, notification/chat badges, profile menu), CustomerLayout (floating top navbar), AuthLayout (split glass login layout), mobile bottom tab bar.
5. Routing skeleton with every route from the rules, placeholder page per route, and role-based route guards (reading the user from an AuthContext; for now use a dev mock user switcher).
6. A /design-system page showing every component in light and dark.
7. prefers-reduced-transparency and reduced-motion fallbacks. Accessible focus rings and contrast (WCAG AA for text on glass).
Verify with Playwright: screenshots of /design-system (light and dark), sidebar per role.
Acceptance: no console errors, build passes, components visually match iOS 26 glass: blur, translucent borders, capsule buttons, 28px cards.
```

---

## PHASE 4: Authentication UI and role routing

```
TOOLS: Kilo Code mode, Playwright MCP, Context7 (React Router, React Query), terminal.

Build all auth screens and wire them to the real backend:
- /login (staff portal: admin, receptionist, stylist): split glass layout, left brand panel with ZenFlow logo/tagline/feature highlights, right glass card with email, password (show/hide), remember me, forgot password link, Sign in button, 2FA code step when required.
- /customer/login and /customer/register (name, phone, email, password, confirm password, validation with zod, strength meter).
- /forgot-password, /reset-password, /accept-invite (set password from invite token).
- Axios instance with cookies (withCredentials), CSRF header, automatic refresh on 401 once, global error toasts. AuthContext (user, role, login, logout, loading), protected routes, role redirects (admin -> /dashboard, receptionist -> /schedule, stylist -> /my-day, customer -> /customer-dashboard), 403 and 404 pages, auto-logout on refresh failure.
- Sidebar items per role: Admin all items. Receptionist: Dashboard, Appointments, Schedule, Customers, POS / Billing, Inventory (view), Zen Chat, Reports (daily sales). Stylist: My Day, My Schedule, My Customers, Zen Chat, Earnings. Customer uses the top navbar: Home, Book, My Appointments, Invoices, Chat.
Verify with Playwright: login as each seeded role, check redirect and sidebar, wrong password error, lockout message, logout, accessing a forbidden route.
Acceptance: all four roles log in and land on the right page; tokens never in localStorage.
```

---

## PHASE 5: Services, staff and customer CRM (backend + UI)

```
TOOLS: Kilo Code mode, Playwright MCP, SQLite MCP, Context7, terminal.

BACKEND (with tests and role permissions):
- Services: CRUD (admin), list (all staff), categories, assign staff via StaffSkill, price change audited.
- Staff: list/create via invite (admin), profile, working hours, breaks, assigned services, performance and earnings endpoints (stubs returning real aggregates from existing data).
- Customers: CRUD (admin + receptionist), search by name/email/phone (phone via blind index), profile with appointments and invoices history, allergies alert, preferred staff, loyalty points, referral code.
- Permissions: receptionist create/edit customers; stylist read-only for customers they serve; customer sees only self; admin all.
FRONTEND:
- /services: category tabs, table/cards, active toggle, Edit/Duplicate/Delete, Add/Edit modal (name, description, category, duration, price, buffer, assigned staff, products used, active), Packages & Memberships tab with "Create package".
- /staff: cards with photo, designation, rating, today's status, today's appointments, commission %, buttons View profile / Clock in-out / Assign services; tabs Staff, Attendance, Leaves (Approve/Reject); Add Staff drawer (sends invite). /staff/:id with tabs Overview, Performance, Earnings, Appointments, Schedule & Leaves, Reviews.
- /customers: search, filters (loyalty tier, last visit, preferred staff, membership), table/grid toggle, row actions View/Book/Chat/Invoice, Import/Export CSV, Add Customer drawer (photo, name, phone, email, DOB, gender, address, allergies, notes, preferred staff). /customers/:id with header actions (Book appointment, Chat, Create invoice, Edit, Delete), allergy alert banner, stat cards, tabs Overview, Appointments, Invoices, Preferences, Chat history, Feedback, Loyalty & Packages, referral card with copy link.
Acceptance: Playwright flow: receptionist adds a customer, searches by phone, opens the profile; admin invites a stylist; data visible in SQLite (phone encrypted).
```

---

## PHASE 6: Scheduling engine (backend)

```
TOOLS: Kilo Code mode, Context7 (Django transactions, select_for_update), SQLite MCP, terminal.

Build the appointment engine:
- GET /api/appointments/availability/?service=&staff=&date= (staff optional = any qualified staff): returns open slots considering working hours, breaks, leaves, existing appointments, service duration + buffer, room availability.
- POST /api/appointments/ (receptionist, admin, customer for self): inside transaction.atomic lock the staff and room rows with select_for_update, re-check overlap, create. On conflict return HTTP 409 with the nearest 3 available slots.
- PATCH /api/appointments/{id}/reschedule/ (move time and/or reassign staff, same safety checks), PATCH /status/ with a state machine: scheduled -> checked_in -> in_progress -> completed; scheduled/checked_in -> cancelled or no_show. Invalid transitions rejected. Stylists may only start/complete their own.
- Walk-in creation (instant check-in), waitlist (add, list, assign to a freed slot), recurring appointments (weekly/monthly with occurrence limit), room/chair assignment.
- When an appointment is created: create a ChatThread, create simulated confirmation Notification. On cancel: surface matching waitlist entries.
- Attendance: clock-in/clock-out; Leave: request, approve/reject (admin). Rule-based no_show_risk score (history of no-shows, lead time, first-time booking, time of day).
- Role matrix: receptionist full control, stylist own appointments only, customer own appointments only (cancel/reschedule within allowed window, configurable).
Tests: concurrent booking race (two requests, one wins), overlap edge cases, leave/break blocking, buffer, state machine, permissions, 409 payload.
Acceptance: all tests pass, availability endpoint verified in Swagger.
```

---

## PHASE 7: Appointments pages and drag-and-drop Schedule (UI)

```
TOOLS: Kilo Code mode, Playwright MCP, Context7 (dnd-kit, React Query), terminal.

Build with real APIs:
- /appointments: header buttons + New Appointment, Walk-in, Waitlist, Export CSV; search; filters (date range, staff, service, status); status tabs with counts; table with checkbox, customer avatar+name, service, staff, date, time, status badge, no-show risk chip, amount, row menu (View details, Reschedule, Check-in, Start, Complete, Cancel, Mark no-show, Open chat); bulk actions (Cancel selected, Send reminder); pagination.
- /appointments/new: customer search + "Add new customer", service, staff (qualified only, plus "Any available"), date picker, time-slot grid from the availability API (unavailable disabled), room/chair, recurring toggle + frequency, notes, "Send confirmation" checkbox, sticky summary, buttons Book, Save as walk-in, Join waitlist, Cancel.
- /appointments/:id: status badge + action bar (Check-in, Start, Complete, Reschedule, Cancel, Mark no-show, Edit), customer card with allergy alert and links (View profile, Chat), service, staff, room, notes, no-show risk, status timeline, products used (+ Add product), "Create invoice" (-> /pos), chat preview, Reschedule modal.
- /schedule (the receptionist's main screen): custom resource calendar built with @dnd-kit: columns = staff (avatar, name, availability dot), rows = time 9AM-8PM in 15/30-min steps, glass appointment blocks coloured by status. Toolbar: prev/next, Today, date picker, Day/Week/Month views, staff multi-select, service filter, + New Appointment, Walk-in, Waitlist panel. Break blocks hatched; "On leave" columns greyed; current-time red line. Drag to empty slot = reschedule, drag to another staff column = reassign, show a green drop highlight, optimistic UI, call PATCH reschedule, on 409 revert and show a conflict toast with suggested slots. Click block = popover (View details, Check-in, Reschedule, Cancel, Chat). Right collapsible panel: mini calendar + waitlist with Assign buttons. Poll or refetch every 15s for now (real-time sync comes later).
Acceptance (Playwright): receptionist books via form, sees the block on /schedule, drags it to another staff column, conflict case reverts, status changes work, data persists after refresh.
```

---

## PHASE 8: POS, billing, loyalty, packages

```
TOOLS: Kilo Code mode, Playwright MCP, SQLite MCP, Context7, terminal.

BACKEND (one atomic checkout):
POST /api/invoices/ from a completed appointment or walk-in: items (services + products), discount via coupon / package / membership / gift card / loyalty redemption, GST tax, tip (assigned to staff) -> Invoice. POST /api/invoices/{id}/payment/ with method cash/card/UPI/wallet (mocked, supports split payment) -> in the same transaction: mark paid, create StockMovement rows (ServiceProductUsage + sold products), CommissionRecord (staff commission_percent on service total + tip), LoyaltyTransaction, update package/membership/gift-card balances. Paid invoices are immutable. Refunds: stylist cannot; receptionist requests, admin approves; approval reverses stock/commission/loyalty as configured. Daily sales summary, CashClose endpoint (expected cash vs counted, difference, notes) for receptionist, viewable by admin. Everything audited. Customers can list/view only their own invoices.
Tests: totals, discount stacking rules, tip, split payment, stock deduction, commission, refund approval flow, immutability, permissions.
FRONTEND:
- /pos: left = select completed appointment or walk-in toggle, customer card (allergies, points), item table (qty stepper, remove), + Add Service, + Add Product. Right = bill summary (subtotal, coupon + Apply, Membership/Package/Gift card/Loyalty toggles, discount, GST, tip chips 0/5/10/15/Custom, total), payment method cards (Cash, Card, UPI, Wallet), buttons Charge, Hold, Clear. Tabs: Recent Invoices (View, Refund) and Daily Sales cards.
- /pos/invoice/:id: printable glass invoice (logo, number, date, Paid badge, items, totals, payment method) with Print, Download PDF, Send via WhatsApp/Email (simulated), Refund modal, View customer, View appointment, Back to POS.
- /cash-close: counted cash form, expected vs counted, submit.
Acceptance (Playwright): complete appointment -> invoice -> pay -> stock decreased, commission row created, invoice immutable, refund request and admin approval.
```

---

## PHASE 9: Inventory

```
TOOLS: Kilo Code mode, Playwright MCP, SQLite MCP, terminal.

BACKEND: Inventory CRUD (admin), receptionist view-only, stylist records product usage per appointment (creates StockMovement), stock adjust endpoint (adds a ledger row with reason, never edits stock directly), low-stock endpoint with reorder suggestions, suppliers, purchase orders (draft -> sent -> received; receiving creates StockMovement), stock transfer, audit counts (difference creates adjustment), usage and valuation reports. Tests for ledger math and permissions.
FRONTEND:
- /inventory: stat cards (Total products, Low stock, Out of stock, Stock value), low-stock banner with "Create Purchase Order", tabs Products, Low Stock, Purchase Orders, Suppliers, Stock Transfers, Audits, Usage; products table (image, name, category, stock level bar, reorder level, unit price, supplier, status) with actions View/Adjust/Reorder/Delete; search + filters; Add Product, Adjust Stock, Export; Purchase Order modal (supplier, lines, quantities, expected date, Send/Cancel).
- /inventory/:id: image, details, circular stock gauge, buttons Adjust stock (modal: add/remove, quantity, reason, note), Edit, Reorder, Delete; tabs Stock history, Usage per service, Purchase orders; stock level chart.
Acceptance: low-stock badge appears after usage; PO receive increases stock via ledger.
```

---

## PHASE 10: Zen Chat (real-time + encrypted)

```
TOOLS: Kilo Code mode, Playwright MCP (two browser contexts), Context7 (Channels), terminal.

BACKEND: Channels consumer ws://.../ws/chat/<thread_id>/ authenticated via the JWT cookie; only the thread's customer, assigned stylist, receptionist and admin can join. Messages encrypted at rest (per-thread HKDF key), delivered decrypted over the socket; unread counts, mark-read, typing indicator, mark resolved/reopen, quick replies endpoint, rate limiting, auto thread creation per appointment (already done in Phase 6), REST fallbacks for history. Tests: websocket auth, access denial, encryption at rest (DB shows ciphertext), unread logic.
FRONTEND:
- /chat (staff) three panes: thread list (search, All/Unread/Resolved tabs, avatar, last message, time, unread badge, appointment tag), conversation (header with customer name + appointment chip + "Mark as resolved", glass message bubbles with timestamps and read ticks, typing indicator, quick-reply chips, "AI suggested replies" chips with Regenerate (rule-based for now), input with attach/emoji/Send), right customer profile panel (photo, phone, allergies, loyalty points, preferred staff, next appointment, buttons View profile / Reschedule / Book appointment / Create invoice).
- /customer/chat: two-pane simplified view with quick replies ("Running late", "Please reschedule", "Where to park?").
- Header chat icon unread badge updates live; reconnect with backoff.
Acceptance (Playwright): customer and stylist browsers exchange messages live; DB stores ciphertext; unread badge works.
```

---

## PHASE 11: Stylist workspace and staff operations

```
TOOLS: Kilo Code mode, Playwright MCP, terminal.

BACKEND: stylist-scoped endpoints: my day (today's appointments with guest allergies/notes/history), start/complete service with service notes and products used, my schedule (week), my customers, my earnings (commission, tips, per day/week/month, payroll-ready summary), break and unavailability requests, leave requests, clock in/out. Admin: approve leave, payroll summary export (CSV). Strict ownership tests.
FRONTEND (stylist role):
- /my-day: glass timeline of today's appointments, clock in/out button, allergy alert chips, Start service / Complete buttons, service notes box, products-used picker, next-guest card, quick chat button.
- /my-schedule (week view, read-only plus request break/leave), /my-customers (list + profile summary), /earnings (stat cards, chart, table, Export).
Acceptance: stylist can only see their own data; completing a service makes it appear ready for POS on the receptionist screen.
```

---

## PHASE 12: Customer portal

```
TOOLS: Kilo Code mode, Playwright MCP, terminal.

Build the customer experience with the CustomerLayout:
- /customer-dashboard: welcome banner + "Book new appointment", next appointment card (Reschedule, Cancel, Chat with stylist), loyalty points card with progress and Redeem, quick-action tiles, recommended services (rule-based now) with Book buttons, offers carousel, recent invoices, "Rate your last visit" (5 stars, comment, Submit).
- /customer/book: step accordion: 1 Service (category tabs, cards with duration/price, "Describe your concern" box with Suggest services returning 3 matches), 2 Staff (cards with rating, "Any available"), 3 Date & time (calendar + slot chips from availability API), 4 Confirm (notes, coupon Apply); sticky price summary; Back / Next / Confirm booking; success state with calendar-add and chat link.
- /customer/appointments: tabs Upcoming/Past/Cancelled, cards with actions Reschedule, Cancel, Chat with stylist, View details, Rebook, View invoice, Leave feedback.
- /customer/invoices: summary cards, search/date filter, table with View and Download PDF, invoice drawer. /customer/profile: edit details, allergies, change password, delete account request.
Backend additions as needed: cancellation/reschedule window rules, feedback endpoint, customer-safe serializers (no staff-private fields).
Acceptance (Playwright): register a new customer, book, chat, view invoice after the receptionist checks out, leave feedback.
```

---

## PHASE 13: Dashboard, reports, marketing, notifications, settings

```
TOOLS: Kilo Code mode, Playwright MCP, SQLite MCP, Context7 (Recharts), terminal.

BACKEND: dashboard aggregates (today revenue, appointments, new customers, low stock), revenue by day/week/month, bookings vs cancellations vs no-shows, service popularity, staff performance, retention and repeat-customer rate, payment breakdown, inventory usage; CSV and PDF export; campaigns (WhatsApp/Email/SMS simulated sending, audience filters, scheduled send, performance counters), automations (birthday, anniversary, appointment reminder, rebooking reminder, review request) via a management command/scheduler, coupons/offers, loyalty rules, notifications feed, settings (business info, working hours, tax, roles & permissions view, integrations toggles), audit-log list endpoint (admin).
FRONTEND:
- /dashboard (admin; receptionist sees today's view): greeting, date-range toggle, + New Appointment / Walk-in / Quick Invoice, 4 clickable stat cards, revenue chart with Daily/Weekly/Monthly, today's appointments table with actions, top services donut, staff performance list, low-stock alerts with Reorder, recent chats, AI insights card.
- /reports with tabs Revenue, Bookings, Staff, Services, Customers, Inventory, Payments, date range, Compare, Export CSV/PDF.
- /marketing: stat cards, tabs Campaigns, Automations (toggles), Coupons & Offers, Loyalty; Create Campaign modal with variable chips, phone preview, schedule, Send test, Save draft.
- /settings tabs: Profile, Business, Roles & Permissions, Notifications, Integrations, AI Settings, Payments & Tax, Data & Export. /audit-log, /users-roles, /security (2FA setup with QR).
Acceptance: charts match SQL totals; exports download; audit log shows earlier actions.
```

---

## PHASE 14: Hybrid AI (rules first, local Ollama second)

```
TOOLS: Kilo Code mode, Context7, terminal. (Ollama runs locally: no API key. Install from ollama.com, `ollama pull llama3.2:3b`, `ollama pull all-minilm`.)

Build the ai app with AI_MODE = hybrid | rules | ollama.
1. Rule engine (always works): intent detection with regex/keywords for book / reschedule / cancel / ask price / ask hours / recommend service; entity extraction for service, staff, date, time using the real service/staff tables and a date parser; always validates availability with the Phase 6 engine; never invents availability.
2. Ollama client (http://localhost:11434/api/chat, stream false, timeout, health check). If Ollama is down or slow, automatically fall back to rules.
3. RAG: embed salon documents (services, prices, FAQs, policies) with all-minilm, store in a simple vector store (FAISS or ChromaDB), retrieve top-k, pass to the LLM.
4. Endpoints: POST /api/ai/chat/, /book-appointment/, /recommend-service/ (exactly 3 services from the catalogue as JSON), /business-insight/ (answers only from provided dashboard data, no invented numbers), /review-reply/, /no-show-risk/, /suggest-replies/ (for Zen Chat). Strict JSON outputs, validated and sanitised; prompt-injection safe (system prompt separated from user text; the model can only propose, the backend validates and books).
5. Role rules: customers can use receptionist/recommender features; insights only for admin.
FRONTEND: /ai-assistant (history list + New chat, tabs Business Insights / Receptionist / Service Recommender / Review Reply / No-show Risk, suggested prompts, response cards with metric mini-charts, booking confirmation card with Confirm booking / Change time, copy/regenerate/thumbs), AI suggested replies in Zen Chat, "Suggest services" in customer booking, AI insights card on dashboard.
Tests: intent/entity extraction cases, fallback when Ollama is unreachable (mock), no-invented-slots test.
```

---

## PHASE 15: Hardening, quality and polish

```
TOOLS: Kilo Debug mode, Playwright MCP, terminal (pytest, ruff, npm run build, npm audit, pip-audit).

1. Security pass: test every endpoint against all four roles (automated matrix test), IDOR checks, CSRF, rate limits, cookie flags, security headers, input validation, error messages, secrets scan, dependency audit. Fix everything found.
2. Performance: add select_related/prefetch_related, N+1 detection on list endpoints, pagination everywhere, DB indexes verified.
3. Frontend: loading/empty/error states on every page, form validation, keyboard navigation, focus states, responsive layouts (desktop/tablet/mobile), dark mode check, remove console errors, bundle size check.
4. Playwright end-to-end tests for the demo script: owner logs in -> customer books (AI receptionist or form) -> receptionist drags appointment -> customer and stylist chat -> stylist completes -> receptionist checks out -> stock drops, commission updates -> owner asks "Which service earned most this month?".
5. Documentation: README, docs/API.md (from Swagger), docs/ARCHITECTURE.md (data flow, encryption, roles), docs/DEMO.md.
Acceptance: backend tests green, ruff clean, frontend build clean, Playwright demo script passes.
```

---

## PHASE 16: Wow-factor features (after the foundation is solid)

Run each as its own small prompt.

```
TOOLS: Kilo Code mode, Playwright MCP, terminal.

16a. Live sync: Channels broadcast so every receptionist's /schedule updates instantly when anyone books, moves or cancels (with a subtle glass "updated by Priya" toast).
16b. Gap filler: when a cancellation opens a slot, rank waitlist and past customers by fit and show one-tap "Offer slot" (simulated message with a 10-minute hold).
16c. Command palette (Cmd/Ctrl+K): search customers, appointments, invoices; commands like "book Priya haircut 6pm" routed to the rule engine.
16d. Live salon floor view: real-time board of chairs/rooms, who is in service, waiting guests, wait times.
16e. No-show risk + overbooking suggestion shown on schedule blocks with explanation chips.
16f. Smart upsell at checkout based on service history and inventory.
16g. Liquid Glass refraction: SVG displacement filter on selected elements (nav pill, modal edge) with graceful blur-only fallback for non-Chromium browsers.
16h. True end-to-end encrypted Zen Chat option using libsodium in the browser (key exchange per thread, ciphertext-only on server). Document the trade-off: AI suggested replies and server search are disabled for E2EE threads.
16i. Demo mode: one-click reset and seeded storyline for recording the demo video.
```

---

## PHASE 17: Deployment (later)

```
TOOLS: Kilo Architect mode, Context7, terminal.

Prepare production settings: PostgreSQL via DATABASE_URL, DEBUG False, secure cookies with correct SameSite/domain strategy (cookie auth across Vercel and Render needs a shared parent domain or a reverse proxy), Daphne start command, WhiteNoise/static handling, collectstatic, CORS/CSRF trusted origins, env var docs, Dockerfile/render.yaml, frontend VITE_ env vars, health checks, backup notes, AI_MODE=hybrid with Ollama optional. Provide a step-by-step deployment checklist. Do not deploy anything without my confirmation.
```

---

## Per-phase verification checklist

- Tests pass (`pytest`), `ruff check .` clean, `npm run build` succeeds.
- No console errors in the browser; Playwright screenshots look correct in light and dark mode.
- SQLite MCP confirms rows changed as expected; encrypted columns contain ciphertext.
- Role matrix still holds: try the new endpoints as admin, receptionist, stylist, customer.
- Commit to Git.

## If the free tier runs out mid-phase

- Stop and commit what works.
- Split the prompt: backend first, frontend second.
- Ask the agent to work on one file or one page at a time.
- Come back to Claude with the failing output and the file; paste only the relevant part.
