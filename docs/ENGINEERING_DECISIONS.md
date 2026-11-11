# Engineering decisions

These notes used to be a public page on the For Zenotians site. They are private documentation now (the public section was removed on 2026-11-07). Each one says why, and where to find it in the code.

## 1. One policy file for every role

Menus, pages and API actions for the four roles come from a single JSON file that both the front end and the server read. An endpoint with no known action is denied. Hidden actions are removed, not just disabled, and tests walk every endpoint as a guest and as each role, including direct API calls with other people's ids.

Where: `shared/policy.json`, `backend/core/policy.py`, `frontend/src/policy/policy.ts`, `backend/core/tests/test_sweep.py`

## 2. Two yeses, and no double booking

A request holds the stylist's slot while the front desk and the stylist each answer; each accept re-checks the slot under a database row lock, and the booking is confirmed only when both have said yes. Creating or moving a booking is one transaction with an overlap check; a clash returns 409 with the three nearest free times. The booking table has no database exclusion rule, so row locks and a read-only integrity check do the job there; two desks acting at once are tested. AIR's slot holds are the exception: they carry PostgreSQL exclusion constraints (stylist and customer overlap), which need the `btree_gist` extension created by AIR's first migration.

Where: `backend/scheduling/approvals.py`, `backend/scheduling/booking.py`, `backend/billing/tests/test_concurrency_8b.py`, `backend/core/integrity.py`

## 3. Encrypted fields you can still search

Sensitive fields are stored as AES-GCM ciphertext tied to their column. Phone search uses a keyed hash (a blind index), so the number itself is never stored in the clear. Chat messages and photos use a key derived per conversation.

Where: `backend/core/crypto.py`, `backend/core/fields.py`, `backend/chat/models.py`

## 4. Immutable invoices and a stock ledger

A paid invoice is never edited; a correction is a refund that the admin approves. Stock is a ledger of movements, so every quantity can be explained from its history.

Where: `backend/billing/models.py`, `backend/billing/refunds.py`, `backend/inventory/models.py`

## 5. Deterministic algorithms first; AI only as an optional extra

Everything works with deterministic algorithms: no machine-learning library, and with the default settings no outside AI service. The chatbot's engine is a rule program over the shop's own data. AIR, the optional virtual receptionist (off by default), can additionally send a customer's redacted message to a third-party language-model provider, but only when the admin switches it on with a key, under request and spending caps, and only for customers who agreed; the rules take over whenever it is off or fails, and the model can only propose, never book or pay (docs/AIR.md). On questions I wrote myself it got 130 of 143 right (90.9%) on the set I tuned it against and 67 of 91 (73.6%) on a holdout set; real customers will phrase things differently, so expect lower in practice.

Where: `backend/chatbot/engine/`, `backend/chatbot/tests/test_accuracy.py`, `docs/CHATBOT_ALGORITHM.md`

## 6. Everything that changes is audited

Sign-ins, price and role changes, refunds, invites, exports, rating exclusions, payroll steps and content publishing each write an audit entry that admins can read. Audit entries are never removed by the clean-up job.

Where: `backend/accounts/audit.py`, `backend/accounts/models.py`, `backend/core/jobs.py`

## 7. A remembered device that cannot be replayed

A customer can skip the emailed code for 30 days on one browser. The browser holds a random 256-bit token; the server keeps only its hash and rotates it on every use, and an old token coming back cancels that device. It skips the emailed code and nothing else: the password is always checked first and sensitive actions ask for a fresh code.

Where: `backend/accounts/trusted.py`, `backend/accounts/stepup.py`, `backend/accounts/tests/test_trusted_devices.py`
