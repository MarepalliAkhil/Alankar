"""Stylist pay (estimate until the admin approves payroll in Task 6).

For a month: for each billed task, the task payout (scaled to the services really done), times the
rating multiplier, plus tips (100%, outside the multiplier). The multiplier comes from the average
of the ratings for that month's tasks, and only counts with enough ratings (default 5).
"""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from billing.models import Invoice
from people.models import Rating, StylistProfile
from scheduling.models import Appointment, AppointmentStatus
from website.content import pay_rules

PAISA = Decimal("0.01")
ZERO = Decimal("0")
ONE = Decimal("1.00")


def money(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def bands() -> list[tuple[Decimal, Decimal]]:
    rows = [(Decimal(str(low)), Decimal(str(mult))) for low, mult in pay_rules()["rating_bands"]]
    return sorted(rows, reverse=True)


def multiplier_for(average: Decimal) -> Decimal:
    for low, mult in bands():
        if average >= low:
            return mult
    return ONE


def task_base(appt: Appointment) -> Decimal:
    """Flat payout for the service (or the commission share when none is set), scaled to the part
    of the booked value the stylist actually did."""
    booked = appt.price_total
    payout = appt.service.task_payout
    if payout is None:
        payout = booked * Decimal(str(pay_rules()["commission_percent"])) / 100
    completion = getattr(appt, "completion", None)
    if completion is not None and completion.booked_price > 0:
        payout = payout * completion.done_price / completion.booked_price
    return money(payout)


def rating_summary(stars: list[int]) -> dict:
    rules = pay_rules()
    needed = int(rules["min_ratings"])
    count = len(stars)
    average = money(Decimal(sum(stars)) / count) if count else None
    enough = count >= needed
    multiplier = multiplier_for(average) if (enough and average is not None) else ONE
    flagged = bool(enough and average is not None and average < Decimal(str(rules["flag_below"])))
    return {
        "count": count,
        "needed": needed,
        "enough": enough,
        "average": None if average is None else str(average),
        "multiplier": str(multiplier),
        "flagged": flagged,
    }


def rules_table() -> dict:
    rules = pay_rules()
    rows = []
    sorted_bands = bands()
    for index, (low, mult) in enumerate(sorted_bands):
        high = sorted_bands[index - 1][0] if index else None
        if high is None:
            label = f"{low} and above"
        elif low == 0:
            label = f"Below {high}"
        else:
            label = f"{low} to {(high - PAISA)}"
        rows.append({"label": label, "multiplier": str(mult)})
    return {"min_ratings": int(rules["min_ratings"]), "bands": rows}


def counted_ratings():
    """Submitted ratings that count: not held for review and not excluded by the admin."""
    return Rating.objects.filter(
        status=Rating.Status.SUBMITTED, moderation=Rating.Moderation.ACTIVE
    )


def earnings(
    profile: StylistProfile, start: datetime, end: datetime, *, detail: bool = False
) -> dict:
    """The month's estimate. `detail` (admin only) adds invoice, customer and rating state."""
    invoices = list(
        Invoice.objects.filter(
            appointment__stylist=profile, issued_at__gte=start, issued_at__lt=end
        )
        .select_related("appointment__service", "appointment__completion", "appointment__customer")
        .order_by("issued_at")
    )
    seen = {
        r.appointment_id: r
        for r in Rating.objects.filter(
            appointment__in=[i.appointment_id for i in invoices],
            status=Rating.Status.SUBMITTED,
        )
    }
    stars = [r.stars for r in seen.values() if r.stars and r.moderation == Rating.Moderation.ACTIVE]
    rating = rating_summary(stars)
    multiplier = Decimal(rating["multiplier"])
    rows = []
    tasks_total = tips_total = ZERO
    for invoice in invoices:
        appt = invoice.appointment
        base = task_base(appt)
        paid = money(base * multiplier)
        tip = money(invoice.tip_amount)
        completion = getattr(appt, "completion", None)
        extra = {}
        if detail:
            rated = seen.get(appt.id)
            if rated is None:
                state = "unrated"
            elif rated.moderation == Rating.Moderation.ACTIVE:
                state = "counted"
            else:
                state = "held"
            extra = {
                "invoice": invoice.number,
                "customer": appt.customer.full_name if appt.customer_id else "",
                "service_price": str(money(appt.price_total)),
                "stars": rated.stars if rated else None,
                "rating_state": state,
            }
        rows.append(
            {
                **extra,
                "id": str(appt.id),
                "date": invoice.issued_at,
                "service": appt.service_name
                + (f" ({appt.variant_label})" if appt.variant_label else ""),
                "partial": bool(completion and completion.removed_lines),
                "base_payout": str(base),
                "multiplier": str(multiplier),
                "payout": str(paid),
                "tip": str(tip),
                "total": str(paid + tip),
            }
        )
        tasks_total += paid
        tips_total += tip
    waiting = Appointment.objects.filter(
        stylist=profile, status=AppointmentStatus.COMPLETED, invoice__isnull=True
    ).order_by("start")
    return {
        "estimated": True,
        "rating": rating,
        "rules": rules_table(),
        "tasks": rows,
        "waiting_checkout": [
            {"id": str(a.id), "date": a.start, "service": a.service_name} for a in waiting
        ],
        "totals": {
            "tasks": str(tasks_total),
            "tips": str(tips_total),
            "total": str(tasks_total + tips_total),
        },
    }


def ratings_overview(profile: StylistProfile, limit: int = 50) -> dict:
    """The stylist's own ratings and comments, without customer names. A rating the admin has
    put under review (or excluded) is shown only as a count: no stars, comment, customer or
    reason, and it is not in the average, graph or pay while it is held."""
    everything = Rating.objects.filter(stylist=profile, status=Rating.Status.SUBMITTED)
    held = everything.exclude(moderation=Rating.Moderation.ACTIVE).count()
    rows = list(
        everything.filter(moderation=Rating.Moderation.ACTIVE)
        .select_related("appointment")
        .order_by("-submitted_at")
    )
    distribution = {str(n): 0 for n in range(1, 6)}
    for row in rows:
        distribution[str(row.stars)] += 1
    average = money(Decimal(sum(r.stars for r in rows)) / len(rows)) if rows else None
    months: dict[str, list[int]] = {}
    for row in rows:
        months.setdefault(row.submitted_at.strftime("%Y-%m"), []).append(row.stars)
    trend = [
        {"month": m, "average": str(money(Decimal(sum(v)) / len(v))), "count": len(v)}
        for m, v in sorted(months.items())[-6:]
    ]
    return {
        "count": len(rows),
        "under_review": held,
        "average": None if average is None else str(average),
        "distribution": distribution,
        "trend": trend,
        "comments": [
            {
                "stars": r.stars,
                "comment": r.comment,
                "tags": r.tags,
                "date": r.submitted_at,
                "service": r.appointment.service_name,
            }
            for r in rows
            if r.comment or r.tags
        ][:limit],
    }
