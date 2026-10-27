# salon-app

Public website + management platform for a unisex salon, spa and beauty parlor.
Brand names live only in `frontend/src/config/brand.ts` and `backend/core/brand.py`.
Rules: `CLAUDE.md`. Full plan: `docs/MASTER_NOTES.md`. Status: `docs/PROGRESS.md`.

## Stack

- `backend/`: Django 5 + DRF + Channels (Daphne) + drf-spectacular, PostgreSQL, pytest, ruff
- `frontend/`: React 18 + Vite + TypeScript + Tailwind, React Router, react-query, zod, vitest, eslint, prettier
- `docker-compose.yml`: PostgreSQL 16 for local development

## Prerequisites (Windows)

- Python 3.11 or newer (`py --version`)
- Node.js 20 or newer (`node --version`)
- Docker Desktop (for PostgreSQL), or a local PostgreSQL 16 install
- Git for Windows

## First-time setup (PowerShell, from the repo root)

```powershell
# 1. Environment files (then edit them: set the same DB password in both, and a secret key)
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
py -c "import secrets; print(secrets.token_urlsafe(50))"   # paste into SALON_SECRET_KEY

# Also generate the encryption key and paste it into SALON_FIELD_KEY in backend\.env
py -c "import secrets,base64;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"

# 2. Database
docker compose up -d db

# 3. Backend
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py create_admin --email you@example.com --name "Your Name"   # first admin (asks for a password)
python manage.py seed_demo   # demo services, prices, team, rooms, contact, hours, policies, FAQ (safe to re-run)
cd ..

# 4. Frontend
cd frontend
npm install
cd ..
```

Using Command Prompt (cmd) instead of PowerShell? Use `copy` instead of `Copy-Item`, activate the venv with `.venv\Scripts\activate.bat`, and run one command per line (cmd has no `#` comments and no `;` separator).

If PowerShell blocks `Activate.ps1`, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Without Docker

Install PostgreSQL 16, then in `psql` as the `postgres` user:

```sql
CREATE USER salon WITH PASSWORD 'your-password' CREATEDB;
CREATE DATABASE salon OWNER salon;
```

Put the same values in `backend/.env`. (`CREATEDB` lets pytest create its test database.)

## Run (two terminals)

```powershell
# Terminal 1: API on http://127.0.0.1:8000
cd backend; .\.venv\Scripts\Activate.ps1; python manage.py runserver

# Terminal 2: website on http://localhost:5173 (proxies /api to the API)
cd frontend; npm run dev
```

- Website: http://localhost:5173
- Health check: http://127.0.0.1:8000/api/health/
- API docs: http://127.0.0.1:8000/api/docs/
- Design system (dev only): http://localhost:5173/design-system
- Dev mailbox (dev only, simulated emails: invites, password resets): http://localhost:5173/dev/mailbox

## Accounts and roles

- Customers register at `/register`. Staff never register: the admin invites them from **Staff**
  (the invite email appears in the dev mailbox; its link lets them set a password).
- The first admin is created with `python manage.py create_admin --email ... --name "..."`.
- Sign in at `/login` with the matching role tab. A wrong tab gives the same error as a wrong password.
- Who can open which page and call which API is defined once in `shared/policy.json`
  (read by both the backend and the frontend). Anything not listed there is denied.
- Dev-only tools (mailbox, invite links) answer 404 unless `SALON_DEBUG=true`.

## Set up real email (Gmail, about 5 minutes)

Without this, emails are simulated: they are saved and shown on the dev mailbox. With it,
invites and password resets are really sent (a copy is still saved). Payment-link emails
use the same setup when they arrive in Task 2b.

1. On your Google account, turn on **2-Step Verification**.
2. In your Google Account security settings, search for **App passwords** and create one
   named "Alankar". You get a 16-character password. Never use your normal Google password.
3. Put these in `backend\.env` (the file is git-ignored; never commit it):

   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USE_TLS=true
   EMAIL_HOST_USER=your-gmail@gmail.com
   EMAIL_HOST_PASSWORD=the-16-character-app-password
   DEFAULT_FROM_EMAIL=Alankar <your-gmail@gmail.com>
   ```

4. Restart the API, then test it:

   ```
   cd backend
   .venv\Scripts\activate.bat
   python manage.py send_test_email --to some-other-email@gmail.com
   ```

   Check that inbox and the spam folder.

Notes:
- Gmail allows roughly 500 emails a day, enough for a demo. For a real launch switch to a
  dedicated email service later; only these settings change, not the code.
- Emails are sent after the database change is saved. If sending fails, the invite stays
  valid: the admin sees "Email could not be sent. Copy the link instead" with a Copy link
  button, and can use "Resend invite". Failures are recorded in the audit log (without links).
- With real email set up, invite links also work when SALON_DEBUG is false; the dev mailbox
  itself always stays debug-only.
- This is a normal email service; it has nothing to do with AI (the no-LLM rule is unaffected).
- Never share the app password. If you paste a log anywhere, remove that line first.

## Booking flow and expiry (Task 2b)

Customers send booking requests, the receptionist or admin confirms them (Appointments page),
and the customer pays with the mock gateway. Unpaid holds expire by themselves whenever
appointments are read; to also run it on a schedule: `python manage.py expire_payments`.

## Customer email code, invoices and ratings (Task 2c)

Customers confirm registration and every sign-in with a 6-digit emailed code
(`SALON_CUSTOMER_OTP=true` by default; set `false` to disable; it is skipped automatically when
no email delivery or dev mailbox exists). A visit is billed at the front desk in POS / Billing
(receptionist or admin); billing issues the invoice and the customer's rating request.
Optional reminder job: `python manage.py send_rating_reminders`.

## Checks

```powershell
# Backend (venv active, database running)
cd backend; pytest; ruff check .

# Frontend
cd frontend; npm test; npm run lint; npm run typecheck; npm run format:check; npm run build
```
