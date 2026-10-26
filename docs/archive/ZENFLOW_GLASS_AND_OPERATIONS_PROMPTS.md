# ZenFlow: Real iOS 26 Glass + Full Role Operations (prompts for Claude in Antigravity)

## Why your screenshot looks flat

1. **Glass needs something colourful behind it.** A translucent white card over a near-white page is just a white card. iOS 26 "Liquid Glass" looks like glass because vivid colour, light and content sit behind a blurred, tinted, edge-lit surface. So the wallpaper must be a rich violet/white gradient, and the glass tint must be much lower (30 to 45% white, not 62%+).
2. **The page is a placeholder.** The foundation step created a title and a white card for every route, with no layout (no sidebar or navbar) and no operations. These prompts replace every placeholder.

## Order to run (one prompt per NEW chat, Claude model selected in Antigravity)

| Step | Prompt | Result |
|---|---|---|
| 1 | **G1** Glass overhaul | Real iOS 26 look: wallpaper, materials, components, layouts |
| 2 | **G2** Workflow engine | A central mock "backend" with all business rules, so operations really work across pages |
| 3 | **R1 to R4** | Receptionist pages (front desk, guests, checkout, inventory view) |
| 4 | **A1 to A5** | Admin pages |
| 5 | **S1** | Stylist pages |
| 6 | **C1 to C3** | Customer pages |
| 7 | **Z** | Chat, AI assistant, notifications, search |
| 8 | **QA** | Gate: no placeholders left, every operation tested |

After each prompt: look at the pages in your browser, then `git commit`.

---

## SECTION 1: Operations catalog (the source of truth)

Put this in your workspace rules (or save as `docs/OPERATIONS.md` and tell the agent to read it first). Every prompt below refers to it.

### Receptionist (front desk)
**Schedule and appointments**
- View day/week calendar by staff; filter by staff, service, status.
- Create appointment (customer, one or multiple services, staff or "any", date, slot, room/chair, notes, recurring).
- Drag to reschedule, drag to another staff column to reassign, resize to change duration; conflict detection with suggested slots.
- Edit notes, cancel (with reason), mark no-show, check-in, send reminder, confirm by phone.
- Block time (internal hold / break), add walk-in (instant check-in), waitlist add / assign / remove.
- Print or export today's schedule.

**Guests (customers)**
- Register new guest, search by name/phone/email, edit profile, photo, allergies, notes, preferred staff.
- View visit history, invoices, chat history, packages, memberships, gift card balance, loyalty points.
- Merge duplicate guests, add tags, record consent, add referral.

**Checkout and money**
- Open checkout from a completed appointment or walk-in; add or remove services/products; change staff on a line.
- Apply coupon, package session, membership benefit, gift card, loyalty redemption; GST; tip (preset or custom, assign to staff).
- Split payment across cash/card/UPI/wallet; hold ticket and resume; generate invoice; print, download, send via WhatsApp/email.
- Sell packages, memberships, gift cards.
- Request refund (admin approves); daily cash close with denominations and difference.

**Chat and engagement**
- Zen Chat inbox: reply, quick replies, assign to stylist, resolve/reopen, convert chat into an appointment.
- Send manual reminder or rebooking message.

**Other**
- View inventory and low-stock list, raise a reorder request.
- Daily sales and appointments report; clock in/out; profile and password.

### Stylist / Barber
- Clock in/out; "My Day" timeline; availability toggle (available / on break / unavailable).
- See next guest details: history, allergies (alert), preferences, notes.
- Start service, complete service; add service notes/formula; add upsell (extra service or product) to the ticket; record products used; upload before/after photo (mock).
- Request reschedule or hand-off to receptionist; mark guest late/no-show (request).
- Block time / request break / request leave.
- My schedule (week), my customers (read-only profiles), chat with guests.
- Earnings: commission, tips, per-day/week/month, payroll-ready summary; reviews received.

### Admin / Owner (everything the receptionist has, plus)
- **People:** invite/create staff and receptionists, assign roles, set working hours, breaks, skills, commission %, enable/disable accounts, unlock accounts, reset passwords, approve/reject leave, attendance review, payroll summary export.
- **Catalogue:** services and categories (price, duration, buffer, products used, staff), rooms/chairs, packages, memberships, gift cards, coupons/offers, loyalty rules, tax (GST), tip presets.
- **Money:** approve/reject refunds, price override with reason, view all invoices, payments by method, cash-close review.
- **Inventory:** products CRUD, suppliers, purchase orders (draft, send, receive), stock adjust, transfers, audits, usage and valuation.
- **Marketing:** campaigns (WhatsApp/Email/SMS simulated), automations (birthday, anniversary, reminder, rebooking, review request), coupons, review-reply generator.
- **Insight:** dashboard, reports (revenue, bookings, staff, services, customers, inventory, payments), CSV/PDF export, AI insights.
- **Control:** business settings, working hours, integrations toggles, AI mode, audit log, security/2FA, active sessions, data export, anonymize/delete a customer.

### Customer
- Register (with OTP step), login, profile (allergies, preferences), change password, delete-account request.
- Book: pick service (or describe concern and get 3 suggestions), staff, date/time, coupon, notes, confirm; join waitlist if no slot.
- Manage: reschedule/cancel within the allowed window (show policy), rebook, add to calendar, "I'm here" check-in button.
- Chat with the assigned stylist, quick replies.
- Invoices: view, download, tip after service, pay (mock).
- Loyalty: points, redeem, tiers; packages, memberships, gift cards (buy/redeem); referral code and share.
- Feedback and ratings after a visit; notifications; favourite stylists.

### Business rules that must cascade (implemented in the G2 workflow engine)
1. Create appointment → status Scheduled, chat thread created, confirmation notification, appears on schedule instantly.
2. Overlapping booking for staff or room → rejected with 3 nearest slots; staff on leave or break → slot disabled.
3. Status machine: Scheduled → Checked-in → In-progress → Completed; Scheduled/Checked-in → Cancelled or No-show. Invalid transitions are blocked. Stylists can only start/complete their own.
4. Cancel → slot freed → matching waitlist entries get an "Offer slot" prompt.
5. Complete → appointment becomes "Ready for checkout" in POS and a notification goes to the receptionist.
6. Pay invoice → invoice becomes immutable (Paid), stock deducted by service products + sold products (ledger rows), commission (+tip) credited to the stylist, loyalty points earned, package/membership/gift-card balances updated, daily sales updated, customer gets a receipt notification and can leave feedback.
7. Refund: receptionist requests, admin approves → reverses stock/commission/loyalty as configured, invoice shows Refunded.
8. Low stock → alert on dashboard, inventory and a notification to admin.
9. No-show risk recalculated from history, lead time and first-time status.
10. Every sensitive action writes an audit-log row (login, role change, price change, refund, invite, export).
11. Role rules enforced in the UI and in the mock API: each role sees only what its catalog allows.

---

## SECTION 2: Real iOS 26 "Liquid Glass" spec (v2)

```
LIQUID GLASS v2: WHITE + VIOLET, iOS 26 style, light mode.

1. WALLPAPER (this is what makes glass visible). Full-viewport fixed layer:
   - base #F6F2FF
   - 5 large blurred shapes (blur 90-140px, slow 40-60s drift animation, transform only):
     violet #8B5CF6 @55% opacity, deep violet #7C3AED @35%, lilac #C4B5FD @70%, periwinkle #A5B4FC @50%, soft pink #F5B8E6 @35%, plus one white glow #FFFFFF @80%.
   - 3% film-grain noise overlay (SVG feTurbulence) to avoid banding.
   Content scrolls UNDER the floating toolbar/sidebar so the blur is visible.

2. GLASS MATERIAL (build as a reusable .glass class + <Glass> component with variants: regular, clear, tinted, dense):
   - fill: regular rgba(255,255,255,0.34), clear rgba(255,255,255,0.20), tinted violet rgba(139,92,246,0.18), dense rgba(255,255,255,0.72) (tables, forms, calendar, chat text areas).
   - backdrop-filter: blur(32px) saturate(190%) brightness(1.06). Add -webkit- prefix.
   - specular edge: 1px gradient border (white 0.95 at top-left -> white 0.15 mid -> white 0.55 bottom-right) via mask-composite.
   - inner highlight: inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), inner soft glow inset 0 0 24px rgba(255,255,255,0.25).
   - outer shadow: 0 10px 40px rgba(91,33,182,0.16), 0 2px 8px rgba(91,33,182,0.08).
   - "light follows pointer": on hover, a radial-gradient specular highlight (white 0.5 -> transparent, 220px) tracks the mouse position via CSS variables (--mx, --my). Disable on touch and reduced motion.
   - Optional lensing for navbar/toolbar/capsules: SVG feDisplacementMap filter (scale 6-10) applied to a pseudo-element behind the content, Chromium only, with plain blur fallback. Feature-detect.
   - Fallbacks: @supports not (backdrop-filter) and prefers-reduced-transparency -> solid rgba(255,255,255,0.92).

3. SHAPES (concentric radii): app cards 28px, nested inner items 20px, floating sidebar 36px inset 16px, toolbar pill 999px, buttons/chips/segmented controls/toggles fully capsule, inputs 18px, modals/sheets 36px with a grabber handle on mobile sheets, avatars circular.

4. COLOUR: primary violet #7C3AED; hover #6D28D9; light #8B5CF6; soft #EDE9FE. Primary button = tinted violet glass capsule: gradient #9F67FF -> #7C3AED, specular top highlight, glow shadow rgba(124,58,237,0.45). Secondary button = clear glass capsule with violet text. Text #1E1B4B (secondary #5B5675, tertiary #8B87A3). Success #22C55E, warning #F59E0B, danger #EF4444, indigo #6366F1 (status capsules are tinted glass with coloured dot).

5. CONTROLS: iOS segmented control with a sliding glass thumb; iOS-style toggle (green when on for system toggles, violet for brand toggles); search field as a glass capsule with magnifier; large titles (34px/700) that collapse into the toolbar on scroll; list rows with inset separators; tab bar on mobile as a floating glass capsule with an active "bubble".

6. MOTION: spring easing cubic-bezier(0.2,0.8,0.2,1) 350-450ms; press scale 0.97; modals/popovers morph from the trigger (scale+opacity+blur-in); stagger list entrances 40ms; hover lift translateY(-2px) with brighter specular. Honour prefers-reduced-motion.

7. TYPE: -apple-system, "SF Pro Display", "SF Pro Text", Inter. Large title 34/700, title 22/650, headline 17/600, body 15/450, caption 12/500, tracking -0.01em on titles. Tabular numbers for money.

8. ICONS: lucide-react, strokeWidth 1.6, in glass icon buttons (44px capsule/circle).

9. READABILITY RULE: any text block longer than a short label sits on dense glass (>=0.72 white). Contrast WCAG AA. Never put body text directly on clear glass.
```

---

## G1: Glass overhaul (run first)

```
TOOLS: Claude in Antigravity, built-in browser (screenshots), terminal.

Read the rules, docs/OPERATIONS.md and the existing /frontend. The current UI is flat white cards with placeholder pages and no layout. Rebuild the visual layer with the "LIQUID GLASS v2" spec exactly as written (wallpaper, material, shapes, colours, controls, motion, type, icons, readability rule). Do not change routes or data code.

1. Create src/styles/glass.css (+ Tailwind plugin/tokens) implementing the glass material, wallpaper (fixed, animated, grain), specular borders, pointer-following highlight (small useGlassPointer hook), fallbacks and reduced-motion/transparency support.
2. Rewrite every UI component in src/components/ui on top of <Glass>: Button (primary tinted-violet capsule, secondary clear glass, ghost, danger), IconButton, Input/PasswordInput/Textarea/Select/MultiSelect/DatePicker/TimePicker/DateRangePicker, SegmentedControl (sliding thumb), Toggle, Checkbox, Chip, StatusBadge (tinted glass + dot), RiskChip, Avatar/AvatarGroup, StatCard, Tabs, Table (dense glass, sticky header, row hover glow, selectable, pagination, row action menu), Modal and Drawer (morph from trigger, grabber on mobile), Popover, DropdownMenu, Tooltip, Toast (floating glass capsule), ConfirmDialog, Stepper, Pagination, Breadcrumbs, ProgressBar, CircularGauge, Rating, FileUpload, SearchBar, EmptyState (with soft illustration), Skeleton (shimmer).
3. Layouts: StaffLayout = floating glass sidebar (36px radius, inset 16px, icon + label, active item is a violet glass bubble, collapsible to icons, user card at the bottom with role and Logout) + floating pill toolbar (large title that collapses on scroll, breadcrumbs, glass search capsule, "+ New Appointment" primary capsule, notification bell and chat icon with badges, profile menu). Main content scrolls under the toolbar. CustomerLayout = floating glass top navbar capsule (logo, Home, Book, My Appointments, Invoices, Chat, loyalty chip, profile). Mobile: floating bottom tab bar capsule. AuthLayout: full-bleed wallpaper with a large glass card.
4. Apply StaffLayout / CustomerLayout / AuthLayout to EVERY route according to role (the current pages render without any layout; fix that).
5. Update /design-system to show every component, all glass variants, over the wallpaper.
6. Restyle the placeholder pages with real page headers (large title + subtitle + action capsule) so no page is a bare card.

VERIFY: screenshots of /design-system, /login, /customer-dashboard, /dashboard. The result must look like iOS 26: visible coloured depth through translucent surfaces, bright edge highlights, capsule controls, soft violet shadows. If surfaces look like flat white cards, lower the fill opacity and increase wallpaper contrast until the blur and colour show through. Build and lint must pass.
```

---

## G2: Workflow engine (makes operations real across pages)

```
TOOLS: Claude in Antigravity, browser, terminal.

Read docs/OPERATIONS.md ("Business rules that must cascade"). Build a central mock backend in /frontend/src/mocks/engine so operations work end to end across pages. When the real Django API is ready, only src/api/* will change.

1. State store (zustand or React context + reducer) holding: users, staff, customers, services, categories, rooms, workingHours, breaks, leaves, appointments, waitlist, invoices, invoiceItems, payments, refunds, coupons, packages, memberships, giftCards, loyaltyTransactions, commissionRecords, cashCloses, products, suppliers, purchaseOrders, stockMovements, chatThreads, chatMessages, campaigns, notifications, feedback, auditLogs, settings. Persist ONLY mock data to localStorage under "zenflow-mock-db" (never tokens) with a "Reset demo data" button in Settings and a seed function with rich Indian-salon data (4 stylists Rahul, Arun, Kiran, Priya; 2 receptionists; 1 admin; 30 customers; 15 services; ~80 appointments across past/future/today with all statuses; invoices; 25 products with some low stock; chat threads; campaigns).
2. Engine functions (pure, tested): getAvailability, createAppointment (overlap, leave, break, room, buffer checks, returns 3 nearest slots on conflict), rescheduleAppointment, reassignStaff, changeDuration, setStatus (state machine + role checks), cancelAppointment (frees slot, offers waitlist), addToWaitlist, assignWaitlist, createInvoiceFromAppointment, applyDiscounts (coupon, package, membership, gift card, loyalty), calculateTotals (GST, tip), payInvoice (immutable, stock ledger, commission, loyalty, balances, notification), requestRefund / approveRefund / rejectRefund, adjustStock, createPurchaseOrder / receivePurchaseOrder, sendMessage (creates notification, unread counts), computeNoShowRisk, dashboard/report aggregations, writeAudit.
3. Permission layer: can(role, action, resource, ownerId) used by every api function and by UI components (hide or disable what a role cannot do; show a toast "Not allowed for your role" if forced).
4. src/api/* functions call the engine with ~250ms artificial delay and return the same shapes the real API will. React Query hooks invalidate the right queries after each mutation so UI updates everywhere (schedule, dashboard, notifications, unread badges).
5. Real-time feel: a tiny event bus so that changes made in one role appear in another browser tab via the BroadcastChannel API (nice for demos: receptionist books, stylist's My Day updates).
6. Write vitest unit tests for the engine: overlap, leave/break, buffer, state machine, waitlist offer, totals with each discount type, payInvoice cascade, refund reversal, permissions.
Do not build page UI in this step beyond a hidden /dev/engine page that lists store counts and has buttons to run sample operations.
VERIFY: tests pass, build passes.
```

---

## RECEPTIONIST PAGES

## R1: Front desk (Schedule, Appointments, New, Details, Walk-in, Waitlist)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Receptionist: Schedule and appointments) and the F5-F8 page descriptions in ZENFLOW_FRONTEND_PAGE_PROMPTS.md. Replace the placeholders for /schedule, /appointments, /appointments/new, /appointments/:id with fully working glass pages using the G2 engine and hooks. Role: receptionist (admin has the same abilities).

/schedule: resource calendar (@dnd-kit): staff columns, 9AM-8PM, 15-min snapping. Drag to move, drag across columns to reassign, resize bottom edge to change duration, optimistic update + revert with conflict toast showing 3 suggested slots. Click empty slot -> quick-book drawer (customer combobox with "+ New guest", service(s), staff, room, notes). Click block -> popover (View details, Check-in, Start, Complete, Reschedule, Cancel with reason, No-show, Chat). Toolbar: Day/Week/Month, staff and service filters, date picker, status legend, + New Appointment, Walk-in, Block time (internal hold), Waitlist panel, Print schedule (print stylesheet). Show breaks, leaves, current-time line, risk badges on blocks.
/appointments: table with search, filters, tabs with counts, bulk actions (cancel selected, send reminder), row menu with ALL status operations and Reschedule modal, Export CSV, + New Appointment, Walk-in drawer, Waitlist drawer (Add, Assign to slot, Remove).
/appointments/new: customer combobox with inline new-guest drawer, multi-service selection (stacked durations), staff or "Any available", date, slot grid from getAvailability, room, recurring (weekly/monthly + occurrences), notes, send confirmation checkbox, sticky summary, buttons Book / Save as walk-in / Join waitlist / Cancel.
/appointments/:id: status action bar following the state machine, Reschedule modal, Cancel with reason, edit notes, products used, "Create invoice" -> /pos?appointment=ID, chat preview, audit-style timeline of every change.
Every action must show a toast, update all other views instantly and be reflected in the notifications feed.
VERIFY with the browser as receptionist: create, drag, reassign, resize, conflict, cancel (waitlist offer appears), check-in, start, complete (appears as ready for checkout). Screenshots.
```

## R2: Guests (CRM)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Receptionist: Guests). Replace placeholders for /customers and /customers/:id with fully working pages.
/customers: search (name/phone/email), filters, table/grid toggle, + Add Customer drawer (zod), Import CSV modal (parses and previews rows before importing), Export, row actions (View, Book, Chat, Invoice), bulk tag, merge duplicates (select 2 -> compare dialog -> merge).
/customers/:id: header actions (Book, Chat, Create invoice, Edit, Delete/Anonymize with confirm - admin only), allergy alert, stats, tabs: Overview, Appointments, Invoices (-> invoice page), Preferences, Chat history, Feedback, Loyalty & Packages (points ledger; admin can adjust points with reason; sell package/membership/gift card buttons), Notes (add dated notes), Consents. Referral card with copy link.
Permissions: receptionist cannot delete or adjust points; stylist is read-only.
```

## R3: Checkout and money (POS, Invoice, Cash close)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Receptionist: Checkout and money). Replace placeholders for /pos, /pos/invoice/:id and /cash-close with working pages using the engine.
/pos: select "ready for checkout" appointment (or walk-in), items table (add/remove services and products, change staff per line, qty), coupon Apply (validate), toggles for membership, package session, gift card (enter code), loyalty redemption (shows points used), GST, tip chips + custom (assign tip to staff), split payments across cash/card/UPI/wallet with remaining balance, Hold ticket / Resume held tickets, Charge, success animation, New sale. Sell package / membership / gift card as line items. Recent Invoices tab (View, Request refund) and Daily Sales tab with live totals.
/pos/invoice/:id: printable invoice, Print, Download PDF (generate a real PDF in the browser with a small library if approved, else print-to-PDF), Send via WhatsApp/Email (creates notification), Refund flow (receptionist requests, admin approves/rejects with note), Refunded and Paid states, paid invoice cannot be edited.
/cash-close: denominations counter, expected vs counted difference, notes, submit, history table.
After payment: stock ledger rows, commission + tip, loyalty points, balances and notifications must update, visible in /inventory, /earnings, /dashboard, customer profile.
```

## R4: Inventory (view + request) and Receptionist dashboard

```
TOOLS: Claude in Antigravity, browser, terminal.
Build /inventory and /inventory/:id in view mode for the receptionist (stock levels, low-stock list, usage, "Request reorder" button that creates an admin notification), and the receptionist /dashboard variant (today's arrivals, ready for checkout, waitlist, unread chats, today's sales, low-stock alerts). Admin gets the full inventory in prompt A4.
```

---

## ADMIN PAGES

## A1: People (Staff, Staff profile, Users & roles, Attendance, Leaves, Payroll)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Admin: People). Replace placeholders for /staff, /staff/:id, /users-roles with working pages.
/staff: cards + tabs Staff / Attendance / Leaves / Payroll. Add Staff drawer (sends invite -> invite link toast and appears in Pending invites), assign services, weekly working hours + breaks editor, Clock in/out for anyone, Approve/Reject leave (updates schedule availability), Attendance table with late flags and filters, Payroll tab (period selector, per-staff commission + tips + total, Export CSV).
/staff/:id: Overview, Performance, Earnings, Appointments, Schedule & Leaves, Reviews; edit commission %, working hours, skills, disable/enable account.
/users-roles: accounts table, Invite user, Change role (warning), Reset password, Unlock, Disable/Enable, Pending invites (Resend/Revoke). Every change writes an audit row.
```

## A2: Catalogue (Services, Packages, Memberships, Gift cards, Coupons, Rooms)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Admin: Catalogue). Replace the /services placeholder with a working page with tabs: Services (CRUD, categories, price/duration/buffer, products used, assigned staff, active toggle, Duplicate; price changes require a reason and are audited), Packages, Memberships, Gift cards (issue, view balance, history), Coupons & Offers (code, type, amount, validity, limits, usage count), Rooms/Chairs (CRUD). Changes immediately affect booking, POS and customer booking pages.
```

## A3: Inventory (admin full)

```
TOOLS: Claude in Antigravity, browser, terminal.
Complete /inventory and /inventory/:id for admin: Products CRUD, Adjust stock modal (ledger entry with reason), Suppliers CRUD, Purchase orders (draft -> send -> receive creates stock ledger rows), Stock transfers between locations, Audits (count -> variance -> adjustment), Usage and valuation charts, low-stock banner and reorder suggestions that prefill a PO.
```

## A4: Insight (Dashboard, Reports, Marketing)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Admin: Marketing, Insight). Replace placeholders for /dashboard, /reports, /marketing with working pages driven by real engine aggregations (numbers must match the underlying data).
/dashboard: stat cards (clickable), revenue chart (Daily/Weekly/Monthly), today's appointments with actions, top services, staff performance, low stock with Reorder, recent chats, AI insights card.
/reports: all tabs, date range, Compare, Export CSV (real file) and PDF (print view).
/marketing: Campaign wizard (audience filter computed from customers, channel, template with variables, live preview, schedule, Send test, Save draft, Send -> creates notification rows and updates campaign stats), Automations toggles with editable templates, Coupons, Loyalty rules, Review-reply generator.
```

## A5: Control (Settings, Audit log, Security)

```
TOOLS: Claude in Antigravity, browser, terminal.
Replace placeholders for /settings, /audit-log, /security, /cash-close (admin view) with working pages: business info and working hours, GST/tip presets, refund approval rule, integrations toggles with Test buttons, AI mode selector + Ollama connection check, notification preferences, Data export, Reset demo data, system health chip; Audit log with filters and CSV export (reads the engine's audit rows); Security: 2FA enrolment stepper (mock QR + code), sessions list with Sign out, recovery codes, encryption explainer. Refund approvals queue lives in /pos Recent Invoices and a "Pending approvals" card on the admin dashboard.
```

---

## STYLIST PAGES

## S1: Stylist workspace

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Stylist). Replace placeholders for /my-day, /my-schedule, /my-customers, /earnings with working pages scoped to the logged-in stylist only.
/my-day: clock in/out with timer, availability toggle, timeline, next-guest card with history and allergy alert, Start, Complete (drawer: service notes/formula, products used with quantities, upsell add-on service/product, before/after photo upload), Request hand-off or reschedule (creates receptionist notification), mark late/no-show request, Chat. Completing creates "ready for checkout".
/my-schedule: week view, Block time, Request break, Request leave, request statuses.
/my-customers: searchable list and read-only profile drawer (no billing), Chat.
/earnings: commission, tips, chart, per-service table, reviews received, payroll summary, Export.
Stylist can never see other stylists' data or admin pages; verify by trying the URLs.
```

---

## CUSTOMER PAGES

## C1: Account and booking

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer). Replace placeholders for /customer/login, /customer/register, /customer-dashboard, /customer/book, /customer/profile with working pages. Register has the OTP step; Book is the 4-step flow with AI "describe your concern" returning exactly 3 service suggestions (rule-based now), staff choice, slot grid from the engine, coupon, notes, confirm, waitlist join when full, success with Add to calendar (.ics download) and Chat. Dashboard: next appointment with Reschedule/Cancel (policy window and fee notice), "I'm here" check-in button (-> status Checked-in, notifies receptionist), loyalty ring + Redeem, offers, rate last visit.
```

## C2: Appointments, invoices, wallet

```
TOOLS: Claude in Antigravity, browser, terminal.
Replace placeholders for /customer/appointments and /customer/invoices: tabs Upcoming/Past/Cancelled with all actions (reschedule, cancel with policy, rebook, details drawer, feedback with stars, view invoice), invoices table and drawer (download, tip after service, mock pay online), plus a "My Wallet" section on the dashboard or profile: loyalty ledger, packages and memberships with balances, gift card redeem/buy, referral code with copy/share.
```

## C3: Customer chat

```
TOOLS: Claude in Antigravity, browser, terminal.
Replace the /customer/chat placeholder: threads per appointment, messages with ticks and typing indicator, quick replies, attachments (mock), real-time via the engine's event bus (messages from the stylist/receptionist tab appear live), unread badges in the navbar.
```

---

## CROSS-CUTTING

## Z: Zen Chat (staff), AI Assistant, Notifications, Search

```
TOOLS: Claude in Antigravity, browser, terminal.
1. /chat (admin, receptionist, stylist): three panes, tabs All/Unread/Resolved, send messages (live across tabs), quick replies, AI suggested replies (rule-based from keywords: running late, reschedule, parking, price), Mark resolved/Reopen, Assign to stylist (receptionist), "Convert to appointment" (opens new-appointment prefilled), customer panel with actions. Stylists only see their own threads.
2. /ai-assistant (admin; receptionist limited): rule-based intent engine on top of the workflow engine: "Book a haircut with Rahul tomorrow at 6 PM" -> parses service/staff/date/time, checks availability, shows a booking card with Confirm (creates the real appointment); "Which service earned most this month?" and other insights computed from data (never invent numbers); recommend 3 services; review reply generator; no-show risk table. Structure the code so an Ollama call can replace the parser later.
3. Notifications drawer: real events from the engine (booking, cancellation, waitlist offer, ready for checkout, low stock, refund request, message, payment), grouped, mark read/all read, click navigates, scoped by role.
4. Command palette (Ctrl/Cmd+K): search customers, appointments, invoices, products, pages; quick actions; role-aware results.
```

---

## QA: Final gate (run last, repeat until clean)

```
TOOLS: Claude in Antigravity, browser, terminal.
Audit the frontend against docs/OPERATIONS.md. For each role (admin, receptionist, stylist, customer):
1. List every route and confirm it renders inside the correct layout with real content. FAIL any page that is a placeholder, a bare title, or contains "coming soon".
2. Walk through every operation in that role's catalog and test it in the browser. Produce a table: operation | page | works (yes/no) | fix applied.
3. Run the cascade scenario end to end across roles/tabs: customer books -> receptionist sees it, drags it -> customer checks in -> stylist starts, adds an upsell, completes -> receptionist checks out with coupon + tip + split payment -> stock drops, commission appears in stylist earnings, dashboard revenue updates, customer gets receipt and leaves feedback -> admin approves a refund -> everything reverses correctly.
4. Verify permissions by visiting forbidden URLs as each role.
5. Check the glass look: coloured wallpaper visible through surfaces, specular edges, capsule controls, readable text on dense glass, no flat white cards. Fix problems.
6. `npm run build`, `npm run lint`, vitest all pass. No console errors.
Fix everything you find, then output the final table and screenshots of the 12 most important pages.
```

---

## Next stage (after the frontend is solid)

Backend phases are in `ZENFLOW_KILO_PROMPTS.md` (Phase 1 onwards). For each module tell the agent: *"Replace the mock engine calls in src/api/<module>.ts with real Django API calls; keep the page components unchanged; move the business rules from the TypeScript engine to the backend."*
