# Production deployment (Azure for Students)

A free alternative (Vercel + Render + Neon + cron-job.org) is in `docs/DEPLOY_FREE.md`; it uses the
same code and leaves everything here unchanged.

One small always-on VM runs four containers with Docker Compose; the database is a separate,
managed Azure Database for PostgreSQL. Images are built on your PC or by GitHub Actions and pulled
by the VM, which never runs a heavy build.

**The field-encryption key (`SALON_FIELD_KEY`) must be backed up offline (a password manager and a
printed copy in a safe place). Phones, allergies, notes and chat are encrypted with keys derived
from it. Losing it makes that data unreadable forever, and database backups do NOT contain it.**

## 1. Architecture

```
            Internet (HTTPS 443, HTTP 80 -> redirect)
                               |
        +----------------------------------------------+
        |  Azure VM  (Ubuntu 24.04, B-series, 1 GB RAM + 2 GB swap)
        |                                              |
        |  web (Caddy + built frontend)   128 MB       |
        |    /            prerendered pages, app.html  |
        |    /assets/*    hashed files, 1 year cache   |
        |    /static/*    Django static (volume)       |
        |    /api/*, /ws/*  ----------------+          |
        |                                   v          |
        |  backend (Daphne, one ASGI process)  400 MB  |---- SSL ----> Azure Database for
        |    HTTP API + chat WebSockets               |               PostgreSQL Flexible
        |  scheduler (same image, timed jobs) 320 MB  |---- SSL ----> Server (B1ms, "alankar")
        |  redis (cache + channel layer)       96 MB  |
        |                                              |
        |  volumes: caddy-data (certificates), static, media; /var/backups/alankar (host)
        +----------------------------------------------+
   GitHub: CI (tests) and Images (build, push to ghcr.io) -> the VM pulls by tag
```

Frontend and backend share one domain, so the sign-in cookies, CSRF and CORS stay simple.

Files: `docker-compose.prod.yml`, `docker-compose.local.yml`, `backend/Dockerfile`,
`frontend/Dockerfile`, `deploy/caddy/Caddyfile`, `scripts/deploy/*.sh`,
`backend/config/settings_production.py`, `.env.production.example`,
`.env.production.local.example`, `.github/workflows/ci.yml`, `.github/workflows/images.yml`.

## 2. Local test (Windows, Docker Desktop)

The whole production stack on your PC over plain HTTP on http://localhost:8088, with a local
PostgreSQL container (profile `localdb`) instead of Azure.

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app"
copy .env.production.local.example .env.production.local
notepad .env.production.local
```

Fill `SALON_SECRET_KEY`, `SALON_JWT_SIGNING_KEY`, `SALON_FIELD_KEY` (commands in the file),
`LOCALDB_PASSWORD` and the same password inside `DATABASE_URL`, and an `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. Then:

```bat
docker compose --env-file .env.production.local -f docker-compose.prod.yml -f docker-compose.local.yml --profile localdb config --quiet
docker compose --env-file .env.production.local -f docker-compose.prod.yml -f docker-compose.local.yml --profile localdb up -d --build
docker compose --env-file .env.production.local -f docker-compose.prod.yml -f docker-compose.local.yml --profile localdb ps
docker compose --env-file .env.production.local -f docker-compose.prod.yml -f docker-compose.local.yml --profile localdb exec backend /app/deploy/first_run.sh
curl http://localhost:8088/api/health/
start http://localhost:8088
```

The first build takes several minutes. Logs:
`docker compose --env-file .env.production.local -f docker-compose.prod.yml -f docker-compose.local.yml --profile localdb logs -f backend`.
Stop: the same command with `down` (add `-v` to delete the local database too).

In the local test emails are simulated and the customer email code is off (no SMTP), and
`deploy_check` reports the HTTP-only settings as errors: that is expected only here.

Check that the production file is valid without the local parts (it needs an env file):

```bat
copy .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

(`config` complains if `DOMAIN` or `SITE_URL` is empty; fill them first.)

## 3. How the images are built and pulled

Two images on GitHub Container Registry (lowercase names):

- `ghcr.io/marepalliakhil/alankar-backend:<tag>`: Python 3.12, Daphne, PostgreSQL 16 client
  tools, non-root user. Also runs the scheduler (`manage.py run_scheduler`).
- `ghcr.io/marepalliakhil/alankar-web:<tag>`: Caddy 2.8 with the built frontend. The build needs
  `SITE_URL` (the prerendered pages, canonical links and sitemap contain it).

**GitHub Actions** (`images.yml`) builds both on every push to `main` (and by hand: Actions >
Images > Run workflow), for linux/amd64, tagged with the commit SHA and `latest`. It uses the
built-in `GITHUB_TOKEN` (`packages: write`) and never deploys. Set the repository variable
`SITE_URL` first: GitHub > Settings > Secrets and variables > Actions > Variables > New repository
variable, `SITE_URL` = `https://alankar-akhil.centralindia.cloudapp.azure.com` (optional
`VITE_BUSINESS_*` variables fill the business details).

**From your PC** instead (Docker Desktop, a GitHub personal access token with `write:packages`):

```bat
cd /d "C:\Users\akhim\Downloads\salon-app-starter-kit (1)\salon-app\salon-app"
docker login ghcr.io -u marepalliakhil
docker build --platform linux/amd64 -f backend/Dockerfile -t ghcr.io/marepalliakhil/alankar-backend:v1 .
docker build --platform linux/amd64 -f frontend/Dockerfile --build-arg SITE_URL=https://alankar-akhil.centralindia.cloudapp.azure.com -t ghcr.io/marepalliakhil/alankar-web:v1 .
docker push ghcr.io/marepalliakhil/alankar-backend:v1
docker push ghcr.io/marepalliakhil/alankar-web:v1
```

`ci.yml` runs on every push and pull request: backend tests against PostgreSQL 16 (btree_gist is
included in the official image), ruff, missing migrations, frontend lint, typecheck, format,
vitest and the build. It uses no secrets.

## 4. Azure for Students setup (portal)

1. **Budget alert first.** Cost Management > Budgets > Add: scope your subscription, amount
   USD 10 per month, alerts at 50%, 80% and 100% to your email.
2. **Resource group**: Resource groups > Create, name `alankar-rg`, region **Central India**
   (or the closest region that offers the free VM size).
3. **VM**: Virtual machines > Create > Azure virtual machine.
   - Image: **Ubuntu Server 24.04 LTS - x64 Gen2**. Size: a free-eligible B-series size shown
     with the "free services eligible" label (usually **Standard_B1s**, 1 vCPU, 1 GB RAM).
   - Authentication: **SSH public key** (create a new key pair and keep the downloaded .pem),
     username `azureuser`.
   - Disk: Standard SSD, 30 GiB (P4/E4 is within the free disk allowance for 12 months).
   - Networking: new virtual network; **public IP: create new, SKU Standard, assignment Static**.
   - Public inbound ports: none here (the rules come in step 5).
4. **DNS name**: open the public IP resource > Configuration > DNS name label `alankar-akhil` >
   Save. The address becomes `alankar-akhil.centralindia.cloudapp.azure.com` (the region is part
   of it). This is `DOMAIN`.
5. **Network security group** (VM > Networking > Network settings):
   - Allow TCP **22** from **My IP address** only (Source: IP addresses, your current public IP).
   - Allow TCP **80** and **443** from Any (Let's Encrypt and visitors).
   - Optionally UDP 443 (HTTP/3).
6. **PostgreSQL**: Azure Database for PostgreSQL flexible servers > Create.
   - Workload: Development. Compute: **Burstable, Standard_B1ms**. Storage: **32 GiB**,
     **storage autogrow: off**. PostgreSQL version **16**. High availability: off. Backups: 7 days.
   - Authentication: PostgreSQL authentication only; admin user `alankaradmin` with a strong
     password (`python -c "import secrets; print(secrets.token_urlsafe(24))"`).
   - Networking: **Public access (allowed IP addresses)**, add a firewall rule with **only the VM's
     public IP** (start and end the same). Do not tick "Allow public access from any Azure service".
   - SSL is required by default (`require_secure_transport` ON): keep it.
7. **Allow-list btree_gist**: the server > Server parameters > search `azure.extensions` > tick
   **BTREE_GIST** > Save. Without it the first `migrate` stops with a message saying so.
8. **Database**: the server > Databases > Add > name `alankar`.
9. `DATABASE_URL` =
   `postgresql://alankaradmin:<percent-encoded password>@<server>.postgres.database.azure.com:5432/alankar?sslmode=require`
   (percent-encode the password with the command in `.env.production.example`).

## 5. Server setup (SSH into the VM)

```bash
ssh -i alankar_key.pem azureuser@alankar-akhil.centralindia.cloudapp.azure.com
sudo timedatectl set-timezone Asia/Kolkata
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades          # answer Yes
# 2 GB swap (the VM has 1 GB RAM)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
# Firewall (the Azure NSG is the first layer, ufw the second)
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443 && sudo ufw --force enable
# Docker Engine and the compose plugin (official repository)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker azureuser && newgrp docker
docker compose version
sudo mkdir -p /var/backups/alankar && sudo chown 10001:10001 /var/backups/alankar
```

(The backup folder belongs to the user id 10001 the backend image runs as.)

**Deploy key for the private repository** (read-only, this repository only):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/alankar_deploy -N "" -C "alankar-vm"
cat ~/.ssh/alankar_deploy.pub
```

GitHub > the repository > Settings > Deploy keys > Add deploy key: paste it, **do not** tick "Allow
write access". Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/alankar_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
sudo mkdir -p /opt/alankar && sudo chown azureuser /opt/alankar
git clone git@github.com:MarepalliAkhil/Alankar.git /opt/alankar
```

**Log in to GitHub Container Registry with a read-only token**: GitHub > Settings > Developer
settings > Personal access tokens > Tokens (classic) > Generate, scope **read:packages** only,
expiry 90 days (renew it later). On the VM:

```bash
echo '<the token>' | docker login ghcr.io -u marepalliakhil --password-stdin
```

(Or make the two packages public on GitHub > your profile > Packages, then no login is needed.)

## 6. Fill .env.production

```bash
cd /opt/alankar
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Every variable is explained in the file, with the command that generates each secret. Required:
`DOMAIN`, `SITE_URL`, `SALON_SECRET_KEY`, `SALON_FIELD_KEY`, `DATABASE_URL`, and the email block
(sign-in codes need real email; Gmail with an App Password works). The settings refuse to start
when a required variable is missing.

## 7. First launch

```bash
cd /opt/alankar
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend   # Ctrl+C to leave
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python manage.py deploy_check --strict
curl https://alankar-akhil.centralindia.cloudapp.azure.com/api/health/
```

The backend waits for the database and Redis, runs `migrate` and `collectstatic`, then starts.
Caddy gets the Let's Encrypt certificate on the first HTTPS request (ports 80 and 443 must be
open). `deploy_check --strict` must print "deploy_check passed (0 warning(s))".

**First run** (demo data and the admin):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend /app/deploy/first_run.sh
```

It loads the demo only when the database has no bookings and no customers (it refuses to reset a
database with data), creates the admin from `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` when
no account with that email exists (an existing account is never changed), then adds the demo
extras, the owner's demo coupons and the recommendations. Remove `ADMIN_PASSWORD` from
`.env.production` afterwards.

**The demo accounts use the published demo password (`Demo-Pass-2026!`), including the demo admin
`owner@demo.example.com`.** That is fine for a portfolio demo, but anyone who reads the docs can
sign in as them: for a real shop, do not run `first_run.sh`'s demo step (start from an empty
database and create real staff by invite).

## 8. Updates and rollback

```bash
cd /opt/alankar
scripts/deploy/deploy.sh <commit SHA>     # or: scripts/deploy/deploy.sh latest
scripts/deploy/rollback.sh                # back to the tag that ran before
```

`deploy.sh` runs `git pull`, sets `IMAGE_TAG`, pulls the images, restarts, waits for
`/api/health/` and prints the result. `rollback.sh` goes back to the previous tag (migrations are
not undone; restore a backup if a migration must be reversed).

## 9. Timed jobs (scheduler container)

`manage.py run_scheduler`, in shop time (Asia/Kolkata), one JSON log line per run:

| When | What |
|---|---|
| every minute | `run_jobs` steps: expire unpaid holds, AIR holds and desk cover sweep, request reminders, waitlist |
| every 15 minutes | `send_campaigns` (it waits outside the quiet hours itself) |
| every 10 minutes | the other `run_jobs` steps: memberships, rebook and rating reminders, clean-up, chat photo retention |
| 02:30 | `build_recommendations` |
| 03:00 | `scripts/deploy/backup.sh` |

`docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 50 scheduler`
shows the runs.

## 10. Backups and a restore test

Every night at 03:00: `/var/backups/alankar/alankar-<time>.dump` (pg_dump custom format,
compressed) and `media-<time>.tar.gz`; 14 days are kept. Azure also keeps its own 7-day backups.
Copy a recent dump off the VM now and then:

```bash
scp -i alankar_key.pem azureuser@alankar-akhil.centralindia.cloudapp.azure.com:/var/backups/alankar/alankar-*.dump .
```

Run one by hand: `scripts/deploy/backup.sh`. **Restore test** (do it once, then every few months):
create a second database `alankar_restore_test` on the Azure server, point a copy of
`.env.production` at it (`ENV_FILE=.env.restoretest`), and run
`ENV_FILE=.env.restoretest scripts/deploy/restore.sh /var/backups/alankar/alankar-<time>.dump`.
`restore.sh` asks you to type the database name, stops the backend and the scheduler, restores,
starts them and checks `/api/health/`. A restored database needs the SAME `SALON_FIELD_KEY`.

## 11. Monitoring

UptimeRobot (free): New monitor > HTTP(s) keyword, URL
`https://alankar-akhil.centralindia.cloudapp.azure.com/api/health/`, keyword `"status":"ok"`, every
5 minutes, alert to your email. `/api/health/` checks the database and Redis and returns only
"ok"/"unavailable" words, never a host name, version or secret.

## 12. When the 12 free months end

Azure for Students gives USD 100 credit for 12 months and some services free for 12 months. Before
they end (watch the budget alert and Cost Management):

- The B1ms PostgreSQL server is the biggest cost after the free period. Cheaper options: stop it
  when not demoing (it starts again automatically after 7 days), or move the database into the
  stack (`db` service without the `localdb` profile, plus `backup.sh` to a second place).
- Downsize or deallocate the VM when not needed (a deallocated VM costs only its disk and IP).
- Renew Azure for Students if you are still a student, or move to another host: the same images
  and compose file run on any Docker host.
- Take a final `backup.sh` and keep it (with `SALON_FIELD_KEY`) before deleting anything.

## 13. Variables (summary)

See `.env.production.example`; every variable has a comment there.

| Variable | Needed | Notes |
|---|---|---|
| `DOMAIN` | yes | host name only |
| `SITE_URL` | yes | `https://` + DOMAIN; also a GitHub repository variable for the image build |
| `IMAGE_TAG` | yes | set by deploy.sh / rollback.sh |
| `ACME_EMAIL` | recommended | Let's Encrypt notices |
| `SALON_SECRET_KEY` | yes | Django secret |
| `SALON_JWT_SIGNING_KEY` | optional | sign-in token key (empty = SECRET_KEY) |
| `SALON_FIELD_KEY` | yes | encryption and blind-index master key; **back it up offline** |
| `DATABASE_URL` | yes | Azure PostgreSQL, `sslmode=require` |
| `REDIS_URL` | yes | keep `redis://redis:6379/0` |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | first run | remove the password afterwards |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | yes | real SMTP |
| `AI_TEXT_PROVIDER`, `AI_TEXT_API_KEY`, `AI_TEXT_MODEL` | optional | empty = AI off |
| `VITE_BUSINESS_*` | optional | build values for the web image |
| `SALON_HSTS_SECONDS`, `SALON_LOG_LEVEL` | optional | defaults are fine |
