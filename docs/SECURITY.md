# Security (Alankar / ZenFlow)

Written in Task 8a. This is the plain list of what protects the system, what was found and fixed, and what is left.

## How access is decided
- `shared/policy.json` is the single list of who may call what. Every endpoint declares one policy action; an endpoint without a known action is denied. Tests walk every endpoint as guest and as every role (`core/tests/test_sweep.py`) and check the answer against the file.
- Object-level rules (a customer sees only their own bookings, a stylist only their own work, and so on) are tested per app, plus the field-exposure tests that check what each role's JSON contains.
- CSRF: sign-in is by HttpOnly cookies, so every state-changing call needs the `X-CSRFToken` header. `core/tests/test_csrf_sweep.py` signs in as each role with real cookies and proves that every unsafe endpoint refuses a call without the header.

## Sessions and passwords
- Access token 15 minutes, refresh token rotated on every use and blacklisted after; cookies are HttpOnly, SameSite, Secure outside debug.
- Access tokens are bound to the password hash: changing or resetting a password ends every other session at once (not up to 15 minutes later).
- Deactivating a user stops their session on the next request (the user is loaded on every call).
- Lockout: 5 wrong passwords for one email in 15 minutes locks that email for 15 minutes (case-insensitive, counted even for unknown emails so it does not reveal who is registered).
- Reset links, invite links and email codes are random, stored only as hashes, expire, and work once. Using one takes a database row lock, so two simultaneous clicks cannot both succeed.
- Passwords use Argon2. Admin can turn on TOTP two-step sign-in.

## Browser-facing protections
- API responses carry `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a `Permissions-Policy` that turns off camera/microphone/location, and `Cross-Origin-Opener-Policy: same-origin`.
- In production (DEBUG off): HTTPS redirect, HSTS (1 year by default), Secure cookies.
- The API accepts JSON only (form and multipart bodies get 415). There are no file-upload endpoints; images are links, and links must be a site path or http(s) (`javascript:` is refused).
- The React app never uses `dangerouslySetInnerHTML` and has no inline styles. Serve the built app with this header (set it in the web server that serves `frontend/dist`):

  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

  (`img-src https:` is there because owners can paste image links. Tighten it if you only use your own images. The Vite dev server needs inline scripts for hot reload, so use this header only for the production build.)
- Emails are rendered through Django templates (auto-escaped).

## Rate limits (per client)
Auth 20/min, booking requests 20/min, waitlist/unsubscribe 20/min, chat messages and chatbot have their own limits, everything else 240/min anonymous and 600/min signed in. All can be changed in `.env` (see `.env.example`). The client address is taken from the connection, not from `X-Forwarded-For`, unless `SALON_NUM_PROXIES` says a proxy is in front.

## Logs
A redaction filter on the console log removes tokens in URLs, `Authorization` headers, JWTs, `password=`/`code=`/`otp=` style values and card-number-looking digits. Chat message text, email bodies and passwords are never passed to the logger (tests scan for this).

## Production check
`python manage.py deploy_check` exits with an error if the settings are unsafe (debug on, default secret, missing field key, wrong hosts, no HTTPS, dev tools on, and so on). `--strict` also fails on warnings. It also runs Django's `check --deploy`.

## Found and fixed in Task 8a
1. Forged `X-Forwarded-For` headers let a caller dodge every rate limit including the login limit. Fixed (`NUM_PROXIES=0` by default).
2. A pending (never accepted) staff invite could not be withdrawn: deactivating the invitee left the link alive and the person could still activate the account. Deactivating now cancels the link.
3. Announcement-banner links accepted `javascript:` URLs (stored cross-site scripting through the router link). Links are now validated.
4. Reset and invite links were not safe against two simultaneous uses. Fixed with row locks.
5. Access tokens kept working up to 15 minutes after a password change. Fixed (token bound to password hash).
6. No Content-Security-Policy, no `no-store` on API data, no limits on booking/waitlist/unsubscribe/general traffic, form/multipart parsing enabled, no log redaction. All added.

## Dependency audit
`scripts\audit.cmd` (Windows) or `sh scripts/audit.sh` runs `pip-audit` and `npm audit`. These need the internet and could not run in the build sandbox; first run on the owner's PC, 2026-10-28:

**Backend (`pip-audit`), fixed and confirmed:** Django 5.1.15 and djangorestframework 3.16.1 had known CVEs; `requirements.txt` previously capped them below the fixed releases (`Django<5.2`, `djangorestframework<3.17`). Raised and pinned to **Django==5.2.17**, then djangorestframework 3.17.2 itself turned out to have 3 more CVEs (CVE-2026-114138, CVE-2026-114136, CVE-2026-114137), so re-pinned again to **djangorestframework==3.18.2**. Both are now installed and confirmed on the owner's PC: `pytest` passes (1221 passed, 2 skipped, 0 failed) and a re-run of `pip-audit` (2026-10-29) shows **zero findings for Django or djangorestframework**.

**Backend, left as-is (known limitation, not fixed):** `twisted` (pulled in by Daphne/Channels) has several open CVEs; as of this audit the only version that addresses some of them is a **release candidate** (`26.10.0rc1`), and at least one CVE (`CVE-2026-106454`) has no fixed version at all yet. Shipping a pre-release security dependency is its own risk, so it is left unpinned (upgrades automatically once a stable fixed release exists) rather than forced to an RC. Re-run the audit periodically and upgrade `twisted` as soon as a stable fix lands.

**Frontend (`npm audit`), left as-is (needs your decision):** `react-router`/`react-router-dom` and `zod` (production dependencies) have known advisories; `npm audit fix --force` would bump both to a new major version (react-router-dom 7.18.x, zod 4.x), which is a breaking API change for code built against zod 3.x schemas and the current router version — not a safe drop-in on its own. `vitest`/`vite`/`esbuild`/`tinypool` (dev-only tools, one rated critical) have the same kind of breaking fix available. None of these were changed; they need a dedicated task (upgrade, then fix whatever the breaking change touches, then re-run every frontend check) rather than a same-day patch bump. Flagged here so it isn't forgotten.

## Known limitations
- Anyone can lock someone else's account for 15 minutes by typing wrong passwords for that email. This is the usual trade-off of lockout; the owner can unlock from Security overview.
- A refresh token that is used twice is refused, but a replay does not log the real user out everywhere.
- Rate-limit counters and live chat use in-process memory: correct for one server process only. Use Redis (not set up yet) before running several processes. `deploy_check` warns about this.
- The invite check sends its token in the URL query (it is redacted in our logs, but a reverse proxy may log it).
- `twisted`'s open CVEs have no stable fixed release yet (see "Dependency audit" above); re-check periodically.
- `react-router`/`zod` (frontend) and `vitest`/`vite` (frontend, dev-only) have audit findings whose fix is a breaking major upgrade; not yet done (see "Dependency audit" above).
- Deployment (HTTPS, proxy, backups schedule) is not set up yet.
- `backup_db`/`restore_db` and their tests need PostgreSQL's client tools (`pg_dump`, `pg_restore`) on `PATH`, or `SALON_PG_BIN` set in `.env`; Docker's Postgres *server* image does not provide these on the host. The two tests that exercise a real backup/restore round trip now skip (with a clear reason) when the tools aren't found, instead of failing.
