"""DATABASE_URL -> Django DATABASES entry (production and free modes). No extra dependency."""

from __future__ import annotations

from urllib.parse import parse_qsl, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured


def database(url: str, *, conn_max_age: int) -> dict:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ImproperlyConfigured("DATABASE_URL must start with postgresql://")
    options = dict(parse_qsl(parsed.query))
    # Managed PostgreSQL (Azure, Neon) requires SSL; a local test database can say
    # sslmode=disable explicitly.
    options.setdefault("sslmode", "require")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or 5432),
        "CONN_MAX_AGE": conn_max_age,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": options,
    }
