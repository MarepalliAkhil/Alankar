"""Task 8b: money and stock stay correct when two people act at the same moment."""

from decimal import Decimal

import pytest
from django.test import Client

from billing.models import Invoice, Refund
from billing.tests.test_concurrency_5e import bill, run_together, second_desk
from billing.tests.test_invoices_ratings import post
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    scheduled_visit,
    serum,
)
from conftest import login
from inventory import stock
from inventory.models import Product, StockMovement
from scheduling.tests.test_booking import (  # noqa: F401
    catalogue,
    customer,
    desk,
)

D = Decimal


@pytest.mark.django_db(transaction=True)
def test_the_same_visit_billed_from_two_desks_makes_one_invoice(
    catalogue, customer, desk, make_user
):
    appt_id = scheduled_visit(customer[0], desk, catalogue)
    other = second_desk(make_user)
    results = run_together(lambda: bill(desk[0], appt_id), lambda: bill(other, appt_id))
    assert sorted(results) == [201, 409], results
    assert Invoice.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_two_admins_approving_one_refund_pay_it_once(catalogue, customer, desk, admin, make_user):
    appt_id = scheduled_visit(customer[0], desk, catalogue)
    invoice = billed(desk, appt_id)
    asked = post(
        desk[0],
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {"amount": "100", "reason": "unhappy with service"},
    )
    assert asked.status_code == 201
    refund_id = asked.json()["id"]
    boss2 = Client()
    login(boss2, make_user(role="admin", email="boss2@example.com"))
    url = f"/api/desk/refunds/{refund_id}/decision/"
    body = {"decision": "approve", "method": "cash"}
    results = run_together(
        lambda: post(admin[0], url, body).status_code,
        lambda: post(boss2, url, body).status_code,
    )
    assert sorted(results) == [200, 409], results
    assert Refund.objects.filter(status=Refund.Status.PROCESSED).count() == 1


@pytest.mark.django_db(transaction=True)
def test_two_refund_requests_together_cannot_exceed_what_was_paid(
    catalogue, customer, desk, make_user
):
    appt_id = scheduled_visit(customer[0], desk, catalogue)
    invoice = billed(desk, appt_id)
    left = D(invoice["refundable"])
    other = second_desk(make_user)
    url = f"/api/desk/invoices/{invoice['id']}/refunds/"
    body = {"amount": str(left), "reason": "everything back"}
    results = run_together(
        lambda: post(desk[0], url, body).status_code, lambda: post(other, url, body).status_code
    )
    assert sorted(results) == [201, 400], results
    total = sum(r.amount for r in Refund.objects.exclude(status=Refund.Status.REJECTED))
    assert total <= left


@pytest.mark.django_db(transaction=True)
def test_the_last_units_of_a_product_cannot_be_sold_twice(catalogue, customer, desk, make_user):
    product = Product.objects.create(
        sku="LAST-1", name="Last jar", category="Hair", unit_price=D("300")
    )
    stock.move(product, 1, StockMovement.Reason.OPENING)
    first = scheduled_visit(customer[0], desk, catalogue, hour=11)
    second = scheduled_visit(customer[0], desk, catalogue, hour=15)
    other = second_desk(make_user)
    extra = {"products": [{"product": str(product.id), "quantity": 1}]}
    results = run_together(
        lambda: bill(desk[0], first, **extra), lambda: bill(other, second, **extra)
    )
    assert sorted(results) == [201, 409], results
    assert stock.level(product) == 0


@pytest.mark.django_db(transaction=True)
def test_two_desks_cannot_confirm_overlapping_visits_for_one_stylist(
    catalogue, customer, desk, make_user
):
    from scheduling.models import Appointment, AppointmentStatus
    from scheduling.tests.test_booking import confirm, day_at, requested

    client, _ = customer
    first = requested(client, catalogue, start=day_at(3, 11).isoformat())
    second = requested(client, catalogue, start=day_at(3, 11, 15).isoformat())
    other = second_desk(make_user)
    asha = catalogue["asha"]
    results = run_together(
        lambda: confirm(desk[0], first, asha, day_at(3, 11)).status_code,
        lambda: confirm(other, second, asha, day_at(3, 11, 15)).status_code,
    )
    assert sorted(results) == [200, 409], results
    held = Appointment.objects.filter(stylist=asha, status=AppointmentStatus.AWAITING_PAYMENT)
    assert held.count() == 1


@pytest.mark.django_db(transaction=True)
def test_paying_the_same_hold_twice_at_once_records_one_payment(catalogue, customer, desk):
    from billing.models import Payment
    from scheduling.tests.test_booking import awaiting, pay

    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    results = run_together(
        lambda: pay(client, appt_id).status_code, lambda: pay(client, appt_id).status_code
    )
    assert results.count(200) == 1, results
    assert Payment.objects.filter(appointment_id=appt_id, status="succeeded").count() == 1


@pytest.mark.django_db(transaction=True)
def test_the_included_membership_session_cannot_be_used_twice_at_once(
    catalogue, customer, desk, make_user
):
    from wallet.models import Membership, MembershipPlan

    client, user = customer
    first = scheduled_visit(client, desk, catalogue, hour=11)
    second = scheduled_visit(client, desk, catalogue, hour=15)
    plan = MembershipPlan.objects.create(
        name="Gold", price=D("1000"), period_months=1, discount_percent=D("10"), included_sessions=1
    )
    plan.included_services.add(catalogue["haircut"])
    sold = post(
        desk[0],
        "/api/desk/wallet/sell/",
        {"kind": "membership", "method": "upi", "customer": str(user.pk), "plan": str(plan.pk)},
    )
    assert sold.status_code == 201, sold.content
    other = second_desk(make_user)
    results = run_together(
        lambda: bill(desk[0], first, membership_session=True),
        lambda: bill(other, second, membership_session=True),
    )
    assert results.count(201) == 1, results
    assert Membership.objects.get().sessions_left == 0
