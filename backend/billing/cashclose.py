"""End-of-day cash close: what the till should hold, what was counted, and the difference."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from billing.models import CashClose, Invoice, Payment, Refund
from billing.pos import METHODS, CheckoutError, money
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus
from wallet.models import Sale, SaleRefund

ZERO = Decimal("0")


def today() -> date:
    return booking.local(timezone.now()).date()


def _bounds(day: date):
    tz = timezone.get_current_timezone()
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def summary(day: date) -> dict:
    """Takings for one business day, from the payments and refunds themselves."""
    start, end = _bounds(day)
    paid = Payment.objects.filter(
        kind=Payment.Kind.CHECKOUT,
        status=Payment.Status.SUCCEEDED,
        created_at__gte=start,
        created_at__lt=end,
    )
    refunded = Refund.objects.filter(
        status=Refund.Status.PROCESSED, processed_at__gte=start, processed_at__lt=end
    )
    # Packages, memberships and gift cards sold at the counter go through the same till.
    sold = Sale.objects.filter(channel=Sale.Channel.POS, created_at__gte=start, created_at__lt=end)
    sale_back = SaleRefund.objects.filter(
        sale__channel=Sale.Channel.POS, created_at__gte=start, created_at__lt=end
    )
    by_method = {}
    for method in METHODS:
        taken = paid.filter(method=method).aggregate(t=Coalesce(Sum("amount"), ZERO))["t"]
        taken += sold.filter(method=method).aggregate(t=Coalesce(Sum("amount"), ZERO))["t"]
        back = refunded.filter(method=method).aggregate(t=Coalesce(Sum("amount"), ZERO))["t"]
        back += sale_back.filter(method=method).aggregate(t=Coalesce(Sum("amount"), ZERO))["t"]
        by_method[method] = {"taken": taken, "refunded": back, "expected": taken - back}
    waiting = Appointment.objects.filter(
        status__in=(
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.COMPLETED,
        ),
        invoice__isnull=True,
        start__gte=start,
        start__lt=end,
    ).count()
    closed = CashClose.objects.select_related("closed_by").filter(business_date=day).first()
    return {
        "date": day,
        "methods": by_method,
        "invoice_count": Invoice.objects.filter(issued_at__gte=start, issued_at__lt=end).count(),
        "tips": Invoice.objects.filter(issued_at__gte=start, issued_at__lt=end).aggregate(
            t=Coalesce(Sum("tip_amount"), ZERO)
        )["t"],
        "unbilled_visits": waiting,
        "closed": closed,
    }


def sign_off(*, actor, day: date, counted_cash, note: str = "") -> CashClose:
    if day > today():
        raise CheckoutError("A day can be closed only on or after that day.")
    counted = money(counted_cash)
    if counted < 0:
        raise CheckoutError("The counted cash cannot be negative.")
    note = (note or "").strip()
    with transaction.atomic():
        if CashClose.objects.filter(business_date=day).exists():
            raise CheckoutError("This day is already closed.", code="conflict")
        data = summary(day)
        expected_cash = data["methods"]["cash"]["expected"]
        difference = counted - expected_cash
        if difference != 0 and len(note) < 3:
            raise CheckoutError("The count does not match. Write a short note to explain it.")
        try:
            return CashClose.objects.create(
                business_date=day,
                expected_cash=expected_cash,
                expected_card=data["methods"]["card"]["expected"],
                expected_upi=data["methods"]["upi"]["expected"],
                counted_cash=counted,
                difference=difference,
                invoice_count=data["invoice_count"],
                note=note[:300],
                closed_by=actor,
                closed_at=timezone.now(),
            )
        except IntegrityError as exc:
            raise CheckoutError("This day is already closed.", code="conflict") from exc
