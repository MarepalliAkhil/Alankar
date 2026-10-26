# ZenFlow: Strict Role-Based Workflow (replaces the earlier operations catalog)

This file **supersedes** `docs/OPERATIONS.md` and the role sections of earlier prompt files. Save Section 1 to `docs/OPERATIONS.md` (overwrite) and add it to your workspace rules. Use a **new chat per prompt** with the Claude model selected in Antigravity. Work on the **existing project** (the dashboard you like stays as is). Refactor, do not rebuild.

---

# SECTION 1: THE PLAN (single source of truth)

## 1.1 The workflow

```
CUSTOMER                RECEPTIONIST / ADMIN               STYLIST
   |                           |                              |
1. Books appointment  -->  2. Sees a REQUEST CARD        
   (service, preferred        (status: Requested)
   date/time, optional        Assigns stylist + time + room
   stylist, notes)            -> status: Scheduled
   status: Requested     -->  3. Customer notified; chat   -->  4. Stylist sees the appointment card
                                 unlocked between customer         (only theirs). Chat card appears
                                 and the assigned stylist           in Zen Chat for both.
5. Customer taps         -->  6. Receptionist checks guest in
   "I'm here" (flag)           (status: Checked-in)          -->  7. Stylist: Start service
                                                                   (In-progress), then Complete.
                         <--  8. Receptionist/Admin sees "Ready for checkout" -> POS: invoice, payment
9. Customer gets receipt, loyalty points, can rate. Stylist sees commission + tip. Stock auto-deducted.
```

## 1.2 Roles: who may do what (STRICT)

If an operation is not listed under a role, that role **cannot** do it: no menu item, no button, route blocked, and the engine rejects it.

### CUSTOMER
**Menu (nothing else):** Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile.
**May:**
- Register, login, edit profile (allergies, preferences), change password.
- Submit a booking request (service(s), preferred date and time slot, optional preferred stylist, notes, coupon).
- View own appointments (as cards) with status and assigned stylist/time once scheduled.
- Cancel own appointment/request (free before the cancellation window; inside the window it becomes a "Cancel requested" flag for the receptionist).
- Request reschedule (sets a "Reschedule requested" flag with a preferred new time; the receptionist decides).
- Tap "I'm here" (sets an "Arrived" flag; does NOT change status).
- Chat with the **assigned stylist** only (after assignment).
- View own invoices, download, leave a tip after service, rate and review a completed visit.
- View own loyalty points, packages, memberships, gift cards, referral code.
**May NOT:** assign staff or times, change status, see other customers, see staff data, chat with receptionist/admin, access any staff page.

### RECEPTIONIST
**Menu (nothing else):** Dashboard, Appointments, Schedule, Customers, POS / Billing, Cash Close, Inventory (view only).
**May:**
- Appointments: see **all** requests and appointments as cards; **assign** stylist + time + room to a request (Confirm) or **reject** it with a reason; create an appointment for a guest (phone/walk-in); reschedule, reassign, change duration (drag and resize on Schedule), cancel with reason, mark no-show, check-in guest, handle customer reschedule/cancel requests, add to waitlist and assign from waitlist, block time, send reminder, print the day schedule.
- Customers: register, search, edit, view history, allergies, notes, tags, merge duplicates.
- Billing: create invoice from a completed appointment or a walk-in, add services/products, coupon, package, membership, gift card, loyalty redemption, GST, tip, split payment, hold/resume ticket, print/send receipt, sell packages/memberships/gift cards, **request** a refund, daily cash close.
- Inventory: view stock and low-stock list, raise a reorder request to admin.
- Own: clock in/out, profile, password.
**May NOT:** Zen Chat (no access at all), start or complete a service, approve refunds, edit staff/services/pricing, marketing, reports (beyond the Dashboard and POS daily sales), settings, audit log, delete customers.

### STYLIST (barber/therapist)
**Menu (nothing else):** My Day, My Appointments, My Schedule, Zen Chat, Earnings.
**May:**
- See only appointments **assigned to them** (never Requested ones, never others' appointments) as cards with guest details and allergy alerts.
- On their own checked-in appointment: **Start service**, then **Complete service** (service notes, products used, upsell suggestion that goes to checkout as a line the receptionist confirms).
- Clock in/out, availability toggle, request leave/break.
- Zen Chat with **their own customers** only.
- Earnings: commission, tips, per-service history, reviews received.
**May NOT:** create, edit, assign, reschedule, cancel, check-in or no-show any appointment; see billing, other stylists, customers they are not assigned to; any admin or receptionist page.

### ADMIN (owner)
**Menu (nothing else):** Dashboard, Appointments, Schedule, Customers, Staff, Services, POS / Billing, Inventory, Marketing, Reports, AI Assistant, Settings (Business, Users & Roles, Audit Log, Security).
**May:** everything the receptionist can do **plus**:
- Staff: invite/create receptionists and stylists, roles, working hours, breaks, skills, commission %, enable/disable, unlock, reset password, approve/reject leave, attendance, payroll summary.
- Catalogue: services, categories, prices (reason required), packages, memberships, gift cards, coupons, loyalty rules, rooms, GST, tip presets.
- Money: **approve/reject refunds**, price override with reason, all invoices, cash-close review.
- Inventory: full CRUD, suppliers, purchase orders (draft, send, receive), adjustments, transfers, audits.
- Marketing, Reports (+export), AI Assistant insights, Settings, Audit log, 2FA/security, anonymize or delete customers.
**May NOT:** Zen Chat (no access, to protect stylist-customer privacy), start or complete services.

## 1.3 Appointment lifecycle and who can trigger each step

| From | To | Allowed roles |
|---|---|---|
| (none) | **Requested** | Customer (online); Receptionist/Admin may also create directly as Scheduled |
| Requested | **Scheduled** (assign stylist, time, room) | Receptionist, Admin |
| Requested | **Rejected/Cancelled** (reason) | Receptionist, Admin; Customer (own) |
| Scheduled | Scheduled (reschedule/reassign/resize) | Receptionist, Admin |
| Scheduled | **Checked-in** | Receptionist, Admin |
| Checked-in | **In-progress** | Assigned Stylist only |
| In-progress | **Completed** | Assigned Stylist only |
| Scheduled/Checked-in | **Cancelled** | Receptionist, Admin; Customer (own, by policy) |
| Scheduled | **No-show** | Receptionist, Admin |
| Completed | Invoiced -> **Paid** | Receptionist, Admin (POS) |

Customer-set flags (do not change status): `arrived`, `reschedule_requested` (+ preferred time), `cancel_requested`.

## 1.4 Visibility rules

| Data | Customer | Receptionist | Stylist | Admin |
|---|---|---|---|---|
| Requested appointments | own | all | none | all |
| Scheduled/active appointments | own | all | only assigned to them | all |
| Customer profiles | self | all | none (guest info appears only inside their own appointment card) | all |
| Invoices | own | all | none | all |
| Chat threads | own (with their stylist) | **none** | own (with their customers) | **none** |
| Earnings/commission | none | none | own | all |

## 1.5 Zen Chat rules
- Participants: **customer and the assigned stylist only**. Receptionist and admin have no chat menu and no access.
- A chat opens when the receptionist assigns the stylist (status Scheduled). One chat per customer-stylist pair (history kept across appointments, each message group tagged with its appointment).
- The Zen Chat page is a **grid of person cards** (stylist sees customer cards; customer sees stylist cards) showing avatar, name, next/last appointment chip, last message preview, unread badge. **Clicking a card opens that conversation** (right pane on desktop, full screen with Back on mobile).
- If a customer has no assigned stylist yet, show an empty state: "Chat unlocks once your appointment is scheduled."

## 1.6 Notifications (who gets what)
| Event | Recipients |
|---|---|
| Customer submits request | Receptionists, Admin |
| Request assigned (Scheduled) | Customer, assigned Stylist |
| Request rejected | Customer (with reason) |
| Rescheduled/reassigned | Customer, old and new Stylist |
| Customer arrived flag, reschedule/cancel request | Receptionists, Admin |
| Checked-in | Assigned Stylist |
| Service completed | Receptionists, Admin ("Ready for checkout") |
| Payment completed | Customer (receipt), Stylist (commission + tip) |
| Refund requested | Admin; approved/rejected -> requester |
| Low stock / reorder request | Admin |
| New chat message | The other participant only |

---

# SECTION 2: PROMPTS (run in order)

Every prompt begins with: *"Read docs/OPERATIONS.md first. It is the single source of truth. Work on the existing project; keep the current dashboard look and glass design. Implement ONLY what the plan allows for each role. Do not add features for roles that are not listed."*

## P1: Policy layer and strict menus (foundation)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first (single source of truth). Keep the current dashboard look and glass design. Refactor the existing code, do not rebuild.

1. Create src/policy/policy.ts as the ONLY place permissions live:
   - ROLE_MENUS: exact sidebar/navbar items per role from section 1.2 (admin, receptionist, stylist, customer), with icons and routes.
   - ROLE_ROUTES: allowed routes per role. Anything else redirects to the role's home with a toast "Not available for your role".
   - can(role, action, resource, ctx) covering every action in the plan, including appointment transitions from the lifecycle table and visibility rules from 1.4. Actions are named, e.g. appointment.assign, appointment.reschedule, appointment.checkIn, appointment.start, appointment.complete, appointment.cancel, appointment.requestReschedule, appointment.markArrived, invoice.create, invoice.refund.request, invoice.refund.approve, chat.read, chat.send, staff.manage, catalogue.manage, inventory.manage, report.view, settings.manage, audit.view.
   - A table-driven Vitest suite that asserts every ALLOWED and every DENIED combination from the plan (e.g. receptionist cannot chat.read; admin cannot chat.read; stylist cannot appointment.assign; customer cannot appointment.checkIn).
2. Rewire StaffLayout/CustomerLayout to render menus from ROLE_MENUS only. Remove Zen Chat from admin and receptionist menus. Remove pages not in a role's menu from navigation (keep files only if another role uses them).
3. Route guards use ROLE_ROUTES. UI components use a <Can action=... resource=...> wrapper so buttons a role may not use are not rendered at all (hide, do not just disable).
4. Role homes after login: admin /dashboard, receptionist /dashboard, stylist /my-day, customer /customer-dashboard.
5. Create any missing route shells needed by the plan: /my-appointments (stylist), /customer/appointments (customer), /appointments (receptionist/admin). Delete or redirect routes no role needs.
VERIFY in the browser: log in as each role, list the sidebar items and compare to section 1.2; try forbidden URLs; run tests.
```

## P2: Workflow engine update (Requested -> Scheduled, visibility, chat, notifications)

```
TOOLS: Claude in Antigravity, terminal (vitest).
Read docs/OPERATIONS.md first. Update the mock workflow engine (src/mocks/engine) to follow the plan exactly:
1. Appointment model: status in requested | scheduled | checked_in | in_progress | completed | cancelled | no_show | rejected; fields: customerId, serviceIds, preferredStylistId?, preferredDate, preferredSlot, assignedStylistId?, startAt?, endAt?, roomId?, notes, rejectionReason?, flags {arrived, rescheduleRequested, cancelRequested, preferredNewTime}, source (online/walk_in/phone), createdBy.
2. Functions with role checks via policy.can: submitBookingRequest (customer), assignAppointment (receptionist/admin: validates stylist skill, working hours, leave, break, overlap, room, buffer; returns 3 nearest slots on conflict; sets scheduled; creates the customer-stylist chat thread if missing), rejectRequest(reason), createDirectAppointment (receptionist/admin), reschedule, reassign, resize, cancel(reason), markNoShow, checkIn, startService (assigned stylist only, must be checked_in), completeService (assigned stylist only, with notes, products used, upsell suggestions), customerMarkArrived, customerRequestReschedule, customerRequestCancel / customerCancel (policy window setting, default 24h), handleRescheduleRequest (approve -> moves; decline with reason), waitlist ops.
3. Selectors with visibility rules from 1.4: getAppointmentsFor(user) returns only what that user may see. No component may read the raw store directly.
4. Chat: threads keyed by customer+stylist pair; only participants can read/send; getThreadsFor(user) returns [] for receptionist and admin. Unread counts per participant.
5. Notifications exactly per section 1.6, delivered only to the listed recipients.
6. Billing cascade stays as before (pay -> immutable, stock ledger, commission+tip to the stylist, loyalty, balances, receipt notification). Receptionist/admin only; refund request by receptionist, approval by admin.
7. Seed data: 8 requested appointments, 20 scheduled across today and next week for different stylists, 10 completed, some cancelled/no-show, chat threads between stylists and their customers only.
8. Vitest tests: full lifecycle happy path, each forbidden transition per role, visibility (stylist never sees requested or others' appointments; receptionist has zero chat threads), notification recipients, conflict suggestions.
Do not change page UI in this step.
```

## P3: Customer pages (request, view, manage)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Role: customer only. Menu: Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile.
1. /customer/book (4 steps): Service(s) (with "Describe your concern" -> 3 suggestions), Preferred stylist (optional, "No preference"), Preferred date and time (slots shown are preferences only), Confirm (notes, coupon). Submit creates a REQUEST (status Requested). Success screen says "Request sent. The salon will confirm your stylist and time shortly." and links to My Appointments. No staff schedule is exposed.
2. /customer/appointments: CARDS grouped as Requests, Upcoming, Past, Cancelled. Each card shows service(s), status chip, preferred time (Requested) or assigned stylist + confirmed time + room (Scheduled), flags. Buttons by state: Requested -> Cancel request; Scheduled -> "I'm here" (sets arrived, shows "Reception notified"), Request reschedule (modal: preferred new time + reason), Cancel (policy dialog; inside the window it becomes "Cancel requested"), Chat with stylist (-> that chat card); Completed -> View invoice, Tip, Rate and review, Rebook (prefills booking).
3. Zen Chat: see prompt P7. Invoices: table + drawer, download, tip after service, mock pay. Profile: details, allergies, preferences, wallet (loyalty ledger, packages, memberships, gift cards, referral), change password, account deletion request.
4. Home: next appointment card, request status tracker (Requested -> Scheduled -> Checked-in -> In service -> Completed), loyalty ring, offers, rate last visit.
Use only src/api hooks that call the engine functions allowed for customers.
VERIFY as customer: submit a request, see it as a Requested card, cancel one, request reschedule on a scheduled one, mark arrived.
```

## P4: Receptionist and Admin Appointment Desk (cards) + Schedule

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Roles: receptionist and admin (identical abilities on appointments). The stylist and customer must never see these pages.
Rebuild /appointments as an Appointment Desk made of CARDS (not a table) with a cards/table toggle (table optional):
1. Top segmented control with live counts: Requests (status requested), Today, Upcoming, In service, Ready for checkout (completed and not paid), Needs attention (arrived flag, reschedule/cancel requests, conflicts), Completed, Cancelled/No-show.
2. Each card (dense glass, 28px radius): customer avatar + name, phone, allergy chip, services, requested/confirmed time, assigned stylist avatar, room, status chip, flags chips (Arrived, Reschedule requested, Cancel requested), no-show risk chip, source tag. Cards are keyboard accessible.
3. Card actions by state (buttons visible only if policy allows and state fits):
   - Requested: **Assign** (opens an assign drawer: stylist picker showing only qualified stylists with their free slots from getAvailability, date/time, room, buffer, "Confirm assignment"; shows conflicts with 3 suggestions), **Reject** (reason dialog).
   - Scheduled: Check-in, Reschedule (modal), Reassign stylist, Edit notes, Cancel (reason), Mark no-show, Send reminder, View details.
   - Checked-in / In-progress: View details, (read-only status, stylist drives the next step).
   - Completed: **Create invoice** (-> /pos?appointment=ID).
   - Flags: Approve/Decline reschedule request, Confirm cancellation, acknowledge Arrived.
4. Search, filters (stylist, service, date range), sort, bulk select with Send reminder / Cancel selected, + New Appointment (direct booking for phone/walk-in guest with the same assign logic), Walk-in (instant check-in), Waitlist drawer (add, assign to freed slot), Export CSV.
5. /appointments/:id details page with full timeline of every change (who, what, when), notes, products used, flags, links to customer profile and invoice.
6. /schedule (drag and drop calendar) remains for receptionist/admin: drag = reschedule, drag across columns = reassign, resize = duration, conflict toast with suggestions, click block -> same action popover. Requested items appear in a right "Unassigned requests" panel as small cards; dragging a request card onto a stylist column/time opens the assign drawer prefilled. Everything here uses the same engine functions as the cards, so both views always agree.
7. Every action: engine call, toast, instant update everywhere (cards, schedule, dashboard counts, notifications for the right recipients only).
VERIFY: customer tab submits a request; receptionist tab shows the Request card within seconds (BroadcastChannel), assigns it; customer card flips to Scheduled; stylist tab shows the appointment; admin sees the same cards. Test the denied cases: log in as stylist and customer and confirm /appointments is blocked.
```

## P5: Admin-only operations pages (strict)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Role: admin only. Make sure these pages are reachable ONLY by admin and contain real working operations (no placeholders): /staff (+/staff/:id: invite, roles, hours, breaks, skills, commission, enable/disable, unlock, reset password, leave approvals, attendance, payroll export), /services (services, categories, packages, memberships, gift cards, coupons, loyalty rules, rooms, GST, tip presets; price edits need a reason and are audited), /inventory (full CRUD, suppliers, purchase orders, adjustments, transfers, audits; receptionist sees view-only with "Request reorder"), /marketing, /reports (with CSV/PDF export), /ai-assistant, /settings (Business, Users & Roles, Audit Log, Security/2FA, Reset demo data). Refund approval queue on the admin dashboard and in POS Recent Invoices. Remove Zen Chat from admin. Each button must perform its operation through the engine, write an audit row, and update other views.
VERIFY with the browser as admin, then confirm the receptionist cannot open any of these URLs except inventory in view mode.
```

## P6: Stylist pages (execute services only)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Role: stylist only. Menu: My Day, My Appointments, My Schedule, Zen Chat, Earnings.
1. /my-appointments: CARDS of appointments assigned to this stylist only (Today, Upcoming, Completed). Each card: customer avatar/name, services, time, room, status chip, allergy alert chip, notes, "Arrived" indicator, guest preferences/last visit. Buttons: **Start service** (only when status is Checked-in), **Complete service** (only when In-progress; drawer with service notes/formula, products used with quantities, upsell suggestions as "Suggest to reception" lines, before/after photo mock upload), **Chat** (-> that customer's chat card). NO edit/reschedule/cancel/assign/check-in/no-show buttons and none of those routes. Show a disabled-looking helper line like "Waiting for check-in at reception" when the card is Scheduled.
2. /my-day: timeline version of the same data with clock in/out, availability toggle, next guest panel.
3. /my-schedule: read-only week view of own appointments + Request break / Request leave (creates admin notification and approval item).
4. /earnings: commission, tips, chart, per-service table, reviews, payroll summary, export. Own data only.
VERIFY: stylist never sees Requested items or other stylists' appointments; Start is blocked before check-in; Complete updates the receptionist's "Ready for checkout" and notifies reception.
```

## P7: Zen Chat (stylist and customer only, card-based)

```
TOOLS: Claude in Antigravity, browser (two tabs: stylist and customer), terminal.
Read docs/OPERATIONS.md section 1.5 first. Rebuild /chat (stylist) and /customer/chat (customer) as ONE shared ChatPage component with role-specific data. Receptionist and admin have no chat route, no menu item and no engine access.
1. Landing view = grid of PERSON CARDS (glass): stylist sees their customers, customer sees their assigned stylists. Card: avatar, name, role chip, appointment chip (next or last), last message preview, time, unread badge, online dot. Search + filters (All, Unread, Today's guests).
2. Clicking a card opens that conversation: on desktop a split view (card list narrows to a rail on the left, conversation fills the rest); on mobile full screen with Back. Header: person name, appointment chip, Back to cards. Messages in glass bubbles with timestamps, read ticks, typing indicator, quick replies (stylist: "Please come 10 minutes early", "I'm ready for you", "Running 10 minutes late"; customer: "Running late", "On my way", "Can I reschedule?" which also fires the customer reschedule-request flag with confirmation), attachments (mock), emoji, Enter to send.
3. Customer-side card for a stylist exists only after assignment; before that show the empty state "Chat unlocks once your appointment is scheduled."
4. Live across tabs via the event bus; unread badges in the navbar/sidebar count only the user's own unread.
5. Tests: receptionist/admin getThreadsFor returns []; a stylist cannot open another stylist's thread by URL; messages notify only the other participant.
VERIFY with two tabs: customer sends a message, the stylist's card shows the unread badge, clicking it opens the conversation and replies appear live.
```

## P8: Checkout (receptionist/admin) and the end of the workflow

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Roles: receptionist and admin for POS; customer sees own invoices; stylist sees only earnings.
1. /pos: left list of "Ready for checkout" CARDS (completed, unpaid) with customer, stylist, services, stylist's upsell suggestions (accept or dismiss each); selecting a card loads the ticket. Items, coupon, package, membership, gift card, loyalty redemption, GST, tip (assigned to the stylist), split payment, hold/resume, Charge. Sell package/membership/gift card. Recent invoices with View and Request refund (receptionist) / Approve or Reject (admin).
2. On Charge: invoice immutable (Paid), stock ledger rows, commission + tip credited to the assigned stylist, loyalty points, balances, notifications (customer receipt, stylist earning), dashboard totals, the appointment shows Paid.
3. /cash-close for receptionist (submit) and admin (review).
4. Customer side after payment: invoice appears in Invoices, tip-after-service option, Rate and review prompt.
VERIFY full path: customer request -> receptionist assign -> customer arrived -> receptionist check-in -> stylist start and complete -> receptionist checkout -> stylist earnings updated, customer receipt and feedback -> admin refund approval reverses everything.
```

## P9: Button-by-button audit (strict QA, repeat until clean)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. For each role (customer, receptionist, stylist, admin):
1. Log in and record the exact menu. FAIL if it differs from section 1.2.
2. For EVERY page in that menu, click EVERY button, tab, filter, menu item and link. Produce a table: page | control | expected result | actual | pass/fail | fix. Fix all failures. A control that does nothing, navigates wrongly, or is shown to a role that cannot use it is a failure.
3. Try every forbidden URL for each role and confirm redirect + toast. Confirm chat is inaccessible to receptionist and admin.
4. Run the full end-to-end scenario from section 1.1 across four browser tabs and confirm every notification in 1.6 reaches exactly the listed recipients and nobody else.
5. Confirm appointments appear as cards for receptionist/admin/stylist/customer according to 1.4, and Zen Chat is card-based for stylist and customer.
6. Run vitest, `npm run build`, `npm run lint`; no console errors.
Output the final tables and screenshots. Do not mark complete while any row fails.
```

## P10: Automated end-to-end test (optional but recommended)

```
TOOLS: Claude in Antigravity, terminal.
Add Playwright (state why) with an e2e test that runs the section 1.1 workflow with four browser contexts (customer, receptionist, stylist, admin), asserting at each step what each role sees, which buttons exist, and the final stock, commission, loyalty and refund results. Add `npm run test:e2e` and make it pass.
```

---

## Notes

- **Two interpretations I made, so you can change them:** (1) the stylist does not operate appointments except **Start** and **Complete** on their own checked-in appointments, because the workflow needs someone to run the service; (2) customers pick *preferred* times, and the receptionist makes the final assignment, as in your plan.
- If you later want a different rule (for example, the admin able to read chats for dispute handling), change it only in `policy.ts` and the tests, and the whole app follows.
- After the frontend passes P9, move to the Django backend with the phases in `ZENFLOW_KILO_PROMPTS.md`. Port the same `policy` rules and lifecycle table to the backend so the server enforces them too.
