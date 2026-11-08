"""Desk cover mode: when AIR may act for the front desk. Decided on the server only.

AIR covers only when ALL of these are true:
  * the admin has switched AIR on (`air_enabled`), and
  * no receptionist is on shift right now (the admin-set `ShiftSchedule`, Asia/Kolkata), and
  * no receptionist is logged in / clocked in (an open, recently active `WorkSession`).
The admin can force cover ON or OFF (always with a reason, always audited). As soon as a
receptionist signs in, or a shift starts, cover ends: AIR takes no new action and anything it
had in flight is marked "handed to desk".
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import ShiftSchedule, User, WorkSession
from air import config
from air.models import CoverPeriod, CoverState

IST = ZoneInfo("Asia/Kolkata")
AUDIT_COVER_FORCED = "air_cover_forced"

REASON_OFF_SHIFT = "off_shift_nobody_in"
REASON_FORCED_ON = "forced_on"


class CoverError(ValueError):
    pass


def receptionist_on_shift(now: datetime) -> bool:
    local = now.astimezone(IST)
    return ShiftSchedule.objects.filter(
        user__role=User.Role.RECEPTIONIST,
        user__is_active=True,
        weekday=local.weekday(),
        start_time__lte=local.time(),
        end_time__gt=local.time(),
    ).exists()


def presence_window() -> timedelta:
    return timedelta(minutes=config.get_settings().presence_minutes)


def present_receptionists(now: datetime):
    """Receptionists who are at the desk right now: an open work session (a sign-in or clock-in
    that has not ended) whose page was active within `presence_minutes`. Signing out ends the
    session and an idle or expired one is closed by the work code, so neither counts; and a row
    that was left open but has gone quiet stops counting after the window, whatever its state."""
    return WorkSession.objects.filter(
        user__role=User.Role.RECEPTIONIST,
        user__is_active=True,
        ended_at__isnull=True,
        last_seen_at__gt=now - presence_window(),
    )


def receptionist_logged_in(now: datetime) -> bool:
    return present_receptionists(now).exists()


def state() -> CoverState:
    obj = CoverState.objects.filter(pk=1).first()
    if obj is None:
        obj, _ = CoverState.objects.get_or_create(pk=1)
    return obj


def evaluate(now: datetime | None = None) -> tuple[bool, str]:
    """(active, reason) for this moment. Reads only; records nothing."""
    now = now or timezone.now()
    if not config.get_settings().air_enabled:
        return False, "air_disabled"
    force = state().force
    if force == CoverState.Force.ON:
        return True, REASON_FORCED_ON
    if force == CoverState.Force.OFF:
        return False, "forced_off"
    if receptionist_on_shift(now):
        return False, "receptionist_on_shift"
    if receptionist_logged_in(now):
        return False, "receptionist_logged_in"
    return True, REASON_OFF_SHIFT


def is_active(now: datetime | None = None) -> bool:
    """True when AIR may act for the desk. Opens / closes the CoverPeriod row on a change."""
    now = now or timezone.now()
    active, reason = evaluate(now)
    current = state()
    if active == (current.open_period_id is not None):
        return active
    _transition(active, reason, now)
    return active


def current_period() -> CoverPeriod | None:
    return state().open_period


def _transition(active: bool, reason: str, now: datetime) -> None:
    from air import handover

    with transaction.atomic():
        obj = CoverState.objects.select_for_update().get(pk=1)
        if active and obj.open_period_id is None:
            obj.open_period = CoverPeriod.objects.create(started_at=now, reason=reason)
            obj.save(update_fields=["open_period"])
        elif not active and obj.open_period_id is not None:
            period = obj.open_period
            period.ended_at = max(now, period.started_at)
            period.ended_reason = reason
            period.save(update_fields=["ended_at", "ended_reason"])
            obj.open_period = None
            obj.save(update_fields=["open_period"])
            handover.hand_to_desk(period, now)


def force(mode: str, *, actor, reason: str, request=None, now: datetime | None = None) -> dict:
    """The admin forces cover on or off, or puts it back to automatic. A reason is required."""
    if mode not in {m.value for m in CoverState.Force}:
        raise CoverError("Choose on, off or auto.")
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise CoverError("Please give a reason (at least a few words).")
    if len(reason) > 200:
        raise CoverError("Please keep the reason under 200 characters.")
    now = now or timezone.now()
    with transaction.atomic():
        config.get_settings()
        state()
        obj = CoverState.objects.select_for_update().get(pk=1)
        before = obj.force
        obj.force, obj.force_reason, obj.forced_by, obj.forced_at = mode, reason, actor, now
        obj.save()
        audit(
            AUDIT_COVER_FORCED,
            request=request,
            actor=actor,
            before=before,
            after=mode,
            reason=reason,
        )
    active = is_active(now)
    return status(now) | {"active": active}


def status(now: datetime | None = None) -> dict:
    now = now or timezone.now()
    active, why = evaluate(now)
    obj = state()
    return {
        "active": active,
        "reason": why,
        "force": obj.force,
        "force_reason": obj.force_reason,
        "forced_at": obj.forced_at,
        "since": obj.open_period.started_at if obj.open_period_id else None,
        "receptionist_on_shift": receptionist_on_shift(now),
        "receptionist_logged_in": receptionist_logged_in(now),
        "presence_minutes": config.get_settings().presence_minutes,
        "time_zone": "Asia/Kolkata",
    }
