"""Read-only consistency checks over the money, stock and booking data.

Nothing here changes data. `python manage.py check_integrity` prints any problems and exits with an
error if there are any, so it can run after a restore, before a payroll run, or on a schedule.
"""

from collections.abc import Iterator
from decimal import Decimal

from django.db.models import DecimalField, Exists, F, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce

ZERO = Decimal("0")


def negative_stock() -> Iterator[str]:
    from inventory.models import Product

    rows = Product.objects.annotate(level=Coalesce(Sum("movements__delta"), 0)).filter(level__lt=0)
    for p in rows:
        yield f"Product {p.sku} has negative stock ({p.level})."


def negative_gift_cards() -> Iterator[str]:
    from wallet.models import GiftCard

    rows = GiftCard.objects.annotate(bal=Coalesce(Sum("entries__delta"), ZERO)).filter(bal__lt=0)
    for c in rows:
        yield f"Gift card ending {c.last4} has a negative balance ({c.bal})."


def negative_package_sessions() -> Iterator[str]:
    from wallet.models import PackageCredit

    rows = PackageCredit.objects.annotate(left=Coalesce(Sum("entries__delta"), 0)).filter(
        left__lt=0
    )
    for c in rows:
        yield f"Package credit {c.service_name} ({c.pk}) has {c.left} sessions left."


def negative_membership_sessions() -> Iterator[str]:
    from wallet.models import Membership

    for m in Membership.objects.filter(sessions_left__lt=0):
        yield f"Membership {m.pk} has negative sessions."


def over_refunded_invoices() -> Iterator[str]:
    from billing.models import Invoice, Refund

    refunded = (
        Refund.objects.filter(invoice=OuterRef("pk"))
        .exclude(status=Refund.Status.REJECTED)
        .values("invoice")
        .annotate(t=Sum("amount"))
        .values("t")
    )
    rows = Invoice.objects.annotate(
        back=Coalesce(Subquery(refunded, output_field=DecimalField()), ZERO)
    ).filter(back__gt=F("prepaid_amount") + F("balance_paid"))
    for inv in rows:
        yield f"Invoice {inv.number} was refunded more than it was paid."


def overlapping_bookings() -> Iterator[str]:
    from scheduling.models import BLOCKING_STATUSES, Appointment

    base = Appointment.objects.filter(
        status__in=BLOCKING_STATUSES, start__isnull=False, end__isnull=False
    )
    for field in ("stylist", "room"):
        other = base.filter(
            **{field: OuterRef(field)}, start__lt=OuterRef("end"), end__gt=OuterRef("start")
        ).exclude(pk=OuterRef("pk"))
        clash = base.filter(**{f"{field}__isnull": False}).filter(Exists(other))
        for a in clash:
            yield f"Two bookings overlap for the same {field} (appointment {a.pk})."


def invoices_without_payment() -> Iterator[str]:
    from billing.models import Invoice

    rows = Invoice.objects.filter(balance_paid__gt=0, payments__isnull=True)
    for inv in rows:
        yield f"Invoice {inv.number} shows money collected but has no payment rows."


CHECKS = [
    negative_stock,
    negative_gift_cards,
    negative_package_sessions,
    negative_membership_sessions,
    over_refunded_invoices,
    overlapping_bookings,
    invoices_without_payment,
]


def run_checks() -> list[str]:
    problems: list[str] = []
    for check in CHECKS:
        problems.extend(check())
    return problems
