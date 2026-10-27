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

from billing.models import Invoice, InvoiceItem, Payment, Refund
from scheduling.models import Appointment, AppointmentStatus
from wallet.models import GiftCardEntry, Sale, SaleRefund

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


# --------------------------------------------------------------------------- hours and tender

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
BUSY = (
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.COMPLETED,
)
METHOD_NAMES = {"cash": "Cash", "card": "Card", "upi": "UPI", "online": "Online", "mock": "Online"}


def method_name(method: str) -> str:
    return METHOD_NAMES.get(method, method.title() if method else "Other")


def _when(invoice: Invoice) -> datetime:
    """The time a bill belongs to: the visit's start, or the bill time for a counter sale."""
    appt = invoice.appointment
    return timezone.localtime(appt.start if appt is not None and appt.start else invoice.issued_at)


def _hour_label(hour: int) -> str:
    return f"{hour:02d}:00"


def revenue_by_hour(start: date, end: date) -> dict:
    per: dict[int, dict] = {}
    for inv in invoices(start, end).select_related("appointment"):
        row = per.setdefault(_when(inv).hour, {"bills": 0, "revenue": ZERO, "total": ZERO})
        row["bills"] += 1
        row["revenue"] += inv.subtotal
        row["total"] += inv.total
    rows = [
        {
            "hour": _hour_label(h),
            "bills": r["bills"],
            "revenue": money_row(r["revenue"]),
            "total": money_row(r["total"]),
        }
        for h, r in sorted(per.items())
    ]
    totals = {
        "hour": "Total",
        "bills": sum(r["bills"] for r in rows),
        "revenue": money_row(sum((Decimal(r["revenue"]) for r in rows), ZERO)),
        "total": money_row(sum((Decimal(r["total"]) for r in rows), ZERO)),
    }
    return {
        "columns": [
            col("hour", "Hour of day"),
            col("bills", "Bills", "number"),
            col("revenue", "Revenue (before GST)", "money"),
            col("total", "Total billed", "money"),
        ],
        "rows": rows,
        "totals": totals,
        "chart": {"kind": "bar", "x": "hour", "y": "revenue"},
    }


def _heatmap(cells: dict, *, money: bool) -> dict:
    hours = sorted({h for (_, h) in cells}) or []
    rows = []
    for number, name in enumerate(WEEKDAYS):
        row = {"weekday": name}
        total = ZERO
        for h in hours:
            value = cells.get((number, h), ZERO)
            total += value
            row[f"h{h:02d}"] = money_row(value) if money else int(value)
        row["total"] = money_row(total) if money else int(total)
        rows.append(row)
    kind = "money" if money else "number"
    columns = [col("weekday", "Day")]
    columns += [col(f"h{h:02d}", _hour_label(h), kind) for h in hours]
    columns.append(col("total", "Total", kind))
    grand = sum(cells.values(), ZERO)
    totals = {"weekday": "Total", "total": money_row(grand) if money else int(grand)}
    for h in hours:
        column_sum = sum((v for (_, hh), v in cells.items() if hh == h), ZERO)
        totals[f"h{h:02d}"] = money_row(column_sum) if money else int(column_sum)
    peak = max(cells.items(), key=lambda kv: kv[1], default=None)
    summary = {}
    if peak is not None and peak[1] > 0:
        (number, h), value = peak
        summary["busiest"] = f"{WEEKDAYS[number]} {_hour_label(h)}"
    return {
        "columns": columns,
        "rows": rows,
        "totals": totals,
        "chart": {"kind": "heatmap", "x": "weekday", "hours": [f"h{h:02d}" for h in hours]},
        "summary": summary,
    }


def peak_hours_visits(start: date, end: date) -> dict:
    lo, hi = bounds(start, end)
    cells: dict = defaultdict(lambda: ZERO)
    for when in Appointment.objects.filter(
        status__in=BUSY, start__gte=lo, start__lt=hi
    ).values_list("start", flat=True):
        local = timezone.localtime(when)
        cells[(local.weekday(), local.hour)] += 1
    return _heatmap(dict(cells), money=False)


def peak_hours_revenue(start: date, end: date) -> dict:
    cells: dict = defaultdict(lambda: ZERO)
    for inv in invoices(start, end).select_related("appointment"):
        when = _when(inv)
        cells[(when.weekday(), when.hour)] += inv.subtotal
    return _heatmap(dict(cells), money=True)


def revenue_by_payment_method(start: date, end: date) -> dict:
    lo, hi = bounds(start, end)
    per: dict[str, dict] = {}

    def line(method: str) -> dict:
        return per.setdefault(method_name(method), {"taken": ZERO, "refunded": ZERO, "count": 0})

    ok = Payment.Status.SUCCEEDED
    for pay in Payment.objects.filter(status=ok, created_at__gte=lo, created_at__lt=hi):
        row = line(pay.method)
        row["taken"] += pay.amount
        row["count"] += 1
    for sale in Sale.objects.filter(created_at__gte=lo, created_at__lt=hi):
        row = line(sale.method)
        row["taken"] += sale.amount
        row["count"] += 1
    for refund in Refund.objects.filter(
        status=Refund.Status.PROCESSED, processed_at__gte=lo, processed_at__lt=hi
    ).select_related("payment"):
        line(refund.method or refund.payment.method)["refunded"] += refund.amount
    for back in SaleRefund.objects.filter(created_at__gte=lo, created_at__lt=hi):
        line(back.method)["refunded"] += back.amount
    rows = [
        {
            "method": name,
            "payments": r["count"],
            "taken": money_row(r["taken"]),
            "refunded": money_row(r["refunded"]),
            "net": money_row(r["taken"] - r["refunded"]),
        }
        for name, r in sorted(per.items())
    ]
    totals = {
        "method": "Total",
        "payments": sum(r["payments"] for r in rows),
        **{
            k: money_row(sum((Decimal(r[k]) for r in rows), ZERO))
            for k in ("taken", "refunded", "net")
        },
    }
    # Every bill in range was paid by checkout payments (balance plus tip) plus things that are
    # not money in the till: prepayment, wallet credit and loyalty. The first part must match.
    billed = invoices(start, end)
    due = billed.aggregate(
        v=Coalesce(Sum("balance_paid"), ZERO) + Coalesce(Sum("tip_amount"), ZERO)
    )["v"]
    paid = Payment.objects.filter(
        status=ok, kind=Payment.Kind.CHECKOUT, invoice__in=billed
    ).aggregate(v=Coalesce(Sum("amount"), ZERO))["v"]
    summary = {
        "bills_collected": money_row(due),
        "checkout_payments": money_row(paid),
        "difference": money_row(due - paid),
    }
    return {
        "columns": [
            col("method", "Payment method"),
            col("payments", "Payments", "number"),
            col("taken", "Taken", "money"),
            col("refunded", "Refunded", "money"),
            col("net", "Net", "money"),
        ],
        "rows": rows,
        "totals": totals,
        "chart": {"kind": "bar", "x": "method", "y": "net"},
        "summary": summary,
    }


def wallet_sales(start: date, end: date) -> dict:
    lo, hi = bounds(start, end)
    per: dict[tuple[str, str], dict] = {}
    labels = dict(Sale.Kind.choices)
    channels = dict(Sale.Channel.choices)
    for sale in Sale.objects.filter(created_at__gte=lo, created_at__lt=hi).prefetch_related(
        "refunds"
    ):
        row = per.setdefault(
            (sale.kind, sale.channel), {"count": 0, "amount": ZERO, "refunded": ZERO}
        )
        row["count"] += 1
        row["amount"] += sale.amount
        row["refunded"] += sum((r.amount for r in sale.refunds.all()), ZERO)
    rows = [
        {
            "kind": labels[kind],
            "channel": channels[channel],
            "count": r["count"],
            "amount": money_row(r["amount"]),
            "refunded": money_row(r["refunded"]),
            "net": money_row(r["amount"] - r["refunded"]),
        }
        for (kind, channel), r in sorted(per.items())
    ]
    totals = {
        "kind": "Total",
        "channel": "",
        "count": sum(r["count"] for r in rows),
        **{
            k: money_row(sum((Decimal(r[k]) for r in rows), ZERO))
            for k in ("amount", "refunded", "net")
        },
    }
    outstanding = GiftCardEntry.objects.filter(card__status="active").aggregate(
        v=Coalesce(Sum("delta"), ZERO)
    )["v"]
    return {
        "columns": [
            col("kind", "Sold"),
            col("channel", "Where"),
            col("count", "Sales", "number"),
            col("amount", "Amount", "money"),
            col("refunded", "Refunded", "money"),
            col("net", "Net", "money"),
        ],
        "rows": rows,
        "totals": totals,
        "chart": {"kind": "bar", "x": "kind", "y": "net"},
        "summary": {"gift_card_balance_outstanding": money_row(outstanding)},
    }


REPORTS = {
    "revenue-by-day": ("Revenue by day", revenue_by_day),
    "revenue-by-service": ("Revenue by service", revenue_by_service),
    "revenue-by-stylist": ("Revenue by stylist", revenue_by_stylist),
    "revenue-by-division": ("Revenue by division", revenue_by_division),
    "appointments-by-status": ("Appointments by status", appointments_by_status),
    "no-shows-cancellations": ("No-shows and cancellations", no_shows_and_cancellations),
    "top-customers": ("Top customers", top_customers),
    "product-sales": ("Product sales", product_sales),
    "revenue-by-hour": ("Revenue by hour of day", revenue_by_hour),
    "revenue-by-payment-method": ("Payments by method", revenue_by_payment_method),
    "peak-hours-visits": ("Busiest hours: visits", peak_hours_visits),
    "peak-hours-revenue": ("Busiest hours: revenue", peak_hours_revenue),
    "wallet-sales": ("Packages, memberships and gift cards", wallet_sales),
}
