# Operations: timed jobs, backups, checks

All commands run from the `backend` folder with the virtual environment active
(Windows: `.venv\Scripts\activate`).

## Timed background work: one command
```
python manage.py run_jobs
```
Runs, in order: release unpaid slot holds, expire waitlist offers and windows, end lapsed memberships,
send due campaigns, send rating reminders, remove old one-time tokens (reset/code rows older than
7 days) and sign-in attempts older than 90 days. Audit logs are never removed.

- **Safe to run twice, or from two places at once.** Every step re-checks its own conditions under a
  database row lock and skips what is already done (tested in `core/tests/test_jobs.py` and the
  concurrency tests).
- If one step fails, the others still run and the command exits with an error (the log has details).
- `python manage.py run_jobs --only campaigns waitlist` runs just those steps.
- Schedule it every 5 minutes. Windows Task Scheduler: action `...\.venv\Scripts\python.exe`,
  arguments `manage.py run_jobs`, start in the `backend` folder. Linux: a cron line
  `*/5 * * * * cd /path/backend && .venv/bin/python manage.py run_jobs`.
- The site also does the urgent parts itself on every booking read (so a missed run only delays
  campaigns and reminders, it never double-books or loses a slot).

## Backup and restore
```
python manage.py backup_db            # writes backend\backups\alankar-YYYYMMDD-HHMMSS.dump
python manage.py restore_db backups\alankar-20261101-020000.dump --into alankar_restored
```
- Needs PostgreSQL client tools (`pg_dump`, `pg_restore`) on PATH, or `SALON_PG_BIN=C:\Program Files\PostgreSQL\16\bin` in `.env`.
- Restore always creates a NEW database and refuses the one the app is using. To switch to it, set
  `SALON_DB_NAME=alankar_restored` in `.env` and restart. The old database stays untouched.
- Backups hold customer data (contact details are encrypted inside the file with the field key, but
  keep the file private). `backend/backups/` and `*.dump` are git-ignored. Copy backups off this
  computer: a backup on the same disk does not survive a disk failure.
- Keep `SALON_FIELD_KEY` safe and separate: without it the encrypted fields in a restored backup cannot be read.
- Try a restore at least once (a backup you have never restored is a guess).

## Consistency check
```
python manage.py check_integrity
```
Read-only. Reports negative stock, negative gift-card / package / membership balances, refunds above
the amount paid, overlapping bookings for one stylist or room, invoices with money but no payment.
Exits with an error if any are found. Run it after a restore and before each payroll run.

## Production settings check
```
python manage.py deploy_check
```
See docs/SECURITY.md.

## How money and slots are kept correct
- Balances (stock, gift cards, package sessions) are ledgers: you only ever add rows, the balance is their sum.
- Every change that spends a balance locks the owning row first (`SELECT ... FOR UPDATE`), re-reads the balance inside the lock, then writes. Two people acting at the same moment: one succeeds, the other gets a clear refusal.
- The database also refuses impossible rows (negative prices or payments, refunds of zero or less, an appointment that ends before it starts, a zero-length appointment).
- Not added: a database-level "no overlapping bookings" rule. It needs a PostgreSQL extension (`btree_gist`) that normal database users cannot install. Overlaps are prevented by locking the stylist and room rows while confirming (tested with two desks at once) and `check_integrity` would report any that slipped through.
