"""Task 8b: the database itself refuses impossible rows, even if the application code is wrong."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from billing.models import Payment, Refund
from inventory.models import Product, StockMovement
from scheduling.models import Appointment
from scheduling.tests.test_booking import catalogue, customer  # noqa: F401

pytestmark = pytest.mark.django_db
D = Decimal


def test_product_price_cannot_be_negative():
    with pytest.raises(IntegrityError), transaction.atomic():
        Product.objects.create(sku="NEG", name="x", category="y", unit_price=D("-1"))


def test_stock_movement_cannot_be_zero():
    product = Product.objects.create(sku="Z1", name="x", category="y", unit_price=D("1"))
    with pytest.raises(IntegrityError), transaction.atomic():
        StockMovement.objects.create(product=product, delta=0, reason="adjustment")


def test_appointment_cannot_end_before_it_starts(catalogue, customer):  # noqa: F811
    from scheduling.tests.test_booking import day_at, requested

    client, _ = customer
    appt_id = requested(client, catalogue, start=day_at(3, 11).isoformat())
    appt = Appointment.objects.get(pk=appt_id)
    when = timezone.now() + timedelta(days=3)
    with pytest.raises(IntegrityError), transaction.atomic():
        Appointment.objects.filter(pk=appt.pk).update(start=when, end=when - timedelta(minutes=5))
    with pytest.raises(IntegrityError), transaction.atomic():
        Appointment.objects.filter(pk=appt.pk).update(duration_minutes=0)
    with pytest.raises(IntegrityError), transaction.atomic():
        Appointment.objects.filter(pk=appt.pk).update(amount_payable=D("-5"))


def test_payment_and_refund_amounts_cannot_be_negative(catalogue, customer):  # noqa: F811
    from scheduling.tests.test_booking import day_at, requested

    client, _ = customer
    appt = Appointment.objects.get(pk=requested(client, catalogue, start=day_at(3, 11).isoformat()))
    with pytest.raises(IntegrityError), transaction.atomic():
        Payment.objects.create(
            appointment=appt, amount=D("-1"), status="succeeded", reference="NEG-PAY"
        )
    pay = Payment.objects.create(
        appointment=appt, amount=D("10"), status="succeeded", reference="OK-PAY"
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        Refund.objects.create(payment=pay, amount=D("0"), status="processed", reason="none")
