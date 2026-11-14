# Personal recommendations

Plain counting rules over the shop's own booking history. No language model, no machine-learning
library, no third party. Code: `backend/recommendations/`.

## What the customer sees

| Where | What | Rule |
|---|---|---|
| Dashboard, "For you" | Up to 5 services, each with a plain reason | Scoring below; services already had, upcoming, "not interested" or excluded by the admin are left out; at most 2 per category |
| Dashboard, first card | "Rate your last visit" | Shown first whenever a rating is waiting |
| Dashboard, "Time to rebook" | Up to 3 services that are due, with 3 real free times | Due when days since the last visit reach the usual gap minus 3 days; the usual stylist when they offer the service |
| Notification and email | "Time to rebook X?" | `run_jobs` step `rebook_reminders`: at most one per customer, service and cycle (the cycle is the last visit's date), one per customer per run; the email copy only with marketing consent, outside quiet hours and the one-a-week limit |
| Booking sheet | "Add after" | Only when a service is often booked together with the chosen one AND the same stylist is free for it right after |
| Dashboard | Aftercare products | The team's picks for the category of the last visit, then products often bought with that service |
| Dashboard | Quieter times | The 3 open hours (one per day) with the fewest visits over the last 8 weeks |
| Chat | "What do you recommend?" | For a signed-in customer with recommendations on: due services first, then "For you" |
| AIR | Alternatives when a time is taken | The customer's usual stylist is offered first when free (only with recommendations on) |

## Scoring

Each signal is between 0 and 1; the score is the weighted sum (`engine.WEIGHTS`):

| Signal | Weight | Value | Reason shown |
|---|---|---|---|
| together | 0.35 | best lift / 3 over services the customer had, only with support >= 3 customers and lift >= 1.2 | "Often booked together with X" |
| similar | 0.20 | 1 same category, 0.4 same division, plus half the tag overlap | "Similar to X, which you had" |
| interest | 0.15 | 1 if the customer chose that category on their profile | "Matches your interest: X" |
| popular | 0.15 | bookings in the last 90 days / the most booked service | "One of our most booked services" (from 0.6) |
| rated | 0.15 | (average - 3) / 2, only with 3 or more ratings | "Rated 4.6 out of 5 by 12 guests" (from 4.0) |

Lift = P(B | A) / P(B) over customers. Usual gap = the customer's own median gap for that service
(2 or more visits), else the shop's median gap (3 or more repeat gaps), else 30 days (21 for the
Beauty Parlor). Gaps under 7 or over 180 days are ignored.

## What is never used

Gender, age, caste, religion, ethnicity or any other sensitive attribute; the service's
"audience" field; the customer's phone, allergies or preferences. The models do not hold the
sensitive attributes, and a test reads the code of the engine, the build and the reminders and fails
if any of those names appears (`test_the_engine_never_reads_sensitive_attributes`). Another test
changes a customer's private fields and checks the recommendations stay the same.

## Controls and privacy

- On by default. The first time the dashboard shows them, a one-time notice explains what is used
  and offers the switch ("Keep them" / "Turn off").
- The customer can switch them off on the dashboard or the profile, choose interests, and undo any
  "not interested". Switching off stops suggestions, rebook reminders, chat picks, AIR's preference
  and the personal email kinds. The change is audited.
- Admin page **Recommendations**: on/off for everyone, rebook reminders on/off, exclude services,
  pin one website offer above the suggestions, rebuild now.
- Only the customer's own data is used for their suggestions; nobody else can read them (tests for
  every role, including other customers and guests).

## Measuring

- Impressions (what was shown), clicks and "not interested" are stored per placement
  (`RecEvent`); no tracking pixels. A booking counts when the customer sent a booking request for
  that service within 7 days of the click.
- Offline evaluation (`build_recommendations`): the newest quarter of completed visits is the test
  period. The model is built only from visits before the cutoff and asked for 5 services for every
  customer who booked something new after it. Hit rate@5 (at least one hit) and precision@5 are
  compared with a popularity baseline (the 5 most booked services they had not had). Fewer than 5
  such customers is reported as "too few to measure".
- On the demo database the history includes 120 fictional "archive" guests with invented habits
  (`recommendations/demo.py`), so the numbers show that the pipeline works, not how it would do with
  real customers. The admin page and the command print the numbers of the database it ran on.

## Running it

```bat
cd backend
python manage.py build_recommendations
python manage.py run_jobs --only rebook_reminders
```

`reset_demo` adds the archive guests and runs `build_recommendations`. Run the build nightly (or
press Rebuild now on the admin page); the dashboard always uses the latest build plus the
customer's own live history.
