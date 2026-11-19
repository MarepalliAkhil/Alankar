"""Free-tier settings (docs/DEPLOY_FREE.md): DJANGO_SETTINGS_MODULE=config.settings_free.

Render free web service (one instance, 512 MB, sleeps when idle) + Neon free PostgreSQL + the
frontend on Vercel, which forwards /api to Render so the sign-in cookies stay first-party on the
Vercel domain. Chat WebSockets go straight to Render with a short single-use ticket
(GET /api/ws-ticket/), because Vercel rewrites cannot carry WebSockets.

Redis is optional: without REDIS_URL the cache and the chat channel layer live in the one process.
That is correct here because the free plan runs exactly ONE instance with ONE Daphne process:
rate limits, ws tickets and chat messages are all handled by that process. Restarting it only
clears short-lived data (rate-limit counters, unused 30-second tickets). Set REDIS_URL before ever
running a second instance. deploy_check reports these two facts as warnings, not errors.
"""

from __future__ import annotations

import os

from django.core.exceptions import ImproperlyConfigured

from config.dburl import database

REQUIRED = ("SALON_SECRET_KEY", "SALON_FIELD_KEY", "DATABASE_URL", "FRONTEND_DOMAIN")

missing = [name for name in REQUIRED if not (os.environ.get(name) or "").strip()]
if missing:
    raise ImproperlyConfigured(
        "Free-mode settings need these variables (see docs/DEPLOY_FREE.md): " + ", ".join(missing)
    )


def _host(name: str) -> str:
    value = (os.environ.get(name) or "").strip().lower()
    if "://" in value or "/" in value:
        raise ImproperlyConfigured(f"{name} is a host name only (no https:// and no path).")
    return value


FRONTEND_DOMAIN = _host("FRONTEND_DOMAIN")  # e.g. alankar.vercel.app
CUSTOM_DOMAIN = _host("CUSTOM_DOMAIN")  # optional, later
# Render sets RENDER_EXTERNAL_HOSTNAME (e.g. alankar-api.onrender.com) on its own.
BACKEND_HOST = _host("RENDER_EXTERNAL_HOSTNAME") or _host("BACKEND_HOST")
SITE_HOST = CUSTOM_DOMAIN or FRONTEND_DOMAIN
SITE_URL = f"https://{SITE_HOST}"
ORIGINS = [f"https://{h}" for h in dict.fromkeys(h for h in (FRONTEND_DOMAIN, CUSTOM_DOMAIN) if h)]

# Neon suspends its compute when idle: never keep a connection open between requests.
DATABASE = database(os.environ["DATABASE_URL"], conn_max_age=0)

_defaults = {
    "SALON_DEBUG": "false",
    "SALON_ALLOWED_HOSTS": ",".join(h for h in (BACKEND_HOST, FRONTEND_DOMAIN, CUSTOM_DOMAIN) if h),
    "SALON_CORS_ORIGINS": ",".join(ORIGINS),
    "SALON_FRONTEND_URL": SITE_URL,
    "SALON_BEHIND_PROXY": "true",
    # Browser -> Vercel -> Render's router -> the app: the client address is two hops back.
    "SALON_NUM_PROXIES": "2",
    "SALON_API_DOCS": "false",
    # The fictional demo customers (meera@demo.example.com, ...) cannot receive a code; everyone
    # else gets the emailed code once real email is set up.
    "SALON_OTP_SKIP_DOMAINS": "demo.example.com",
    "SALON_DB_NAME": DATABASE["NAME"],
    "SALON_DB_USER": DATABASE["USER"],
    "SALON_DB_PASSWORD": DATABASE["PASSWORD"],
    "SALON_DB_HOST": DATABASE["HOST"],
    "SALON_DB_PORT": DATABASE["PORT"],
}
for _key, _value in _defaults.items():
    if not (os.environ.get(_key) or "").strip():
        os.environ[_key] = _value

from .settings import *  # noqa: E402,F403

DEBUG = False
DATABASES = {"default": DATABASE}
ALLOWED_HOSTS = [h for h in (BACKEND_HOST, FRONTEND_DOMAIN, CUSTOM_DOMAIN, "localhost") if h]
CSRF_TRUSTED_ORIGINS = ORIGINS
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Render's health check and cron-job.org call these; they must not be redirected.
SECURE_REDIRECT_EXEMPT = [r"^api/ping/$", r"^api/health/$"]

REDIS_URL = (os.environ.get("REDIS_URL") or "").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "KEY_PREFIX": "salon",
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL], "prefix": "salon-ws"},
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

# Neon free has 1 GB: chat photos (encrypted in PostgreSQL, no disk) are compacted and capped.
SALON_PHOTO_COMPACT = True
SALON_PHOTO_USER_MB = int(os.environ.get("SALON_PHOTO_USER_MB", "20"))
SALON_PHOTO_TOTAL_MB = int(os.environ.get("SALON_PHOTO_TOTAL_MB", "300"))

# Jobs without a worker (core/internal.py): cron-job.org calls these with this header value.
SALON_TICK_SECRET = (os.environ.get("TICK_SECRET") or "").strip()
# Chat WebSockets go straight to Render with a ticket (chat/tickets.py).
SALON_WS_TICKETS = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"redact": {"()": "core.logging_filters.RedactFilter"}},
    "formatters": {"json": {"()": "core.logging_filters.JsonFormatter"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "filters": ["redact"], "formatter": "json"}
    },
    "root": {"handlers": ["console"], "level": os.environ.get("SALON_LOG_LEVEL", "INFO")},
}
