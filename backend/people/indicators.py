"""Rule-based indicators for a staff member and month, from real data only.

They feed the Staff Summary and the monthly Performance Review. There is no score and no model:
each indicator is a plain number with a transparent threshold (shown on screen) so the admin can
see why it is marked good, watch or concern. Too little data is said plainly, never guessed.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from accounts import work, work_admin
from accounts.models import User
from billing.models import Invoice
from people.models import Rating, StylistProfile
from scheduling.models import Appointment, AppointmentEvent, AppointmentStatus

S = AppointmentStatus
MIN_REBOOK_CUSTOMERS = 5
REBOOK_WINDOW_DAYS = 60
# (good at or above, watch at or above); below the second number is a concern.
THRESHOLDS = {
    "rating": (Decimal("4.0"), Decimal("3.0")),
    "punctuality": (Decimal("90"), Decimal("70")),
    "rebooking": (Decimal("40"), Decimal("20")),
}
THRESHOLD_TEXT = {
    "rating": "Good from 4.0, watch from 3.0, concern below 3.0",
    "punctuality": "Good from 90%, watch from 70%, concern below 70%",
    "rebooking": "Good from 40%, watch from 20%, concern below 20%",
}
# Bookings that count as "booked again": confirmed or finished, not cancelled or no-show.
REBOOKED = (S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)


def level(kind: str, value: Decimal | None) -> str:
    if value is None:
        return "no_data"
    good, watch = THRESHOLDS[kind]
    if value >= good:
        return "good"
    return "watch" if value >= watch else "concern"


def pct(part: int, whole: int) -> Decimal | None:
    return None if whole == 0 else (Decimal(part) * 100 / whole).quantize(Decimal("0.1"))


def rating_indicator(profile: StylistProfile, first: datetime, nxt: datetime) -> dict:
    stars = list(
        Rating.objects.filter(
            stylist=profile,
            status=Rating.Status.SUBMITTED,
            moderation=Rating.Moderation.ACTIVE,
            submitted_at__gte=first,
            submitted_at__lt=nxt,
        ).values_list("stars", flat=True)
    )
    average = (Decimal(sum(stars)) / len(stars)).quantize(Decimal("0.01")) if stars else None
    return {
        "average": None if average is None else str(average),
        "count": len(stars),
        "level": level("rating", average),
        "rule": THRESHOLD_TEXT["rating"],
    }


def stylist_punctuality(profile: StylistProfile, first: datetime, nxt: datetime) -> dict:
    """Per day, the first visit that was actually started: on time if it started no later than
    its booked time plus the grace period."""
    grace = work_admin.grace()
    started = {
        e.appointment_id: e.created_at
        for e in AppointmentEvent.objects.filter(
            action="started",
            appointment__stylist=profile,
            appointment__start__gte=first,
            appointment__start__lt=nxt,
        )
    }
    appts = Appointment.objects.filter(pk__in=started.keys()).order_by("start")
    tz = timezone.get_current_timezone()
    by_day: dict = {}
    for appt in appts:
        by_day.setdefault(appt.start.astimezone(tz).date(), appt)
    days = len(by_day)
    on_time = sum(1 for a in by_day.values() if started[a.pk] <= a.start + grace)
    rate = pct(on_time, days)
    return {
        "days": days,
        "on_time": on_time,
        "late": days - on_time,
        "rate": None if rate is None else str(rate),
        "level": level("punctuality", rate),
        "rule": THRESHOLD_TEXT["punctuality"]
        + f". On time = the day's first visit starts within {int(grace.total_seconds() // 60)} "
        "minutes of its booked time.",
    }


def rebooking(profile: StylistProfile, first: datetime, nxt: datetime) -> dict:
    """Of the customers with a completed visit this month, how many booked this stylist again
    within 60 days. Cancelled and no-show visits are not part of it. Under 5 customers: no rate."""
    visits = list(
        Appointment.objects.filter(
            stylist=profile, status=S.COMPLETED, start__gte=first, start__lt=nxt
        ).order_by("start")
    )
    firsts: dict = {}
    for v in visits:
        firsts.setdefault(v.customer_id, v)
    rebooked = 0
    for customer_id, visit in firsts.items():
        later = Appointment.objects.filter(
            stylist=profile,
            customer_id=customer_id,
            status__in=REBOOKED,
            start__gt=visit.start,
            start__lte=visit.start + timedelta(days=REBOOK_WINDOW_DAYS),
        ).exists()
        rebooked += 1 if later else 0
    customers = len(firsts)
    enough = customers >= MIN_REBOOK_CUSTOMERS
    rate = pct(rebooked, customers) if enough else None
    return {
        "customers": customers,
        "rebooked": rebooked,
        "enough": enough,
        "rate": None if rate is None else str(rate),
        "label": "" if enough else "Not enough data",
        "level": level("rebooking", rate),
        "rule": THRESHOLD_TEXT["rebooking"]
        + f". Needs at least {MIN_REBOOK_CUSTOMERS} customers in the month; visits in the last "
        f"{REBOOK_WINDOW_DAYS} days may still rebook.",
    }


def stylist_indicators(profile: StylistProfile, first: datetime, nxt: datetime) -> dict:
    completed = Appointment.objects.filter(
        stylist=profile, status=S.COMPLETED, start__gte=first, start__lt=nxt
    ).count()
    no_shows = Appointment.objects.filter(
        stylist=profile, status=S.NO_SHOW, start__gte=first, start__lt=nxt
    ).count()
    return {
        "kind": "stylist",
        "completed_tasks": completed,
        "no_shows": no_shows,
        "rating": rating_indicator(profile, first, nxt),
        "punctuality": stylist_punctuality(profile, first, nxt),
        "rebooking": rebooking(profile, first, nxt),
    }


def receptionist_indicators(user: User, first: datetime, nxt: datetime) -> dict:
    pay = work_admin.month_pay(user, first, nxt)
    punctual = work_admin.receptionist_punctuality(user, first, nxt)
    sessions = list(work.sessions_in(user, first, nxt))
    flags = work_admin.flag_sessions(sessions)
    processed = Invoice.objects.filter(
        created_by=user, issued_at__gte=first, issued_at__lt=nxt
    ).aggregate(n=Count("id"), total=Sum("total"))
    if not punctual["has_shifts"]:
        rate = None
    else:
        rate = None if not punctual["shifts_counted"] else Decimal(punctual["on_time_rate"])
    return {
        "kind": "receptionist",
        "hours": pay["hours"],
        "sessions": pay["sessions"],
        "flagged_sessions": sum(1 for f in flags.values() if f),
        "corrected_sessions": pay["corrected_sessions"],
        "completed_tasks": processed["n"] or 0,
        "revenue_processed": str(processed["total"] or Decimal("0.00")),
        "punctuality": {
            "has_shifts": punctual["has_shifts"],
            "label": "" if punctual["has_shifts"] else "No shift set",
            "days": punctual.get("shifts_counted", 0),
            "on_time": punctual.get("on_time", 0),
            "late": punctual.get("late", 0),
            "missed": punctual.get("missed", 0),
            "rate": None if rate is None else str(rate),
            "level": level("punctuality", rate),
            "rule": THRESHOLD_TEXT["punctuality"]
            + f". On time = signed in within {int(work_admin.grace().total_seconds() // 60)} "
            "minutes of the shift start.",
        },
    }


def for_user(user: User, first: datetime, nxt: datetime) -> dict:
    if user.role == User.Role.STYLIST:
        profile = StylistProfile.objects.filter(user=user).first()
        if profile is None:
            return {"kind": "stylist", "unlinked": True}
        return stylist_indicators(profile, first, nxt)
    return receptionist_indicators(user, first, nxt)
