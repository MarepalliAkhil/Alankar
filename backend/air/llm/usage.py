"""Caps, the monthly spending cap, and the circuit breaker for the optional language model.

Everything here fails CLOSED: if a switch is off, a cap is reached or the breaker is open, the
model is not called and the caller uses the fixed, deterministic behaviour instead.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounts.audit import audit
from air import config
from air.models import AirSettings, AiUsage, ProviderState

AUDIT_SHUTOFF = "air_spend_shutoff"


def _month(now: datetime) -> str:
    local = timezone.localtime(now)
    return f"{local.year:04d}-{local.month:02d}"


def _totals(now: datetime) -> tuple[int, int, Decimal]:
    local = timezone.localtime(now)
    today = local.date()
    rows = AiUsage.objects.filter(day__year=today.year, day__month=today.month)
    month = rows.aggregate(r=Sum("requests"), c=Sum("cost_rupees"))
    day = rows.filter(day=today).aggregate(r=Sum("requests"))
    return int(day["r"] or 0), int(month["r"] or 0), Decimal(month["c"] or 0)


def breaker_state() -> ProviderState:
    obj = ProviderState.objects.filter(pk=1).first()
    if obj is None:
        obj, _ = ProviderState.objects.get_or_create(pk=1)
    return obj


def allowed(now: datetime | None = None) -> tuple[bool, str]:
    """(ok, reason). Checks the switches, the caps, the spending cap and the breaker."""
    now = now or timezone.now()
    cfg = config.get_settings()
    if not cfg.master_enabled:
        return False, "master_off"
    if not cfg.air_enabled:
        return False, "air_off"
    if cfg.spend_shutoff_month == _month(now):
        return False, "spend_shutoff"
    day_n, month_n, month_cost = _totals(now)
    if day_n >= cfg.daily_request_cap:
        return False, "daily_cap"
    if month_n >= cfg.monthly_request_cap:
        return False, "monthly_cap"
    if month_cost + cfg.cost_per_request_rupees > cfg.monthly_spend_cap_rupees:
        _shut_off(cfg, now)
        return False, "spend_cap"
    breaker = breaker_state()
    if breaker.open_until and breaker.open_until > now:
        return False, "breaker_open"
    return True, "ok"


def _shut_off(cfg: AirSettings, now: datetime) -> None:
    """The spending cap is reached: switch the model layer off until the admin turns it back on."""
    with transaction.atomic():
        obj = AirSettings.objects.select_for_update().get(pk=1)
        if obj.master_enabled:
            obj.master_enabled = False
            obj.spend_shutoff_month = _month(now)
            obj.save(update_fields=["master_enabled", "spend_shutoff_month", "updated_at"])
            audit(
                AUDIT_SHUTOFF, month=obj.spend_shutoff_month, cap=str(obj.monthly_spend_cap_rupees)
            )


def record_call(cost: Decimal | None = None, now: datetime | None = None) -> Decimal:
    """Counts one provider call and returns its estimated cost in rupees."""
    now = now or timezone.now()
    cost = cost if cost is not None else config.get_settings().cost_per_request_rupees
    today = timezone.localtime(now).date()
    with transaction.atomic():
        row, _ = AiUsage.objects.select_for_update().get_or_create(day=today)
        row.requests += 1
        row.cost_rupees = Decimal(row.cost_rupees) + Decimal(cost)
        row.save(update_fields=["requests", "cost_rupees"])
    return Decimal(cost)


def record_success() -> None:
    with transaction.atomic():
        obj = ProviderState.objects.select_for_update().get_or_create(pk=1)[0]
        if obj.consecutive_failures or obj.open_until:
            obj.consecutive_failures, obj.open_until, obj.last_error = 0, None, ""
            obj.save()


def record_failure(code: str, now: datetime | None = None) -> None:
    now = now or timezone.now()
    cfg = config.get_settings()
    with transaction.atomic():
        obj = ProviderState.objects.select_for_update().get_or_create(pk=1)[0]
        obj.consecutive_failures += 1
        obj.last_error = (code or "error")[:60]
        if obj.consecutive_failures >= cfg.breaker_failures:
            obj.open_until = now + timedelta(seconds=cfg.breaker_cooldown_seconds)
        obj.save()
