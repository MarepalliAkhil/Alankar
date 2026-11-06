"""Receptionist work sessions: when they were at the desk, and what that earns.

A session starts at sign-in and ends at sign-out. If the browser goes quiet for the idle limit
(15 minutes) the server signs the receptionist out and the session ends at their last activity,
so idle time is never paid. Only a ping from the page (real clicks and keys) counts as activity;
background refreshes do not.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import User, WorkSession
from website.content import security_settings

E_ = WorkSession.EndReason


def idle_limit() -> timedelta:
    return timedelta(minutes=int(security_settings()["idle_minutes"]))


def tracked(user) -> bool:
    return getattr(user, "role", None) == User.Role.RECEPTIONIST


def _open(user) -> WorkSession | None:
    return WorkSession.objects.select_for_update().filter(user=user, ended_at__isnull=True).first()


def _close(session: WorkSession, at: datetime, reason: str) -> None:
    session.ended_at = max(at, session.started_at)
    session.end_reason = reason
    session.save(update_fields=["ended_at", "end_reason"])


def start(user, now: datetime | None = None) -> WorkSession | None:
    """At sign-in. A session left open earlier is closed at its last activity."""
    if not tracked(user):
        return None
    now = now or timezone.now()
    with transaction.atomic():
        old = _open(user)
        if old is not None:
            _close(old, min(now, old.last_seen_at + idle_limit()), E_.REPLACED)
        return WorkSession.objects.create(user=user, started_at=now, last_seen_at=now)


def end(user, reason: str = E_.LOGOUT, now: datetime | None = None) -> None:
    """Called at sign-out."""
    if not tracked(user):
        return
    now = now or timezone.now()
    with transaction.atomic():
        session = _open(user)
        if session is not None:
            _close(session, min(now, session.last_seen_at + idle_limit()), reason)


def enforce(user, now: datetime | None = None) -> bool:
    """True if this receptionist may keep using the app. Closes an idle session as a side effect."""
    if not tracked(user):
        return True
    now = now or timezone.now()
    with transaction.atomic():
        session = _open(user)
        if session is None:
            return False  # signed out already (idle or elsewhere): sign in again
        if now - session.last_seen_at > idle_limit():
            _close(session, session.last_seen_at, E_.IDLE)
            return False
        return True


def ping(user, now: datetime | None = None) -> bool:
    """The page saw real activity. False if the session had already gone idle."""
    if not tracked(user):
        return True
    now = now or timezone.now()
    with transaction.atomic():
        session = _open(user)
        if session is None:
            return False
        if now - session.last_seen_at > idle_limit():
            _close(session, session.last_seen_at, E_.IDLE)
            return False
        session.last_seen_at = now
        session.save(update_fields=["last_seen_at"])
        return True


# --------------------------------------------------------------------------- hours and pay


def worked_seconds(session: WorkSession) -> int:
    """An open session counts up to the last activity, never beyond."""
    stop = session.ended_at or session.last_seen_at
    return max(0, int((stop - session.started_at).total_seconds()))


def hours(seconds: int) -> Decimal:
    return (Decimal(seconds) / 3600).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def pay(seconds: int, rate) -> Decimal | None:
    if rate is None:
        return None
    return (Decimal(seconds) * Decimal(rate) / 3600).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def month_bounds(year: int, month: int):
    tz = timezone.get_current_timezone()
    first = datetime.combine(date(year, month, 1), time.min, tzinfo=tz)
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    return first, datetime.combine(nxt, time.min, tzinfo=tz)


def sessions_in(user, start_at: datetime, end_at: datetime):
    return WorkSession.objects.filter(user=user, started_at__gte=start_at, started_at__lt=end_at)
