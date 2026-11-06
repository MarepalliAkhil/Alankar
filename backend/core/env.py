"""Tiny environment helpers (standard library only).

Settings are read from environment variables. For local development a
backend/.env file is loaded first; real environment variables always win.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

_MISSING = object()
_TRUE = {"1", "true", "yes", "on"}


def load_env_file(path: str | os.PathLike[str]) -> None:
    """Load KEY=VALUE lines into os.environ without overriding existing values."""
    file = Path(path)
    if not file.is_file():
        return
    for raw in file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


def env(key: str, default: object = _MISSING) -> str:
    value = os.environ.get(key)
    if value is None or value == "":
        if default is _MISSING:
            raise ImproperlyConfigured(f"Missing required environment variable: {key}")
        return str(default)
    return value


def env_bool(key: str, default: bool = False) -> bool:
    value = os.environ.get(key)
    if value is None or value == "":
        return default
    return value.strip().lower() in _TRUE


def env_list(key: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(key, default).split(",") if item.strip()]
