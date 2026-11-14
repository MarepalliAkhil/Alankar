# Personal marketing emails

Campaign emails from the admin's **Marketing > Campaigns** tab, built on the recommendation system
(docs/RECOMMENDATIONS.md). Emails are simulated unless SMTP is configured; read them in the
developer mailbox (`/dev/mailbox`). Code: `backend/marketing/` (`campaigns.py`, `content.py`,
`limits.py`, `consent.py`, templates in `marketing/templates/marketing/`).

## Consent

- Registration has an **unticked** box; the profile has the same switch.
- Every change is stored append-only in `ConsentRecord`: opted in or out, the wording version
  (`consent.VERSION`, now `2026-11`), the source (registration, profile, unsubscribe page,
  one-click from a mail app, demo) and the time. Changes are also audited.
- Withdrawal: the unsubscribe page link and the one-click `List-Unsubscribe` /
  `List-Unsubscribe-Post` headers (RFC 8058) carry a signed token; no sign-in needed. A customer who
  withdraws after a campaign started is skipped by the next batch.
- The personal kinds also need personal recommendations to be on for that customer.

## Kinds

| Kind | Content | Sent only when |
|---|---|---|
| Your own message | The admin's text (and a coupon) | always |
| For you | 3 recommended services with their reasons | the customer has suggestions |
| Products for you | Aftercare products for the last visit | there are some |
| Time to rebook | Due services with 3 real free times | due, and not already emailed in this cycle (shared with the rebook reminder) |
| Most booked | The 3 most booked services in 90 days, with counts | something was booked |
| Highest rated | Services with 5 or more ratings, by average | at least one service has 5 ratings |
| Current offers | The active website offers | at least one offer is active |

A campaign whose content does not exist (no offers, too few ratings) cannot be sent; the panel says
why. A customer with nothing true to receive is skipped with the reason.

## Flow

1. Write a draft: name, kind, audience (all opted in, visited in 90 days, no visit in 90 days),
   subject, intro text, optional coupon.
2. **Preview** one customer's email (HTML and text), or pick a customer. Nothing is sent.
3. **Send a test** to your own address (subject marked `[Test]`).
4. **Approve and send** (or schedule; scheduling is the approval). The approver and time are kept.
5. The audience is copied into recipient rows and sent in batches of 100. `send_campaigns` (also
   `run_jobs`) starts due scheduled campaigns and continues any that are still sending.

## Limits

- Quiet hours: nothing is sent between 21:00 and 09:00 shop time (`SALON_MARKETING_QUIET_HOURS`,
  default `21,9`). A send in quiet hours waits ("sending") until the first run after 09:00; a
  schedule inside quiet hours is refused.
- At most one marketing email per customer in 7 days (`SALON_MARKETING_MIN_DAYS`, default 7),
  counting rebook reminder emails too. Skipped customers are listed by reason.
- Rebook emails at most once per customer, service and cycle.
- Idempotent: one row per campaign and customer; batches lock rows with `skip_locked`, so two
  runners never email anyone twice.

## Results (no tracking pixels)

Opens are not measured. Every link goes through `/api/public/c/<recipient>/?to=/path`, which counts
the click and redirects inside the app only (any other address goes to the home page). The results
show sent, waiting, skipped (with reasons), clicked, and booked: customers who sent a booking
request within 7 days of the email.

## Commands

```bat
cd backend
python manage.py send_campaigns
python manage.py send_campaigns --batches 1
```
