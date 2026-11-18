# Free deployment: Vercel + Render + Neon + cron-job.org

Costs nothing. The Docker / Azure setup in `docs/DEPLOY.md` is unchanged and still works; this is a
second way to run the same code.

**The field-encryption key (`SALON_FIELD_KEY`) must be NEW for this deployment and backed up
offline (password manager + a printed copy). Phones, allergies, notes and chat are encrypted with
keys derived from it. Losing it makes that data unreadable forever; a `pg_dump` backup does NOT
contain it. Use the same key on Render and on your PC (first run).**

## 1. Architecture

```
 Browser ── https://alankar.vercel.app ──> Vercel (free)
   |          /, /salon, ...   prerendered HTML (static heads), /assets/* cached 1 year
   |          /dashboard, ...  app.html          unknown paths: 404.html with HTTP 404
   |          /api/*  ── rewrite (same address, cookies stay first-party) ──┐
   |                                                                       v
   └── wss://alankar-api.onrender.com/api/ws/chat/<id>/?ticket=…  ──>  Render free web service
          (WebSockets cannot pass a Vercel rewrite: direct, with a        ONE Daphne process
           30-second single-use ticket from GET /api/ws-ticket/)          in-memory cache + channels
                                                                                 |  SSL
 cron-job.org ── GET /api/ping (14 min), POST /api/internal/tick (15 min),       v
                 POST /api/internal/nightly (02:30 IST)  ──> Render        Neon free PostgreSQL
```

- **Sign-in cookies** are set by Django but travel through the Vercel rewrite, so the browser
  stores them for the Vercel address (first-party). CSRF trusts `https://FRONTEND_DOMAIN`.
- **Chat**: the page asks `GET /api/ws-ticket/` (normal cookie session, customers and stylists
  only), then opens the socket on Render with `?ticket=`. The ticket is valid 30 seconds, works
  once, and only says who you are: the chat consumer still checks that you belong to that thread,
  exactly as before. Every reconnect fetches a new ticket. Local and Docker setups keep the cookie
  socket (no `VITE_WS_ORIGIN`).
- **Sleeping backend**: Render sleeps after 15 minutes without traffic and needs up to a minute to
  wake. The site then shows the logo loader with "Waking up the server, this can take up to a
  minute" and retries by itself (reads on 502/503/504 and timeouts; changes only on 502/503, which
  never reached Django). The cron-job.org ping every 14 minutes keeps it awake.
- **In-memory cache and channel layer**: correct here because the free plan runs exactly one
  instance with one Daphne process; rate limits, tickets and chat messages are all in that process.
  A restart only clears short-lived data. `deploy_check` lists these two facts as warnings and
  passes. Set `REDIS_URL` (for example Upstash free) before ever running a second instance; it is
  used automatically.
- **Database sleeping**: `/api/ping` makes no database or cache query, so Neon can suspend between
  jobs. Connections are never kept open (`conn_max_age 0`).

### Jobs without workers

| Endpoint | What runs | When |
|---|---|---|
| `POST /api/internal/tick/` | expire unpaid holds, AIR hold expiry, AIR cover sweep, booking-request reminders, waitlist offers, campaigns (quiet hours respected by the campaign job) | every 15 minutes |
| `POST /api/internal/nightly/` | end lapsed memberships, rebook and rating reminders, purge old rows, chat photo retention, build recommendations | 02:30 Asia/Kolkata |

Both need the header `X-Tick-Secret: <TICK_SECRET>` (compared in constant time), allow 20 calls an
hour per address, stop starting new jobs after 25 seconds and answer
`{"status": "nothing to do"}` when nothing was due. A missing or wrong header, or no `TICK_SECRET` on
Render, gets 403. They read no cookies, so the browser CSRF check does not apply to them.

**Correctness never depends on the tick.** Expired payment holds and booking requests are expired
on every read that shows them (`expire_due()` runs before the lists, the schedule and the booking
checks), so a late tick never lets anyone pay for or book a released slot. AIR acts when a request
is created and when a stylist accepts (database signals), and decides "cover" when it is asked. The
tick only sends the reminders and messages on time and tidies up.

### Photos without a disk

Render's disk is wiped on every deploy, so nothing is stored on it. Chat photos were already kept
encrypted inside PostgreSQL (shown only through the permission-checked chat views, unchanged), and
the admin's pictures are web addresses, not uploads. In free mode photos are also compacted before
they are stored: WebP, at most 1600 px on the long side and at most 300 KB, with limits on the
space used (`SALON_PHOTO_USER_MB`, default 20 MB per person, and `SALON_PHOTO_TOTAL_MB`, default
300 MB for the whole shop; a photo over a limit is refused with a clear message). Docker and Azure
keep the full-quality photos as before. `python manage.py cleanup_chat_photos` removes photos past
the retention period (the nightly job runs it too).

## 2. Environment variables

Generate every secret on your PC (`cmd.exe`, in the backend's `.venv`):

| Secret | Command |
|---|---|
| `SALON_SECRET_KEY`, `SALON_JWT_SIGNING_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `SALON_FIELD_KEY` (new, back it up offline) | `python -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"` |
| `TICK_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |

### Render (backend)

| Variable | Example (empty = fill it) | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings_free` | set by `render.yaml` |
| `FRONTEND_DOMAIN` | `` | Vercel host only, e.g. `alankar.vercel.app` (required) |
| `CUSTOM_DOMAIN` | `` | optional, host only |
| `DATABASE_URL` | `` | Neon connection string (required; `sslmode=require` added if missing) |
| `SALON_SECRET_KEY` | `` | required |
| `SALON_JWT_SIGNING_KEY` | `` | recommended |
| `SALON_FIELD_KEY` | `` | required, the same one used on your PC for the first run |
| `TICK_SECRET` | `` | required for the jobs (the same value goes into cron-job.org) |
| `REDIS_URL` | `` | leave empty on the free plan |
| `EMAIL_HOST` | `` | `smtp-relay.brevo.com` (Render free blocks ports 25/465/587) |
| `EMAIL_PORT` | `2525` | set by `render.yaml` |
| `EMAIL_USE_TLS` | `true` | set by `render.yaml` |
| `EMAIL_HOST_USER` | `` | your Brevo SMTP login |
| `EMAIL_HOST_PASSWORD` | `` | your Brevo SMTP key |
| `DEFAULT_FROM_EMAIL` | `` | a sender verified in Brevo |
| `AI_TEXT_PROVIDER` | `disabled` | AIR's optional AI stays off (docs/AIR.md) |
| `SALON_LOG_LEVEL` | `INFO` | |
| `SALON_PHOTO_USER_MB` / `SALON_PHOTO_TOTAL_MB` | `20` / `300` | optional |

Render sets `RENDER_EXTERNAL_HOSTNAME` and `PORT` itself. The app refuses to start without
`SALON_SECRET_KEY`, `SALON_FIELD_KEY`, `DATABASE_URL` or `FRONTEND_DOMAIN`, and names the missing
one in the log.

### Vercel (frontend, build time, all public)

| Variable | Example | Notes |
|---|---|---|
| `SITE_URL` | `` | `https://alankar.vercel.app` (canonicals, sitemap) |
| `VITE_WS_ORIGIN` | `` | `wss://alankar-api.onrender.com` (same host as the rewrite) |

Nothing secret ever goes into a `VITE_` variable: they are built into the public pages, and the
build refuses names that look like secrets.

## 3. Step by step

### Step 1: Neon (database)

1. neon.tech > sign up > New project: name `alankar`, PostgreSQL 16, region **AWS Asia Pacific
   (Singapore)** (next to Render).
2. Dashboard > Connect: copy the connection string (`postgresql://...neon.tech/neondb?sslmode=require...`).
   This is `DATABASE_URL`.
3. SQL editor: `CREATE EXTENSION IF NOT EXISTS btree_gist;` (the migration also tries this and
   stops with a clear message if it is refused).

### Step 2: first run from your PC

`first_run_free` migrates; loads the demo ONLY when the database has no bookings and no customers
(it refuses to reset a database with data); creates your admin from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` when no account with that email exists; then `seed_demo_extras`,
`seed_demo_coupons` and `build_recommendations`. Use `set "NAME=value"` with the quotes (the `&`
in the Neon address would otherwise break the line):

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app\backend"
.venv\Scripts\activate
set "DJANGO_SETTINGS_MODULE=config.settings_free"
set "SALON_SKIP_ENV_FILE=1"
set "DATABASE_URL=<Neon connection string>"
set "SALON_SECRET_KEY=<same as Render>"
set "SALON_FIELD_KEY=<same as Render>"
set "FRONTEND_DOMAIN=<your-project>.vercel.app"
set "ADMIN_EMAIL=<your email>"
set "ADMIN_NAME=<your name>"
set "ADMIN_PASSWORD=<a strong password>"
python manage.py first_run_free
set DJANGO_SETTINGS_MODULE=
set SALON_SKIP_ENV_FILE=
set DATABASE_URL=
set SALON_SECRET_KEY=
set SALON_FIELD_KEY=
set FRONTEND_DOMAIN=
set ADMIN_EMAIL=
set ADMIN_NAME=
set ADMIN_PASSWORD=
```

Closing the window also forgets them. Optional check, before the `set X=` lines:
`python manage.py deploy_check` (passes with 2 warnings: the in-memory cache and channel layer).

### Step 3: Render (backend)

1. Push the code to GitHub (`MarepalliAkhil/Alankar`, branch `main`).
2. render.com > New > **Blueprint** > connect the repository. Render reads `render.yaml`: one free
   Docker web service `alankar-api` in Singapore, built from `backend/Dockerfile`, start command
   `entrypoint.sh free` (migrate, then one Daphne on `$PORT`), health check `/api/ping/`.
3. Fill the variables Render asks for (table above). `FRONTEND_DOMAIN`: the Vercel address you
   will get in step 4 (you can pick the Vercel project name first, or fill it in later and redeploy).
4. Wait for "Live". Open `https://alankar-api.onrender.com/api/ping/` (your name may differ):
   `{"status": "ok"}`. Note this address: it is your **Render URL**.

### Step 4: Vercel (frontend)

1. **Paste the Render URL** in `frontend/vercel.json`, the first entry of `"rewrites"`:
   ```json
   { "source": "/api/:path(.*)", "destination": "https://YOUR-RENDER-SERVICE.onrender.com/api/:path" }
   ```
   Replace `YOUR-RENDER-SERVICE` with your service name (e.g. `alankar-api`). This is the only
   place the address is written (vercel.json cannot read environment variables); the build fails
   while the placeholder is still there. (`/api/:path(.*)` instead of `/api/:path*` so Django's
   trailing slashes are passed on.) Commit and push.
2. vercel.com > Add New > Project > import the repository. **Root Directory: `frontend`**. Vercel
   reads `vercel.json` (framework Vite, `npm run build:vercel`, output `dist`).
3. Environment Variables: `SITE_URL` and `VITE_WS_ORIGIN` (table above). Deploy.
4. If the Vercel address differs from `FRONTEND_DOMAIN` on Render, fix it on Render (Environment >
   save; it redeploys).

`vercel.json` also: serves the prerendered page of each public route, sends every signed-in area
(`PRIVATE_PREFIXES` in `src/seo/seo-data.js`) to `app.html`, answers unknown paths with the
designed `404.html` and HTTP 404, redirects `/zenotians...` to `/for-zenotians...` (301), sets
HSTS, nosniff, Referrer-Policy, `frame-ancestors 'none'` and a CSP that allows
`wss://*.onrender.com`, caches `/assets/*` for a year and checks HTML every time.

### Step 5: cron-job.org (jobs)

Sign up, then Create cronjob three times (time zone **Asia/Kolkata** in the settings):

| Title | URL | Method | Schedule | Header |
|---|---|---|---|---|
| keep awake | `https://alankar-api.onrender.com/api/ping/` | GET | every 14 minutes | none |
| tick | `https://alankar-api.onrender.com/api/internal/tick/` | POST | every 15 minutes | `X-Tick-Secret: <TICK_SECRET>` |
| nightly | `https://alankar-api.onrender.com/api/internal/nightly/` | POST | daily 02:30 | `X-Tick-Secret: <TICK_SECRET>` |

Call the jobs on the Render address directly (not through Vercel). Set the request timeout to 30
seconds (the first call after a sleep can be slow). A 403 means the header is wrong or `TICK_SECRET`
is not set on Render.

## 4. Updating

Push to `main`: Render rebuilds and migrates on start; Vercel rebuilds the site. New migrations run
automatically. If a deploy fails, Render keeps the previous version live; Events > Rollback.

## 5. Backup (manual, from your PC)

Install the PostgreSQL 16 client tools (only "Command Line Tools" in the installer), then:

```bat
set "PGURL=<Neon connection string>"
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" --format=custom --no-owner --file "%USERPROFILE%\Documents\alankar-%DATE:~-4%%DATE:~3,2%%DATE:~0,2%.dump" "%PGURL%"
set PGURL=
```

Restore into an empty database with `pg_restore --no-owner --dbname "<url>" <file>`. Keep
`SALON_FIELD_KEY` with the backups (separately): a restore is useless without it. Neon also keeps
a short history (point-in-time restore) on the free plan.

## 6. Free-tier limits and what happens

| Service | Limit | When it runs out |
|---|---|---|
| Render web service | 512 MB RAM, 0.1 CPU, 750 instance hours a month, sleeps after 15 min idle, ~1 min to wake, disk wiped on deploy, no SMTP ports 25/465/587 | Pinging every 14 min uses ~744 h, just inside 750; over it the service is suspended until next month (the site shows the waking loader, then errors). Slow first request after a sleep. |
| Neon | 0.5 GB storage per project (free plan; 1 GB in older plans), compute suspends after 5 min idle, 100 compute-unit hours a month (0.25 CU ≈ 400 h) | Ticks wake it every 15 min for a few minutes (~60 CU-hours a month). Over the hours: the database is suspended until next month. Over storage: writes fail; delete old demo data or chat photos. |
| Vercel Hobby | 100 GB bandwidth, non-commercial use | Site paused until next month. |
| cron-job.org | free, 30 s timeout per call | A missed call only delays reminders (see "Correctness"). |
| Brevo | 300 emails a day | Further codes and reminders wait until the next day. |

Check the current limits on each provider's pricing page before relying on them.
