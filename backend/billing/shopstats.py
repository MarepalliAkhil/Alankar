"""Shop statistics for the admin dashboard (Task 14B).

ONE service that turns the rows already in the portal into the numbers on the admin dashboard.
It is a plain module with no HTTP in it, so other parts (the Alankar Intelligence insights) can
call `build()` or any single function later. Nothing is estimated or invented: if there is no data
the numbers are 0 or `None` (shown as "no data"), never a made-up value.

Definitions (also shown on the dashboard):

* Dates are local dates; a range is whole days, start and end included. The comparison period is
  the same number of days immediately before it.
* Revenue is before GST, in the same way as the Reports page: an invoice's subtotal shared over its
  lines by price (`billing.reports.shares`). Streams: services, products (counter sales), tips
  (invoice tips), packages and memberships (wallet sales on the sale day, minus refunds of those
  sales). Total = the five streams. Refunds on invoices are shown next to it, not subtracted.
* Bookings are counted on the day of the visit (`start`; a request that has no time yet uses the
  time the customer asked for).
* Rating = submitted ratings that are not excluded, by the day they were submitted.
* Utilization = booked minutes (scheduled, checked-in, in-progress and completed visits) divided by
  working minutes (each stylist's weekly hours, or the shop's hours, minus approved days off).
* New vs returning = customers billed in the range: "new" when their first ever bill falls in it.
* Acceptance rate = requests (created in the range) that were accepted by both sides divided by
  those that were accepted, declined or expired. Open requests and ones the customer withdrew are
  not counted. Response time = minutes from the request to the first answer of each side, and to
  the decision that moved it out of "requested".
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from billing import reports
from billing.models import Invoice, Refund
from inventory.models import Product
from marketing.models import CouponRedemption
from people.models import DayOffRequest, PayrollRun, Rating, StylistProfile
from scheduling.models import Appointment, AppointmentEvent, AppointmentStatus
from shop.models import Order
from wallet.models import Membership, MembershipEntry, PackageEntry, Sale, SaleRefund

S = AppointmentStatus
ZERO = Decimal("0")
PRESETS = ("today", "7d", "30d", "month", "custom")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
BUSY = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)
DESK_ANSWERS = ("reception_accepted", "reception_declined", "confirmed", "rejected")
STYLIST_ANSWERS = ("stylist_accepted", "stylist_declined", "confirmed")
DECLINED = (S.DECLINED_BY_STYLIST, S.DECLINED_BY_RECEPTION, S.REJECTED)
STREAMS = ("services", "products", "tips", "packages", "memberships")
STREAM_LABELS = {
    "services": "Services",
    "products": "Products",
    "tips": "Tips",
    "packages": "Packages",
    "memberships": "Memberships",
}
STATUS_ORDER = (
    S.REQUESTED,
    S.AWAITING_PAYMENT,
    S.SCHEDULED,
    S.CHECKED_IN,
    S.IN_PROGRESS,
    S.COMPLETED,
    S.CANCELLED,
    S.NO_SHOW,
    S.DECLINED_BY_STYLIST,
    S.DECLINED_BY_RECEPTION,
    S.REJECTED,
    S.EXPIRED,
    S.PAYMENT_EXPIRED,
)


class StatsError(Exception):
    pass


# ----------------------------------------------------------------------------- periods


def _month_start(day: date) -> date:
    return day.replace(day=1)


def resolve_period(params, today: date | None = None) -> dict:
    """The chosen range and the equally long one just before it."""
    today = today or timezone.localdate()
    preset = params.get("preset") or "30d"
    if preset not in PRESETS:
        raise StatsError("Choose today, 7 days, 30 days, this month or a custom range.")
    if preset == "today":
        start = end = today
    elif preset == "7d":
        start, end = today - timedelta(days=6), today
    elif preset == "30d":
        start, end = today - timedelta(days=29), today
    elif preset == "month":
        start, end = _month_start(today), today
    else:
        try:
            start = date.fromisoformat(params.get("from") or "")
            end = date.fromisoformat(params.get("to") or "")
        except ValueError as exc:
            raise StatsError("Dates must look like 2026-10-27.") from exc
    if start > end:
        raise StatsError("The start date is after the end date.")
    length = (end - start).days + 1
    if length > reports.MAX_DAYS:
        raise StatsError(f"Choose a range of at most {reports.MAX_DAYS} days.")
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    return {
        "preset": preset,
        "start": start,
        "end": end,
        "prev_start": prev_start,
        "prev_end": prev_end,
        "days": length,
    }


def _money(value) -> str:
    return str(reports.q(value))


def _change(current, previous) -> dict:
    """Current vs previous with the percent change (`None` when there is nothing to compare)."""
    pct = None
    if previous is not None and current is not None and Decimal(str(previous)) != 0:
        pct = float(
            (
                (Decimal(str(current)) - Decimal(str(previous))) / Decimal(str(previous)) * 100
            ).quantize(Decimal("0.1"))
        )
    return {"value": current, "previous": previous, "change_pct": pct}


def _table(
    columns: list[tuple[str, str, str]], rows: list[dict], totals: dict | None = None
) -> dict:
    out = {
        "columns": [{"key": k, "label": label, "kind": kind} for k, label, kind in columns],
        "rows": rows,
    }
    if totals is not None:
        out["totals"] = totals
    return out


# ----------------------------------------------------------------------------- revenue


def revenue_by_day(start: date, end: date) -> dict[date, dict[str, Decimal]]:
    """Revenue of each stream on each day of the range (days with nothing are present as zeros)."""
    per = {d: dict.fromkeys(STREAMS, ZERO) for d in reports.days(start, end)}
    for invoice, item, part in reports.allocated(start, end):
        day = timezone.localtime(invoice.issued_at).date()
        per[day]["products" if item.kind == "product" else "services"] += part
    lo, hi = reports.bounds(start, end)
    for issued, tip in Invoice.objects.filter(issued_at__gte=lo, issued_at__lt=hi).values_list(
        "issued_at", "tip_amount"
    ):
        per[timezone.localtime(issued).date()]["tips"] += tip
    sales = Sale.objects.filter(
        created_at__gte=lo, created_at__lt=hi, kind__in=("package", "membership")
    ).annotate(refunded=Coalesce(Sum("refunds__amount"), ZERO))
    for sale in sales:
        key = "packages" if sale.kind == "package" else "memberships"
        per[timezone.localtime(sale.created_at).date()][key] += sale.amount - sale.refunded
    return per


def revenue(start: date, end: date) -> dict:
    per = revenue_by_day(start, end)
    streams = {s: sum((d[s] for d in per.values()), ZERO) for s in STREAMS}
    total = sum(streams.values(), ZERO)
    lo, hi = reports.bounds(start, end)
    invoices = Invoice.objects.filter(issued_at__gte=lo, issued_at__lt=hi).aggregate(
        bills=Count("id"), billed=Coalesce(Sum("total"), ZERO)
    )
    refunds = Refund.objects.filter(
        status=Refund.Status.PROCESSED, processed_at__gte=lo, processed_at__lt=hi
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
    orders = Order.objects.filter(
        status__in=("placed", "packed", "shipped", "delivered"),
        created_at__gte=lo,
        created_at__lt=hi,
    ).aggregate(count=Count("id"), total=Coalesce(Sum("total"), ZERO))
    return {
        "per_day": per,
        "streams": streams,
        "total": total,
        "bills": invoices["bills"],
        "average_bill": (invoices["billed"] / invoices["bills"]) if invoices["bills"] else None,
        "refunds_paid": refunds,
        "online_orders": orders["count"],
        "online_orders_total": orders["total"],
    }


# ----------------------------------------------------------------------------- bookings


def _visit_filter(lo: datetime, hi: datetime) -> Q:
    return Q(start__gte=lo, start__lt=hi) | Q(
        start__isnull=True, preferred_start__gte=lo, preferred_start__lt=hi
    )


def bookings(start: date, end: date) -> dict:
    lo, hi = reports.bounds(start, end)
    rows = Appointment.objects.filter(_visit_filter(lo, hi)).values_list(
        "status", "start", "preferred_start"
    )
    by_status: dict[str, int] = defaultdict(int)
    per_day = {
        d: {"total": 0, "completed": 0, "cancelled": 0, "no_show": 0}
        for d in reports.days(start, end)
    }
    for status, when, asked in rows:
        by_status[status] += 1
        day = timezone.localtime(when or asked).date()
        cell = per_day[day]
        cell["total"] += 1
        if status == S.COMPLETED:
            cell["completed"] += 1
        elif status == S.CANCELLED:
            cell["cancelled"] += 1
        elif status == S.NO_SHOW:
            cell["no_show"] += 1
    return {
        "by_status": dict(by_status),
        "per_day": per_day,
        "total": sum(by_status.values()),
        "completed": by_status.get(S.COMPLETED, 0),
        "cancelled": by_status.get(S.CANCELLED, 0),
        "no_show": by_status.get(S.NO_SHOW, 0),
    }


# ----------------------------------------------------------------------------- people and quality


def ratings(start: date, end: date) -> dict:
    lo, hi = reports.bounds(start, end)
    agg = (
        Rating.objects.filter(
            status=Rating.Status.SUBMITTED, submitted_at__gte=lo, submitted_at__lt=hi
        )
        .exclude(moderation=Rating.Moderation.EXCLUDED)
        .aggregate(count=Count("id"), stars=Sum("stars"))
    )
    count = agg["count"]
    return {"count": count, "average": round(agg["stars"] / count, 2) if count else None}


def _hours_on(profile: StylistProfile, shop: dict, weekday: str):
    own = profile.weekly_hours or {}
    return own[weekday] if weekday in own else shop.get(weekday)


def _minutes(hours) -> int:
    if not hours or len(hours) != 2:
        return 0
    a = time.fromisoformat(hours[0])
    b = time.fromisoformat(hours[1])
    return max(0, (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute))


def utilization(start: date, end: date) -> dict:
    from website.content import booking_settings

    shop = booking_settings()["weekly_hours"]
    lo, hi = reports.bounds(start, end)
    profiles = list(
        StylistProfile.objects.filter(
            Q(user__isnull=True) | Q(user__is_active=True)
        ).prefetch_related("days_off")
    )
    booked = {
        row["stylist_id"]: row["minutes"] or 0
        for row in Appointment.objects.filter(
            status__in=BUSY, start__gte=lo, start__lt=hi, stylist__isnull=False
        )
        .values("stylist_id")
        .annotate(minutes=Sum("duration_minutes"))
    }
    rows = []
    for profile in profiles:
        off = [
            (d.start_date, d.end_date)
            for d in profile.days_off.all()
            if d.status == DayOffRequest.Status.APPROVED
        ]
        available = 0
        for day in reports.days(start, end):
            if any(a <= day <= b for a, b in off):
                continue
            available += _minutes(_hours_on(profile, shop, WEEKDAYS[day.weekday()]))
        used = booked.get(profile.id, 0)
        rows.append(
            {
                "id": str(profile.id),
                "name": profile.display_name,
                "booked_minutes": used,
                "available_minutes": available,
                "utilization_pct": round(used / available * 100, 1) if available else None,
            }
        )
    available = sum(r["available_minutes"] for r in rows)
    used = sum(r["booked_minutes"] for r in rows)
    return {
        "rows": rows,
        "booked_minutes": used,
        "available_minutes": available,
        "pct": round(used / available * 100, 1) if available else None,
    }


def customers(start: date, end: date) -> dict:
    lo, hi = reports.bounds(start, end)
    ids = set(
        Invoice.objects.filter(issued_at__gte=lo, issued_at__lt=hi, customer__isnull=False)
        .values_list("customer_id", flat=True)
        .distinct()
    )
    first = {
        row["customer_id"]: row["first"]
        for row in Invoice.objects.filter(customer_id__in=ids)
        .values("customer_id")
        .annotate(first=Min("issued_at"))
    }
    new = sum(1 for cid in ids if first[cid] >= lo)
    return {"new": new, "returning": len(ids) - new, "total": len(ids)}


def requests(start: date, end: date) -> dict:
    """Acceptance rate and response times of the booking requests created in the range."""
    lo, hi = reports.bounds(start, end)
    # A request is a booking that was sent by the customer (it has a "requested" event); visits
    # the desk created for a walk-in were never requests and are not counted.
    sent = dict(
        AppointmentEvent.objects.filter(
            action="requested", created_at__gte=lo, created_at__lt=hi
        ).values_list("appointment_id", "created_at")
    )
    status_of = dict(Appointment.objects.filter(id__in=sent).values_list("id", "status"))
    asked = {i: SimpleNamespace(status=status_of[i], created_at=sent[i]) for i in status_of}
    events = AppointmentEvent.objects.filter(
        appointment_id__in=asked, from_status=S.REQUESTED
    ).values_list("appointment_id", "action", "to_status", "created_at")
    accepted: set = set()
    decision: dict = {}
    desk: dict = {}
    stylist: dict = {}
    for appt_id, action, to_status, when in events:
        if to_status in (S.AWAITING_PAYMENT, S.SCHEDULED):
            accepted.add(appt_id)
        if action in DESK_ANSWERS:
            desk[appt_id] = min(when, desk.get(appt_id, when))
        if action in STYLIST_ANSWERS:
            stylist[appt_id] = min(when, stylist.get(appt_id, when))
        # the step that took it out of "requested" (not a timeout, not the customer withdrawing)
        if to_status not in (S.REQUESTED, S.EXPIRED, S.CANCELLED):
            decision[appt_id] = min(when, decision.get(appt_id, when))
    declined = {i for i, a in asked.items() if a.status in DECLINED}
    expired = {i for i, a in asked.items() if a.status == S.EXPIRED}
    answered = len(accepted | declined | expired)

    def minutes(stamps: dict) -> float | None:
        values = [(stamps[i] - asked[i].created_at).total_seconds() / 60 for i in stamps]
        return round(sum(values) / len(values), 1) if values else None

    return {
        "requests": len(asked),
        "accepted": len(accepted),
        "declined": len(declined - accepted),
        "expired": len(expired - accepted),
        "open": sum(1 for a in asked.values() if a.status == S.REQUESTED),
        "acceptance_pct": round(len(accepted) / answered * 100, 1) if answered else None,
        "decision_minutes": minutes(decision),
        "desk_minutes": minutes(desk),
        "stylist_minutes": minutes(stylist),
    }


# ----------------------------------------------------------------------------- tables


def top_stylists(start: date, end: date, limit: int = 10) -> list[dict]:
    lo, hi = reports.bounds(start, end)
    revenue_by: dict = defaultdict(lambda: ZERO)
    for invoice, item, part in reports.allocated(start, end):
        stylist = invoice.appointment.stylist if invoice.appointment_id else None
        if item.kind == "service" and stylist is not None:
            revenue_by[stylist.id] += part
    done = dict(
        Appointment.objects.filter(
            status=S.COMPLETED, start__gte=lo, start__lt=hi, stylist__isnull=False
        )
        .values_list("stylist_id")
        .annotate(n=Count("id"))
    )
    stars = {
        row["stylist_id"]: (row["n"], row["total"])
        for row in Rating.objects.filter(
            status=Rating.Status.SUBMITTED, submitted_at__gte=lo, submitted_at__lt=hi
        )
        .exclude(moderation=Rating.Moderation.EXCLUDED)
        .values("stylist_id")
        .annotate(n=Count("id"), total=Sum("stars"))
    }
    names = dict(StylistProfile.objects.values_list("id", "display_name"))
    rows = []
    for sid in set(revenue_by) | set(done) | set(stars):
        n, total = stars.get(sid, (0, 0))
        rows.append(
            {
                "name": names.get(sid, "Former stylist"),
                "revenue": _money(revenue_by.get(sid, ZERO)),
                "completed": done.get(sid, 0),
                "rating": round(total / n, 2) if n else "",
                "ratings": n,
            }
        )
    rows.sort(key=lambda r: (-Decimal(r["revenue"]), -r["completed"], r["name"]))
    return rows[:limit]


def top_products(start: date, end: date, limit: int = 10) -> list[dict]:
    grouped: dict = {}
    for _, item, part in reports.allocated(start, end):
        if item.kind != "product":
            continue
        row = grouped.setdefault(
            item.description, {"name": item.description, "units": 0, "revenue": ZERO}
        )
        row["units"] += item.quantity
        row["revenue"] += part
    rows = sorted(grouped.values(), key=lambda r: (-r["revenue"], r["name"]))[:limit]
    return [{**r, "revenue": _money(r["revenue"])} for r in rows]


def low_stock() -> list[dict]:
    """Active products at or below their low-stock level (right now, not by date)."""
    rows = []
    products = Product.objects.filter(is_active=True).annotate(
        stock=Coalesce(Sum("movements__delta"), 0)
    )
    for p in products:
        if p.stock <= p.low_stock_level:
            rows.append(
                {"name": p.name, "sku": p.sku, "stock": p.stock, "level": p.low_stock_level}
            )
    rows.sort(key=lambda r: (r["stock"] - r["level"], r["name"]))
    return rows


def by_service(start: date, end: date, limit: int = 10) -> list[dict]:
    grouped: dict = {}
    for invoice, item, part in reports.allocated(start, end):
        if item.kind != "service":
            continue
        name = invoice.appointment.service_name
        row = grouped.setdefault(name, {"name": name, "visits": 0, "revenue": ZERO})
        row["visits"] += item.quantity
        row["revenue"] += part
    rows = sorted(grouped.values(), key=lambda r: (-r["revenue"], r["name"]))[:limit]
    return [{**r, "revenue": _money(r["revenue"])} for r in rows]


def offers(start: date, end: date) -> dict:
    lo, hi = reports.bounds(start, end)
    used = CouponRedemption.objects.filter(
        created_at__gte=lo, created_at__lt=hi, released_at__isnull=True
    )
    coupon_rows = [
        {"name": row["coupon__code"], "uses": row["n"], "given": _money(row["total"] or ZERO)}
        for row in used.values("coupon__code")
        .annotate(n=Count("id"), total=Sum("amount"))
        .order_by("-n", "coupon__code")[:10]
    ]
    sold = {
        kind: Sale.objects.filter(kind=kind, created_at__gte=lo, created_at__lt=hi).aggregate(
            n=Count("id"), total=Coalesce(Sum("amount"), ZERO)
        )
        for kind in ("package", "membership")
    }
    refunded = {
        kind: SaleRefund.objects.filter(
            sale__kind=kind, sale__created_at__gte=lo, sale__created_at__lt=hi
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
        for kind in ("package", "membership")
    }
    used_entries = PackageEntry.objects.filter(
        created_at__gte=lo, created_at__lt=hi, reason__in=("used", "consumed")
    )
    sessions = (
        used_entries.filter(appointment__isnull=True).count()
        + used_entries.filter(appointment__isnull=False).values("appointment_id").distinct().count()
    )
    entries = {
        row["reason"]: row["n"]
        for row in MembershipEntry.objects.filter(created_at__gte=lo, created_at__lt=hi)
        .values("reason")
        .annotate(n=Count("id"))
    }
    return {
        "coupons": {
            "uses": sum(r["uses"] for r in coupon_rows) if len(coupon_rows) < 10 else used.count(),
            "given": _money(used.aggregate(t=Coalesce(Sum("amount"), ZERO))["t"]),
            "top": coupon_rows,
        },
        "packages": {
            "sold": sold["package"]["n"],
            "net": _money(sold["package"]["total"] - refunded["package"]),
            "sessions_used": sessions,
        },
        "memberships": {
            "sold": sold["membership"]["n"],
            "net": _money(sold["membership"]["total"] - refunded["membership"]),
            "joined": entries.get("joined", 0),
            "renewed": entries.get("renewed", 0),
            "cancelled": entries.get("cancelled", 0),
            "ended": entries.get("ended", 0),
            "active_now": Membership.objects.filter(status="active").count(),
        },
    }


def payroll(start: date, end: date) -> list[dict]:
    months = sorted({f"{d.year}-{d.month:02d}" for d in reports.days(start, end)})
    runs = (
        PayrollRun.objects.filter(month__in=months).annotate(staff=Count("items")).order_by("month")
    )
    labels = dict(PayrollRun.Status.choices)
    have = {r.month: r for r in runs}
    out = []
    for month in months:
        run = have.get(month)
        out.append(
            {
                "month": month,
                "status": labels[run.status] if run else "No run yet",
                "staff": run.staff if run else 0,
            }
        )
    return out


# ----------------------------------------------------------------------------- the dashboard


def _gather(start: date, end: date) -> dict:
    """Every figure of one range, computed once (used for the range and the one before it)."""
    return {
        "rev": revenue(start, end),
        "book": bookings(start, end),
        "rating": ratings(start, end),
        "use": utilization(start, end),
        "cust": customers(start, end),
        "req": requests(start, end),
    }


def _kpis(g: dict) -> dict:
    rev, book, rating, use, cust, req = (
        g[k] for k in ("rev", "book", "rating", "use", "cust", "req")
    )
    return {
        "revenue_total": rev["total"],
        **{f"revenue_{s}": rev["streams"][s] for s in STREAMS},
        "bills": rev["bills"],
        "average_bill": rev["average_bill"],
        "bookings": book["total"],
        "completed": book["completed"],
        "cancelled": book["cancelled"],
        "no_show": book["no_show"],
        "average_rating": rating["average"],
        "ratings": rating["count"],
        "utilization_pct": use["pct"],
        "new_customers": cust["new"],
        "returning_customers": cust["returning"],
        "acceptance_pct": req["acceptance_pct"],
        "desk_minutes": req["desk_minutes"],
        "stylist_minutes": req["stylist_minutes"],
        "decision_minutes": req["decision_minutes"],
    }


MONEY_KPIS = {"revenue_total", "average_bill", *(f"revenue_{s}" for s in STREAMS)}


def _fmt(key: str, value):
    if value is None:
        return None
    return _money(value) if key in MONEY_KPIS else value


def build(period: dict) -> dict:
    """The whole dashboard for a period from `resolve_period`."""
    start, end = period["start"], period["end"]
    ps, pe = period["prev_start"], period["prev_end"]
    g, before = _gather(start, end), _gather(ps, pe)
    now_k, before_k = _kpis(g), _kpis(before)
    kpis = {key: _change(_fmt(key, now_k[key]), _fmt(key, before_k[key])) for key in now_k}

    rev, book, use, req = g["rev"], g["book"], g["use"], g["req"]
    off = offers(start, end)

    trend_rows = [
        {
            "date": day.isoformat(),
            **{s: _money(v[s]) for s in STREAMS},
            "total": _money(sum(v.values(), ZERO)),
        }
        for day, v in rev["per_day"].items()
    ]
    status_labels = dict(S.choices)
    status_rows = [
        {"status": status_labels[s], "count": book["by_status"][s]}
        for s in STATUS_ORDER
        if book["by_status"].get(s)
    ]
    prev_streams = before["rev"]["streams"]
    streams_rows = [
        {
            "stream": STREAM_LABELS[s],
            "revenue": _money(rev["streams"][s]),
            "previous": _money(prev_streams[s]),
        }
        for s in STREAMS
    ]
    heat = reports.peak_hours_visits(start, end)

    tables = {
        "revenue_streams": _table(
            [
                ("stream", "Stream", "text"),
                ("revenue", "Revenue (before GST)", "money"),
                ("previous", "Previous period", "money"),
            ],
            streams_rows,
            {
                "stream": "Total",
                "revenue": _money(rev["total"]),
                "previous": _money(sum(prev_streams.values(), ZERO)),
            },
        ),
        "bookings_by_status": _table(
            [("status", "Status", "text"), ("count", "Bookings", "number")],
            status_rows,
            {"status": "Total", "count": book["total"]},
        ),
        "revenue_trend": _table(
            [("date", "Day", "text")]
            + [(s, STREAM_LABELS[s], "money") for s in STREAMS]
            + [("total", "Total", "money")],
            trend_rows,
        ),
        "bookings_per_day": _table(
            [
                ("date", "Day", "text"),
                ("total", "Bookings", "number"),
                ("completed", "Completed", "number"),
                ("cancelled", "Cancelled", "number"),
                ("no_show", "No-shows", "number"),
            ],
            [{"date": d.isoformat(), **v} for d, v in book["per_day"].items()],
        ),
        "busiest_hours": {
            "columns": heat["columns"],
            "rows": heat["rows"],
            "totals": heat["totals"],
            "hours": heat["chart"]["hours"],
            "busiest": heat.get("summary", {}).get("busiest"),
        },
        "revenue_by_service": _table(
            [
                ("name", "Service", "text"),
                ("visits", "Visits", "number"),
                ("revenue", "Revenue (before GST)", "money"),
            ],
            by_service(start, end),
        ),
        "top_stylists": _table(
            [
                ("name", "Stylist", "text"),
                ("revenue", "Revenue (before GST)", "money"),
                ("completed", "Completed visits", "number"),
                ("rating", "Average rating", "number"),
                ("ratings", "Ratings", "number"),
            ],
            top_stylists(start, end),
        ),
        "utilization": _table(
            [
                ("name", "Stylist", "text"),
                ("booked_minutes", "Booked minutes", "number"),
                ("available_minutes", "Working minutes", "number"),
                ("utilization_pct", "Utilization (%)", "number"),
            ],
            use["rows"],
        ),
        "top_products": _table(
            [
                ("name", "Product", "text"),
                ("units", "Units sold", "number"),
                ("revenue", "Revenue (before GST)", "money"),
            ],
            top_products(start, end),
        ),
        "low_stock": _table(
            [
                ("name", "Product", "text"),
                ("sku", "SKU", "text"),
                ("stock", "In stock", "number"),
                ("level", "Low-stock level", "number"),
            ],
            low_stock(),
        ),
        "coupons": _table(
            [
                ("name", "Coupon", "text"),
                ("uses", "Times used", "number"),
                ("given", "Discount given", "money"),
            ],
            off["coupons"]["top"],
        ),
        "payroll": _table(
            [
                ("month", "Month", "text"),
                ("status", "Status", "text"),
                ("staff", "Staff paid", "number"),
            ],
            payroll(start, end),
        ),
    }
    return {
        "period": {
            "preset": period["preset"],
            "from": start.isoformat(),
            "to": end.isoformat(),
            "previous_from": ps.isoformat(),
            "previous_to": pe.isoformat(),
            "days": period["days"],
        },
        "generated_at": timezone.now().isoformat(),
        "kpis": kpis,
        "details": {
            "bookings_total": book["total"],
            "requests": req,
            "revenue_extra": {
                "bills": rev["bills"],
                "refunds_paid": _money(rev["refunds_paid"]),
                "online_orders": rev["online_orders"],
                "online_orders_total": _money(rev["online_orders_total"]),
            },
            "offers": {
                "coupons": {k: v for k, v in off["coupons"].items() if k != "top"},
                "packages": off["packages"],
                "memberships": off["memberships"],
            },
        },
        "tables": tables,
    }
