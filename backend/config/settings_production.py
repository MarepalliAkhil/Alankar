"""Production settings (docs/DEPLOY.md): DJANGO_SETTINGS_MODULE=config.settings_production.

Everything still comes from the environment (.env.production on the server). This module first
refuses to start when a required variable is missing, then fills the base settings' SALON_*
variables from the few production ones (DOMAIN, DATABASE_URL, REDIS_URL), imports the base
settings and finally switches on what only production needs: PostgreSQL over SSL, Redis for the
cache and the chat channel layer, HTTPS behind Caddy, and JSON logs on stdout.
"""

from __future__ import annotations

import os
from urllib.parse import parse_qsl, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

REQUIRED = (
    "DOMAIN",
    "SALON_SECRET_KEY",
    "SALON_FIELD_KEY",
    "DATABASE_URL",
    "REDIS_URL",
)


def _missing() -> list[str]:
    return [name for name in REQUIRED if not (os.environ.get(name) or "").strip()]


missing = _missing()
if missing:
    raise ImproperlyConfigured(
        "Production settings need these variables (see .env.production.example): "
        + ", ".join(missing)
    )

DOMAIN = os.environ["DOMAIN"].strip().lower()
if "://" in DOMAIN or "/" in DOMAIN:
    raise ImproperlyConfigured(
        "DOMAIN is a host name only, e.g. alankar.example.com (no https://)."
    )
# The site's own address: https://DOMAIN, or the local test's http://localhost:8080.
SITE_URL = (os.environ.get("SITE_URL") or f"https://{DOMAIN}").strip().rstrip("/")


def _database(url: str) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ImproperlyConfigured("DATABASE_URL must start with postgresql://")
    options = dict(parse_qsl(parsed.query))
    # Azure Database for PostgreSQL requires SSL; the local test database (localdb profile) can
    # say sslmode=disable explicitly.
    options.setdefault("sslmode", "require")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or 5432),
        # One ASGI process and a small Burstable server: keep few, short-lived connections.
        "CONN_MAX_AGE": int(os.environ.get("SALON_DB_CONN_MAX_AGE", "60")),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": options,
    }


DATABASE = _database(os.environ["DATABASE_URL"].strip())

# The base settings read SALON_* variables: derive them from DOMAIN unless set explicitly.
_defaults = {
    "SALON_DEBUG": "false",
    "SALON_ALLOWED_HOSTS": DOMAIN,
    "SALON_CORS_ORIGINS": SITE_URL,
    "SALON_FRONTEND_URL": SITE_URL,
    "SALON_BEHIND_PROXY": "true",
    "SALON_NUM_PROXIES": "1",
    "SALON_API_DOCS": "false",
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

# Host names: the site, plus the internal names the health check and the scheduler use.
ALLOWED_HOSTS = [DOMAIN, "backend", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = [SITE_URL]

# Caddy terminates HTTPS and sets X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = False
# The container health check calls the backend directly over plain HTTP.
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]

# Redis: one shared cache (rate limits, chat limits) and the chat channel layer.
REDIS_URL = os.environ["REDIS_URL"].strip()
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "salon",
        "TIMEOUT": 300,
    }
}
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL], "prefix": "salon-ws"},
    }
}

# Files: static files are collected into a volume Caddy serves at /static/; media (if any) lives
# on its own persistent volume and is backed up with the database (scripts/deploy/backup.sh).
STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("SALON_STATIC_ROOT", "/app/staticfiles")
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("SALON_MEDIA_ROOT", "/app/media")

# JSON logs on stdout (Docker keeps and rotates them). The redaction filter stays on.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"redact": {"()": "core.logging_filters.RedactFilter"}},
    "formatters": {"json": {"()": "core.logging_filters.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["redact"],
            "formatter": "json",
        }
    },
    "root": {"handlers": ["console"], "level": os.environ.get("SALON_LOG_LEVEL", "INFO")},
}
