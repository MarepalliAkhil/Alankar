"""Days-off requests. A stylist cannot ask for days that still hold scheduled visits: reception
has to move those first. The admin decides on the request in Task 6."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from people.models import DayOffRequest, StylistProfile
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
MAX_DAYS = 31
HOLDING = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS)


class DayOffError(Exception):
    def __init__(self, message: str, code: str = "invalid", visits: list | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.visits = visits or []


def _bounds(start: date, end: date):
    tz = timezone.get_current_timezone()
    first = datetime.combine(start, time.min, tzinfo=tz)
    return first, datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)


def clashes(profile: StylistProfile, start: date, end: date) -> list[Appointment]:
    first, last = _bounds(start, end)
    return list(
        Appointment.objects.filter(
            stylist=profile, status__in=HOLDING, start__gte=first, start__lt=last
        ).order_by("start")
    )


def request_days_off(
    profile: StylistProfile, *, start: date, end: date, reason: str
) -> DayOffRequest:
    reason = (reason or "").strip()
    today = timezone.localdate()
    if len(reason) < 3:
        raise DayOffError("Give a short reason.")
    if end < start:
        raise DayOffError("The last day cannot be before the first day.")
    if start < today:
        raise DayOffError("Days off must start today or later.")
    if (end - start).days + 1 > MAX_DAYS:
        raise DayOffError(f"Ask for at most {MAX_DAYS} days at a time.")
    with transaction.atomic():
        StylistProfile.objects.select_for_update().get(pk=profile.pk)
        mine = DayOffRequest.objects.filter(
            stylist=profile,
            status__in=(DayOffRequest.Status.PENDING, DayOffRequest.Status.APPROVED),
            start_date__lte=end,
            end_date__gte=start,
        )
        if mine.exists():
            raise DayOffError("You already have a request for some of these days.", "conflict")
        busy = clashes(profile, start, end)
        if busy:
            raise DayOffError(
                "You have visits on these days. Ask reception to reschedule them first.",
                "visits",
                visits=busy,
            )
        return DayOffRequest.objects.create(
            stylist=profile, start_date=start, end_date=end, reason=reason[:200]
        )


def withdraw(profile: StylistProfile, request_id) -> DayOffRequest:
    with transaction.atomic():
        row = (
            DayOffRequest.objects.select_for_update().filter(pk=request_id, stylist=profile).first()
        )
        if row is None:
            raise DayOffError("Request not found.", "not_found")
        if row.status != DayOffRequest.Status.PENDING:
            raise DayOffError("Only a request that is still waiting can be withdrawn.", "conflict")
        row.status = DayOffRequest.Status.CANCELLED
        row.save(update_fields=["status"])
        return row
