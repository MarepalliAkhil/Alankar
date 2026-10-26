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

# 2. Database
docker compose up -d db

# 3. Backend
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
python manage.py migrate
cd ..

# 4. Frontend
cd frontend
npm install
cd ..
```

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

## Checks

```powershell
# Backend (venv active, database running)
cd backend; pytest; ruff check .

# Frontend
cd frontend; npm test; npm run lint; npm run typecheck; npm run format:check; npm run build
```
