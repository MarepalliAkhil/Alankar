"""Admin: every stylist's estimated pay for a month, with the breakdown per appointment.

Same formula as the stylist's own Earnings page (people/pay.py): task payout x rating multiplier
(only with enough counted ratings) + tips, which are outside the multiplier. Payroll (6c) freezes
these numbers into a run; until then they are estimates.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.db.models import Sum

from billing.models import Invoice
from people import pay
from people.models import StylistProfile

ZERO = Decimal("0")


def _profiles(start: datetime, end: datetime):
    with_invoices = Invoice.objects.filter(
        issued_at__gte=start, issued_at__lt=end, appointment__stylist__isnull=False
    ).values_list("appointment__stylist_id", flat=True)
    rows = StylistProfile.objects.filter(user__isnull=False).order_by("display_name")
    return [p for p in rows if p.user.is_active or p.id in set(with_invoices)]


def month_list(start: datetime, end: datetime) -> dict:
    stylists = []
    tasks_sum = tips_sum = ZERO
    invoice_count = 0
    for profile in _profiles(start, end):
        data = pay.earnings(profile, start, end)
        totals = data["totals"]
        stylists.append(
            {
                "id": str(profile.id),
                "name": profile.display_name,
                "active": profile.user.is_active,
                "invoices": len(data["tasks"]),
                "rating": data["rating"],
                "tasks_pay": totals["tasks"],
                "tips": totals["tips"],
                "total": totals["total"],
                "waiting_checkout": len(data["waiting_checkout"]),
            }
        )
        tasks_sum += Decimal(totals["tasks"])
        tips_sum += Decimal(totals["tips"])
        invoice_count += len(data["tasks"])
    # An independent query on the invoices, to prove the tips add up.
    billed = Invoice.objects.filter(
        issued_at__gte=start,
        issued_at__lt=end,
        appointment__stylist__in=[s["id"] for s in stylists],
    ).aggregate(tips=Sum("tip_amount"))
    tips_billed = pay.money(billed["tips"] or ZERO)
    return {
        "estimated": True,
        "rules": pay.rules_table(),
        "stylists": stylists,
        "totals": {
            "tasks": str(tasks_sum),
            "tips": str(tips_sum),
            "total": str(tasks_sum + tips_sum),
            "invoices": invoice_count,
        },
        "reconciliation": {
            "tips_on_invoices": str(tips_billed),
            "tips_in_pay": str(tips_sum),
            "difference": str(tips_billed - tips_sum),
        },
    }


def stylist_month(profile: StylistProfile, start: datetime, end: datetime) -> dict:
    data = pay.earnings(profile, start, end, detail=True)
    return {"id": str(profile.id), "name": profile.display_name, **data}
