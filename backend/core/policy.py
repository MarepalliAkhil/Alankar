"""Role policy loaded from shared/policy.json (the single source of truth).

The frontend imports the same file for menus and route guards. The backend enforces
API actions through core.permissions.PolicyPermission. Anything not listed is denied.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from django.conf import settings

ROLES = ("customer", "receptionist", "stylist", "admin")


@lru_cache(maxsize=1)
def load_policy() -> dict[str, Any]:
    with open(settings.SALON_POLICY_PATH, encoding="utf-8") as handle:
        return json.load(handle)


def known_actions() -> set[str]:
    return set(load_policy()["actions"])


def is_public_action(action: str) -> bool:
    return action in load_policy()["public"]["api"]


def role_can(role: str | None, action: str) -> bool:
    if role not in load_policy()["roles"]:
        return False
    return action in load_policy()["roles"][role]["api"]


def role_home(role: str) -> str:
    return load_policy()["roles"][role]["home"]
