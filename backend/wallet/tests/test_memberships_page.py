"""Task 8.5 part 6: memberships -- the customer's own page, cancel, renew (also after cancelling),
buy again after it ends, and the admin ending one early with a reason."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing import online
from scheduling.tests.test_booking import catalogue, customer  # noqa: F401
from wallet import selling
from wallet.models import Membership, MembershipEntry, MembershipPlan
from wallet.tests.test_packages import json_post, plan  # noqa: F401

D = Decimal
BASE = "/api/my/wallet/memberships"


def join(client, plan_id):
    return json_post(client, f"{BASE}/join/", {"plan": str(plan_id), "outcome": "success"})


def page(client):
    return client.get(f"{BASE}/").json()


@pytest.fixture
def silver(db):
    return MembershipPlan.objects.create(
        name="Silver", price=D("500"), period_months=1, discount_percent=D("5")
    )


def test_the_page_shows_current_past_and_plans(customer, plan, silver):
    client, _ = customer
    data = page(client)
    assert data["current"] is None and data["past"] == []
    assert {p["name"] for p in data["plans"]} == {"Gold", "Silver"}
    assert join(client, plan.pk).status_code == 201
    current = page(client)["current"]
    assert current["plan_name"] == "Gold" and current["can_renew"] is True
    assert current["ledger"][0]["reason"] == "joined"


def test_cancel_keeps_benefits_and_renew_takes_the_cancellation_back(customer, plan):
    client, user = customer
    join(client, plan.pk)
    first_end = Membership.objects.get().period_end
    r = json_post(client, f"{BASE}/cancel/")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert selling.current_membership(user) is not None  # still running to the end
    assert page(client)["current"]["can_renew"] is True
    # cannot join a second plan while one is still running...
    assert join(client, plan.pk).status_code == 409
    # ...but renewing takes the cancellation back and adds a period
    r = json_post(client, f"{BASE}/renew/", {"outcome": "success"})
    assert r.status_code == 200, r.content
    m = Membership.objects.get()
    assert m.status == "active" and m.cancelled_at is None and m.period_end > first_end
    assert AuditLog.objects.filter(action="membership_renewed").count() == 1


def test_buy_again_after_it_ended(customer, plan, silver):
    client, _ = customer
    join(client, plan.pk)
    Membership.objects.update(period_end=timezone.now() - timedelta(days=1))
    data = page(client)
    assert data["current"] is None and [m["plan_name"] for m in data["past"]] == ["Gold"]
    assert json_post(client, f"{BASE}/renew/", {"outcome": "success"}).status_code == 409
    assert join(client, silver.pk).status_code == 201  # buy again, any plan
    data = page(client)
    assert data["current"]["plan_name"] == "Silver" and len(data["past"]) == 1


def test_a_failed_payment_buys_nothing(customer, plan):
    client, _ = customer
    r = json_post(client, f"{BASE}/join/", {"plan": str(plan.pk), "outcome": "fail"})
    assert r.status_code == 402 and Membership.objects.count() == 0


# --------------------------------------------------------------------------- staff


@pytest.fixture
def members(customer, plan, make_user):
    client, user = customer
    join(client, plan.pk)
    other = make_user(role="customer", full_name="Ravi Kumar", email="ravi@example.com")
    selling.join_membership(plan.pk, other, channel="pos", method="cash")
    selling.cancel_membership(other)
    return user, other


def test_staff_filter_members_by_status_plan_and_name(logged_in, members):
    desk, _ = logged_in("receptionist")
    data = desk.get("/api/memberships/").json()
    assert len(data["members"]) == 2 and data["counts"]["active"] == 1
    assert data["plans"] == ["Gold"]
    assert all(m["can_end"] is False for m in data["members"])  # receptionist: view only
    cancelled = desk.get("/api/memberships/?status=cancelled").json()["members"]
    assert [m["customer_name"] for m in cancelled] == ["Ravi Kumar"]
    found = desk.get("/api/memberships/?q=ravi@").json()["members"]
    assert len(found) == 1
    assert desk.get("/api/memberships/?plan=Silver").json()["members"] == []


def test_the_admin_ends_a_membership_with_a_reason(logged_in, members):
    admin, _ = logged_in("admin")
    user, _ = members
    m = Membership.objects.get(customer=user)
    url = f"/api/memberships/{m.pk}/end/"
    assert json_post(admin, url, {"reason": ""}).status_code == 400
    r = json_post(admin, url, {"reason": "Moved to another city"})
    assert r.status_code == 200, r.content
    assert r.json()["status"] == "ended" and r.json()["end_reason"] == "Moved to another city"
    assert selling.current_membership(user) is None  # benefits stop at once
    entry = MembershipEntry.objects.filter(membership=m, reason="ended").get()
    assert entry.note == "Moved to another city"
    log = AuditLog.objects.get(action="membership_ended")
    assert log.metadata["reason"] == "Moved to another city"
    assert json_post(admin, url, {"reason": "again"}).status_code == 409
    # the online engine no longer gives the member discount
    b = online.calculate(
        [online.Item(kind="service", description="Cut", amount=D("1000"))], customer=user
    )
    assert b.member_amount == 0


@pytest.mark.parametrize("role", ["receptionist", "stylist", "customer"])
def test_only_the_admin_ends_memberships(logged_in, members, role):
    client, _ = logged_in(role)
    m = Membership.objects.first()
    r = json_post(client, f"/api/memberships/{m.pk}/end/", {"reason": "not allowed"})
    assert r.status_code == 403
    assert Membership.objects.get(pk=m.pk).status != "ended"


@pytest.mark.parametrize("role", ["stylist", "customer"])
def test_the_member_list_is_staff_only(logged_in, role):
    client, _ = logged_in(role)
    assert client.get("/api/memberships/").status_code == 403


@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_the_memberships_page_is_for_customers(logged_in, role):
    client, _ = logged_in(role)
    assert client.get(f"{BASE}/").status_code == 403
