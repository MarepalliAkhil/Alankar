"""Staff Summary: numbers and graph series for every stylist and receptionist over a date range.

Revenue uses the same allocation as the Reports page (billing.reports.allocated), so a stylist's
revenue here matches "Revenue by stylist" there. Earnings are the same estimates as the Payroll
page. Ratings count only those that are not under review or excluded.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from accounts import work, work_admin
from billing import reports
from people import indicators, pay
from people.models import Rating, StylistProfile
from people.payroll import stylist_profiles
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
ZERO = Decimal("0.00")
MAX_DAYS = 366
MONTHLY_AFTER_DAYS = 120


class RangeError(Exception):
    pass


def parse_range(params) -> tuple[date, date]:
    """`month=2026-10` or `start`/`end` dates. Defaults to the current month so far."""
    today = timezone.localdate()
    month = params.get("month")
    try:
        if month:
            year, mon = (int(p) for p in str(month).split("-"))
            first = date(year, mon, 1)
            nxt = date(year + (mon == 12), mon % 12 + 1, 1)
            return first, min(nxt - timedelta(days=1), today) if first <= today else first
        if params.get("start") or params.get("end"):
            start = date.fromisoformat(params.get("start") or today.replace(day=1).isoformat())
            end = date.fromisoformat(params.get("end") or today.isoformat())
        else:
            return today.replace(day=1), today
    except ValueError as exc:
        raise RangeError("Choose a month like 2026-10, or start and end dates.") from exc
    if end < start:
        raise RangeError("The end date must not be before the start date.")
    if (end - start).days + 1 > MAX_DAYS:
        raise RangeError(f"Choose at most {MAX_DAYS} days.")
    return start, end


def _bucket_of(day: date, monthly: bool) -> date:
    return day.replace(day=1) if monthly else day - timedelta(days=day.weekday())


def buckets(start: date, end: date) -> tuple[list[date], bool]:
    monthly = (end - start).days + 1 > MONTHLY_AFTER_DAYS
    seen: list[date] = []
    day = start
    while day <= end:
        key = _bucket_of(day, monthly)
        if not seen or seen[-1] != key:
            seen.append(key)
        day += timedelta(days=1)
    return seen, monthly


def _local_date(moment: datetime) -> date:
    return moment.astimezone(timezone.get_current_timezone()).date()


def _avg(values: list[int]):
    return str((Decimal(sum(values)) / len(values)).quantize(Decimal("0.01"))) if values else None


def build(start: date, end: date) -> dict:
    lo, hi = reports.bounds(start, end)
    keys, monthly = buckets(start, end)
    index = {k: i for i, k in enumerate(keys)}

    def empty_series():
        return [
            {
                "bucket": k.isoformat(),
                "appointments": 0,
                "revenue": ZERO,
                "no_shows": 0,
                "stars": [],
                "hours": ZERO,
            }
            for k in keys
        ]

    profiles = stylist_profiles(lo, hi)
    stylist_rows = {
        str(p.id): {"profile": p, "series": empty_series(), "stars": []} for p in profiles
    }
    team = empty_series()

    # completed visits and no-shows
    for appt in Appointment.objects.filter(
        stylist__isnull=False, start__gte=lo, start__lt=hi, status__in=[S.COMPLETED, S.NO_SHOW]
    ):
        i = index[_bucket_of(_local_date(appt.start), monthly)]
        field = "appointments" if appt.status == S.COMPLETED else "no_shows"
        team[i][field] += 1
        row = stylist_rows.get(str(appt.stylist_id))
        if row:
            row["series"][i][field] += 1
    # revenue, the same split as the Reports page (services only; retail has no stylist)
    for invoice, item, part in reports.allocated(start, end):
        stylist = invoice.appointment.stylist
        if item.kind == "product" or stylist is None:
            continue
        i = index[_bucket_of(_local_date(invoice.issued_at), monthly)]
        team[i]["revenue"] += part
        row = stylist_rows.get(str(stylist.id))
        if row:
            row["series"][i]["revenue"] += part
    # ratings that count
    for r in Rating.objects.filter(
        status=Rating.Status.SUBMITTED,
        moderation=Rating.Moderation.ACTIVE,
        submitted_at__gte=lo,
        submitted_at__lt=hi,
        stylist__isnull=False,
    ):
        i = index[_bucket_of(_local_date(r.submitted_at), monthly)]
        team[i]["stars"].append(r.stars)
        row = stylist_rows.get(str(r.stylist_id))
        if row:
            row["series"][i]["stars"].append(r.stars)
            row["stars"].append(r.stars)

    # receptionists
    desk_rows = []
    for user in work_admin.receptionists(lo, hi):
        series = empty_series()
        sessions = list(work.sessions_in(user, lo, hi))
        for s in sessions:
            i = index[_bucket_of(_local_date(s.started_at), monthly)]
            hours = Decimal(work.worked_seconds(s)) / 3600
            series[i]["hours"] += hours
            team[i]["hours"] += hours
        month_pay = work_admin.month_pay(user, lo, hi)
        punctual = work_admin.receptionist_punctuality(user, lo, hi)
        flags = work_admin.flag_sessions(sessions)
        desk_rows.append(
            {
                "id": str(user.pk),
                "name": user.full_name or user.email,
                "active": user.is_active,
                "kpis": {
                    "hours": month_pay["hours"],
                    "sessions": month_pay["sessions"],
                    "pay": month_pay["pay"],
                    "flagged_sessions": sum(1 for f in flags.values() if f),
                    "corrected_sessions": month_pay["corrected_sessions"],
                    "on_time_rate": punctual.get("on_time_rate"),
                    "has_shifts": punctual["has_shifts"],
                },
                "series": [
                    {"bucket": b["bucket"], "hours": str(b["hours"].quantize(Decimal("0.01")))}
                    for b in series
                ],
            }
        )

    def clean(series):
        return [
            {
                "bucket": b["bucket"],
                "appointments": b["appointments"],
                "revenue": str(reports.q(b["revenue"])),
                "no_shows": b["no_shows"],
                "avg_rating": _avg(b["stars"]),
                "rating_count": len(b["stars"]),
                "hours": str(Decimal(b["hours"]).quantize(Decimal("0.01"))),
            }
            for b in series
        ]

    stylists = []
    team_earnings = ZERO
    for row in stylist_rows.values():
        profile: StylistProfile = row["profile"]
        series = row["series"]
        earnings = pay.earnings(profile, lo, hi)
        total = Decimal(earnings["totals"]["total"])
        team_earnings += total
        stylists.append(
            {
                "id": str(profile.id),
                "name": profile.display_name,
                "active": profile.user.is_active,
                "kpis": {
                    "appointments": sum(b["appointments"] for b in series),
                    "revenue": str(reports.q(sum((b["revenue"] for b in series), ZERO))),
                    "avg_rating": _avg(row["stars"]),
                    "rating_count": len(row["stars"]),
                    "no_shows": sum(b["no_shows"] for b in series),
                    "earnings": str(total),
                    "tips": earnings["totals"]["tips"],
                    "rebooking": indicators.rebooking(profile, lo, hi),
                    "punctuality": indicators.stylist_punctuality(profile, lo, hi),
                },
                "series": clean(series),
            }
        )
    desk_pay = sum((Decimal(r["kpis"]["pay"] or 0) for r in desk_rows), ZERO)
    all_stars = [s for r in stylist_rows.values() for s in r["stars"]]
    return {
        "range": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "bucket": "month" if monthly else "week",
        },
        "team": {
            "kpis": {
                "appointments": sum(b["appointments"] for b in team),
                "revenue": str(reports.q(sum((b["revenue"] for b in team), ZERO))),
                "avg_rating": _avg(all_stars),
                "rating_count": len(all_stars),
                "no_shows": sum(b["no_shows"] for b in team),
                "hours": str(
                    sum((Decimal(b["hours"]) for b in team), ZERO).quantize(Decimal("0.01"))
                ),
                "stylist_earnings": str(team_earnings),
                "receptionist_pay": str(desk_pay),
                "payroll_cost": str(team_earnings + desk_pay),
            },
            "series": clean(team),
        },
        "stylists": stylists,
        "receptionists": desk_rows,
    }
