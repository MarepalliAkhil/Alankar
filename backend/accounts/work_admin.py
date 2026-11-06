"""Admin view of receptionists' work: shifts, punctuality, sessions that look wrong, and pay.

Hours and pay come from WorkSessions exactly as accounts.work counts them (corrections already
applied). Nothing here changes data except the weekly shifts; session corrections are in
accounts.work_views and are audited there.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from accounts import work
from accounts.models import ShiftSchedule, User, WorkSession
from website.content import security_settings

LONG_HOURS = 12  # a session longer than this is flagged (a correction may be at most 16)
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

FLAG_LABELS = {
    "long": "Very long session",
    "overlap": "Overlaps another session",
    "idle": "Ended by the idle sign-out",
    "stale": "Still open but idle",
}


def grace() -> timedelta:
    return timedelta(minutes=int(security_settings()["late_grace_minutes"]))


def receptionists(first: datetime, nxt: datetime):
    """Active receptionists, plus any former one who has sessions in the period."""
    had = WorkSession.objects.filter(user=OuterRef("pk"), started_at__gte=first, started_at__lt=nxt)
    return (
        User.objects.filter(role=User.Role.RECEPTIONIST)
        .filter(Q(is_active=True) | Exists(had))
        .order_by("full_name", "email")
    )


def _stop(session: WorkSession) -> datetime:
    return session.ended_at or session.last_seen_at


def flag_sessions(sessions: list[WorkSession], now: datetime | None = None) -> dict:
    """session id -> list of flag codes."""
    now = now or timezone.now()
    out: dict = {s.id: [] for s in sessions}
    ordered = sorted(sessions, key=lambda s: s.started_at)
    for session in ordered:
        if work.worked_seconds(session) > LONG_HOURS * 3600:
            out[session.id].append("long")
        if session.end_reason == WorkSession.EndReason.IDLE:
            out[session.id].append("idle")
        if session.ended_at is None and now - session.last_seen_at > work.idle_limit():
            out[session.id].append("stale")
    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            if b.started_at >= _stop(a):
                break
            for one in (a, b):
                if "overlap" not in out[one.id]:
                    out[one.id].append("overlap")
    return out


def session_rows(sessions: list[WorkSession], now: datetime | None = None) -> list[dict]:
    from accounts.work_views import session_row

    flags = flag_sessions(sessions, now)
    rows = []
    for s in sessions:
        row = session_row(s)
        row["corrected_by"] = s.corrected_by.full_name if s.corrected_by_id else ""
        row["flags"] = [{"code": c, "label": FLAG_LABELS[c]} for c in flags[s.id]]
        rows.append(row)
    return rows


# --------------------------------------------------------------------------- shifts


def weekly_shifts(user: User) -> list[dict | None]:
    by_day = {s.weekday: s for s in ShiftSchedule.objects.filter(user=user)}
    return [
        None
        if i not in by_day
        else {
            "start": by_day[i].start_time.strftime("%H:%M"),
            "end": by_day[i].end_time.strftime("%H:%M"),
        }
        for i in range(7)
    ]


# --------------------------------------------------------------------------- punctuality


def receptionist_punctuality(
    user: User, first: datetime, nxt: datetime, now: datetime | None = None
) -> dict:
    """For every day in the period with a shift: was the first session of that day started
    within the grace period of the shift start? No shifts at all means "No shift set"."""
    now = now or timezone.now()
    shifts = {s.weekday: s for s in ShiftSchedule.objects.filter(user=user)}
    if not shifts:
        return {"has_shifts": False, "label": "No shift set", "days": []}
    tz = timezone.get_current_timezone()
    sessions = list(
        WorkSession.objects.filter(
            user=user, started_at__gte=first - timedelta(days=1), started_at__lt=nxt
        )
    )
    first_by_day: dict[date, WorkSession] = {}
    for s in sorted(sessions, key=lambda s: s.started_at):
        first_by_day.setdefault(s.started_at.astimezone(tz).date(), s)
    days = []
    day = first.astimezone(tz).date()
    last = (nxt.astimezone(tz) - timedelta(days=1)).date()
    while day <= last:
        shift = shifts.get(day.weekday())
        if shift is not None:
            start_at = datetime.combine(day, shift.start_time, tzinfo=tz)
            end_at = datetime.combine(day, shift.end_time, tzinfo=tz)
            if start_at + grace() > now:
                day += timedelta(days=1)
                continue  # the shift has not started yet
            session = first_by_day.get(day)
            if session is None or session.started_at > end_at:
                state, late_by = "missed", None
            elif session.started_at <= start_at + grace():
                state, late_by = "on_time", 0
            else:
                state = "late"
                late_by = int((session.started_at - start_at).total_seconds() // 60)
            days.append(
                {
                    "date": day.isoformat(),
                    "shift": f"{shift.start_time:%H:%M}-{shift.end_time:%H:%M}",
                    "state": state,
                    "minutes_late": late_by,
                    "signed_in": session.started_at if session and state != "missed" else None,
                }
            )
        day += timedelta(days=1)
    counted = len(days)
    on_time = sum(1 for d in days if d["state"] == "on_time")
    return {
        "has_shifts": True,
        "label": "",
        "shifts_counted": counted,
        "on_time": on_time,
        "late": sum(1 for d in days if d["state"] == "late"),
        "missed": sum(1 for d in days if d["state"] == "missed"),
        "on_time_rate": None
        if counted == 0
        else str((Decimal(on_time) * 100 / counted).quantize(Decimal("0.1"))),
        "days": days,
    }


# --------------------------------------------------------------------------- monthly pay


def month_pay(user: User, first: datetime, nxt: datetime) -> dict:
    """Hours x hourly rate for the month, with corrections applied (they are the stored times)."""
    sessions = list(work.sessions_in(user, first, nxt).select_related("corrected_by"))
    seconds = sum(work.worked_seconds(s) for s in sessions)
    tz = timezone.get_current_timezone()
    per_day: dict[date, int] = {}
    for s in sessions:
        d = s.started_at.astimezone(tz).date()
        per_day[d] = per_day.get(d, 0) + work.worked_seconds(s)
    rate = user.hourly_rate
    pay = work.pay(seconds, rate)
    return {
        "hourly_rate": None if rate is None else str(rate),
        "hours": str(work.hours(seconds)),
        "sessions": len(sessions),
        "corrected_sessions": sum(1 for s in sessions if s.corrected_by_id),
        "pay": None if pay is None else str(pay),
        "days": [
            {"date": d.isoformat(), "hours": str(work.hours(sec))}
            for d, sec in sorted(per_day.items())
        ],
    }


def overview(user: User, first: datetime, nxt: datetime, now: datetime | None = None) -> dict:
    sessions = list(work.sessions_in(user, first, nxt))
    flags = flag_sessions(sessions, now)
    pay = month_pay(user, first, nxt)
    punctual = receptionist_punctuality(user, first, nxt, now)
    return {
        "id": str(user.pk),
        "name": user.full_name or user.email,
        "active": user.is_active,
        "pay": pay,
        "flagged_sessions": sum(1 for f in flags.values() if f),
        "punctuality": {k: v for k, v in punctual.items() if k != "days"},
    }


def detail(user: User, first: datetime, nxt: datetime, now: datetime | None = None) -> dict:
    sessions = list(
        work.sessions_in(user, first, nxt).select_related("corrected_by").order_by("started_at")
    )
    return {
        **overview(user, first, nxt, now),
        "sessions": session_rows(sessions, now),
        "shifts": weekly_shifts(user),
        "punctuality": receptionist_punctuality(user, first, nxt, now),
    }


def parse_time(value: str) -> time:
    hour, minute = (int(part) for part in value.split(":"))
    return time(hour, minute)
