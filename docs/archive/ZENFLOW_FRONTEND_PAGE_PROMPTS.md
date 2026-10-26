# ZenFlow: Frontend Page Prompts for Claude in Antigravity

All pages, white and violet "Liquid Glass" (iOS 26 style). Built with mock data first, wired to the real backend later.

## How to use

1. Select a **Claude model** in the Antigravity agent panel.
2. Save **Section 1 (Frontend Rules)** as a workspace rule (Rules / Customizations). If you can't find it, paste it at the top of the first prompt of each new chat.
3. Run **F0 first** (foundation). Then run page prompts **in order, one per new chat** (small pages can be grouped 2 to 3 per chat).
4. After each prompt: open the page in the browser, check it, fix issues with a follow-up, then `git commit`.
5. Prompts say "Verify": the agent should run the dev server, open the page in the built-in browser, take a screenshot and fix console errors.

**Follow-up template when something looks off:**
```
On <page>, fix: <what is wrong>. Keep everything else unchanged. Match the glass design system in the rules. Verify in the browser and show a screenshot.
```

---

## 1. Frontend Rules (workspace rule)

```
PROJECT: ZenFlow, salon & spa management platform. Frontend in /frontend: React 18 + TypeScript + Vite + Tailwind + React Router + @tanstack/react-query + lucide-react + Recharts + date-fns + zod + framer-motion + @dnd-kit/core. Do not add other libraries without stating why. Never use another company's name or branding.

DESIGN: "Liquid Glass" (iOS 26 style), WHITE and VIOLET only, light mode only.
- Wallpaper: white to #F5F3FF with soft blurred violet blobs (#DDD6FE, #C4B5FD, #EDE9FE), slow subtle movement.
- Glass: background rgba(255,255,255,0.62); backdrop-filter blur(28px) saturate(180%); border 1px rgba(255,255,255,0.75); inner top highlight inset 0 1px 0 rgba(255,255,255,0.9); shadow 0 8px 32px rgba(124,58,237,0.15).
- Dense glass (tables, forms, calendar, chat messages): rgba(255,255,255,0.85). Fallback to solid surfaces under prefers-reduced-transparency. Respect prefers-reduced-motion.
- Colors: primary violet #7C3AED (hover #6D28D9, light #8B5CF6, soft #EDE9FE, tint #DDD6FE). Text #1E1B4B, secondary #6B7280. Success #22C55E, warning #F59E0B, danger #EF4444, indigo #6366F1.
- Primary button: violet gradient (#8B5CF6 to #7C3AED), capsule, glossy top highlight, press scale 0.97. Secondary: glass capsule with violet text. Danger: red tinted capsule.
- Status capsules: Scheduled violet, Checked-in indigo, In-progress amber, Completed green, Cancelled grey, No-show red.
- Shapes: cards 28px radius, floating sidebar 32px (inset 16px from screen edge), buttons and chips capsule, inputs 16px, modals and drawers 36px, circular avatars.
- Typography: -apple-system, "SF Pro Display", Inter, sans-serif. Thin line icons (lucide-react). Motion 300-450ms cubic-bezier(0.2,0.8,0.2,1).
- Currency ₹ (INR), GST 18% default. Indian salon sample data: staff Rahul, Arun, Kiran, Priya; services Haircut, Beard Trim, Hair Spa, Facial, Manicure, Hair Color; realistic Indian customer names and phone numbers.

ARCHITECTURE:
- Feature folders: src/features/<feature>/ (pages, components, hooks). Shared UI in src/components/ui. Layouts in src/layouts.
- ALL data access goes through src/api/*.ts functions wrapped by React Query hooks. For now these functions return mock data from src/mocks (with small artificial delay and the same shape the real API will return). Later, only these api files change to call the backend.
- Auth: AuthContext with mock login by role now; real cookie-based JWT later (never store tokens in localStorage).
- Routes (all must exist and be linked): 
  Public: /login, /customer/login, /customer/register, /forgot-password, /reset-password, /accept-invite.
  Staff: /dashboard, /appointments, /appointments/new, /appointments/:id, /schedule, /customers, /customers/:id, /staff, /staff/:id, /services, /pos, /pos/invoice/:id, /inventory, /inventory/:id, /chat, /marketing, /reports, /ai-assistant, /settings, /cash-close, /audit-log, /users-roles, /security.
  Stylist: /my-day, /my-schedule, /my-customers, /earnings.
  Customer: /customer-dashboard, /customer/book, /customer/appointments, /customer/invoices, /customer/chat, /customer/profile.
- Role redirects after login: admin -> /dashboard, receptionist -> /schedule, stylist -> /my-day, customer -> /customer-dashboard.
- Sidebar by role. Admin: Dashboard, Appointments, Schedule, Customers, Staff, Services, POS / Billing, Inventory, Zen Chat, Marketing, Reports, AI Assistant, Settings. Receptionist: Dashboard, Appointments, Schedule, Customers, POS / Billing, Inventory, Zen Chat, Reports. Stylist: My Day, My Schedule, My Customers, Zen Chat, Earnings. Customer: floating top navbar (Home, Book, My Appointments, Invoices, Chat).
- REQUIRED FLOWS (real navigation links/buttons): Login -> role redirect. Dashboard -> Appointments / Customers / Staff / Inventory / Reports. Appointments -> Appointment details -> Customer profile -> POS -> Invoice. Appointment details -> Chat. Schedule block -> Appointment details. Customers -> Customer profile -> Book appointment / Chat / Invoice. Staff -> Staff profile. POS -> Invoice. Inventory -> Product details. Zen Chat thread -> Customer profile. AI Assistant -> booking / recommendation / insights.

QUALITY:
- Every button, tab, filter, menu item and link described in a page prompt must be present and do something (navigate, open a modal/drawer, change state with mock data, or show a toast).
- Every page has loading skeletons, empty state, and error state. Forms validate with zod and show inline errors.
- Responsive (desktop first, tablet and mobile friendly). Keyboard accessible, visible focus rings, text contrast WCAG AA on glass.
- No console errors, no TypeScript errors, `npm run build` must pass.
- After each task: run the dev server, open the page(s) in the browser, screenshot, fix problems, then summarize files changed.
```

---

## F0: Foundation (run first)

```
TOOLS: Claude in Antigravity agent, built-in browser (screenshots), terminal.

Read the rules and the existing /frontend and /backend. Keep what works (Vite, Tailwind, TypeScript, routing, health check). Build the foundation for all pages:
1. Tailwind theme tokens + CSS variables for the design system. Animated violet-white wallpaper component.
2. UI component library in src/components/ui, glass styled: GlassCard, DenseGlassCard, Button (primary/secondary/ghost/danger, sizes, loading), IconButton, Input, PasswordInput, Textarea, Select, MultiSelect, DatePicker, TimePicker, DateRangePicker, Checkbox, Toggle, Chip, StatusBadge (the 6 statuses), RiskChip (Low/Medium/High), Avatar, AvatarGroup, StatCard (with trend), Tabs, Table (sortable, selectable rows, pagination, row action menu), Modal, Drawer, ConfirmDialog, Toast system, Tooltip, DropdownMenu, Popover, EmptyState, Skeleton, SearchBar, Stepper, Pagination, Breadcrumbs, ProgressBar, CircularGauge, Rating stars, FileUpload (photo), Badge counter.
3. Layouts: StaffLayout (floating glass sidebar per role with active indicator and collapsible mode, floating pill top toolbar: title + breadcrumbs, global search, "+ New Appointment" button, notifications bell, chat icon with unread badge, profile menu), CustomerLayout (floating top navbar with loyalty-points chip), AuthLayout, mobile bottom tab bar.
4. Mock layer: src/mocks (seed data for staff, customers, services, appointments, invoices, products, chats, campaigns, notifications, audit logs), src/api/* functions returning mock data with delay, React Query provider, AuthContext with mock login for 4 roles, role-based route guards, 403 and 404 pages, a placeholder page for every route listed in the rules.
5. /design-system page that displays every component and the color/shape tokens.
VERIFY: screenshots of /design-system, StaffLayout for each role, CustomerLayout. Build passes.
```

---

# AUTH PAGES

## F1: Staff login (`/login`)

```
TOOLS: Claude agent, browser, terminal.
Build /login (staff portal for admin, receptionist, stylist). AuthLayout split glass design. Left: large violet gradient panel with ZenFlow logo (leaf-and-wave icon), tagline "Book smarter. Serve faster. Grow automatically.", three feature highlight cards (Smart booking, Drag-and-drop schedule, Real-time Zen Chat) and a soft floating glass illustration. Right: glass card "Welcome back" with email, password (show/hide), Remember me, Forgot password? link (-> /forgot-password), Sign in primary button with loading state, an optional 2FA code step (6 digit input, Verify button, Back link), error alert for wrong credentials and an "Account locked for 15 minutes" state, link "Are you a customer? Sign in here" (-> /customer/login). Include a clearly labelled "Demo access" row of four capsule buttons (Admin, Receptionist, Stylist, Customer) that sign in with mock data and redirect by role. Zod validation, inline errors.
Verify: each demo role logs in and redirects correctly.
```

## F2: Customer login and register

```
TOOLS: Claude agent, browser, terminal.
Build /customer/login and /customer/register in the same AuthLayout but with a warmer customer-facing hero (violet gradient, "Your next appointment is one tap away"). Login: email or phone, password, show/hide, Remember me, Forgot password link, Sign in, "New here? Create account" link, "Staff sign in" link. Register: full name, phone, email, password with strength meter, confirm password, terms checkbox, optional referral code, Create account button, optional OTP step (6-digit input with Resend timer, simulated). After success go to /customer-dashboard. Zod validation and friendly errors.
```

## F3: Forgot password, reset password, accept invite

```
TOOLS: Claude agent, browser, terminal.
Build /forgot-password (email field, Send reset link, success state "Check your email", Back to sign in), /reset-password (new password + confirm with strength meter, Reset button, expired-link state), /accept-invite (staff invite: shows role and business name, set password + confirm, Activate account button, invalid/expired invite state). All glass cards in AuthLayout with consistent styling.
```

---

# STAFF PAGES

## F4: Dashboard (`/dashboard`)

```
TOOLS: Claude agent, browser, terminal.
Build /dashboard (admin; receptionist sees "today" focus). Greeting with date, Today/Week/Month toggle, buttons "+ New Appointment" (-> /appointments/new), "Walk-in", "Quick Invoice" (-> /pos). Four clickable StatCards with trend arrows: Revenue (-> /reports), Appointments (-> /appointments), New customers (-> /customers), Low-stock items (-> /inventory). Revenue line chart (Recharts, violet gradient area) with Daily/Weekly/Monthly toggle. "Today's Appointments" table: time, customer avatar+name, service, staff, StatusBadge, RiskChip, row actions (View -> details, Check-in, Complete) and "View all". Top Services donut. Staff performance list (avatar, rating, bar). Low-stock alerts with Reorder buttons. Recent chats with unread badges (-> /chat). "AI Insights" glass card with an insight, "Ask AI Assistant" (-> /ai-assistant) and refresh icon. Staggered entrance animations.
```

## F5: Appointments list (`/appointments`)

```
TOOLS: Claude agent, browser, terminal.
Build /appointments. Header buttons: + New Appointment, Walk-in (opens a small drawer to quickly add a walk-in), Waitlist (drawer with waitlist entries and Assign buttons), Export CSV (downloads mock CSV). SearchBar; filters: date range, staff, service, status. Status tabs with counts: All, Scheduled, Checked-in, In-progress, Completed, Cancelled, No-show. Dense glass Table: checkbox, ID, customer avatar+name, service, staff, date, time, StatusBadge, RiskChip, amount, row menu (View details, Reschedule (modal), Check-in, Start service, Complete, Cancel (confirm), Mark no-show, Open chat). Status actions update mock state and show toasts. Bulk action bar (Cancel selected, Send reminder). Pagination and rows-per-page.
```

## F6: New appointment (`/appointments/new`)

```
TOOLS: Claude agent, browser, terminal.
Build /appointments/new with a two-column layout. Left form (dense glass): customer search combobox with "+ Add new customer" (opens drawer), service select, staff select (only qualified staff + "Any available"), date picker, time-slot grid (available chips violet, booked chips disabled, selected chip filled), room/chair select, recurring toggle with frequency and occurrences, notes, "Send confirmation message" checkbox. Right sticky summary card: service, staff, date/time, duration, price, buffer, GST, total. Buttons: Book appointment, Save as walk-in, Join waitlist (shown when no slots), Cancel. On success toast and go to /appointments/:id. Show a conflict warning example when choosing an unavailable slot.
```

## F7: Appointment details (`/appointments/:id`)

```
TOOLS: Claude agent, browser, terminal.
Build /appointments/:id with Breadcrumbs and Back button. Header: appointment ID and large StatusBadge. Action bar (buttons enabled by status): Check-in, Start service, Complete, Reschedule (modal with date, time chips, staff select, Confirm/Cancel), Cancel (confirm dialog with reason), Mark no-show, Edit. Cards: customer (photo, phone, amber allergy alert, buttons View profile -> /customers/:id and Chat -> /chat), service (name, duration, price), staff, date/time/room, notes (editable), no-show RiskChip with reasons, status timeline, "Products used" table with "+ Add product" modal, payment card with "Create invoice" (-> /pos?appointment=ID), chat preview with "Open chat".
```

## F8: Schedule (`/schedule`), the receptionist's main screen

```
TOOLS: Claude agent, browser, terminal.
Build /schedule using a custom resource calendar with @dnd-kit. Toolbar: prev/next, Today, date picker, Day/Week/Month toggle, staff multi-select, service filter, + New Appointment, Walk-in, Waitlist panel toggle, status color legend. Grid (dense glass): columns = staff (avatar, name, role, availability dot), rows = time 9 AM to 8 PM in 30-minute steps (15-min snapping). Appointment blocks are glass capsules-with-radius colored by status showing customer, service, time. Hatched break blocks, greyed "On leave" column, red current-time line. Drag a block to an empty slot = reschedule; drag to another staff column = reassign; show a violet ghost while dragging, green highlight on valid drop and red on conflict; on conflict show a toast "Slot unavailable" with nearest suggested slots and revert. Resizing a block's bottom edge changes duration. Clicking a block opens a Popover (View details, Check-in, Reschedule, Cancel, Chat). Clicking an empty slot opens a quick-book drawer. Right collapsible panel: mini month calendar + Waitlist list with Assign buttons. Week and Month views simpler but functional. Mock state updates immediately (optimistic).
Verify: drag between staff columns works, conflict reverts, block popover actions navigate correctly.
```

## F9: Customers list (`/customers`)

```
TOOLS: Claude agent, browser, terminal.
Build /customers. Header: + Add Customer (drawer), Import (modal with file drop zone), Export. SearchBar (name/phone/email), filters (loyalty tier, last visit, preferred staff, membership), table/grid view toggle. Table: avatar, name, phone, email, last visit, total visits, loyalty points, membership badge (Gold/Silver/None), total spent, row actions (View profile -> /customers/:id, Book -> /appointments/new?customer=ID, Chat, Invoice). Grid view with glass customer cards. Add Customer drawer: photo upload, full name, phone, email, DOB, gender, address, allergies, notes, preferred staff, Save customer / Cancel with zod validation. Pagination.
```

## F10: Customer profile (`/customers/:id`)

```
TOOLS: Claude agent, browser, terminal.
Build /customers/:id with Back button. Header glass card: large photo, name, tags (VIP, Gold), phone, email, loyalty points; buttons Book appointment, Chat, Create invoice, Edit (drawer), Delete (confirm). Amber allergy alert banner. Stat cards: total visits, total spent, last visit, loyalty points. Tabs: Overview (notes, preferred staff and services, upcoming appointment card, recent visits timeline, referral card with Copy referral link, gift card and membership cards), Appointments table, Invoices table (-> invoice page), Preferences (editable), Chat history, Feedback (ratings and comments), Loyalty & Packages (points history, packages balance, Redeem points button).
```

## F11: Staff list (`/staff`)

```
TOOLS: Claude agent, browser, terminal.
Build /staff. Header: + Add Staff (drawer), search, filters (role, status). Tabs: Staff, Attendance, Leaves. Staff tab: glass cards with photo, name, designation, specialization, rating stars, today's status chip (Available, In service, On leave, Off), today's appointment count, commission %, buttons View profile (-> /staff/:id), Clock in/out (toggle with toast), Assign services (modal multi-select). Attendance tab: table with date, clock-in, clock-out, hours, late flag, date filter. Leaves tab: requests table with Approve and Reject buttons (updates status). Add Staff drawer: photo, name, email, phone, role (receptionist/stylist), designation, specialization, experience years, commission %, working hours per weekday, services, "Send invite" button (simulated, shows toast with invite link).
```

## F12: Staff profile (`/staff/:id`)

```
TOOLS: Claude agent, browser, terminal.
Build /staff/:id with Back button. Header: photo, name, designation, rating, availability badge, buttons Edit (drawer), Assign services, Manage schedule (modal with weekly hours editor), Clock in/out. Tabs: Overview (stat cards: completed appointments, rating, commission earned, tips; performance line chart; upcoming appointments list; assigned services chips; attendance log), Performance (charts: services by count, revenue by week), Earnings (commission, tips, payroll-ready summary table, Export button), Appointments (table linking to details), Schedule & Leaves (weekly hours, breaks, leave history, Add leave), Reviews (list with stars and replies).
```

## F13: Services (`/services`)

```
TOOLS: Claude agent, browser, terminal.
Build /services. Header: + Add Service, search. Category capsule tabs: All, Hair, Beard, Spa, Skin, Nails, Packages & Memberships. Grid of glass service cards (name, category chip, duration, price ₹, assigned staff AvatarGroup, active Toggle, actions Edit, Duplicate, Delete). Add/Edit modal: name, description, category, duration, price, buffer time, assigned staff multi-select, products used (inventory select + quantity rows), active toggle, Save/Cancel. Packages & Memberships tab: cards with price, sessions, validity, "Create package" modal (name, services, sessions, price, validity), membership plans with monthly price and benefits.
```

## F14: POS / Billing (`/pos`)

```
TOOLS: Claude agent, browser, terminal.
Build /pos in two columns. Left: "Select completed appointment" searchable dropdown (or Walk-in customer toggle), customer summary card (name, phone, loyalty points, amber allergies), items table (service/product, staff, quantity stepper, price, remove icon), buttons "+ Add Service" and "+ Add Product" (searchable modals). Right sticky bill summary glass card: subtotal, coupon code field with Apply, toggles for Membership, Package, Gift card, Redeem loyalty points (shows points used), discount line, GST 18%, tip chips (0%, 5%, 10%, 15%, Custom input), total in large text. Payment method selector cards: Cash, Card, UPI, Wallet (supports split payment with an "Add another method" link). Buttons: Charge ₹total, Hold, Clear. Success state after charging: animated check, "View invoice" (-> /pos/invoice/:id), "New sale". Below: tabs Recent Invoices (table with View and Refund request buttons) and Daily Sales (cards: Cash, Card, UPI, Wallet, Refunds, Total). Prefill from ?appointment=ID.
```

## F15: Invoice (`/pos/invoice/:id`)

```
TOOLS: Claude agent, browser, terminal.
Build /pos/invoice/:id with "Back to POS" button. Printable glass invoice card: ZenFlow logo, invoice number, date, Paid badge, customer and staff details, items table (item, qty, price, total), subtotal, discount, GST, tip, grand total in ₹, payment method(s). Right action card: Print (print stylesheet that removes glass and chrome), Download PDF (mock), Send via WhatsApp, Send via Email (toast), Refund (modal: amount, reason dropdown, note, "Request refund" or "Approve" depending on role), View customer, View appointment. Show Refunded state variant and a "Paid invoices cannot be edited" notice.
```

## F16: Cash close (`/cash-close`)

```
TOOLS: Claude agent, browser, terminal.
Build /cash-close (receptionist/admin). Summary cards: expected cash, card, UPI, wallet, refunds. Cash counting form with denomination inputs (₹500, 200, 100, 50, 20, 10) auto-totalling, expected vs counted difference with colored indicator, notes, "Submit cash close" button and confirmation. Past closes table with date, user, expected, counted, difference, status.
```

## F17: Inventory (`/inventory`)

```
TOOLS: Claude agent, browser, terminal.
Build /inventory. Header: + Add Product (drawer), Adjust Stock (modal), Export. StatCards: Total Products, Low Stock, Out of Stock, Stock Value. Low-stock warning banner with "Create Purchase Order". Tabs: Products, Low Stock, Purchase Orders, Suppliers, Stock Transfers, Audits, Usage. Products table: image, name, category, stock level bar, reorder level, unit price, supplier, status badge (In stock/Low/Out), actions View (-> /inventory/:id), Adjust, Reorder, Delete. Search + filters (category, supplier, status). Create Purchase Order modal: supplier, product lines with quantities, expected date, Send/Cancel. Purchase Orders tab with statuses (Draft, Sent, Received) and a Receive button. Suppliers tab with add/edit. Transfers and Audits tabs with functional tables and "New" buttons. Usage tab with a chart and table.
```

## F18: Product details (`/inventory/:id`)

```
TOOLS: Claude agent, browser, terminal.
Build /inventory/:id with Back button. Header: product image, name, category, supplier, unit price, status badge. Stock card with CircularGauge, current stock, reorder level. Buttons: Adjust stock (modal: Add/Remove toggle, quantity, reason dropdown, note, Save/Cancel; updates mock stock and history), Edit (drawer), Reorder (opens PO modal prefilled), Delete (confirm). Tabs: Stock history (ledger table), Usage per service (chart + table), Purchase orders. Stock level line chart.
```

## F19: Zen Chat (`/chat`)

```
TOOLS: Claude agent, browser, terminal.
Build /chat three-pane messaging in glass. Left: SearchBar, tabs All/Unread/Resolved, thread list (avatar, customer name, last message preview, time, unread badge, appointment tag chip). Center: header (customer name, appointment chip, "Mark as resolved" button), message bubbles (customer left in dense white glass, staff right in violet gradient) with timestamps and read ticks, typing indicator, quick-reply chips ("Yes, come early", "I'll reschedule", "Running late?"), "AI suggested replies" chips row with Regenerate icon (mock suggestions), input bar with attach, emoji and Send (Enter to send, mock auto-reply from the customer after a delay to demo real-time feel). Right: customer profile panel (photo, phone, allergies, loyalty points, preferred staff, next appointment) with buttons View profile (-> /customers/:id), Reschedule, Book appointment, Create invoice. Unread badge in sidebar and toolbar updates.
```

## F20: Marketing (`/marketing`)

```
TOOLS: Claude agent, browser, terminal.
Build /marketing. Header button + Create Campaign. StatCards: Campaigns Sent, Delivery Rate, Open Rate, Revenue from Campaigns. Tabs: Campaigns (table: name, channel icons WhatsApp/Email/SMS, audience, scheduled date, status badge, performance bar, actions View, Duplicate, Pause, Delete), Automations (toggle cards: Birthday greeting, Anniversary greeting, Appointment reminder, Rebooking reminder, Review request, each with an editable template drawer), Coupons & Offers (coupon table + "Create coupon" modal: code, type %, amount, validity, usage limit), Loyalty (points rules editor: points per ₹, redemption value, tiers). Create Campaign modal: name, channel selector, audience selector, message editor with variable chips ({name}, {date}, {service}), live phone-style preview, schedule picker, buttons Send test, Save draft, Schedule, Cancel.
```

## F21: Reports (`/reports`)

```
TOOLS: Claude agent, browser, terminal.
Build /reports. Header: DateRangePicker, Compare toggle, Export CSV, Export PDF. Tabs: Revenue (line/area chart with Daily/Weekly/Monthly toggle + KPI cards), Bookings (bookings vs cancellations vs no-shows grouped bars), Staff (performance table + bar chart), Services (popularity bar chart + revenue table), Customers (retention and repeat-customer rate donut, new vs returning), Inventory (usage chart, valuation table), Payments (method breakdown donut, refunds table). Every chart in a glass card with a small download icon and violet palette. Receptionist role sees only a Daily Sales view.
```

## F22: AI Assistant (`/ai-assistant`)

```
TOOLS: Claude agent, browser, terminal.
Build /ai-assistant. Layout: left narrow history list with "+ New chat", center chat area, right "Key Metrics" panel. Tabs above chat: Business Insights, Receptionist, Service Recommender, Review Reply, No-show Risk. Welcome state with suggested prompt chips: "Which service earned most this month?", "Who has the most no-shows?", "Show low-stock items", "Book a haircut with Rahul tomorrow at 6 PM". Mock responses rendered as rich cards: metric card with mini chart, recommendations list, booking confirmation card with "Confirm booking" and "Change time" buttons (confirm navigates to the new appointment), service recommendation cards (exactly 3), review-reply generator (paste a review, get a reply with Copy button), no-show risk table. Under each reply: Copy, Regenerate, thumbs up/down. Typing animation. Input bar with Send.
```

## F23: Settings (`/settings`)

```
TOOLS: Claude agent, browser, terminal.
Build /settings with vertical glass tabs: Profile (photo upload, name, email, phone, Change password modal), Business (name, logo upload, address, working hours per weekday with toggles, GST %, currency), Roles & Permissions (read-only matrix of roles vs features with check icons), Notifications (toggles per event and channel), Integrations (WhatsApp, Email, SMS simulation toggles with "Test" buttons), AI Settings (mode selector Hybrid / Rules only / Local model, Ollama status indicator with Check connection button), Payments & Tax (enabled payment methods, tip presets, refund approval toggle), Data & Export (export customers/invoices CSV buttons). Sticky "Save changes" and "Cancel" bar, Logout button. Include the system status chip (API and Database health from /api/health/).
```

## F24: Users and roles (`/users-roles`)

```
TOOLS: Claude agent, browser, terminal.
Build /users-roles (admin only). Table of all staff accounts: avatar, name, email, role chip, status (Active, Invited, Locked, Disabled), last login. Actions: Invite user (drawer: name, email, role, Send invite -> shows invite link toast), Change role (modal with warning), Reset password, Unlock, Disable/Enable (confirm). Pending invites list with Resend and Revoke. Search and role filter.
```

## F25: Audit log (`/audit-log`)

```
TOOLS: Claude agent, browser, terminal.
Build /audit-log (admin only). Filters: date range, user, action type (login, failed login, role change, price change, refund, invite, export). Table with timestamp, user, action chip, target, IP address, details expand row. Export CSV. Color-coded action chips; failed logins in red. Pagination.
```

## F26: Security and 2FA (`/security`)

```
TOOLS: Claude agent, browser, terminal.
Build /security. Cards: Two-factor authentication (status, "Enable 2FA" button opening a stepper: scan QR placeholder, enter 6-digit code, save recovery codes with Copy/Download buttons), Active sessions list with "Sign out" buttons, Password change, Login history table, Data encryption info card (explains field-level encryption of phone, allergies, notes, chat messages in plain language).
```

---

# STYLIST PAGES

## F27: My Day (`/my-day`)

```
TOOLS: Claude agent, browser, terminal.
Build /my-day (stylist). Top: greeting, date, Clock in/Clock out capsule button with timer, today's earnings chip. Glass vertical timeline of today's appointments: time, customer avatar+name, service, duration, StatusBadge, amber allergy chips, notes. Per appointment buttons: Start service, Complete (opens drawer: service notes textarea, products-used picker with quantities, Save), Chat. "Next guest" highlighted card with guest history (last visits, preferences, allergies). Break and unavailable button (modal). Empty state when no appointments.
```

## F28: My Schedule (`/my-schedule`)

```
TOOLS: Claude agent, browser, terminal.
Build /my-schedule: week view (read-only) of the stylist's own appointments with glass blocks colored by status, clicking opens a details popover. Buttons: Request break (modal), Request leave (modal with dates, reason), My requests list with statuses.
```

## F29: My Customers (`/my-customers`)

```
TOOLS: Claude agent, browser, terminal.
Build /my-customers: searchable list/grid of customers this stylist has served: avatar, name, last visit, visits, preferred services, allergy chip. Click opens a right drawer with profile summary, history, notes, and "Chat" button. No access to billing details.
```

## F30: Earnings (`/earnings`)

```
TOOLS: Claude agent, browser, terminal.
Build /earnings: StatCards (commission this month, tips, services completed, rating), Day/Week/Month toggle, earnings chart, table of services with commission and tip per row, payroll-ready summary card and Export button.
```

---

# CUSTOMER PAGES (floating top navbar layout)

## F31: Customer dashboard (`/customer-dashboard`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer-dashboard. Welcome hero glass banner with "Book new appointment" (-> /customer/book). Next appointment card (service, stylist, date/time, buttons Reschedule modal, Cancel confirm, Chat with stylist). Loyalty points card with progress ring to next reward and Redeem button. Quick action tiles (Book, My appointments, Invoices, Chat). "Recommended for you" service cards with Book buttons. Offers & coupons carousel with Copy code. Recent invoices list with View. "Rate your last visit" card (5-star selector, comment, Submit feedback with success state).
```

## F32: Customer booking (`/customer/book`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer/book as a 4-step flow with a Stepper and a sticky booking summary card on the right. Step 1 Service: category tabs, service cards (duration, price), plus an "Describe your concern" textarea with "Suggest services" button returning exactly 3 recommendation cards. Step 2 Staff: staff cards with rating and specialization, "Any available" option. Step 3 Date & time: calendar and time-slot chips (unavailable disabled). Step 4 Confirm: notes, coupon field with Apply, price breakdown with GST. Buttons Back, Next, Confirm booking. Success screen: animated check, appointment summary, "Add to calendar", "Chat with stylist", "View my appointments". Floating "Book with assistant" button opening a small AI chat panel.
```

## F33: My appointments (`/customer/appointments`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer/appointments. Tabs Upcoming, Past, Cancelled. Cards with service, stylist, date/time, StatusBadge; actions: upcoming (Reschedule modal, Cancel confirm, Chat with stylist, View details drawer), past (Rebook -> /customer/book prefilled, View invoice, Leave feedback modal), cancelled (Rebook). Search, filter dropdown, empty states with illustrations.
```

## F34: My invoices (`/customer/invoices`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer/invoices. Summary cards: total spent, invoice count, loyalty points earned. Search and date filter. Table: invoice number, date, service, total, payment method, StatusBadge, buttons View (opens right drawer with itemised bill, GST, tip, total) and Download PDF. Drawer has Download PDF and Close.
```

## F35: Customer chat (`/customer/chat`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer/chat two-pane glass layout. Left: threads per appointment (stylist avatar, last message, unread badge). Right: conversation header (stylist name, appointment chip), message bubbles with timestamps and read ticks, quick-reply chips ("Running late", "Please reschedule", "Where to park?"), input with attach, emoji, Send, mock stylist auto-reply. Small right card: stylist info and appointment details with Reschedule and View appointment buttons.
```

## F36: Customer profile (`/customer/profile`)

```
TOOLS: Claude agent, browser, terminal.
Build /customer/profile: photo upload, name, phone, email, DOB, address, allergies and notes (with a note explaining they are stored encrypted), preferred stylist, communication preferences toggles, referral code with Copy and Share, Change password modal, "Request account deletion" (confirm dialog), Save/Cancel.
```

---

# GLOBAL EXTRAS

## F37: Notifications, global search, error pages

```
TOOLS: Claude agent, browser, terminal.
1. Notifications drawer opened from the bell: grouped by Today/Earlier, icons by type (booking, cancellation, low stock, message, payment), mark all read, individual click navigates to the related page, unread dot.
2. Global search / command palette (Ctrl/Cmd+K and clicking the toolbar search): glass modal searching customers, appointments, invoices, products and pages (mock), keyboard navigation, recent searches, quick actions ("New appointment", "New invoice", "Open schedule").
3. Polish error pages: 403 "Not allowed for your role" and 404, with glass cards and a button back to the role's home.
4. Make sure every toast, modal and drawer in the app uses the same glass style and animations.
```

## F38: Final polish and QA pass

```
TOOLS: Claude agent, browser, terminal.
Audit the whole frontend: click every sidebar item and button for all four roles. List and fix: dead buttons, missing hover/focus states, inconsistent spacing, glass readability (increase opacity where text is hard to read), layout breaks at 1440, 1024 and 390 widths, console and TypeScript errors. Confirm the required flows from the rules all work. Run `npm run build` and `npm run lint`. Provide a final checklist with screenshots of the 10 most important pages.
```

---

## After the frontend is done

Wire pages to the real backend one module at a time, using the backend phases in `ZENFLOW_KILO_PROMPTS.md` (Phase 1 onwards). For each, tell the agent: *"Replace the mock functions in src/api/<module>.ts with real calls to the Django API. Do not change the page components."*
