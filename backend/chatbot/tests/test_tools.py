"""The engine reads a customer's records only through UserTools, and only their own."""

from decimal import Decimal

import pytest
from django.test import Client

from billing import checkout
from billing.tests.test_pos import admin, pay_in_full, scheduled_visit  # noqa: F401
from chatbot.tools import UserTools
from conftest import login
from people.models import LoyaltyEntry
from scheduling.tests.test_booking import awaiting, catalogue, customer, desk  # noqa: F401
from wallet import selling
from wallet.models import MembershipPlan, Package, PackageItem

D = Decimal


@pytest.fixture
def stranger(make_user):
    user = make_user(role="customer", full_name="Someone Else")
    client = Client()
    login(client, user)
    return client, user


def test_appointments_invoices_and_points_are_the_customers_own(
    catalogue, customer, desk, stranger
):
    client, user = customer
    appt_id = scheduled_visit(client, desk, catalogue)
    assert pay_in_full(desk[0], appt_id).status_code in (200, 201)
    LoyaltyEntry.objects.create(customer=user, points=120, reason="earned")
    mine, theirs = UserTools(user), UserTools(stranger[1])

    assert mine.invoices() and mine.invoices()[0]["status"] == "Paid"
    assert mine.history()[0]["service"] == "Haircut" and mine.upcoming() == []
    assert mine.loyalty_points() == checkout.points_balance(user) >= 120
    # the stranger sees nothing of it, even when asked with the customer's own id
    assert theirs.invoices() == [] and theirs.history() == []
    assert theirs.upcoming() == [] and theirs.next_appointment() is None
    assert theirs.loyalty_points(user.pk) == 0 and theirs.awaiting_payment(user.pk) == []


def test_awaiting_payment_and_next_appointment(catalogue, customer, desk, stranger):
    client, user = customer
    awaiting(client, desk[0], catalogue)
    row = UserTools(user).awaiting_payment()
    assert len(row) == 1 and row[0]["service"] == "Haircut"
    nxt = UserTools(user).next_appointment()
    assert nxt and nxt["service"] == "Haircut" and nxt["status"] == "Awaiting payment"
    assert UserTools(stranger[1]).awaiting_payment() == []


def test_packages_membership_and_gift_cards(catalogue, customer, stranger):
    _, user = customer
    pkg = Package.objects.create(name="Cut x3", price=D("750"), validity_days=90)
    PackageItem.objects.create(package=pkg, service=catalogue["haircut"], quantity=3)
    plan = MembershipPlan.objects.create(
        name="Gold", price=D("1000"), period_months=1, discount_percent=D("10"), included_sessions=1
    )
    plan.included_services.add(catalogue["haircut"])
    selling.sell_package(pkg.pk, user, channel="pos", method="cash")
    selling.join_membership(plan.pk, user, channel="pos", method="cash")
    selling.sell_gift_card(amount="1000", channel="pos", method="cash", buyer=user)

    mine = UserTools(user)
    assert mine.packages()[0]["remaining"] == 3
    assert mine.membership()["plan"] == "Gold"
    assert mine.gift_cards()[0]["balance"] == "1000.00"
    other = UserTools(stranger[1])
    assert other.packages() == [] and other.membership() is None and other.gift_cards() == []
