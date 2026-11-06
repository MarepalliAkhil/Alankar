"""Task 8b: list endpoints use a fixed number of queries however many rows they show (no N+1)."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from accounts.models import AuditLog
from billing.tests.helpers import bill
from billing.tests.test_invoices_ratings import scheduled
from inventory import stock
from inventory.models import Product, StockMovement
from people.models import Rating
from scheduling.tests.test_booking import catalogue, customer, desk  # noqa: F401

pytestmark = pytest.mark.django_db


def count_queries(client, url):
    with CaptureQueriesContext(connection) as ctx:
        response = client.get(url)
    assert response.status_code == 200, (url, response.status_code)
    return len(ctx)


def assert_flat(client, url, grow, small=3, big=9):
    """Counts queries with `small` rows, adds more rows, counts again: the counts must match."""
    grow(small)
    client.get(url)  # warm caches such as content types and settings
    before = count_queries(client, url)
    grow(big - small)
    after = count_queries(client, url)
    assert after <= before, f"{url}: {before} queries with {small} rows, {after} with {big}"


def test_staff_and_customer_lists(logged_in, make_user):
    admin_client, _ = logged_in("admin")
    n = {"i": 0}

    def more_people(count):
        for _ in range(count):
            n["i"] += 1
            make_user(role="stylist", email=f"s{n['i']}@example.com")
            make_user(role="customer", email=f"c{n['i']}@example.com")

    assert_flat(admin_client, "/api/staff/", more_people)
    assert_flat(admin_client, "/api/desk/customers/", more_people)


def test_audit_list(logged_in):
    admin_client, admin = logged_in("admin")

    def more(count):
        AuditLog.objects.bulk_create(
            [AuditLog(action="login_success", actor=admin, email=admin.email) for _ in range(count)]
        )

    assert_flat(admin_client, "/api/audit/", more)


def test_appointment_and_invoice_lists(catalogue, customer, desk):  # noqa: F811
    client, _ = customer
    state = {"day": 2}

    def more_visits(count):
        for _ in range(count):
            appt_id = scheduled(client, desk[0], catalogue, hour=11, days=state["day"])
            state["day"] += 1
            bill(appt_id)
            Rating.objects.filter(status=Rating.Status.PENDING).delete()

    urls = [
        (desk[0], "/api/desk/appointments/"),
        (desk[0], "/api/desk/invoices/"),
        (client, "/api/my/appointments/"),
        (client, "/api/my/invoices/"),
    ]
    more_visits(2)
    for who, url in urls:
        who.get(url)
    before = {url: count_queries(who, url) for who, url in urls}
    more_visits(3)
    for who, url in urls:
        after = count_queries(who, url)
        assert after <= before[url], f"{url}: {before[url]} queries with 2 rows, {after} with 5"


def test_inventory_list(logged_in):
    desk_client, _ = logged_in("receptionist")
    n = {"i": 0}

    def more_products(count):
        for _ in range(count):
            n["i"] += 1
            p = Product.objects.create(
                sku=f"P{n['i']}", name=f"Item {n['i']}", category="Hair", unit_price=100
            )
            stock.move(p, 5, StockMovement.Reason.OPENING)

    assert_flat(desk_client, "/api/desk/inventory/", more_products)
