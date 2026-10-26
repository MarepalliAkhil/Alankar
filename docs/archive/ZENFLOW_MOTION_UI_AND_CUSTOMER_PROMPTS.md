# ZenFlow: Interactive Motion UI + Customer Role (Prompts for Claude in Antigravity)

We build in this order: **UI motion first, then the customer role only.** Other roles wait until you say go.

## How to run
- New chat per prompt, Claude model selected, existing project open.
- Every prompt begins with this line (already included below): *"Read docs/OPERATIONS.md first. Work on the existing project, refactor do not rebuild, keep the glass design and the dashboard you already have."*
- After each prompt: test in your browser, then `git commit`.
- Performance note: glass blur plus lots of animation can lag on low-end laptops. The prompts set a performance budget. If it still lags, tell the agent: "reduce blurred layers and animate only transform and opacity."

## Run order

| # | Prompt | Result |
|---|---|---|
| 1 | U1 | Motion kit (reusable animation components and tokens) |
| 2 | U2 | Apply motion across layouts, existing pages, plus a /motion-lab demo page |
| 3 | C0 | Dev simulator (lets you test customer flows without building other roles yet) |
| 4 | C1 | Customer login, sign up, OTP, forgot password |
| 5 | C2 | Customer Home + Book Appointment (request flow) |
| 6 | C3 | My Appointments (cards) and all customer actions |
| 7 | C4 | Invoices, Profile, Wallet |
| 8 | C5 | Zen Chat (customer side, card-based) |
| 9 | C6 | Customer QA gate |

---

# PART 1: INTERACTIVE MOTION UI

## Motion design language ("alive but calm")

Use this as the rule for every animation:
- **Springs, not tweens:** `stiffness 260, damping 24` for UI, `stiffness 180, damping 20` for large surfaces.
- **Only animate `transform`, `opacity`, `filter`** (and clip-path where needed). Never animate width/height/top/left (use `layout` animations).
- **Everything responds to the user:** hover lift + tilt, press squash (scale 0.96), focus glow, drag with momentum.
- **Choreography:** stagger children 40 to 70 ms, parent first, content second.
- **Reduced motion:** every effect has a `prefers-reduced-motion` fallback (fade only).
- **Budget:** at most 6 simultaneously blurred glass layers on screen; blobs in the wallpaper use only transform; no animation running off-screen (pause with IntersectionObserver).

## U1: Motion kit

```
TOOLS: Claude in Antigravity, built-in browser (screenshots), terminal.
Read docs/OPERATIONS.md first. Work on the existing project (React + TypeScript + Vite + Tailwind + framer-motion already approved). Refactor, do not rebuild. Keep the glass design and the current dashboard.

Create src/motion/ with tokens and reusable components, all respecting prefers-reduced-motion:
1. tokens.ts: spring presets (ui, surface, gentle, bouncy), durations, easings, stagger values, z-layers.
2. <PageTransition>: route transitions using AnimatePresence (outgoing page fades+blurs 6px and slides 12px, incoming page springs in); shared-element friendly.
3. <Reveal> and <Stagger>/<StaggerItem>: on-scroll/on-mount reveals (fade, rise 16px, blur-in 8px->0), with `once` and direction props.
4. <TiltCard>: 3D tilt (max 8 deg) toward the pointer with perspective, a moving specular glare, and depth layers (children with data-depth shift slightly). Disabled on touch.
5. <Magnetic>: wrapper that pulls buttons/icons toward the cursor within 60px and springs back.
6. <PressScale>: spring press (0.96) + soft ripple from the pointer position for buttons.
7. <CountUp> for numbers (₹ formatting, tabular numbers) and <AnimatedBar>/<ProgressRing> that animate on reveal.
8. <SlidingIndicator> using framer-motion layoutId for tabs, segmented controls, sidebar active bubble and navbar active pill.
9. <SuccessCheck> (SVG path-drawn tick with a ring pulse and small confetti burst, 700 ms) and <ErrorShake>.
10. <MorphModal> and <MorphDrawer>: open from the trigger using layoutId (scale/position morph), background blurs and dims, closes with spring; drag-down to dismiss on mobile.
11. <ParallaxWallpaper>: the existing wallpaper blobs drift slowly and also parallax 20-40px with the cursor and with scroll (transform only).
12. <GlowBorder>: animated conic-gradient violet border for focus/hover on key cards and primary buttons.
13. <ScrollTitle>: large title that collapses into the toolbar on scroll (scale + translate + opacity).
14. <Toast> stack with spring in/out and swipe to dismiss; <Skeleton> shimmer.
15. Hooks: usePointerPosition, useReducedMotion wrapper, useInViewOnce, useMagnetic.
16. A single `motion.config.ts` flag MOTION_LEVEL = "full" | "reduced" | "off" saved in the mock settings and exposed in a Settings toggle ("Reduce animations"), also auto-set from prefers-reduced-motion.

Do not restyle pages yet; build and document the kit with a small README in src/motion.
VERIFY: unit-style sanity page at /motion-lab showing each component working. Build and lint pass.
```

## U2: Apply motion everywhere (layouts, existing pages, interactions)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Use the src/motion kit to make the whole app feel like a modern, interactive "vibe-coded" product. Do not change data logic or permissions.

1. Layouts: wrap routes in <PageTransition>. Sidebar/navbar active item uses <SlidingIndicator>; items have hover glow and <Magnetic> icons; sidebar collapses with a spring and labels fade; toolbar uses <ScrollTitle> and its glass gets more opaque as the page scrolls; wallpaper uses <ParallaxWallpaper>.
2. Components: all buttons use <PressScale> (+ <Magnetic> for primary actions); cards use <TiltCard> only for hero/feature cards (stat cards, service cards, appointment cards) and a light hover-lift elsewhere; inputs have floating labels with a glowing focus ring and animated validation (error shake, success tick); toggles and checkboxes spring; tabs and segmented controls use <SlidingIndicator>; tables rows fade in with stagger and highlight on hover.
3. Data visuals: stat numbers use <CountUp>; charts draw in (line stroke-dashoffset, bars grow, donut sweeps); progress rings and bars animate on reveal.
4. Overlays: modals and drawers use <MorphModal>/<MorphDrawer>; toasts use the new stack; command palette opens with a blur-scale spring.
5. Micro-interactions: skeletons shimmer then crossfade to content; list item add/remove animates with layout; status chip changes animate (colour crossfade + tiny bounce); copy buttons morph into a tick; notification bell wiggles on new notification; empty states have a gentle floating illustration.
6. Apply to the existing dashboard (keep its layout and look, add motion), /login, and all placeholder pages' headers.
7. Create /motion-lab (dev only) listing every effect with toggles for MOTION_LEVEL.
8. Performance: run Chrome performance profile via the browser tool on /dashboard; keep animations at ~60fps, no layout thrash; pause off-screen animations; limit simultaneous blur layers. Report findings and fix hotspots.
VERIFY: record before/after screenshots and describe each animation added; confirm reduced-motion mode disables transforms; build and lint pass.
```

---

# PART 2: CUSTOMER ROLE

The customer's permitted operations (from `docs/OPERATIONS.md`): register, login, profile, **submit booking request**, view own appointment cards, cancel own request/appointment (policy window), request reschedule, tap "I'm here", chat with the assigned stylist, view invoices, tip, rate and review, loyalty, packages, memberships, gift cards, referral. **Nothing else.**

## C0: Dev simulator (so you can test the customer without other roles)

```
TOOLS: Claude in Antigravity, terminal, browser.
Read docs/OPERATIONS.md first. Create a DEV-ONLY page /dev/simulator (rendered only when import.meta.env.DEV, never in production, not in any menu) that acts as the other roles using the engine with a "system" actor, so the customer flow can be tested end to end before other roles are built. Buttons:
- Receptionist: "Assign next request" (pick stylist/time/room, runs the real availability and conflict checks), "Reject request (reason)", "Check in", "Approve reschedule request", "Confirm cancellation", "Create invoice from completed appointment" and "Mark paid" (runs the full billing cascade with a chosen tip and payment method).
- Stylist: "Start service", "Complete service (notes, products used)", "Send chat message to customer X".
- Admin: "Reset demo data".
A live table shows all appointments with their status, flags and assigned stylist, plus the notification feed for every role.
Add a clear red "DEV ONLY - remove before production" banner and a comment. Engine rules still apply (invalid transitions fail with a message).
VERIFY: assign a request from the simulator and see the customer's card change (open the app in another tab).
```

## C1: Customer login, sign up, OTP, forgot password

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Role: customer only. Build with the new motion kit.

Pages and behaviour:
1. /customer/login: full-bleed animated wallpaper, large glass card (<TiltCard> subtle), floating-label inputs: email or phone, password (show/hide). Buttons: Sign in, "Forgot password?", "Create account", "Staff sign in" (links to /login). Remember me toggle. Validation with zod and animated errors (shake). Wrong password shows the error and counts attempts; after 5 failed attempts show the "Account locked for 15 minutes" state with a live countdown. Successful login plays <SuccessCheck>, then <PageTransition> to /customer-dashboard. If a staff account logs in here, show "Please use the staff sign in" and block.
2. /customer/register: multi-step with a progress indicator and slide transitions. Step 1: full name, phone (10-digit Indian format +91), email, password with live strength meter, confirm password. Step 2: allergies (optional chips), preferred stylist (optional), communication preference (WhatsApp/SMS/Email toggles), referral code (optional, validates and shows who referred), terms checkbox. Step 3: OTP (6-digit auto-advance input, 30s Resend timer, simulated OTP shown in a dev-only toast and in console). Step 4: success screen with confetti and "Go to dashboard". Duplicate email/phone shows an inline error. Account created with role customer only; staff roles cannot be created here.
3. /forgot-password -> enter email or phone -> OTP step -> /reset-password (new password + strength meter) -> success -> login. Expired OTP and wrong OTP states.
4. Session handling (mock): session kept in memory plus sessionStorage under "zenflow-mock-session" only for the mock; add a TODO comment that real tokens will be httpOnly cookies. Logout button clears it and animates to /customer/login. Auto-logout after 30 minutes idle with a warning toast at 28.
5. Engine functions: registerCustomer, loginCustomer, requestOtp, verifyOtp, resetPassword with hashed (mock) passwords, lockout counters, audit rows for login success/failure.
6. Route guard: customer routes require a customer session; other roles' routes redirect.
ACCEPTANCE (test in the browser and write a short pass/fail list): register -> OTP -> dashboard; logout; login; 5 wrong attempts -> lockout; forgot password; staff account blocked on customer login; refresh keeps session; idle logout; keyboard-only navigation works; reduced-motion mode works.
```

## C2: Customer Home + Book Appointment (request flow)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first (customer rules and the lifecycle). Customer navbar menu: Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile (floating glass top navbar with sliding indicator, loyalty chip, notification bell, profile menu).

1. Home (/customer-dashboard): animated greeting with the customer's name; "Your appointment" hero card (<TiltCard>) with the live status tracker: Requested -> Scheduled -> Checked-in -> In service -> Completed (stepper animates as status changes), assigned stylist and time once scheduled; empty state with "Book your first appointment"; loyalty ring (<ProgressRing>), recommended services (3 cards), offers carousel with Copy code, "Rate your last visit" card. All numbers use <CountUp>.
2. Book Appointment (/customer/book): a 4-step animated flow with sliding step transitions, a sticky summary card on the right that updates live (price, GST, duration):
   Step 1 Services: category tabs, service cards (<TiltCard>) with duration/price, multi-select with animated check, and "Describe your concern" textarea + "Suggest services" button -> shows exactly 3 suggested services (rule-based keyword match) with "Add" buttons.
   Step 2 Preferred stylist: stylist cards (photo, rating, specialization) + "No preference". No schedules shown.
   Step 3 Preferred date and time: calendar (next 30 days, closed days disabled by business hours) + time-slot chips shown as preferences (business-hours based, not stylist availability). Add "Flexible with time" toggle.
   Step 4 Confirm: notes, coupon field (validate/apply with animation), price breakdown with GST, Confirm button.
3. Submit creates a REQUEST via engine submitBookingRequest (status Requested). Success screen: <SuccessCheck>, "Request sent. Our team will confirm your stylist and time shortly.", buttons "View my appointments" and "Back to home". Validation: at least one service, a date/time or flexible flag; block double-submit; prevent identical duplicate requests with a friendly message.
4. Notification created for receptionists/admin (engine); the customer sees a bell notification when it is later assigned or rejected.
ACCEPTANCE: submit a request, see it on Home tracker as Requested, open the dev simulator, assign it, watch the tracker and notification update live without refresh.
```

## C3: My Appointments (cards) and all customer actions

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Build /customer/appointments with CARDS (not a table):
1. Segmented control with live counts: Requests, Upcoming, Past, Cancelled. Cards animate in with stagger and re-layout smoothly when status changes.
2. Card content: service(s) with icons, status chip, requested preference (Requested) or assigned stylist avatar + confirmed date/time + room (Scheduled), flag chips (Arrived, Reschedule requested, Cancel requested), price, "Details" expand (morph drawer) showing a timeline of status changes with timestamps.
3. Buttons by state (render only what the state and policy allow):
   - Requested: Cancel request (confirm dialog, reason optional).
   - Scheduled: "I'm here" (sets arrived flag, button changes to "Reception notified" with a tick, only enabled within 2 hours before start), Request reschedule (modal: new preferred date/time + reason; sets rescheduleRequested), Cancel (policy dialog: shows free-cancellation window from settings, default 24h; inside the window it becomes "Request cancellation" -> cancelRequested flag), Chat with stylist (-> that stylist's chat card; disabled with tooltip until assigned).
   - Checked-in / In-progress: read-only status with animated "In service" indicator.
   - Completed: View invoice, Tip (preset chips + custom), Rate and review (stars + comment, one per visit), Rebook (prefills the booking flow).
   - Cancelled / Rejected: shows reason; Rebook.
4. Everything goes through engine functions allowed for customers only; the customer can only ever see their own appointments. Real-time updates when the simulator or other tabs change status (BroadcastChannel).
5. Empty states with a gentle animated illustration and a "Book appointment" button.
ACCEPTANCE: run every button above for each state using the simulator; confirm the receptionist-side flags appear in the simulator table and notifications; confirm no staff-only information (other customers, internal notes, stylist earnings) is visible.
```

## C4: Invoices, Profile, Wallet

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Customer pages:
1. /customer/invoices: summary cards (total spent, invoices, points earned) with CountUp; search and date filter; list as cards or table toggle; each invoice opens a MorphDrawer: itemised bill, GST, discount lines, tip, payment methods, status chip (Paid/Refunded). Buttons: Download PDF (real PDF generation in the browser, state which small library you used or use print-to-PDF), Tip after service (if not tipped; updates the invoice tip record and notifies the stylist), Rate this visit, Pay now (mock payment for unpaid invoices: Card/UPI/Wallet picker with a processing animation then <SuccessCheck>).
2. /customer/profile: tabs Details (name, phone, email, DOB, address, photo upload preview), Health and preferences (allergies chips, preferred stylist, communication toggles), Security (change password with strength meter, active session, sign out), Wallet (loyalty points ledger and tier progress with Redeem button -> creates a coupon-like credit; packages with remaining sessions; memberships with benefits and renewal date; gift cards: redeem a code (validates) and view balance; "Buy gift card" modal), Referral (code, Copy button morph, share sheet, list of referrals and rewards), Danger zone (Request account deletion with confirm and 7-day grace notice).
3. Allergies/notes show a small lock icon and text "Stored encrypted" (UI only for now).
All data via customer-scoped engine functions. Validation with zod; every save shows a toast and animates the changed field.
ACCEPTANCE: use the simulator to create and pay an invoice, then verify the invoice shows here, tip works, rating works, wallet changes, redemption, gift card redeem, profile edits persist after refresh.
```

## C5: Zen Chat (customer side, card-based)

```
TOOLS: Claude in Antigravity, browser (two tabs), terminal.
Read docs/OPERATIONS.md section 1.5 first. Build /customer/chat.
1. Landing = grid of STYLIST CARDS (only stylists assigned to this customer's appointments): avatar, name, specialization, appointment chip (next or last), last message preview, time, unread badge, online dot. Search. Empty state when none assigned: "Chat unlocks once your appointment is scheduled."
2. Clicking a card opens that conversation: split view on desktop (cards collapse into a left rail with the active card highlighted, conversation fills the rest, shared-element animation from the card to the header), full screen with Back on mobile.
3. Conversation: glass bubbles (customer in violet gradient, stylist in dense glass), timestamps grouped by day, read ticks, typing indicator, quick replies ("Running late", "On my way", "Can I reschedule?" -> also offers to open the reschedule request modal), attachment (mock image), emoji picker, Enter to send, message appear/send animations, scroll-to-latest button, appointment tags inline when the visit changes.
4. Engine: only participants can read or send; the customer cannot open any thread that is not theirs (even by URL). Receptionist/admin never access chat.
5. Live updates: simulator "Stylist sends message" shows typing then the message in the open tab; unread badge increments in the navbar and the card when the conversation is closed.
ACCEPTANCE: simulator assigns a stylist, the card appears; simulator sends a message, badge appears; open the card, reply, refresh and confirm history persists.
```

## C6: Customer QA gate (run last, repeat until clean)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md first. Audit ONLY the customer role.
1. Menu must be exactly: Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile. Visit every staff URL (/dashboard, /appointments, /schedule, /customers, /staff, /services, /pos, /inventory, /marketing, /reports, /settings, /my-day, /earnings, /chat) and confirm redirect + toast.
2. Click every button, tab, filter, link, modal action and drawer control on every customer page. Output a table: page | control | expected | actual | pass/fail | fix. Fix all failures; a control that does nothing is a failure.
3. Run the full flow with the simulator: register -> request -> assigned -> arrived flag -> check-in -> start -> complete -> invoice -> pay -> tip -> rate -> chat. Confirm each status and notification appears in real time without refresh.
4. Motion QA: all animations smooth (~60fps on /customer-dashboard and /customer/book), reduced-motion works, no layout jumps, focus rings visible, keyboard navigation works, mobile (390px) layout works.
5. Security checks (mock level): no tokens in localStorage, customer cannot read other customers' data via URL tampering, lockout works.
6. vitest, `npm run build`, `npm run lint` pass; no console errors.
Report results with screenshots of Login, Register steps, Home, Book steps, My Appointments (each state), Invoice drawer, Profile/Wallet, Chat.
```

---

## After the customer role is approved

Tell me "proceed" and I'll give the receptionist prompts next (Appointment Desk, assignment, schedule, customers, POS), then stylist, then admin. The dev simulator pages get removed as each real role replaces them.
