# AIR: Alankar Intelligence Receptionist (Tasks 1 to 3)

AIR is a **back-office actor** that covers the front desk when no human receptionist is present.
It is not a person, has no login, and everything about it is **OFF by default**. With every switch
off the app behaves exactly as it did before.

Sections 1 to 12 describe Task 1 (foundation). Section 13 describes Task 2 (AIR for customers: chat
booking and product orders). Section 14 describes Task 3 (the AIR Activity page, its statistics, the
receptionist's popup and the For Zenotians text). The label "AI Alankar Intelligence" (customer chat) and "Alankar Intelligence"
(admin assistant) are unchanged.

## 1. Architecture

```
backend/air/
  models.py      AirSettings, CoverState, CoverPeriod, SlotHold, AirRequestState,
                 AIActionLog (append-only), AirConsent, AiUsage, ProviderState
  config.py      read / change settings (audited), "key configured: yes/no"
  cover.py       cover mode, force on/off, status
  actor.py       the deny-by-default allow-list and `require()`
  holds.py       slot holds, expiry, the busy-range hook
  handover.py    the row-level claim and hand-to-desk
  lifecycle.py   keeps holds and customer messages in step with the booking's real status
  links.py       payment-link create / resend (once) / expire
  service.py     what AIR can do: read services and slots, hold, submit, accept, undo
  actionlog.py   writes the log (allow-listed fields only)
  consent.py     the customer consent store for the language model
  signals.py     glue that follows the existing booking code without editing it
  views.py       admin-only endpoints (settings, cover, log)
  llm/           provider adapter, redaction, tools, orchestrator, number checker, caps
  management/commands/expire_holds.py
```

AIR **reuses** the existing code instead of copying it: `scheduling.booking.create_request` (so
prices, the email check and the **mandatory-rating block** apply exactly as for a person),
`scheduling.approvals.reception_accept` (the dual approval), the existing payment simulation
(`booking.pay`), `notifications` (simulated SMS, email and in-app messages) and `accounts`
shifts and work sessions.

Existing code touched (small, additive): `scheduling/booking.py` (`busy_ranges` also counts live AIR
holds), `billing/models.py` (`PaymentLink.sent_by`, `PaymentLink.sent_by_air`), `core/policy.py`
(`service_actor_can`), `core/jobs.py` (the `air_expire_holds` step), `notifications/templates.py`
(merges `air_templates.py`), `config/settings.py` and `config/urls.py` (register the app).

## 2. Cover rules (desk cover mode)

`air.cover.is_active(now)` runs **on the server only**. AIR covers only when **all** are true:

1. The admin switched AIR on (`air_enabled`).
2. **No** receptionist is on shift: the admin-set `ShiftSchedule` (weekday + start/end, time zone
   **Asia/Kolkata**). No new schedule was needed; the existing one is reused. If no receptionist has
   any shift, "nobody is on shift" is true all day, so cover then depends only on rule 3.
3. **No** receptionist is logged in or clocked in: an open `WorkSession` that was active within the
   idle limit (`SALON_IDLE_MINUTES`, 15 by default). A stale open session does not keep cover off.

Every start and end is a `CoverPeriod` row (`started_at`, `ended_at`, `reason`, `ended_reason`).
Periods are opened and closed when `is_active` is called (page reads, the `expire_holds` command,
the scheduler job), so run the job every minute for exact boundaries.

**Admin force.** `POST /api/admin/air/cover/` with `mode` = `on`, `off` or `auto` and a **reason**
(3 to 200 characters). It is audited (`air_cover_forced`, with before, after and reason). Forcing on
never overrides the AIR switch: with AIR switched off nothing is active.

**When a receptionist signs in** (or forced off, or a shift starts) cover ends immediately:

* AIR takes no new action (`handover.claim` re-checks cover inside the row lock).
* Each unfinished AIR request (waiting for answers, or waiting for payment) is marked
  `handed_to_desk` with `handled_by = human` and an action-log row `handoff_to_desk`
  (status `handed_off`). `handover.needs_desk()` lists them for the receptionist's needs-you list
  (the dashboard that shows it is Prompt 3).
* A request is either finished by AIR before the hand-over or handed over: the claim uses
  `select_for_update` on the request's `AirRequestState` row, and the booking itself is locked
  by the existing approval code, so a person and AIR can never both process one item.

## 3. What AIR may and may not do

AIR is the internal service actor `air` in `shared/policy.json` under `service_actors.air`
(`login: false`). **Deny by default**: anything not in `allow` is refused. The list is mirrored in
`air/actor.py` and the two must agree (a test checks it). AIR actions are **not** API actions: AIR
has no endpoint, token, session or UI.

Allowed (and only while cover is active, except the four marked *):

| Action | What it does |
|---|---|
| `air.services.read` | read active services and public prices |
| `air.availability.read` | read free times |
| `air.hold.create` | hold a slot for a customer |
| `air.hold.release` * | release a hold |
| `air.booking.request` | create a booking request for a customer who **explicitly confirmed** in chat |
| `air.reception.accept` | accept the **receptionist** side of the dual approval, only for a request created from a confirmed customer session |
| `air.payment_link.create` / `.resend` | create a link; resend **once** per request and only if the slot is still free |
| `air.payment_link.expire` * | end a link (the unpaid booking expires, the slot is released) |
| `air.notify.customer` * | send simulated SMS / email / in-app messages |
| `air.requests.read_own` | read the current customer's own requests (status and time only) |
| `air.handoff` * | hand a request to the desk |
| `air.undo` | undo its own scheduling change inside the short window |

AIR can **never**: accept for the stylist, refund, discount, change prices, waive fees, cancel after
the cutoff, override the mandatory-rating block, edit users or staff, read other customers' data,
read staff private fields (including a stylist's private decline reason), open chat photos, or act
outside cover mode. Tests cover every one of these (`air/tests/test_policy.py`), and one test scans
AIR's own source for calls to the forbidden code paths.

## 4. Holds, expiry and the clash-free guarantee

* **SlotHold** (stylist, customer, time range, owner request, `expires_at`, status
  `active / confirmed / released / expired / consumed`). A hold is created the moment a slot is
  offered, inside a transaction, after taking the **stylist's row lock** (the same lock the normal
  booking path takes), with an **idempotency key** (a repeated tap returns the same hold).
* **PostgreSQL exclusion constraints** (migration `0001`, needs `btree_gist`):
  `air_hold_no_stylist_overlap` (one stylist, overlapping time) and `air_hold_no_customer_overlap`
  (one customer, overlapping time), both `WHERE status IN ('active','confirmed')`, ranges `[start,end)`
  so back-to-back is fine. On other databases (the SQLite used for quick checks) the constraints are
  skipped and the application checks stand alone.
* The application also checks free times (`booking.busy_ranges` counts live holds) and the
  customer's own bookings, requests and holds.
* **Stylist timeout: 15 minutes** (admin setting `stylist_timeout_minutes`). AIR sets the request's
  `approval_expires_at` to the hold's expiry, so the existing expiry code ends a stalled request.
  The customer is told "the stylist could not take this slot" and gets the nearest alternatives
  (the existing `nearest_slots`). A decline does the same and never shows the private reason.
* **Both accepted** → `awaiting_payment`. The hold becomes `confirmed` and stays until the payment
  link ends. **AIR payment-link expiry: 45 minutes** (`payment_link_minutes`), never within 5
  minutes of now and never later than 10 minutes before the visit.
* **Link expired** → booking `payment_expired`, hold released, customer told, nearest times offered.
  **Paid** → booking `scheduled` (the existing simulated payment).
* **Expiry runs** through the existing job runner (`air_expire_holds` in `core/jobs.py`, so
  `python manage.py run_jobs` includes it), through `python manage.py expire_holds`, and **lazily on
  every read** (`holds.expire_due`, and overdue holds are ignored by `busy_ranges` even before the
  job runs).

## 5. Payment link lifecycle (simulated)

A `PaymentLink` has an unguessable token (only its SHA-256 hash is stored), an amount, a booking,
`sent_at`, `expires_at`, a status (`active / paid / expired / replaced / cancelled`) and who sent it
(`sent_by` a user, or `sent_by_air`). The raw token appears only inside the simulated email. It is
never logged, audited, returned by an API or written to the AIR log (a test checks this). AIR
resends **at most once per request**, and only while the booking waits for payment and the slot is
still free; a resend replaces the old link and extends the hold to the new expiry.

## 6. Customer messages

AIR requests trigger the existing simulated SMS / email / in-app messages (`notifications`) at:
request received, stylist accepted, declined, timed out, payment link sent, link expired, and paid
and confirmed. The wording lives in `notifications/air_templates.py` and says plainly that **a
booking is confirmed only after payment**. Each message is sent once per request.

## 7. Settings and defaults (admin, audited)

`GET / PATCH /api/admin/air/settings/` (admin only). All switches OFF by default.

| Setting | Default |
|---|---|
| `master_enabled` (the optional language-model layer) | off |
| `air_enabled` (AIR may cover the desk) | off |
| `stylist_timeout_minutes` | 15 |
| `payment_link_minutes` | 45 |
| `undo_window_minutes` | 10 |
| `daily_request_cap` / `monthly_request_cap` | 200 / 3000 |
| `monthly_spend_cap_rupees` | 500 |
| `cost_per_request_rupees` (estimate per provider call) | 0.50 |
| `breaker_failures` / `breaker_cooldown_seconds` | 5 / 300 |
| `request_timeout_seconds` / `retry_limit` | 8 / 1 |

Each change writes an `air_settings_changed` audit row listing old and new values (never a key).
The settings screen shows only **"key configured: yes / no"**. An unknown field, a key, or a bad
value is refused.

## 8. The optional language-model layer (OFF by default)

Environment variables (backend only; empty entries are in `backend/.env.example`):

```
AI_TEXT_PROVIDER=disabled     # disabled (default) | fake | anthropic
AI_TEXT_API_KEY=              # the provider key; never stored in the database
AI_TEXT_MODEL=                # the model name
```

* `disabled`: nothing is ever called. `fake`: scriptable, used by **all** tests (a fixture makes
  any outbound request fail the test). `anthropic`: the Anthropic Messages API over HTTPS using the
  standard library, so **no new dependency**. Another provider (for example Gemini) is one more class
  with the same `complete()` in `air/llm/providers.py`.
* The key is read from the environment at call time. It is never put in the database, a log, a
  response, an error message, an audit row or the frontend.
* The model is used only when **all** hold: master switch on, AIR switch on, the customer has
  consented (`AirConsent`; the consent screen is Prompt 2), daily / monthly caps not reached, the
  monthly **spending cap** not reached (when it is, the master switch is turned off automatically
  and an audit row is written; the admin turns it back on), and the **circuit breaker** is closed
  (it opens after `breaker_failures` failures in a row for `breaker_cooldown_seconds`). On any
  failure, missing key, cap or switch-off the **deterministic behaviour** is used, silently.
* **Tool-calling orchestrator** (`air/llm/orchestrator.py`, `tools.py`). Tools:
  `get_services`, `get_free_slots`, `hold_slot`, `draft_booking`,
  `submit_booking_after_customer_confirm`, `my_requests`, `send_payment_link`, `handoff_to_desk`.
  Each has a JSON schema, a policy action and server-side validation. The model never touches the
  database. Ids are public UUIDs checked to belong to the current session's customer. At most **6
  tool calls per turn**. The model's claim that the customer confirmed is ignored: only the server's
  own `confirmed_hold_id` counts.
* **What the model sees**: the fixed system prompt (in code), the **redacted** current message
  (phone numbers, emails, card-like numbers and links removed, the customer's own name and email
  replaced, length capped to 300 characters), the slots collected so far (a short allow-list) and
  public service names. Never account data, other bookings, payments, chat history or photos.
* **Prompt injection**: customer text is data; requests to reveal prompts, keys or other customers'
  data, and off-topic requests, get a fixed refusal **without calling the model**; tool results are
  data and never instructions; unknown tools and unknown arguments are rejected.
* **Number checker** (`numbercheck.py`): reworded text may use only numbers, times, dates, prices
  and capitalised names that are in the structured result. Otherwise the fixed template text is
  used. Wording that promises discounts, refunds or free service, or says "confirmed / booked"
  without "only after payment", is also thrown away.

## 9. Action log fields (`AIActionLog`, append-only)

`id` (UUID), `created_at`, `actor` ("air"), `cover_period`, `channel` (chat / voice),
`session_id`, `action_type`, `status` (done / failed / handed_off / undone), `customer_ref`,
`booking_ref`, `order_ref` (nullable, used from Prompt 2), `before` and `after` (JSON, allow-listed
non-personal fields only), `reason_code`, `reversible_until`, `undo_of` (an undo is a **new row**
pointing at the original), `provider`, `model`, `latency_ms`, `estimated_cost_rupees`,
`input_hash`. Rows cannot be edited or deleted (`save`, `delete`, bulk `update` and bulk `delete`
all raise). Indexed by time, action type and customer. AIR can undo its own hold and unpaid
request inside the undo window; a **paid booking is never touched** (an `undo_refused` row is
written and it goes to the human refund flow).

## 10. Privacy

The log stores no names, emails, phone numbers, raw prompts or raw model output: only public ids and
a one-way hash of the redacted input. Customer personal data elsewhere stays in the existing
encrypted fields. The admin log endpoint returns exactly those fields. AIR reads only the current
customer's own requests (status and time), never another customer's, and never the stylist's private
decline reason.

## 11. How to run it

See the report for the exact Windows commands. In short: install dependencies (nothing new),
`python manage.py migrate` (creates `btree_gist`), run `python manage.py run_jobs` (or
`python manage.py expire_holds`) every minute, then in the admin settings switch **AIR** on.

## 12. Known limits

* The exclusion constraints guard `SlotHold` rows. Every booking AIR creates keeps a live hold
  (`confirmed`) until the visit is finished or cancelled, so AIR-path bookings are protected at the
  database level. Bookings made by people through the existing screens are still protected by the
  existing application locks and checks, not by a new constraint on the appointments table (adding
  one could break existing data and tests).
* The standard approval code still sends its own "your booking is confirmed, please pay" message when
  both sides accept; for AIR requests the customer also gets AIR's message, which states that
  confirmation happens only after payment.
* The Anthropic adapter has only been exercised with the network call replaced by a stub (no key or
  network here). Test it with a real key on your PC before relying on it.
* The cost shown is an estimate (a fixed rupee amount per provider call), not measured tokens.
* Redaction cannot recognise a name that is not the signed-in customer's, or unusual phone formats.
* Cover periods and hold expiry are exact only if the scheduler runs about every minute; otherwise
  they are corrected on the next read.
* The tests were run here on SQLite with a stand-in for the `cryptography` package; the tests that
  need PostgreSQL (the exclusion constraints and the simultaneous-request tests) were not run here.

## 13. AIR for customers (Task 2 of 3)

### 13.1 What the customer sees

The chat keeps its label **"AI Alankar Intelligence"** with the subtitle **"AIR · virtual
receptionist"**, and shows "AIR is covering the front desk right now" while cover is active. Quick
chips: Book a haircut, Today's free slots, Opening hours, My requests, My orders, Talk to a person
(guests get the general four). Replies can carry real slot chips, a booking summary card (service,
price including GST, duration, stylist, date and time, **Send request** / **Change**), an order card
(**Place order** / **Clear**), a confirm button for changes and cancellations, and a callback note.
Glass style, 320 to 1280 px, safe-area insets, reduced motion, `role="log"` with `aria-live`.

### 13.2 Two ways of understanding a message

* **Basic (rule-based, always available, no key):** `air/understand.py` reads intent, service (fuzzy
  and synonyms against the live catalogue, typo repair incl. swapped letters), day (today, tomorrow,
  day names, this/next, "next week", dd/mm, "5 Nov", "15th"; Asia/Kolkata), time (morning /
  afternoon / evening, after / before / around, exact), stylist (first names, "any") and products
  with quantity, in English, Hinglish and Telugu written in English letters. `air/dialog.py` asks one
  short question per missing piece, offers real free-time chips, and the nearest alternatives
  (`booking.nearest_slots`) when the wish is not free. It also handles inactive services, past dates
  and closed days.
* **AI mode (optional):** only when the master switch, the AIR switch AND the customer's consent are
  all on and the widget is not in basic mode. It uses the Task 1 orchestrator with `assist=True`.
  If the provider fails, is capped or every tool call fails, the rules answer instead. Replies whose
  wording came from the model carry a small "Wording by AI" tag.

### 13.3 Consent

First use shows: "Your messages are sent to an AI service to understand your request. Don't include
phone numbers, emails or payment details." with **Accept** and **Use basic mode**. Consent is stored
with its time and wording version (`AirConsent`), changes are audited (`air_consent_changed`), and
it can be withdrawn under Profile > Privacy: AI help in chat. Without consent the provider is never
called (tested).

### 13.4 Nothing happens from words alone

The model's tools only **propose** (a draft held in the chat session on the server). Only these
buttons act, each checked again by the server:

| Button | Endpoint | What it does |
|---|---|---|
| Send request | `POST /api/my/air/send-request/` | normal booking service with every check (active service, free slot, hours, stylist, rate limits, rating block) |
| Place order / Yes | `POST /api/my/air/confirm/` | places, changes or cancels only what the server is holding for that chat |

After Send request: during desk cover AIR accepts the **receptionist side** (logged); otherwise the
request waits for a person. The stylist has 15 minutes, then the 45-minute payment link; the booking
is confirmed only after payment. The assistant never says "confirmed" before that.

Reschedule and cancel: own unpaid requests, or paid bookings strictly inside the free-cancellation
window. Anything with fees, refunds or exceptions leaves a callback note instead.

### 13.5 Product orders

The existing shop was reused (`shop.Order`, `OrderLine`, the stock ledger, `shop.orders.place`,
`expire_due`). AIR adds `air/orders.py`: list (active, sold online, in stock), add to the next visit,
place, change quantity or remove before payment, and status (own orders only, customer words).
Per-order quantity cap: admin setting `max_order_quantity` (default 5). Stock moves under
`select_for_update` and never goes negative. An unpaid reservation ends no later than the AIR payment
link time. Paid or discounted orders, price changes, discounts, refunds and returns are refused and
handed to a person. Each step is logged in `AIActionLog` with the order, quantity and stock before and
after.

### 13.6 Talk to a person

The chat shows the shop phone and hours and stores a `CallbackNote` with a fixed wording (never the
chat text). Receptionists see open notes above the requests list (`/api/desk/callbacks/`) and mark
them done. Staff never get chat access; staff accounts get 403 from every AIR customer endpoint.

### 13.7 New endpoints and policy

`/api/air/chat/` and `/api/air/status/` (guests and customers, staff 403), `/api/my/air/send-request/`,
`/api/my/air/confirm/`, `/api/my/air/consent/` (customers), `/api/desk/callbacks/` and
`/api/desk/callbacks/<id>/done/` (receptionists). In `shared/policy.json`, `service_actors.air` gained
`customer_assist`: the actions AIR may take for a signed-in customer in their own chat without desk
cover (read services and free times, hold, send the request the customer pressed, own orders and
cancellations, callback). Accepting the receptionist side and payment links still need desk cover.

### 13.8 Measured accuracy (rule-based only)

`air/tests/eval_sets.py` holds 100 developer-written utterances (55 tuning, 45 holdout), scored by
`air/tests/test_eval.py` against the demo catalogue at a fixed time:

| Set | Result |
|---|---|
| Tuning (rules adjusted using it) | 54/55 = 98.2% (49/55 before tuning) |
| Holdout (never tuned on, measured once) | 41/45 = 91.1% |

These are not real customer messages. AI-mode accuracy has **not** been measured: run
`scripts\air_live_eval.py` with your own key (it prints accuracy on both sets, latency and an
estimated cost, and stops at `--max-rupees`).

### 13.9 Known limits (Task 2)

* Tuning miss kept as is: "hair colour" matches both Global Hair Colour and Root Touch-up (both
  catalogue entries carry the alias "colour"), so the chat asks which one.
* Holdout misses: "sat" as a short day name, "where's my parcel", "I don't want my booking anymore".
* The chat keeps its state (not the message text) in the server cache for 30 minutes.
* Stock races were tested on SQLite only; the real two-buyer race test needs PostgreSQL.
* The frontend unit tests and the Playwright test were written but not run here (see the report).
* Privacy risk in AI mode: redaction removes the customer's own name and email, phone numbers, card
  numbers and emails, but not other people's names or unusual formats typed by the customer.

## 14. AIR Activity page, statistics and the popup (Task 3 of 3)

### 14.1 Where the numbers come from

`backend/air/stats.py` counts everything from the database: the append-only `AIActionLog`, the
`AirRequestState` rows (which appointments AIR submitted), `Appointment`, `PaymentLink`,
`CallbackNote`, `Product` and `Order`. Nothing comes from a language model. A range is a window
[start, end) in Asia/Kolkata:

| Range | Start | End |
|---|---|---|
| `since_last` | the end of the user's last finished work session; for an admin (no work sessions) the sign-in before the current one; else midnight today. Never more than 30 days back | now |
| `today` | midnight today (IST) | now |
| `7d` | midnight 6 days ago (7 calendar days including today) | now |
| `30d` | midnight 29 days ago | now |

The **previous period** is the same length immediately before the start. Every KPI shows
`value`, `previous` and `change_pct` = (value - previous) / previous x 100, rounded to 0.1, or
none when previous is 0.

### 14.2 Metric definitions

"An AIR request" = an appointment with an `AirRequestState` row (AIR sent it after the customer
pressed Send request). Request counts use the time the state row was created; their outcome is
the appointment's status **now**.

| Metric | Exact definition |
|---|---|
| Conversations attended (chat / voice) | `AIActionLog` rows `action_type = "conversation"` in the window, split by `channel`. One row is written when a chat session starts (guests too; no text, no customer id for guests). There is no voice channel today, so voice is always 0. |
| Booking requests taken | AIR requests created in the window. |
| Desk side accepted by AIR | log rows `accept_reception` with status `done` in the window (only during cover). |
| Awaiting stylist | AIR requests from the window still `requested` with the stylist's answer neither accepted nor declined. |
| Accepted by stylist | AIR requests from the window with `stylist_status = accepted` (whatever happened after). |
| Declined | AIR requests from the window now `declined_by_stylist`, `declined_by_reception` or `rejected`. |
| Timed out | AIR requests from the window now `expired` (the stylist did not answer in time). |
| Payment links sent / paid / pending / expired | `PaymentLink` rows on AIR requests **created** in the window; paid / active / expired by their status now. |
| Confirmed (paid and scheduled) | distinct AIR appointments with a link **paid** in the window whose status is now scheduled, checked in, in progress or completed. |
| Product orders created / updated | log rows with status `done`: `create_product_order` (created); `update_product_order`, `cancel_product_order`, `add_product_to_booking` (updated). The KPI "orders" is the sum. |
| Units per product | quantities of `create_product_order` and `add_product_to_booking` rows per product; stock before = the first `stock_before` in the window, stock after = the last `stock_after`. Quantity changes are listed in the products panel, not added again. |
| Handed to a person | log rows with status `handed_off` in the window (callback notes, requests handed to the desk, refused money requests, order hand-offs, refused undo of a paid booking). |
| Handover rate | handed to a person / conversations x 100 (0.1), none when there were no conversations. |
| Actions by hour | every log row except `conversation` and `llm_turn`, by IST hour of day, typed: handed off (status) first, then booking, payment, order, other. |
| Stylist responses | per stylist (assigned, else held, else preferred) over AIR requests from the window: accepted, declined, timed out, waiting. |
| 7-day handover trend | the last 7 IST days (today included) regardless of the chosen range: conversations (chat, voice), handed off, rate. |
| Needs you (now, not limited to the range) | AIR requests waiting for the stylist (not handed to the desk); AIR requests handed to the desk and still in flight; AIR payment links expired in the last 7 days whose booking is `payment_expired`; open callback notes; and in the last 7 days log rows with reason `money_request`, `paid_booking`, `paid_order`, `discounted_order` or action `order_handoff` (shown as "refund requests"). There is no complaints feature in the app, so complaints are not a separate category: a customer who wants to complain uses "Talk to a person" (a callback note). Resolved items drop off. |
| Customers panel | customers named in log rows in the window: actions, booking requests, product actions, hand-offs, last time and what AIR did (counted labels). Names come from the account, never from the log. |

### 14.3 Claim, resolve and undo

* **Claim / resolve** (`POST /api/air/desk/needs/claim/` and `/resolve/`): one `NeedsYouState` row
  per item, locked while it changes, so two people never claim the same item (409 with the
  claimer's name). A booking item also takes the Prompt 1 request claim
  (`handover.claim_for_person`), so AIR never touches it again; both booking kinds share one row.
  Resolving a callback item marks the callback note done. Only the claimer (or the admin) may
  resolve a claimed item. Both are audited (`air_needs_you_claimed`, `air_needs_you_resolved`).
* **Undo** (`POST /api/air/desk/activity/<id>/undo/`): only AIR's own `hold_slot` (releases the
  hold) and `submit_booking_request` (cancels the unpaid request), only inside the undo window
  (`undo_window_minutes`), never a paid booking (409 `paid_booking`, logged as `undo_refused`).
  A person may undo outside desk cover; the undo row is `reason_code = undo_by_staff` and audited
  (`air_action_undone_by_staff`).
* **Phone numbers** are masked in the activity table (last four digits). Showing one calls
  `GET /api/air/desk/customers/<id>/phone/`, which is audited (`air_phone_revealed`).

### 14.4 Endpoints and permissions

`/api/air/desk/stats/`, `activity/`, `activity/<id>/undo/`, `needs/claim/`, `needs/resolve/`,
`customers/<id>/phone/`, `briefing/`: receptionist and admin only (policy actions
`air.desk.*`); customers, stylists and guests are refused (tested). AIR settings
(`/api/admin/air/settings/`, `cover/`, `usage/`) stay admin only; every settings change and every
cover override is audited (tested).

### 14.5 The page (AIR Activity, receptionist and admin sidebars)

Needs-you list on top (Open, Claim, Resolved), KPI tiles with the change against the previous
period (arrow and words, not colour only), charts drawn with Recharts: actions by hour stacked by
type; booking funnel (requests, desk side accepted by AIR, stylist accepted, link sent, paid) with
declined, timed out and expired beside it; payment links; stylist responses; conversations by
chat and voice with the 7-day handover-rate line; products updated (stock before and after).
Every chart has a sentence that states its numbers, a data table with the same numbers (and a
CSV download), and uses the Okabe-Ito colour-blind-safe colours (`--chart-cb-*` in
`design/index.css`); charts have no animation. The activity table has filters by type and
customer, masked phones, links to the booking or order and Undo. A customers panel and a products
panel follow. Admin only: an **AIR settings** tab with the AIR and master switches, request and
spending caps, usage and estimated cost (`/api/admin/air/usage/`), the cover override with a
reason, the stylist timeout (default 15 min), the payment-link expiry (default 45 min), the
quantity cap (default 5), the undo window, and "key configured: yes/no" (never the key).

### 14.6 The receptionist's popup (`frontend/src/components/air/Air.tsx`, `air-data.ts`)

* Opens by itself once per login session: the briefing carries `since` (the end of the previous
  session), the popup remembers the last `since` it showed (per user, in local storage) and opens
  again only for a new one. At most once per page load even with blocked storage. It waits while
  the guided tour is on screen. A small AIR button (bottom right, safe-area aware) reopens it.
* A dialog that does not block the app: no backdrop and no scroll lock; focus moves in and Tab
  stays inside while it is open; Escape or Close returns focus. Phones (640 px or less) get a
  bottom sheet with the safe-area inset. Reduced motion: no entrance animation, no typing dots,
  no float. The glass follows the app's reduce-transparency setting.
* It reuses the Meera tour's speech bubble (typing dots, word-by-word reveal), the dotted
  connector style and the float animation; Meera itself is unchanged.
* Poses: greeting = welcome; loading = thinking; reading aloud = explain; hovering or focusing
  "Open AIR Activity" = point-right; items that need you = attention; expired links or more
  declines than accepts = concerned; 3 or more paid = celebrate; some paid and nothing waiting =
  thumbs-up; otherwise report; nothing done = idle; "I have the desk" = handover; the cover banner
  on the page = on-call by day, sleep from 21:00 to 06:59 IST. A missing pose falls back to
  `air.webp`, then to the idle pose, then to a bell icon.
* Pictures: `frontend/public/photos/air/` (see docs/IMAGE_SLOTS.md). Fixed square box, width and
  height set, `object-contain` (never stretched), the 512 px copy in `srcset` once
  `npm run photos:optimize` has made it, the first pose preloaded. A picture with a plain
  background is framed in a circle.

### 14.7 The spoken briefing

`backend/air/briefing.py` fills a fixed template with counts from `air.stats` for "since your last
session": conversations, booking requests, desk side accepted, stylist accepted, declined or timed
out, links paid, links expired, product orders, handed off, items needing you. **Counts and
categories only: never a name, phone number, email, time or amount** (tested). The browser's own
`SpeechSynthesis` (voice `en-IN` where available) reads exactly the text on screen; nothing is
sent anywhere. It speaks by itself only if the receptionist has not muted it (remembered per user)
and the browser allows it; when speech does not start within 1.5 s the popup says so and shows
Play. Play/Pause and Mute are buttons; the full text is always visible. Limits: voices differ
by browser and operating system; some browsers (and all of them without a click first) refuse
to speak by themselves.

The optional AI service may reword the briefing **only** when the master switch is on and the caps
allow it; the reworded text is used only if it keeps exactly the same numbers (same digits, none
added, none dropped), passes the number checker and contains no name, link, email or long digit
run (tested); otherwise the template is shown. It is tagged "Wording by AI".

### 14.8 Other changes in Task 3

* The lifecycle now writes `create_payment_link` / `expire_payment_link` log rows (once per
  request) when a link on an AIR request is sent or expires, so the activity list and the hourly
  chart show them.
* The chat writes one `conversation` row per new chat session (no text).
* Chatbot entries: "What is AIR" and "How do I turn AIR off" (answered in the widget).
* The For Zenotians page describes AIR as built, optional and off by default, with its
  limitations (data migration `website/0008_zenotians_air` updates stored content, keeping admin
  edits). The phrase "no AI" is gone from the page, the README and the decision notes.

### 14.9 Known limits (Task 3)

* There is no voice channel and there are no phone calls: "voice" counts stay 0, and the only
  voice is the browser reading the popup text aloud.
* There is no complaints feature, so the needs-you list has no complaints category of its own.
* Statistics for long ranges are computed per request (no cache); fine for one shop, not
  measured under load.
* The AIR pictures supplied are not transparent (white background) and `air.webp` (the default)
  is missing; see docs/IMAGE_SLOTS.md.
* The frontend unit tests and the Playwright tests of this task were written but not run here.


## 15. Desk cover for requests from the normal booking form (bug fix)

**The bug.** While nobody was at the desk, a request made through the normal booking form stayed at
"Front desk: Waiting" even after the stylist accepted; AIR did nothing and logged nothing.

**Root causes (with evidence).**

1. `air/service.py: accept_reception` (and `handover.claim`) only worked on a request that had an
   `AirRequestState` row. That row was created only in `service.submit_booking`, i.e. only for
   requests AIR itself created in the chat. A form request (`scheduling/views.py:
   BookingRequestView`, `booking.create_request`) never got one, so AIR refused with
   `not_air_request`, silently.
2. Nothing ran after a form request was created or after the stylist accepted: the only triggers
   were the chat's own `submit_booking` and the hold-expiry job. There was no sweeper command and
   no job for desk cover.
3. AIR desk cover (`AirSettings.air_enabled`) is OFF by default (as designed) and nothing turned it
   ON for the demo or told the admin: no banner, no status.
4. Nothing wrote a log row when AIR looked at a request and did nothing (no reason was recorded
   anywhere), and a paid link left no log row.
5. Presence used the 15-minute idle limit; the spec is a 10-minute `presence_minutes` setting.

Checked and **not** causes: acceptance never depended on the language-model switches (`cover`
reads only `air_enabled`); the policy allow-list already had `air.reception.accept`; the claim lock
is inside `transaction.atomic()` so an exception rolls it back (a test proves nothing stays locked);
the shift check uses Asia/Kolkata; the force-ON override is honoured; the amount limit compares
rupees including GST (`amount_payable`) on both sides.

**The fix** (`backend/air/desk.py`, same server functions a receptionist uses, actor `air`):

* `air/signals.py` fires after every request is saved (form, shop, chat, stylist's answer) via
  `transaction.on_commit`; `air_cover_sweep` (also a `run_jobs` step) and a throttled lazy sweep
  when a receptionist loads the requests list do the same, so a request moves even if the scheduler
  is not running.
* Checks, each with a name (`check_failed:<name>`): `customer_active` (a blocked/inactive account),
  `service_active`, `unrated_visit`, `lead_time` (not past, at most 60 days ahead), `amount_limit`
  (at most Rs. 5000 including GST), `stylist_chosen` (an "any stylist" request needs a person to
  choose), `shop_hours`, `stylist_free` (no clashing booking, hold or offer: the request's own hold
  from `approvals.open_request` is taken under the stylist's row lock, exactly as the stylist's
  accept does). A failed check hands the request to the desk.
* Every look at a request writes one `AIActionLog` row (once per request and outcome, so a sweep
  every minute does not flood the log): `accept_reception` (done), `desk_cover_check` with status
  `skipped` (`switch_off`, `cover_inactive`, `claim_busy`, `policy_denied`), `handed_off`
  (`check_failed:<name>`) or `failed` (`error:<ExceptionClass>`, never the message). Errors are
  caught per request and never stop the sweep. A paid link now logs `payment_link_paid`.
* `AirRequestState` gained `source` (chat / form / desk) and `accepted_at`; a form request's
  customer confirmation is the form's own Send. AIR never answers for the stylist.
* Presence: `presence_minutes` (default 10). Demo data (`reset_demo`) switches desk cover ON; the
  migration default stays OFF; the admin AIR settings page shows a red banner when it is off.
* `python manage.py air_cover_diagnose [request_id]` (read only), `air_cover_sweep --verbose`,
  admin API `GET /api/admin/air/status/` and the "Desk cover status" box (cover on/off, active and
  why, last sweep, scheduler stale after 5 minutes, last error, waiting requests with reasons).
* The request card shows "Front desk: Accepted by AIR (covering the desk)" with the time.

Limits: the PostgreSQL race test (`test_two_threads_racing...`) is skipped on SQLite. A request
for "any stylist" always goes to a person. "Customer blocked" means the account is inactive (the
app has no separate block flag).

## 16. Who accepted my request, and sorry notes

### 16.1 Who gave the front desk's yes

Every booking request records its front-desk acceptance in three fields on `Appointment`:
`reception_actor` (`receptionist` or `air`), `reception_user` (the receptionist, **staff views
only**, empty for AIR) and `reception_accepted_at`. They are written by ONE function,
`scheduling.acceptance.record()`, which `approvals.reception_accept` calls. The receptionist's
Accept button and AIR's desk cover (`air.service.accept_reception` passes `by_air=True`) both go
through `reception_accept`, so the two paths cannot differ. The two other places where staff place a
booking themselves (`booking.confirm`, and a booking made at the desk) call `record()` too.

Migration `scheduling/0010_reception_acceptance` fills existing rows: accepted and the append-only
`AIActionLog` has a done `accept_reception` row for it -> `air` (time from the log); any other
accepted request -> `receptionist` (user from the history event, else `confirmed_by`).

### 16.2 The two labels (the only wording about who accepted)

| Actor | Label (`scheduling/acceptance.py`) |
| --- | --- |
| receptionist | Accepted by our front desk |
| air | Accepted by AIR, our virtual receptionist (the front desk was closed) |

AIR is never described as a person. The customer API (`/api/my/appointments/`) exposes only
`reception_actor`, `reception_label`, a `timeline` and a `sorry_note`. It never contains the
receptionist's name or id, `confirmed_by`, or a stylist's private decline reason. Staff views keep
what they showed before (`reception_by_air`, `reception_accepted_at`).

The label appears in: the appointments page timeline; the bell notification and email "The front
desk accepted your request" (`customer_front_desk_accepted`, sent when the front desk accepts first);
the "approved/confirmed" messages; and as the last line of **every** email about a request the front
desk accepted (`notifications.sorry.email_footer`, also used by `booking.email_customer`).

### 16.3 Sorry notes: one module, five parts

`notifications/sorry.py` holds the only wording of an apology. `notifications.templates.TEMPLATES`
imports it, so emails, simulated texts, bell notifications and the appointments page
(`scheduling/timeline.py: sorry_note`) always agree. Each message has five parts, in order:

1. **apology**: sincere, short, plain words.
2. **what**: what happened; no blame, no staff names, no private reasons.
3. **next**: what happens next.
4. **step**: the nearest free times (existing `booking.nearest_slots`) or "book again", plus how to
   reach us (phone from the website contact settings, else "contact our front desk").
5. **money**: only what the real flow does. Nothing charged: "Nothing has been charged." Payment
   kept for a moved booking: "Your payment stays valid for the new time." A refund request filed by
   `desk_cancel`: "We have asked our team to approve a refund of your online payment of Rs. X."
   Money held but no refund filed: "Our front desk will contact you about your payment." No amount,
   deadline or promise is ever invented.

Apology events (the salon caused it): stylist declines (`stylist_declined`), front desk cannot take
it (`reception_declined`), request times out (`timed_out`), payment link expired (`link_expired`),
salon-initiated move or stylist change by the admin, a receptionist or a stylist (`moved`,
`reassigned`), salon-initiated cancellation (`cancelled`). Only the stylist's FIRST name is used.
Good news (request received, front desk accepted, stylist accepted, payment link sent, paid,
confirmed) and changes the customer asked for are acknowledged politely and never apologise.
Emails are plain text and HTML (autoescaped), subject lines name the event, no tracking pixels,
simulated sending only.

### 16.4 The appointments page

`RequestTimeline` (an ordered list: Requested, Front desk accepted, Stylist accepted, Payment link
sent, Paid, Confirmed; every step has a text status, pending ones say "Waiting") and `SorryNote`
(the five parts, the nearest times as links into the booking form, a Book again button, the phone).
Nothing animates, so reduced motion needs nothing special. Declined, expired, payment-link-expired,
salon-rescheduled and salon-cancelled requests show the note; cancellations the customer made do not.

### 16.5 Chatbot

Two knowledge entries, "Who accepted my booking?" and "Why was my request declined or
rescheduled?", use the same labels and never reveal a private reason. Two small intents
(`who_accepted`, `why_declined`) route those questions to them; "do you accept cards" still goes to
payments. Published accuracy is
unchanged (130/143 and 67/91).

## 17. "Any stylist": AIR assigns a free stylist

`backend/scheduling/anystylist.py`. Rule-based and deterministic: it works with the language-model
layer OFF and whether or not a receptionist is on duty.

### 17.1 The option

Every stylist list a customer sees starts with "Any available stylist (AIR picks one who is
free)" (booking form; `frontend/src/config/anyStylist.ts`, backend `ANY_LABEL`). In the AIR chat
the customer simply does not name a stylist (or says "any"); the chat then uses the same order.

### 17.2 Assignment (when the request is created)

- Candidates: stylists shown to customers whose account is active and who offer the service
  (the existing service-stylist link), who work the whole visit (weekly hours), are not on
  approved time off, and have no clashing booking, pending request hold or waitlist offer. This
  is `approvals.check_stylist_free`. The salon has no buffer between visits, so none is added.
- Order: fewest bookings that day (booked visits plus pending request holds), then the higher
  average rating (submitted, counted ratings), then a stable order by id.
- Atomic: the request is created, the stylist chosen and their time held in ONE transaction;
  checking a stylist locks their row (`select_for_update`), so a second customer at the same
  moment waits and then sees the first one's hold. AIR chat holds additionally have the
  PostgreSQL exclusion constraint (section 4). If nobody is free, NO request is created and the
  answer is 409 with the nearest free times (the existing `nearest_slots`), "Any stylist" kept.
- The request then goes to that stylist exactly like a named-stylist request. The front-desk
  side works as before (receptionist on duty, or AIR in cover mode), and everything after (both
  accept, the 45-minute payment link, paid, scheduled) is unchanged.

### 17.3 Reassignment

- The assigned stylist declines, or does not answer within the stylist timeout (AIR setting
  `stylist_timeout_minutes`, 15): AIR offers the request to the next free stylist by the same
  rules, **at most 2 more times**, never to a stylist who already declined or did not answer.
  The front desk's yes is kept. The timeout is checked by `approvals.expire_requests` (lazily
  on reads and by the job runner), before the normal request expiry.
- Only when nobody can take it does the request end as before (declined or expired) with the
  shared sorry note and the nearest free times.
- A receptionist or the admin can give any waiting "Any stylist" request to another free
  stylist (Reassign, same checks, `desk.appointments.reassign` now also for the admin; API only
  for the admin, the button is on the receptionist's Appointments page). It is logged
  (history event, audit entry, the offer row with who did it).

### 17.4 Who sees what

- Customer (appointments page, emails): "Stylist: Asha, assigned by AIR" (first name, current
  stylist only). Never who declined or why. Chat card: "Asha, assigned by AIR".
- Staff: request cards say "Customer chose any stylist"; the receptionist's card has the
  assignment history (`stylist_offers`: who was offered it, by AIR or staff, and the outcome:
  waiting, accepted, declined, did not answer, moved by staff, request ended).
- `StylistOffer` (migration `scheduling/0011`) stores the history; `SlotHold.any_stylist`
  (migration `air/0005`) marks chat holds.
- AIActionLog rows: `stylist_auto_assigned` (reason `any_stylist`), `stylist_reassigned`
  (reason `declined` or `timed_out`), `no_stylist_free` (reason `no_stylist_free` or
  `reassign_limit`). AIR statistics and the popup summary add "stylists auto-assigned" and
  "reassignments" (counts only).

### 17.5 Limits

- Up to 3 stylists per request in total (the first one plus 2 reassignments).
- Each offer waits up to the stylist timeout, but never past the request's own deadline
  (10 minutes before the visit).
- The id tie-break is stable for a salon but not meaningful (ids are random), so equal stylists
  are effectively taken in a fixed order.
