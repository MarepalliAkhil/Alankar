# Load test

How to find out how many people the server handles at once. **Run it only on your own computer, against the throw-away database below. Never point it at a real or public site, and never run it against a database with real data.**

This is a measuring tool only. Nothing in the app was changed for it, and no number from it appears on the website or on the Limitations page.

Measured on: `<date>` with `<hardware: CPU model, cores, RAM, Windows version, Postgres version, Python version>`  (fill in after a run)

## What is in `backend/loadtest/`

| File | What it is |
|---|---|
| `locustfile.py` | The test. Simulated people sign in through the real sign-in endpoints and use the site. About 70% customers, 15% reception, 5% stylists, 10% admin; 3 to 10 seconds of thinking time between actions. Includes a live-chat (WebSocket) scenario. Ends with a verdict line and exit code 1 when over the limits. |
| `seed_loadtest.py` | Builds the throw-away database `alankar_load` with the app's own commands (`migrate`, `flush`, `seed_demo`) and 300 customers, 3 receptionists, 1 stylist and 1 admin. Refuses any database whose name does not end in `_load`. |
| `requirements-loadtest.txt` | Locust and websocket-client. Only for this test. |

## 1. One-time setup (cmd.exe)

Open a **new** Command Prompt. Run the commands one by one.

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app\backend"

rem a separate environment for the load-test tool, so the app's own packages stay untouched
python -m venv .venv-loadtest
.venv-loadtest\Scripts\activate
pip install -r requirements.txt
pip install -r loadtest\requirements-loadtest.txt
```

PostgreSQL must be running (the same server the app already uses). The environment variables below are for this window only; close the window afterwards. Use your own Postgres password and a field key:

```bat
set SALON_DB_NAME=alankar_load
set SALON_DB_USER=salon
set SALON_DB_PASSWORD=YOUR_POSTGRES_PASSWORD
set SALON_DB_HOST=localhost
set SALON_FIELD_KEY=<the same value as SALON_FIELD_KEY in backend\.env>
set SALON_DEBUG=false
set SALON_SSL_REDIRECT=false
set SALON_ALLOWED_HOSTS=localhost,127.0.0.1
rem Rate limits are per address; every simulated person comes from this one computer, so lift them for this test only:
set SALON_ANON_RATE=1000000/min
set SALON_USER_RATE=1000000/min
set SALON_AUTH_RATE=1000000/min
set SALON_BOOKING_RATE=1000000/min
set SALON_PUBLIC_WRITE_RATE=1000000/min
```

What these do: `SALON_DEBUG=false` makes the server behave like production (with `true` Django keeps every SQL query in memory and the numbers would be too pessimistic). `SALON_SSL_REDIRECT=false` lets plain `http://127.0.0.1` work. The rate-limit variables are existing settings; without them the first few simulated people would hit "429 Too Many Requests" and the test would measure the limiter, not the server. **Do not use these values anywhere but here.**

Customer sign-in: the emailed code step is only active when email is configured (or in debug mode). In this window no email is configured and debug is off, so customers sign in with their password. That is the app's own setting; nothing is bypassed. If the server does ask for a code, the test stops and says so; remove `EMAIL_HOST` from the environment of this window (or set `SALON_CUSTOMER_OTP=false`) and run again.

Build the database (takes a few minutes; passwords are hashed slowly on purpose):

```bat
python loadtest\seed_loadtest.py
```

## 2. Start the server (Daphne, because of the live chat)

In a second Command Prompt, set the **same** variables as above, then:

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app\backend"
.venv-loadtest\Scripts\activate
daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Check it answers: open `http://127.0.0.1:8000/api/health/` in a browser.

## 3. Run the steps

Each step is 3 minutes, starting 10 new users per second until the target number is reached, then holding. Use the first window. `results\` is created for you by the first command.

```bat
mkdir results 2>nul
locust -f loadtest\locustfile.py --host http://127.0.0.1:8000 --headless -u 25  -r 10 -t 3m --csv results\u25
locust -f loadtest\locustfile.py --host http://127.0.0.1:8000 --headless -u 50  -r 10 -t 3m --csv results\u50
locust -f loadtest\locustfile.py --host http://127.0.0.1:8000 --headless -u 100 -r 10 -t 3m --csv results\u100
locust -f loadtest\locustfile.py --host http://127.0.0.1:8000 --headless -u 200 -r 10 -t 3m --csv results\u200
locust -f loadtest\locustfile.py --host http://127.0.0.1:8000 --headless -u 300 -r 10 -t 3m --csv results\u300
```

Prefer a page with live charts? Run `locust -f loadtest\locustfile.py --host http://127.0.0.1:8000` and open `http://localhost:8089`.

Each run prints a line like `VERDICT: p95 212 ms (limit 500), errors 0.00% (limit 1%) -> WITHIN the limits`. Between steps give the server a minute to settle (or restart Daphne).

## 4. Results (fill in after the run)

Measured on `<date>` with `<hardware>`.

| Simulated users | Requests/s | Median (ms) | p95 (ms) | p99 (ms) | Errors (%) | Within the limits? | Server CPU / RAM |
|---|---|---|---|---|---|---|---|
| 25 | | | | | | | |
| 50 | | | | | | | |
| 100 | | | | | | | |
| 200 | | | | | | | |
| 300 | | | | | | | |

The numbers come from `results\u*_stats.csv` (the "Aggregated" row). Watch CPU and RAM of the Daphne and Postgres processes in Task Manager while a step runs.

## 5. What "capacity" means here

**Capacity is the highest number of simulated users at which, over the whole 3-minute step, the p95 response time is under 500 ms and fewer than 1% of requests fail.** The first step that breaks either limit is where the server is "full"; the step before it is the capacity. It is a number for one computer, one database, this mix of actions and this think time. It is not a promise about any other setup, so never quote it as one.

## 6. Reading the results: likely bottlenecks

Look at the slowest rows in `results\u*_stats.csv` first. Things that can limit a run, checked against the code:

- **Password hashing at sign-in.** The server hashes slowly on purpose, so `auth login` is expensive. With 300 users starting at 10 per second it is the first thing to look at; it only happens once per user. If sign-in time dominates, that is the design working, not a fault.
- **One server process.** The chat uses `InMemoryChannelLayer` (`config/settings.py`), which only works inside a single process, so Daphne is run as one process here. Real traffic beyond one core needs a shared channel layer (Redis) first; that is a change to the app and is not done by this test.
- **Database.** A busy `booking slots` or `desk schedule` row usually means the query is doing a lot of work: look at Postgres `pg_stat_statements` or the slow-query log while a step runs.
- **Local computer.** The test tool, Daphne and Postgres all share one machine. When total CPU hits 100% the numbers say more about the computer than the app. Closing other programs helps; so does running the tool on a second computer pointed at the first one's address (then add that address to `SALON_ALLOWED_HOSTS`).
- **WebSocket scenario.** The live-chat steps only run for accounts that already have a chat thread (a customer and a stylist with a past visit together). The seeded demo may have none; then the scenario skips quietly and the `WS` rows are missing. Open one conversation with a thread, or add one by hand, before the run if you want them.
- **Throttles.** If you see many `429` errors, the rate-limit variables in step 1 were not set in the **server's** window.

## 7. Clean up

Close both Command Prompt windows (the variables disappear). To remove the database: `psql -U salon -c "DROP DATABASE alankar_load"`. The `results\` folder holds only numbers; delete it when you like. Nothing here touches the main `salon` database.
