"""Sending limits for marketing emails: quiet hours and one email per customer per week.

The test settings switch both off (see conftest.py); the tests for these limits switch them on.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from core.models import MailOutbox


def quiet_hours() -> tuple[int, int] | None:
    value = getattr(settings, "SALON_MARKETING_QUIET_HOURS", (21, 9))
    return tuple(value) if value else None


def min_days() -> int:
    return int(getattr(settings, "SALON_MARKETING_MIN_DAYS", 7))


def in_quiet_hours(now: datetime | None = None) -> bool:
    hours = quiet_hours()
    if not hours:
        return False
    start, end = hours
    hour = timezone.localtime(now or timezone.now()).hour
    return hour >= start or hour < end if start > end else start <= hour < end


def quiet_ends(now: datetime | None = None) -> datetime:
    """The next time sending may start again (the shop's local time)."""
    local = timezone.localtime(now or timezone.now())
    hours = quiet_hours()
    if not hours or not in_quiet_hours(local):
        return local
    end = hours[1]
    candidate = local.replace(hour=end, minute=0, second=0, microsecond=0)
    if candidate <= local:
        candidate += timedelta(days=1)
    return candidate


def emailed_recently(email: str, now: datetime | None = None) -> bool:
    days = min_days()
    if days <= 0:
        return False
    since = (now or timezone.now()) - timedelta(days=days)
    return MailOutbox.objects.filter(
        kind=MailOutbox.Kind.MARKETING, to_email__iexact=email, created_at__gte=since
    ).exists()
