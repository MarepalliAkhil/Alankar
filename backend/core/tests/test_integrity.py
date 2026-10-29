"""Task 8b: check_integrity finds seeded problems and stays quiet on healthy data."""

from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from billing.tests.helpers import bill
from billing.tests.test_invoices_ratings import scheduled
from core import integrity
from inventory import stock
from inventory.models import Product, StockMovement
from scheduling.models import Appointment
from scheduling.tests.test_booking import catalogue, customer, desk  # noqa: F401

pytestmark = pytest.mark.django_db


def test_empty_database_is_healthy():
    out = StringIO()
    call_command("check_integrity", stdout=out)
    assert "passed" in out.getvalue()


def test_a_normal_billed_visit_is_healthy(catalogue, customer, desk):  # noqa: F811
    client, _ = customer
    bill(scheduled(client, desk[0], catalogue))
    assert integrity.run_checks() == []


def test_negative_stock_is_reported():
    p = Product.objects.create(sku="NS", name="x", category="y", unit_price=Decimal("1"))
    stock.move(p, 2, StockMovement.Reason.OPENING)
    StockMovement.objects.create(product=p, delta=-5, reason="adjustment")
    assert any("negative stock" in line for line in integrity.run_checks())
    with pytest.raises(CommandError):
        call_command("check_integrity", stdout=StringIO())


def test_overlapping_bookings_are_reported(catalogue, customer, desk):  # noqa: F811
    client, _ = customer
    first = scheduled(client, desk[0], catalogue, hour=11)
    appt = Appointment.objects.get(pk=first)
    other = Appointment.objects.get(pk=scheduled(client, desk[0], catalogue, hour=15))
    Appointment.objects.filter(pk=other.pk).update(
        start=appt.start, end=appt.end, stylist=appt.stylist
    )
    assert any("overlap" in line for line in integrity.run_checks())
