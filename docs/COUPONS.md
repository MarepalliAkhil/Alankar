# Coupons at payment

Code: `backend/marketing/coupons.py` (rules), `backend/billing/online.py` (pricing),
`backend/scheduling/booking.py` (`apply_coupon`, `remove_coupon`, `available_coupons`, `pay`),
`frontend/src/pages/customer/PayPage.tsx` (payment page), admin **Marketing > Coupons**.

## How totals worked before this task

Prices in the catalogue **include GST** (18% by default, per service or product). The online
payment total was already worked out on the server by `billing/online.py` in a fixed order:
items, coupon, membership, package, delivery (shop only), gift card. GST was never added on top: it
is the part of each line's price after its discounts, `after x rate / (100 + rate)`. A coupon was
typed on the payment page and sent again with the payment; the redemption row was written only when
the payment succeeded, with the coupon row locked. At the counter, `billing/checkout.py` carries the
online coupon over to the invoice and the receipt. This task keeps that engine and adds what was
missing (below).

## The coupon

Admin managed and audited (`marketing.manage`). Code: unique, case-insensitive, stored uppercase,
3 to 24 letters, digits, `-` or `_`. Name (title), description, percent or flat, value, maximum
discount, minimum order value, valid from and to (shop dates, Asia/Kolkata, whole days), active
flag, total and per-customer usage limits, applies to (whole bill, services, products, or chosen
divisions / services / products), first visit only. A coupon is never deleted (there is no delete
endpoint): switch it off. The list shows how often each one was used.

## Pricing order (the server is the only source of truth)

1. Items subtotal: each service and product at its price incl. GST.
2. Eligible subtotal: only the lines the coupon applies to.
3. Discount: percent of the eligible subtotal, capped at the maximum; flat capped at the eligible
   subtotal. One coupon per payment.
4. Membership, package, gift card as before.
5. Taxable value and GST: from what is left of each line after the discounts. So the discount comes
   **before** GST (GST is charged on the discounted value).
6. Total: never below zero.

Money is `Decimal` everywhere (no floats), rounded half up to the paisa (`ROUND_HALF_UP`, 0.01).
A discount shared over several lines is split in proportion; the last line takes the remainder so the
parts add up exactly.

**Accountant's note.** Taking a discount before GST (so GST is on the discounted value) is how this
prototype works. A real shop must confirm this with its accountant (for example whether the
discount is known at the time of supply and shown on the invoice).

## The payment page

- Breakdown: each service and product, Subtotal, Coupon (always shown; a dash when none, so
  nothing moves), GST (included), Total. A polite live region reads the new total.
- Coupons: every listed, active, in-date coupon is a card (a button with `aria-pressed`): code,
  title and terms in plain words (`10% off, up to Rs 200 · minimum order Rs 500 · Spa services only
  · valid till 30 Nov`). A card that can be used says "Tap to apply · save Rs X"; the one that saves
  the most is marked "Best for you". A card that cannot be used for THIS payment is greyed with the
  exact reason: "Add Rs 200 more to use this", "Only for Spa services", "First visit only", "You
  have already used this", "Usage limit reached". One column on phones, two from 640 px.
- Tapping a card applies it through the server (only the code is sent). Tapping another card
  switches to it; the applied card says "Applied, you save Rs X" and has a Remove button that
  brings the full price back exactly.
- "Show in customer coupon list" (on by default) lets the admin keep a code private for campaigns;
  such a code still works in the "Have a private code?" box below the list.
- Errors are short. A code that does not exist, or someone else's private coupon, gets one generic
  message ("That coupon code is not valid.") so codes cannot be guessed. Amounts or totals sent by
  the browser are ignored.

## Correctness and safety

- Applying stores the coupon and its discount on the payment link. Nothing counts as used until
  the payment succeeds.
- At payment the coupon is checked again inside the transaction with `select_for_update` on the
  coupon row, so total and per-customer limits can never be exceeded by two payments at once. If it
  is no longer valid, no money is taken: it is removed from the link and the customer is shown the
  new total to confirm (HTTP 409, `code: coupon_changed`).
- The payment link keeps its 45-minute expiry; when it expires the applied coupon is dropped with it.
- A total of zero is marked paid with a Rs 0 payment (`method: coupon`), the email says "Rs 0,
  covered by coupon", and the booking moves to scheduled as usual.
- Apply attempts are limited per customer and per IP address: `SALON_COUPON_ATTEMPTS` (default 10)
  in `SALON_COUPON_WINDOW_SECONDS` (default 600). A blocked attempt is audited
  (`coupon_apply_blocked`); applying and removing are audited too.
- Who: the customer applies a coupon to their own payment only (`my.payment.coupon`); the admin
  manages coupons; the receptionist and the stylist see the coupon used on a booking, read-only;
  AIR never creates, applies or removes coupons (`service_actors.air.never`, with tests).

## Cancellations, refunds and payroll

- Salon cancellation of a paid booking gives the coupon use back and asks the admin to refund what
  was paid online.
- Customer cancellation follows the existing policy: inside the free-cancellation window (24 hours
  before the visit by default) the customer cancels themselves, gets back everything paid and the
  coupon use is returned; after it they can only ask the desk to cancel.
- Refunds return only money actually paid, never the coupon's rupees; a Rs 0 coupon payment has
  nothing to refund.
- Stylist pay and tips are unchanged: task pay uses the booked price (`people/pay.py`), so the shop
  bears the discount.

## Where the coupon shows

Receipt (counter invoice), payment email, the customer's appointment details, the desk's booking
view, the stylist's appointment page, and the admin coupon report (uses and discount per coupon,
paid bookings and online revenue with and without a coupon).

## Demo coupons (`reset_demo`)

| Code | What it tests |
|---|---|
| `WELCOME10` | 10% off, up to Rs 200, first visit only |
| `FLAT100` | Rs 100 off a bill of Rs 999 or more |
| `EXPIRED20` | Ended 30 days ago: shows "has expired" |
