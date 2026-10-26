# ZenFlow: Customer Phase (Spatial Glass UI + Customer login, sign-up and operations)

We build **role by role**. This file covers only the **customer** role. When you're happy, tell me and I'll write the next role (receptionist) the same way.

Use a **new chat for each prompt**, with the Claude model selected in Antigravity. Every prompt works on the **existing project**: keep what works, refactor, don't rebuild. Make sure `docs/OPERATIONS.md` (the strict role plan) is in the project and in your workspace rules.

## Order

| Step | Prompt | Result |
|---|---|---|
| 1 | **U1** Spatial motion system | Global interactive UI: depth, tilt, parallax, magnetic buttons, page transitions |
| 2 | **U2** Customer shell | Spatial customer layout and navbar |
| 3 | **C1** Auth | Customer login, sign-up, OTP, forgot password |
| 4 | **C2** Home | Customer home with a live request tracker |
| 5 | **C3** Book appointment | Booking request flow |
| 6 | **C4** My Appointments | Cards with every customer operation |
| 7 | **C5** Invoices, Profile, Wallet | Billing and account operations |
| 8 | **C6** Zen Chat (customer side) | Chat with the assigned stylist (card based) |
| 9 | **C7** Customer QA | Button-by-button audit for this role |

After each step: open it in your browser, test, `git commit`. If something looks off, use this follow-up:
```
On <page>, fix: <what is wrong>. Keep everything else unchanged. Keep the spatial glass style and motion rules. Verify in the browser and show a screenshot.
```

---

## Spatial UI design rules (include in your workspace rules)

```
SPATIAL GLASS UI (visionOS + iOS 26 inspired), white + violet, applies to all pages, strongest on customer pages.

DEPTH LAYERS (z-order with different shadow/blur/scale):
 z0 wallpaper (violet/white gradient, grain) -> z1 floating blurred orbs (parallax) -> z2 content cards -> z3 ornaments (navbar, toolbars, floating action buttons) -> z4 sheets/modals/toasts. Higher layers have larger, softer shadows and slightly brighter specular edges.

INTERACTION RULES:
- Cards tilt toward the cursor (max 6-8 degrees, perspective 1000px) with a moving specular glare; they lift forward on hover (translateZ(24px), scale 1.02) and press down on click (scale 0.97).
- Primary buttons are "magnetic": they pull toward the cursor within ~80px and show a light sweep on hover and a ripple on press.
- Wallpaper orbs parallax with the mouse (+-20px) and with scroll; the page title collapses (large title -> toolbar title) while scrolling.
- Page transitions: soft depth transition (outgoing page scales to 0.98 and blurs, incoming slides from z-depth). List card -> detail uses shared layout transitions (framer-motion layoutId) so the card "grows" into the page.
- Staggered spring entrances (40-60ms stagger), skeleton shimmer for loading, number count-up for stats, drawing checkmark and a light confetti/sparkle burst on success, animated progress rings, segmented control with a sliding glass thumb, toggles with a springy bounce.
- Sheets and drawers are draggable to dismiss on touch.
- Cursor spotlight: a soft radial light follows the pointer across glass surfaces.

MOTION TOKENS: spring {stiffness 260, damping 24}; ease cubic-bezier(0.2,0.8,0.2,1); durations 200 (micro), 350 (components), 500 (page).

PERFORMANCE RULES (must follow):
- Animate only transform, opacity and (sparingly) filter. No layout-thrashing animations.
- Limit simultaneous backdrop-filter surfaces on screen (aim for <= 8); use cheaper "tinted fill without blur" for small nested elements.
- Use will-change only during active animation. Lazy-load heavy components. Keep 60fps on a mid-range laptop.
- Disable tilt, parallax and spotlight on touch devices and when prefers-reduced-motion is set (fall back to simple fades). Respect prefers-reduced-transparency.
- Approved libraries: framer-motion (already approved). No other animation libraries unless you explain why.
```

---

## U1: Spatial motion system (global)

```
TOOLS: Claude in Antigravity, built-in browser (screenshots and screen recording if available), terminal.
Read docs/OPERATIONS.md and the rules, including "SPATIAL GLASS UI". Keep the current look and colours; add depth and interaction on top. Do not change routes or business logic.

Build a reusable motion layer in src/motion and update the shared UI components:
1. Hooks and components: useTilt (perspective tilt + moving glare), useMagnetic, useSpotlight (cursor light on glass), useParallax (mouse + scroll), <SpatialCard> (tilt, lift, press, layer prop z1..z4 controlling shadow and specular), <MagneticButton>, <Reveal> / <Stagger> (spring entrance), <CountUp>, <ProgressRing>, <SuccessCheck> (SVG draw animation) and <Burst> (sparkle/confetti particles using transforms only), <PageTransition> (depth transition wrapper around the router outlet), <SharedCard> helpers using layoutId.
2. Upgrade the wallpaper: add 2 more floating orbs on separate parallax layers (mouse + scroll), subtle gradient hue drift, keep grain.
3. Upgrade existing components: Button (magnetic + sweep + ripple), Card/Glass (tilt-ready variants), Modal/Drawer/Popover (morph in from the trigger, drag-to-dismiss on touch), Toast (spring in, swipe away), Tabs and SegmentedControl (sliding glass thumb), Toggle (springy), Table rows (hover glow), SearchBar (expands with focus), Skeleton (shimmer).
4. A global MotionConfig honouring reduced motion; a dev-only FPS meter and an "effects off" switch in Settings for debugging.
5. Add a /design-system "Motion" section showing every effect live.
Performance: follow the performance rules; report the number of backdrop-filter elements on the busiest page and reduce if above 8.
VERIFY: screenshots plus a short description of each effect; confirm 60fps feel, no console errors, `npm run build` and lint pass.
```

---

## U2: Customer shell (spatial layout)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md. Role: customer. Rebuild CustomerLayout with spatial glass (use the U1 motion system):
1. Floating glass navbar ornament (z3) at the top, detached from the edge, with: ZenFlow logo, items Home, Book Appointment, My Appointments, Zen Chat (unread badge), Invoices, Profile; a sliding violet glass "active bubble" that glides between items; loyalty-points chip with live count; notification bell with panel; profile menu with Logout. On mobile: floating bottom tab bar capsule with the same items and an active bubble.
2. Collapsing large page titles with parallax; content scrolls under the navbar showing the blur.
3. Depth transitions between customer pages (PageTransition).
4. Menu items come from the policy file (ROLE_MENUS.customer): exactly Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile. Nothing else.
5. Customer route guard: any non-customer route redirects to /customer-dashboard with a toast.
VERIFY: screenshots at 1440, 1024 and 390 widths; navbar bubble animates; guard works.
```

---

## C1: Customer login and sign-up

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer section) and the SPATIAL GLASS UI rules. If the policy file or engine from earlier prompts is missing, implement only the customer subset you need now (customer role in policy.ts, auth functions in the mock engine) and keep the structure ready for the other roles.

Build /customer/login, /customer/register, /forgot-password, /reset-password as one immersive spatial auth experience (AuthLayout):
1. Scene: full-bleed animated wallpaper with parallax orbs; a large floating glass card (z3) with a smaller glass "ornament" showing the ZenFlow logo orb (floats gently, reacts to the cursor); soft depth shadow. Headline "Your next appointment is one tap away".
2. Tabs "Sign in" and "Create account" with a sliding glass thumb; switching morphs the card height and cross-fades fields (shared layout animation) and changes the URL between /customer/login and /customer/register.
3. Sign in: email or phone, password (show/hide), Remember me, Forgot password link, Sign in magnetic button with loading state, a "Use demo account" chip that fills the seeded customer (priya.sharma@example.com / Customer@123), link "Staff member? Sign in here" (-> /login). Rules: generic error text, shake animation on failure, mock lockout after 5 failed attempts for 15 minutes with a countdown message.
4. Create account (customer only): full name, phone, email, password with animated strength ring and rules checklist, confirm password, referral code (optional), terms checkbox, Create account button. Zod validation with inline animated errors, duplicate email/phone detection.
5. OTP step after registration: 6 boxes with auto-advance, paste support, resend timer (30s), shake on wrong code, and a clearly labelled demo hint toast "Demo OTP: 123456" (simulated SMS, to be replaced by the real backend later).
6. Forgot/reset flow: email -> "Check your inbox" state (mock link in a toast) -> reset form with strength ring -> success -> back to sign in.
7. Success transition: the card scales and blurs away ("zoom through") into /customer-dashboard with a short welcome burst. Session in AuthContext (mock) with role "customer"; no tokens in localStorage. Logout returns to /customer/login.
8. Accessibility: labels, focus rings, Enter submits, aria-live for errors, reduced-motion fallback.
VERIFY: register a new customer end to end, log out, sign in again, trigger a failed login and the lockout, run the reset flow, try visiting staff routes as the customer (blocked). Screenshots of both tabs.
```

---

## C2: Customer home

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer). Build /customer-dashboard using the spatial system:
1. Hero greeting card with time-of-day message and a magnetic "Book appointment" button.
2. **Request tracker** (hero element): a horizontal stepper Requested -> Scheduled -> Checked-in -> In service -> Completed for the customer's current appointment, with animated progress and the confirmed stylist, time and room once scheduled. If nothing is active show an inviting empty state with a Book button.
3. Next appointment card with: Request reschedule, Cancel (policy dialog), "I'm here" (sets the arrived flag, shows "Reception notified" with a success animation), Chat with stylist (only after scheduled).
4. Loyalty ring (animated count-up, progress to next reward, Redeem button), recommended services (3 cards, Book -> booking prefilled), offers carousel with Copy code, recent invoices (View), "Rate your last visit" card (animated stars, comment, submit with success burst).
5. All cards are SpatialCards (tilt, lift), staggered entrance, skeletons while loading.
All data via src/api hooks calling engine functions allowed for the customer; no staff data.
VERIFY: with seeded data, every button works; the tracker updates when the appointment status changes in the store.
```

---

## C3: Book appointment (request flow)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer, lifecycle). Build /customer/book as a spatial 4-step flow that creates a REQUEST (status Requested). The receptionist assigns the stylist and final time later.
Layout: left = steps (large glass panel with animated stepper that morphs), right = sticky floating "Your booking" summary card (z3) that updates live with price breakdown (GST) and animates changes.
Step 1 Service(s): category chips, service cards (SpatialCard) with duration/price and select animation, multiple selection allowed; a "Describe your concern" box with "Suggest services" returning exactly 3 rule-based suggestions with a reveal animation.
Step 2 Preferred stylist (optional): stylist cards with rating and specialization, "No preference" option; note under it: "The salon confirms your stylist and time".
Step 3 Preferred date and time: calendar + time chips (these are preferences, no staff schedule shown), optionally a second-choice time.
Step 4 Confirm: notes, allergies reminder (from profile), coupon with Apply (validates against the engine), final summary, "Send request" magnetic button.
Success: SuccessCheck + Burst, text "Request sent. The salon will confirm your stylist and time shortly.", buttons "View my appointments" and "Book another". Prefill support via query (?service=...&rebook=ID).
Engine: submitBookingRequest creates status Requested, notifies receptionists and admin only. Validate with zod, block past dates, handle closed days from business hours settings.
VERIFY: submit a request; confirm it appears in My Appointments as a Requested card and (in the store) as a notification for receptionist/admin only.
```

---

## C4: My Appointments (cards, all customer operations)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer). Build /customer/appointments as CARDS using SpatialCards and shared layout transitions into a detail sheet.
1. Top segmented control with sliding thumb: Requests, Upcoming, Past, Cancelled (with counts).
2. Card content: services, status chip, preferred time (Requested) or confirmed time + assigned stylist avatar + room (Scheduled), flag chips (Arrived, Reschedule requested, Cancel requested), price estimate.
3. Buttons by state (only those allowed for customers):
   - Requested: Cancel request.
   - Scheduled: "I'm here" (arrived flag), Request reschedule (modal: preferred new date/time + reason), Cancel (policy dialog showing the window; outside the window cancels directly, inside the window becomes "Cancel requested"), Chat with stylist.
   - Completed: View invoice, Tip, Rate and review (stars + comment), Rebook (prefills booking).
   - Cancelled: Rebook.
4. Clicking a card expands it (layoutId) into a detail sheet with a status timeline (every change with time), notes, services, and the same actions.
5. Live updates: when status changes in the store (for example the receptionist assigns), the card animates to its new state and a toast appears.
Customers can only see their own appointments and never staff-side controls (no assign, check-in, start, complete).
VERIFY: all buttons per state; policy-window logic; cancel and reschedule flags appear in the store for the receptionist.
```

---

## C5: Invoices, Profile and Wallet

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md (Customer). Build:
1. /customer/invoices: summary stat cards with count-up (total spent, invoices, points earned), search and date filter, list of invoice cards/table, click opens a spatial drawer with itemised bill, GST, discount, tip, payment method, status; buttons Download PDF (print-to-PDF or generated), Tip after service (if unpaid tip allowed), Pay online (mock, if an invoice is unpaid).
2. /customer/profile: tabs Profile (photo upload, name, phone, email, DOB, address), Health and Preferences (allergies, preferred stylist, communication toggles) with a note that sensitive fields are stored encrypted, Wallet (loyalty points ledger and Redeem, packages with remaining sessions, memberships with benefits/renewal, gift card redeem by code and buy-for-a-friend mock, referral code with Copy and Share), Security (change password with strength ring, active sessions mock, logout everywhere), Danger zone (request account deletion with confirm dialog).
3. All edits validate with zod, show animated save confirmation, and update the store. Customer sees only own data.
VERIFY: edit profile, redeem points, redeem a gift card code, change password, view and download an invoice.
```

---

## C6: Zen Chat (customer side)

```
TOOLS: Claude in Antigravity, browser (two tabs if possible), terminal.
Read docs/OPERATIONS.md section 1.5. Build /customer/chat now (the stylist side comes in the stylist phase; use seeded stylist auto-replies for testing).
1. Landing = grid of STYLIST CARDS (glass SpatialCards): avatar, name, specialization, appointment chip (next or last), last message preview, time, unread badge. Only stylists assigned to this customer appear. Empty state: "Chat unlocks once your appointment is scheduled."
2. Clicking a card opens that conversation (layoutId expand from the card; on desktop a left rail of cards + conversation on the right; on mobile full screen with Back).
3. Conversation: glass bubbles with timestamps, read ticks, typing indicator, quick replies ("Running late", "On my way", "Can I reschedule?" which asks for confirmation and sets the reschedule-request flag), emoji, attachment (mock), Enter to send, auto-scroll, animated message arrival.
4. Seeded stylist auto-reply (dev only, behind a flag) so you can demo.
5. Unread badge in the navbar counts only this customer's unread messages. The customer cannot open any other thread by URL.
VERIFY: open a card, send messages, quick reply, unread behaviour; receptionist/admin have no chat access (check policy tests).
```

---

## C7: Customer QA (strict)

```
TOOLS: Claude in Antigravity, browser, terminal.
Read docs/OPERATIONS.md. Audit ONLY the customer role.
1. Log in as a customer and confirm the menu is exactly: Home, Book Appointment, My Appointments, Zen Chat, Invoices, Profile.
2. For EVERY page, click EVERY button, tab, filter, link and form. Produce a table: page | control | expected | actual | pass/fail | fix. Fix all failures. A control that does nothing, errors, or is shown for an action customers are not allowed to do is a failure.
3. Try forbidden URLs (/dashboard, /appointments, /schedule, /staff, /pos, /chat, /my-day...) and confirm redirect plus toast.
4. Run the scenario: register -> OTP -> book request -> see Requested card -> (simulate the receptionist assigning via the dev tools or store) -> card becomes Scheduled -> "I'm here" -> chat unlocks -> completed -> invoice -> tip and review.
5. Visual check: glass depth visible, tilt/parallax/magnetic/transition effects working, reduced-motion fallback working, no more than ~8 backdrop-blur surfaces per screen, 60fps feel, responsive at 1440/1024/390.
6. vitest, `npm run build`, `npm run lint` all pass; no console errors.
Output the tables and screenshots. Do not mark complete while any row fails.
```

---

## When the customer role is done

Tell me, with screenshots of anything that still looks wrong. Next role: **receptionist** (request cards, assign flow, schedule, check-in, checkout), written in the same format.
