"""Task 5e-4: things that must hold when two people act at the same moment."""

import threading
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test import Client
from django.utils import timezone

from accounts.models import User
from billing.models import Invoice
from billing.tests.test_marketing import opted_in
from billing.tests.test_pos import (  # noqa: F401
    checkout_call,
    quote,
    scheduled_visit,
)
from conftest import login
from core.models import MailOutbox
from marketing import campaigns, private
from marketing.models import Campaign, CouponRedemption
from scheduling.tests.test_booking import (  # noqa: F401
    awaiting,
    catalogue,
    customer,
    desk,
    pay,
    payment_token,
)
from wallet import selling
from wallet.models import Package, PackageItem, PackagePurchase

D = Decimal


def run_together(*jobs):
    """Runs every job on its own thread and database connection, started as close as possible."""
    gate = threading.Barrier(len(jobs))
    results = [None] * len(jobs)

    def wrap(i, job):
        try:
            gate.wait(timeout=10)
            results[i] = job()
        except Exception as exc:  # pragma: no cover - reported by the assertion
            results[i] = exc
        finally:
            connection.close()

    threads = [threading.Thread(target=wrap, args=(i, j)) for i, j in enumerate(jobs)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    return results


def bill(client, appt_id, **extra):
    q = quote(client, appt_id, **extra)
    if q.status_code != 200:
        return q.status_code
    due = D(q.json()["to_collect"])
    payments = [{"method": "cash", "amount": str(due)}] if due > 0 else []
    return checkout_call(client, appt_id, payments=payments, **extra).status_code


def second_desk(make_user):
    client = Client()
    login(client, make_user(role="receptionist", email="desk2@example.com"))
    return client


@pytest.mark.django_db(transaction=True)
def test_one_private_coupon_cannot_pay_for_two_bills_at_once(catalogue, customer, desk, make_user):
    client, user = customer
    first = scheduled_visit(client, desk, catalogue, hour=11)
    second = scheduled_visit(client, desk, catalogue, hour=15)
    boss = make_user(role="admin", email="boss@example.com")
    made = private.issue(
        customers=User.objects.filter(pk=user.pk),
        template={
            "name": "Thanks",
            "kind": "flat",
            "value": D("100"),
            "min_bill": D("0"),
            "max_discount": None,
            "applies_to": "all",
            "ends_on": timezone.localdate() + timedelta(days=5),
        },
        prefix="VIP",
        actor=boss,
    )
    code = made[0][0].code
    other_desk = second_desk(make_user)
    results = run_together(
        lambda: bill(desk[0], first, coupon=code),
        lambda: bill(other_desk, second, coupon=code),
    )
    assert sorted(r for r in results if isinstance(r, int))[0] == 201, results
    assert CouponRedemption.objects.count() == 1
    assert Invoice.objects.count() >= 1
    assert sum(1 for r in results if r == 201) == 1


@pytest.mark.django_db(transaction=True)
def test_the_last_package_session_cannot_be_used_twice_at_once(
    catalogue, customer, desk, make_user
):
    client, user = customer
    first = scheduled_visit(client, desk, catalogue, hour=11)
    second = scheduled_visit(client, desk, catalogue, hour=15)
    pkg = Package.objects.create(name="Cut x1", price=D("300"), validity_days=30)
    PackageItem.objects.create(package=pkg, service=catalogue["haircut"], quantity=1)
    selling.sell_package(pkg.pk, user, channel="pos", method="cash")
    credit = PackagePurchase.objects.get().credits.get()
    other_desk = second_desk(make_user)
    results = run_together(
        lambda: bill(desk[0], first, package=str(credit.id)),
        lambda: bill(other_desk, second, package=str(credit.id)),
    )
    credit.refresh_from_db()
    assert sum(1 for r in results if r == 201) == 1, results
    assert credit.remaining == 0


@pytest.mark.django_db(transaction=True)
def test_a_due_campaign_is_sent_once_when_two_runners_start_together(make_user):
    for n in range(3):
        opted_in(make_user, f"c{n}@example.com")
    Campaign.objects.create(
        name="Diwali",
        subject="Offers",
        body="Hello",
        audience="all",
        status=Campaign.Status.SCHEDULED,
        scheduled_for=timezone.now() - timedelta(minutes=2),
    )
    results = run_together(campaigns.run_due, campaigns.run_due, campaigns.run_due)
    assert sorted(r for r in results if isinstance(r, int)) == [0, 0, 1], results
    assert MailOutbox.objects.filter(kind="marketing").count() == 3
    assert Campaign.objects.get().status == "sent"
