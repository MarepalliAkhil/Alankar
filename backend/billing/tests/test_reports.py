"""Task 5c: reports. Every total must equal the invoices behind it."""

import csv
import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice
from billing.tests.test_marketing import call, new_coupon
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    catalogue,
    customer,
    desk,
    scheduled_visit,
    serum,
    visit,
)
from people.models import Rating
from scheduling.models import Appointment, AppointmentStatus

D = Decimal
URL = "/api/admin/reports"


def get(admin, name, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return call(admin[0], "get", f"{URL}/{name}/?{query}")


def total(rows, key):
    return sum((D(r[key]) for r in rows), D("0"))


@pytest.fixture
def busy(visit, desk, admin, serum, catalogue):
    """Two billed visits: one with a product and a coupon, one plain."""
    client, user, first = visit
    new_coupon(admin, code="TEN", value="10")
    billed(
        desk,
        first,
        coupon="TEN",
        tip="30",
        products=[{"product": str(serum.id), "quantity": 2}],
    )
    Rating.objects.filter(customer=user).update(status="submitted", stars=5)
    second = scheduled_visit(client, desk, catalogue, hour=14)
    billed(desk, second)
    return client, user


def test_revenue_by_day_matches_the_invoices(busy, admin):
    data = get(admin, "revenue-by-day").json()
    invoices = Invoice.objects.all()
    assert data["totals"]["bills"] == invoices.count() == 2
    assert D(data["totals"]["revenue"]) == sum(i.subtotal for i in invoices)
    assert D(data["totals"]["gst"]) == sum(i.gst_amount for i in invoices)
    assert D(data["totals"]["total"]) == sum(i.total for i in invoices)
    assert D(data["totals"]["discounts"]) == sum(i.discount_amount for i in invoices) > 0
    assert D(data["totals"]["tips"]) == D("30")
    assert D(data["totals"]["revenue"]) + D(data["totals"]["gst"]) == D(data["totals"]["total"])
    assert len(data["rows"]) == 30 and total(data["rows"], "total") == D(data["totals"]["total"])


@pytest.mark.parametrize(
    "name", ["revenue-by-service", "revenue-by-stylist", "revenue-by-division"]
)
def test_every_split_adds_up_to_the_invoice_revenue(busy, admin, name):
    data = get(admin, name).json()
    subtotal = sum(i.subtotal for i in Invoice.objects.all())
    assert D(data["totals"]["revenue"]) == subtotal
    assert total(data["rows"], "revenue") == subtotal


def test_splits_put_products_under_retail_and_services_under_their_stylist(busy, admin):
    names = [r["name"] for r in get(admin, "revenue-by-service").json()["rows"]]
    assert "Haircut" in " ".join(names) or any("air" in n for n in names)
    assert any(n.startswith("Retail: Hair serum") for n in names)
    stylists = [r["name"] for r in get(admin, "revenue-by-stylist").json()["rows"]]
    assert "Asha" in stylists and "Retail (no stylist)" in stylists
    divisions = [r["name"] for r in get(admin, "revenue-by-division").json()["rows"]]
    assert "Retail" in divisions and len(divisions) == 2


def test_product_sales_and_top_customers(busy, admin):
    sales = get(admin, "product-sales").json()
    assert sales["rows"][0]["name"] == "Hair serum" and sales["rows"][0]["items"] == 2
    top = get(admin, "top-customers").json()
    assert top["rows"][0]["visits"] == 2
    assert D(top["rows"][0]["spent"]) == sum(i.total for i in Invoice.objects.all())


def test_appointments_by_status_and_lost_visits(busy, admin, catalogue):
    Appointment.objects.filter(pk=Appointment.objects.first().pk).update(
        status=AppointmentStatus.NO_SHOW
    )
    wide = {
        "from": (timezone.localdate() - timedelta(days=5)).isoformat(),
        "to": (timezone.localdate() + timedelta(days=10)).isoformat(),
    }
    data = get(admin, "appointments-by-status", **wide).json()
    assert data["totals"]["count"] == Appointment.objects.count() == 2
    assert total(data["rows"], "count") == 2
    counts = {r["status"]: r["count"] for r in data["rows"]}
    assert counts["No-show"] == 1 and counts["Completed"] == 1
    lost = get(admin, "no-shows-cancellations", **wide).json()
    assert lost["totals"]["no_show"] == 1 and lost["totals"]["all"] == 2
    assert lost["summary"]["lost_rate"] == "50.0"


def test_the_date_range_is_applied_and_checked(busy, admin):
    tomorrow = (timezone.localdate() + timedelta(days=2)).isoformat()
    empty = get(admin, "revenue-by-day", **{"from": tomorrow, "to": tomorrow}).json()
    assert empty["totals"]["bills"] == 0 and len(empty["rows"]) == 1
    for params in (
        {"from": "nonsense"},
        {"from": "2026-02-10", "to": "2026-02-01"},
        {"from": "2020-01-01", "to": "2026-01-01"},
    ):
        assert get(admin, "revenue-by-day", **params).status_code == 400
    assert call(admin[0], "get", f"{URL}/not-a-report/").status_code == 404
    assert len(call(admin[0], "get", f"{URL}/").json()) == 8


def test_csv_export_matches_the_screen_and_is_audited(busy, admin):
    response = get(admin, "revenue-by-day", export="csv")
    assert response.status_code == 200 and response["Content-Type"].startswith("text/csv")
    assert "attachment" in response["Content-Disposition"]
    rows = list(csv.reader(io.StringIO(response.content.decode())))
    data = get(admin, "revenue-by-day").json()
    assert rows[0][0] == "Day" and rows[-1][0] == "Total"
    assert rows[-1][4] == data["totals"]["total"] and len(rows) == len(data["rows"]) + 2
    entry = AuditLog.objects.get(action="report_exported")
    assert entry.metadata["report"] == "revenue-by-day"


def test_csv_cells_cannot_run_as_spreadsheet_formulas(admin):
    from billing.report_views import safe_cell

    assert safe_cell("=SUM(A1)") == "'=SUM(A1)" and safe_cell("-12.50") == "-12.50"
    assert safe_cell("@x") == "'@x" and safe_cell("Facial") == "Facial"
