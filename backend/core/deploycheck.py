"""Production-readiness checks, used by `manage.py deploy_check` and by its tests.

Each check returns Findings. An ERROR means the settings are unsafe for production; a WARNING is
a limit worth knowing about (for example a single-process cache). `python manage.py deploy_check`
exits with status 1 when there is at least one ERROR, so it can gate a deploy.
"""

from __future__ import annotations

import base64
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings

ERROR = "ERROR"
WARNING = "WARNING"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "testserver"}  # noqa: S104
PLACEHOLDER = re.compile(
    r"(replace[-_ ]?with|change[-_ ]?me|changeme|example|your[-_ ]|secret[-_]?key|django-insecure|"
    r"password|1234|test|dev[-_]|todo)",
    re.I,
)


@dataclass(frozen=True)
class Finding:
    level: str
    code: str
    message: str


def _err(code: str, message: str) -> Finding:
    return Finding(ERROR, code, message)


def _warn(code: str, message: str) -> Finding:
    return Finding(WARNING, code, message)


def _secret_checks() -> list[Finding]:
    out = []
    key = settings.SECRET_KEY or ""
    if len(key) < 50 or len(set(key)) < 12 or PLACEHOLDER.search(key):
        out.append(
            _err(
                "secret_key",
                "SALON_SECRET_KEY is short, low-variety or looks like a placeholder. Generate one: "
                'python -c "import secrets; print(secrets.token_urlsafe(64))"',
            )
        )
    field_key = getattr(settings, "SALON_FIELD_KEY", "") or ""
    try:
        raw = base64.urlsafe_b64decode(field_key + "=" * (-len(field_key) % 4))
    except Exception:
        raw = b""
    if len(raw) != 32 or PLACEHOLDER.search(field_key):
        out.append(
            _err(
                "field_key",
                "SALON_FIELD_KEY must be 32 random bytes, base64 (see backend/.env.example), "
                "not a placeholder.",
            )
        )
    if field_key and field_key == key:
        out.append(_err("field_key_reuse", "SALON_FIELD_KEY must differ from SALON_SECRET_KEY."))
    return out


def _host_checks() -> list[Finding]:
    out = []
    hosts = list(settings.ALLOWED_HOSTS)
    if settings.DEBUG:
        out.append(_err("debug", "SALON_DEBUG must be false in production."))
    if not hosts or any(h in ("*", ".*") or h.startswith("*") for h in hosts):
        out.append(_err("allowed_hosts", "SALON_ALLOWED_HOSTS must list the real host names."))
    elif all(h in LOCAL_HOSTS for h in hosts):
        out.append(_err("allowed_hosts_local", "SALON_ALLOWED_HOSTS only has localhost addresses."))
    origins = list(settings.CORS_ALLOWED_ORIGINS)
    if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
        out.append(_err("cors_all", "CORS must not allow all origins."))
    if not origins:
        out.append(_err("cors_empty", "SALON_CORS_ORIGINS must name the site's own origin."))
    for origin in origins:
        parsed = urlparse(origin)
        if origin == "*" or parsed.scheme != "https" or parsed.hostname in LOCAL_HOSTS:
            out.append(
                _err("cors_origin", f"CORS origin {origin!r} must be the site's https address.")
            )
    if urlparse(settings.SALON_FRONTEND_URL).scheme != "https":
        out.append(
            _err("frontend_url", "SALON_FRONTEND_URL (used in emailed links) must be https.")
        )
    return out


def _transport_checks() -> list[Finding]:
    out = []
    auth = settings.SALON_AUTH
    if not auth["COOKIE_SECURE"]:
        out.append(_err("auth_cookie_secure", "The sign-in cookies must be Secure."))
    if auth["COOKIE_SAMESITE"] not in ("Lax", "Strict"):
        out.append(_err("auth_cookie_samesite", "The sign-in cookies need SameSite=Lax or Strict."))
    if not settings.SESSION_COOKIE_SECURE or not settings.CSRF_COOKIE_SECURE:
        out.append(
            _err("cookie_secure", "SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE must be on.")
        )
    if not settings.SESSION_COOKIE_HTTPONLY:
        out.append(_err("session_httponly", "The session cookie must be httpOnly."))
    if not settings.SECURE_SSL_REDIRECT:
        out.append(
            _err(
                "ssl_redirect",
                "SECURE_SSL_REDIRECT is off. Turn it on (SALON_SSL_REDIRECT=true); behind a proxy "
                "also set SALON_BEHIND_PROXY=true.",
            )
        )
    if settings.SECURE_HSTS_SECONDS < 15_552_000:
        out.append(_err("hsts", "HSTS must last at least 180 days (SALON_HSTS_SECONDS)."))
    if not settings.SECURE_HSTS_INCLUDE_SUBDOMAINS:
        out.append(_err("hsts_subdomains", "HSTS should include subdomains."))
    if not settings.SECURE_CONTENT_TYPE_NOSNIFF:
        out.append(_err("nosniff", "X-Content-Type-Options: nosniff must be on."))
    if settings.X_FRAME_OPTIONS != "DENY":
        out.append(_err("frame_options", "X-Frame-Options must be DENY."))
    if "core.middleware.SecurityHeadersMiddleware" not in settings.MIDDLEWARE:
        out.append(_err("security_headers", "SecurityHeadersMiddleware (CSP) is not installed."))
    if not settings.SECURE_REFERRER_POLICY:
        out.append(_err("referrer_policy", "A Referrer-Policy must be set."))
    return out


def _app_checks() -> list[Finding]:
    out = []
    if settings.SALON_DEV_TOOLS:
        out.append(_err("dev_tools", "Development tools (simulated mailbox) are on."))
    if settings.SALON_API_DOCS:
        out.append(_err("api_docs", "API docs are public. Set SALON_API_DOCS=false."))
    if not settings.SALON_CUSTOMER_OTP:
        out.append(_err("customer_otp", "SALON_CUSTOMER_OTP must stay on."))
    if not settings.SALON_SMTP_CONFIGURED:
        out.append(
            _err(
                "email",
                "Real email is not configured (EMAIL_HOST...). Sign-in codes, password resets and "
                "staff invites can not be delivered without it.",
            )
        )
    if not settings.PASSWORD_HASHERS or "Argon2" not in settings.PASSWORD_HASHERS[0]:
        out.append(_err("hasher", "Argon2 must be the first password hasher."))
    db = settings.DATABASES["default"]
    if not db.get("PASSWORD"):
        out.append(_err("db_password", "The database password is empty."))
    if PLACEHOLDER.search(db.get("PASSWORD") or ""):
        out.append(_err("db_password_weak", "The database password looks like a placeholder."))
    rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
    for scope in ("anon", "user", "auth", "booking", "public_write"):
        if not rates.get(scope):
            out.append(_err("throttle", f"No rate limit is set for {scope!r}."))
    if settings.REST_FRAMEWORK.get("NUM_PROXIES") is None:
        out.append(
            _err("num_proxies", "REST_FRAMEWORK NUM_PROXIES must be set (SALON_NUM_PROXIES).")
        )
    if "locmem" in settings.CACHES["default"]["BACKEND"]:
        out.append(
            _warn(
                "cache",
                "The cache is per process: rate limits and chat limits are not shared between "
                "workers. Use one worker, or a shared cache such as Redis.",
            )
        )
    if "InMemory" in settings.CHANNEL_LAYERS["default"]["BACKEND"]:
        out.append(
            _warn(
                "channel_layer",
                "The chat channel layer is in memory: live chat works only with one process.",
            )
        )
    return out


def _repo_checks() -> list[Finding]:
    """The .env file with real secrets must never be in version control."""
    base = Path(settings.BASE_DIR)
    try:
        tracked = subprocess.run(  # noqa: S603
            ["git", "ls-files", "--error-unmatch", ".env"],  # noqa: S607
            cwd=base,
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if tracked.returncode == 0:
        return [
            _err("env_tracked", "backend/.env is tracked by git. Remove it and rotate secrets.")
        ]
    return []


def run_checks() -> list[Finding]:
    findings = [
        *_secret_checks(),
        *_host_checks(),
        *_transport_checks(),
        *_app_checks(),
        *_repo_checks(),
    ]
    return findings
