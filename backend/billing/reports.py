"""Admin reports. Every figure comes from the same rows the invoices are made of, so the totals
always equal the invoices in the date range.

Revenue is the invoice subtotal (before GST). GST and the total the customer paid are shown next
to it. A bill is shared over its lines in proportion to their price (so a discount or coupon is
spread fairly): service lines go to the service, its division and its stylist; product lines go
to "Retail" and have no stylist. Refunds are shown separately, on the day the refund was paid.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from billing.models import Invoice, InvoiceItem, Refund
from scheduling.models import Appointment, AppointmentStatus

ZERO = Decimal("0")
PAISA = Decimal("0.01")
MAX_DAYS = 366
RETAIL = "Retail"


class ReportError(Exception):
    pass


def q(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def parse_range(params) -> tuple[date, date]:
    today = timezone.localdate()
    try:
        end = date.fromisoformat(params.get("to") or today.isoformat())
        start = date.fromisoformat(params.get("from") or (end - timedelta(days=29)).isoformat())
    except ValueError as exc:
        raise ReportError("Dates must look like 2026-10-27.") from exc
    if start > end:
        raise ReportError("The start date is after the end date.")
    if (end - start).days >= MAX_DAYS:
        raise ReportError(f"Choose a range of at most {MAX_DAYS} days.")
    return start, end


def bounds(start: date, end: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    lo = timezone.make_aware(datetime.combine(start, datetime.min.time()), tz)
    hi = timezone.make_aware(datetime.combine(end + timedelta(days=1), datetime.min.time()), tz)
    return lo, hi


def days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def invoices(start: date, end: date):
    lo, hi = bounds(start, end)
    return Invoice.objects.filter(issued_at__gte=lo, issued_at__lt=hi)


def shares(invoice: Invoice, items: list[InvoiceItem]) -> list[Decimal]:
    """The invoice subtotal split over its items by price; the last item takes the rounding."""
    weights = [i.amount for i in items]
    whole = sum(weights, ZERO)
    out: list[Decimal] = []
    given = ZERO
    for n, weight in enumerate(weights):
        if n == len(items) - 1:
            part = invoice.subtotal - given
        elif whole > 0:
            part = q(invoice.subtotal * weight / whole)
        else:
            part = ZERO
        out.append(part)
        given += part
    return out


def allocated(start: date, end: date):
    """Yields (invoice, item, revenue share) for every item of every invoice in range."""
    qs = invoices(start, end).select_related("appointment__stylist", "appointment__service")
    qs = qs.prefetch_related("appointment__service__category", "items")
    for invoice in qs:
        items = list(invoice.items.all())
        for item, part in zip(items, shares(invoice, items), strict=True):
            yield invoice, item, part


def col(key: str, label: str, kind: str = "text") -> dict:
    return {"key": key, "label": label, "kind": kind}


def money_row(value) -> str:
    return str(q(value))


# --------------------------------------------------------------------------- reports


def revenue_by_day(start: date, end: date) -> dict:
    per: dict[date, dict] = {d: defaultdict(lambda: ZERO) for d in days(start, end)}
    for inv in invoices(start, end):
        day = timezone.localtime(inv.issued_at).date()
        row = per[day]
        row["bills"] += 1
        row["revenue"] += inv.subtotal
        row["gst"] += inv.gst_amount
        row["total"] += inv.total
        row["discounts"] += inv.discount_amount
        row["tips"] += inv.tip_amount
    lo, hi = bounds(start, end)
    for refund in Refund.objects.filter(
        status=Refund.Status.PROCESSED, processed_at__gte=lo, processed_at__lt=hi
    ):
        per[timezone.localtime(refund.processed_at).date()]["refunds"] += refund.amount
    rows = [
        {
            "date": d.isoformat(),
            "bills": int(r["bills"]),
            "revenue": money_row(r["revenue"]),
            "gst": money_row(r["gst"]),
            "total": money_row(r["total"]),
            "discounts": money_row(r["discounts"]),
            "refunds": money_row(r["refunds"]),
            "tips": money_row(r["tips"]),
        }
        for d, r in per.items()
    ]
    totals = {
        "date": "Total",
        "bills": sum(r["bills"] for r in rows),
        **{
            k: money_row(sum((Decimal(r[k]) for r in rows), ZERO))
            for k in ("revenue", "gst", "total", "discounts", "refunds", "tips")
        },
    }
    return {
        "columns": [
            col("date", "Day"),
            col("bills", "Bills", "number"),
            col("revenue", "Revenue (before GST)", "money"),
            col("gst", "GST", "money"),
            col("total", "Total billed", "money"),
            col("discounts", "Discounts and coupons", "money"),
            col("refunds", "Refunds paid", "money"),
            col("tips", "Tips", "money"),
        ],
        "rows": rows,
        "totals": totals,
        "chart": {"kind": "bar", "x": "date", "y": "revenue"},
    }


def _grouped(start, end, label_of, *, services_only=False):
    out: dict[str, dict] = {}
    for invoice, item, part in allocated(start, end):
        if services_only and item.kind != "service":
            continue
        label = label_of(invoice, item)
        row = out.setdefault(label, {"name": label, "items": 0, "revenue": ZERO})
        row["items"] += item.quantity
        row["revenue"] += part
    return out


def _finish(grouped: dict, name_label: str, count_label: str, chart_x="name") -> dict:
    rows = sorted(grouped.values(), key=lambda r: (-r["revenue"], r["name"]))
    whole = sum((r["revenue"] for r in rows), ZERO)
    out = [
        {
            "name": r["name"],
            "items": r["items"],
            "revenue": money_row(r["revenue"]),
            "share": f"{(r['revenue'] / whole * 100) if whole else ZERO:.1f}",
        }
        for r in rows
    ]
    return {
        "columns": [
            col("name", name_label),
            col("items", count_label, "number"),
            col("revenue", "Revenue (before GST)", "money"),
            col("share", "Share of revenue (%)", "number"),
        ],
        "rows": out,
        "totals": {
            "name": "Total",
            "items": sum(r["items"] for r in rows),
            "revenue": money_row(whole),
            "share": "100.0" if whole else "0.0",
        },
        "chart": {"kind": "bar", "x": chart_x, "y": "revenue"},
    }


def revenue_by_service(start: date, end: date) -> dict:
    def label(invoice, item):
        if item.kind == "product":
            return f"{RETAIL}: {item.description}"
        return invoice.appointment.service_name

    return _finish(_grouped(start, end, label), "Service or product", "Sold")


def revenue_by_stylist(start: date, end: date) -> dict:
    def label(invoice, item):
        stylist = invoice.appointment.stylist
        if item.kind == "product" or stylist is None:
            return f"{RETAIL} (no stylist)"
        return stylist.display_name

    return _finish(_grouped(start, end, label), "Stylist", "Services")


def revenue_by_division(start: date, end: date) -> dict:
    def label(invoice, item):
        if item.kind == "product":
            return RETAIL
        return invoice.appointment.service.category.get_division_display()

    return _finish(_grouped(start, end, label), "Division", "Services")


def appointments_by_status(start: date, end: date) -> dict:
    lo, hi = bounds(start, end)
    counted = {
        r["status"]: r["n"]
        for r in Appointment.objects.filter(preferred_start__gte=lo, preferred_start__lt=hi)
        .values("status")
        .annotate(n=Count("id"))
    }
    total = sum(counted.values())
    rows = [
        {
            "status": label,
            "count": counted.get(value, 0),
            "share": f"{(counted.get(value, 0) / total * 100) if total else 0:.1f}",
        }
        for value, label in AppointmentStatus.choices
    ]
    return {
        "columns": [
            col("status", "Status"),
            col("count", "Appointments", "number"),
            col("share", "Share (%)", "number"),
        ],
        "rows": rows,
        "totals": {"status": "Total", "count": total, "share": "100.0" if total else "0.0"},
        "chart": {"kind": "bar", "x": "status", "y": "count"},
    }


def no_shows_and_cancellations(start: date, end: date) -> dict:
    lo, hi = bounds(start, end)
    per = {d: {"no_show": 0, "cancelled": 0, "all": 0} for d in days(start, end)}
    qs = Appointment.objects.filter(preferred_start__gte=lo, preferred_start__lt=hi)
    for appt in qs.only("status", "preferred_start", "start"):
        when = appt.start or appt.preferred_start
        day = timezone.localtime(when).date()
        if day not in per:
            continue
        per[day]["all"] += 1
        if appt.status == AppointmentStatus.NO_SHOW:
            per[day]["no_show"] += 1
        elif appt.status == AppointmentStatus.CANCELLED:
            per[day]["cancelled"] += 1
    rows = [
        {
            "date": d.isoformat(),
            "no_show": v["no_show"],
            "cancelled": v["cancelled"],
            "all": v["all"],
        }
        for d, v in per.items()
    ]
    sums = {k: sum(r[k] for r in rows) for k in ("no_show", "cancelled", "all")}
    rate = (sums["no_show"] + sums["cancelled"]) / sums["all"] * 100 if sums["all"] else 0
    return {
        "columns": [
            col("date", "Day"),
            col("no_show", "No-shows", "number"),
            col("cancelled", "Cancellations", "number"),
            col("all", "All appointments", "number"),
        ],
        "rows": rows,
        "totals": {"date": "Total", **sums},
        "summary": {"lost_rate": f"{rate:.1f}"},
        "chart": {"kind": "bar", "x": "date", "y": "cancelled", "y2": "no_show"},
    }


def top_customers(start: date, end: date, limit: int = 10) -> dict:
    rows = (
        invoices(start, end)
        .values("customer", "customer_name")
        .annotate(visits=Count("id"), spent=Coalesce(Sum("total"), ZERO))
        .order_by("-spent", "customer_name")[:limit]
    )
    out = [
        {"name": r["customer_name"], "visits": r["visits"], "spent": money_row(r["spent"])}
        for r in rows
    ]
    return {
        "columns": [
            col("name", "Customer"),
            col("visits", "Visits", "number"),
            col("spent", "Spent (incl. GST)", "money"),
        ],
        "rows": out,
        "totals": {
            "name": f"Top {len(out)}",
            "visits": sum(r["visits"] for r in out),
            "spent": money_row(sum((Decimal(r["spent"]) for r in out), ZERO)),
        },
        "chart": {"kind": "bar", "x": "name", "y": "spent"},
    }


def product_sales(start: date, end: date) -> dict:
    grouped: dict[str, dict] = {}
    for _, item, part in allocated(start, end):
        if item.kind != "product":
            continue
        row = grouped.setdefault(
            item.description, {"name": item.description, "items": 0, "revenue": ZERO}
        )
        row["items"] += item.quantity
        row["revenue"] += part
    return _finish(grouped, "Product", "Units sold")


REPORTS = {
    "revenue-by-day": ("Revenue by day", revenue_by_day),
    "revenue-by-service": ("Revenue by service", revenue_by_service),
    "revenue-by-stylist": ("Revenue by stylist", revenue_by_stylist),
    "revenue-by-division": ("Revenue by division", revenue_by_division),
    "appointments-by-status": ("Appointments by status", appointments_by_status),
    "no-shows-cancellations": ("No-shows and cancellations", no_shows_and_cancellations),
    "top-customers": ("Top customers", top_customers),
    "product-sales": ("Product sales", product_sales),
}
