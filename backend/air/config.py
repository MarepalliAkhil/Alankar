"""AIR settings: read them, change them (audited), and say whether a key is configured.

The API key itself lives only in the backend environment (`AI_TEXT_API_KEY`). Nothing here, and
nothing returned to the admin, ever contains it: only "key configured: yes / no".
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction

from accounts.audit import audit
from air.models import AirSettings
from core.env import env

AUDIT_SETTINGS_CHANGED = "air_settings_changed"

BOOL_FIELDS = ("master_enabled", "air_enabled")
INT_FIELDS = {
    "presence_minutes": (1, 120),
    "stylist_timeout_minutes": (1, 240),
    "payment_link_minutes": (5, 1440),
    "undo_window_minutes": (1, 120),
    "daily_request_cap": (0, 1_000_000),
    "monthly_request_cap": (0, 10_000_000),
    "breaker_failures": (1, 100),
    "breaker_cooldown_seconds": (10, 86_400),
    "request_timeout_seconds": (1, 60),
    "retry_limit": (0, 3),
    "max_order_quantity": (1, 50),
}
DECIMAL_FIELDS = {
    "monthly_spend_cap_rupees": (Decimal("0"), Decimal("10000000")),
    "cost_per_request_rupees": (Decimal("0"), Decimal("1000")),
}
EDITABLE = (*BOOL_FIELDS, *INT_FIELDS, *DECIMAL_FIELDS)


class SettingsError(ValueError):
    def __init__(self, message: str, field: str = ""):
        super().__init__(message)
        self.message = message
        self.field = field


def get_settings() -> AirSettings:
    obj = AirSettings.objects.filter(pk=1).first()
    if obj is None:
        obj, _ = AirSettings.objects.get_or_create(pk=1)
    return obj


def key_configured() -> bool:
    return bool(env("AI_TEXT_API_KEY", "").strip())


def provider_name() -> str:
    return (env("AI_TEXT_PROVIDER", "disabled") or "disabled").strip().lower()


def model_name() -> str:
    return env("AI_TEXT_MODEL", "").strip()


def public_view(obj: AirSettings | None = None) -> dict:
    """What the admin sees. Never the key, only whether one is configured."""
    obj = obj or get_settings()
    data = {name: getattr(obj, name) for name in EDITABLE}
    for name in DECIMAL_FIELDS:
        data[name] = str(data[name])
    data.update(
        key_configured=key_configured(),
        provider=provider_name(),
        model=model_name(),
        spend_shutoff_month=obj.spend_shutoff_month,
        updated_at=obj.updated_at,
    )
    return data


def _clean(name: str, value):
    if name in BOOL_FIELDS:
        if not isinstance(value, bool):
            raise SettingsError("Use true or false.", name)
        return value
    if name in INT_FIELDS:
        low, high = INT_FIELDS[name]
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise SettingsError(f"Enter a whole number from {low} to {high}.", name)
        return value
    low, high = DECIMAL_FIELDS[name]
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise SettingsError("Enter an amount in rupees.", name) from exc
    if not number.is_finite() or not low <= number <= high:
        raise SettingsError(f"Enter an amount from {low} to {high}.", name)
    return number


def update_settings(data: dict, *, actor, request=None) -> AirSettings:
    """Applies the changes the admin sent and writes one audit row listing what changed."""
    unknown = set(data) - set(EDITABLE)
    if unknown:
        raise SettingsError("Unknown setting.", sorted(unknown)[0])
    with transaction.atomic():
        get_settings()
        obj = AirSettings.objects.select_for_update().get(pk=1)
        changes = {}
        for name, raw in data.items():
            value = _clean(name, raw)
            old = getattr(obj, name)
            if old != value:
                changes[name] = {"from": str(old), "to": str(value)}
                setattr(obj, name, value)
        if changes:
            if "monthly_spend_cap_rupees" in changes or "master_enabled" in changes:
                obj.spend_shutoff_month = ""  # the admin re-arms the automatic shut-off
            obj.updated_by = actor
            obj.save()
            audit(AUDIT_SETTINGS_CHANGED, request=request, actor=actor, changes=changes)
    return obj
