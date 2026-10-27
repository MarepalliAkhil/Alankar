"""Task 5e-1: packages and memberships - selling, using at checkout, the ledger and refunds."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice, InvoiceCredit
from billing.tests.test_pos import (  # noqa: F401
    admin,
    checkout_call,
    pay_in_full,
    quote,
    scheduled_visit,
    visit,
)
from scheduling.tests.test_booking import (  # noqa: F401
    awaiting,
    catalogue,
    customer,
    desk,
    pay,
    payment_token,
)
from wallet import selling
from wallet.models import (
    Membership,
    MembershipPlan,
    Package,
    PackageEntry,
    PackageItem,
    PackagePurchase,
    RecordError,
    Sale,
)

D = Decimal


@pytest.fixture
def package(catalogue):
    pkg = Package.objects.create(name="Cut x3", price=D("750"), validity_days=90)
    PackageItem.objects.create(package=pkg, service=catalogue["haircut"], quantity=3)
    return pkg


@pytest.fixture
def plan(catalogue):
    p = MembershipPlan.objects.create(
        name="Gold", price=D("1000"), period_months=1, discount_percent=D("10"), included_sessions=1
    )
    p.included_services.add(catalogue["haircut"])
    return p


def json_post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


def test_pos_sells_a_package_and_the_ledger_balances(catalogue, customer, desk, package):
    _, user = customer
    r = json_post(
        desk[0],
        "/api/desk/wallet/sell/",
        {"kind": "package", "method": "cash", "customer": str(user.pk), "package": str(package.pk)},
    )
    assert r.status_code == 201, r.content
    purchase = PackagePurchase.objects.get()
    assert purchase.price_paid == D("750.00") and purchase.sale.channel == "pos"
    credit = purchase.credits.get()
    assert credit.remaining == 3 and credit.unit_value == D("250.00")
    assert PackageEntry.objects.filter(reason="purchased").count() == 1
    assert AuditLog.objects.filter(action="package_sold").count() == 1


def test_customer_buys_a_package_online_and_a_declined_payment_creates_nothing(
    catalogue, customer, package
):
    client, user = customer
    bad = json_post(client, f"/api/my/wallet/packages/{package.pk}/buy/", {"outcome": "fail"})
    assert bad.status_code == 402
    assert PackagePurchase.objects.count() == 0 and Sale.objects.count() == 0
    good = json_post(client, f"/api/my/wallet/packages/{package.pk}/buy/", {"outcome": "success"})
    assert good.status_code == 201
    mine = client.get("/api/my/wallet/").json()
    assert len(mine["packages"]) == 1 and mine["sessions_total"] == 3


def test_a_package_session_pays_for_the_visit_at_checkout(visit, desk, package):
    _, user, appt_id = visit
    selling.sell_package(package.pk, user, channel="pos", method="cash")
    credit = PackagePurchase.objects.get().credits.get()
    q = quote(desk[0], appt_id, package=str(credit.id)).json()
    assert D(q["credit_amount"]) == D("250.00")
    done = pay_in_full(desk[0], appt_id, package=str(credit.id))
    assert done.status_code == 201, done.content
    invoice = Invoice.objects.get()
    assert invoice.credit_amount == D("250.00")
    assert InvoiceCredit.objects.get(invoice=invoice).kind == "package"
    credit.refresh_from_db()
    assert credit.remaining == 2
    used = PackageEntry.objects.get(reason="used")
    assert used.delta == -1 and used.invoice_id == invoice.id


def test_a_session_of_another_service_or_customer_cannot_be_used(
    visit, desk, package, make_user, catalogue
):
    _, user, appt_id = visit
    other = make_user(role="customer", email="other@example.com")
    selling.sell_package(package.pk, other, channel="pos", method="cash")
    credit = PackagePurchase.objects.get().credits.get()
    r = quote(desk[0], appt_id, package=str(credit.id))
    assert r.status_code in (400, 404)
    assert PackageEntry.objects.filter(reason="used").count() == 0


def test_an_expired_package_cannot_be_used(visit, desk, package):
    _, user, appt_id = visit
    selling.sell_package(package.pk, user, channel="pos", method="cash")
    PackagePurchase.objects.update(expires_at=timezone.now() - timedelta(days=1))
    credit = PackagePurchase.objects.get().credits.get()
    assert quote(desk[0], appt_id, package=str(credit.id)).status_code in (400, 404)


def test_admin_refunds_unused_sessions_only_once(catalogue, customer, admin, package):
    _, user = customer
    purchase = selling.sell_package(package.pk, user, channel="pos", method="cash")
    url = f"/api/admin/packages/purchases/{purchase.pk}/refund/"
    r = json_post(admin[0], url, {"method": "cash", "reason": "moved away"})
    assert r.status_code == 200, r.content
    assert purchase.credits.get().remaining == 0
    again = json_post(admin[0], url, {"method": "cash", "reason": "again"})
    assert again.status_code in (400, 409)
    assert AuditLog.objects.filter(action="package_refunded").count() == 1


def test_admin_can_restore_a_used_session(visit, desk, admin, package):
    _, user, appt_id = visit
    selling.sell_package(package.pk, user, channel="pos", method="cash")
    credit = PackagePurchase.objects.get().credits.get()
    pay_in_full(desk[0], appt_id, package=str(credit.id))
    used = PackageEntry.objects.get(reason="used")
    r = json_post(admin[0], f"/api/admin/packages/uses/{used.pk}/restore/", {"reason": "mistake"})
    assert r.status_code == 200, r.content
    assert credit.remaining == 3


def test_ledger_entries_cannot_be_edited_or_deleted(catalogue, customer, package):
    _, user = customer
    selling.sell_package(package.pk, user, channel="pos", method="cash")
    entry = PackageEntry.objects.get()
    entry.note = "x"
    with pytest.raises(RecordError):
        entry.save()
    with pytest.raises(RecordError):
        entry.delete()


# --------------------------------------------------------------------------- memberships


def test_join_gives_a_discount_and_an_included_session(visit, desk, plan):
    _, user, appt_id = visit
    r = json_post(
        desk[0],
        "/api/desk/wallet/sell/",
        {"kind": "membership", "method": "upi", "customer": str(user.pk), "plan": str(plan.pk)},
    )
    assert r.status_code == 201, r.content
    plain = quote(desk[0], appt_id, membership_session=False).json()
    assert D(plain["member_discount"]) > 0
    used = quote(desk[0], appt_id, membership_session=True).json()
    assert D(used["credit_amount"]) > 0
    done = pay_in_full(desk[0], appt_id, membership_session=True)
    assert done.status_code == 201, done.content
    m = Membership.objects.get()
    assert m.sessions_left == 0
    assert m.entries.filter(reason="used").count() == 1
    # the session is gone: a second use is refused
    again = quote(desk[0], appt_id, membership_session=True)
    assert again.status_code in (400, 404, 409)


def test_one_open_membership_per_customer(catalogue, customer, plan):
    client, _ = customer
    assert (
        json_post(client, "/api/my/wallet/memberships/join/", {"plan": str(plan.pk)}).status_code
        == 201
    )
    second = json_post(client, "/api/my/wallet/memberships/join/", {"plan": str(plan.pk)})
    assert second.status_code in (400, 409)
    assert Membership.objects.count() == 1


def test_cancel_keeps_benefits_until_the_period_ends_then_it_lapses(catalogue, customer, plan):
    client, user = customer
    json_post(client, "/api/my/wallet/memberships/join/", {"plan": str(plan.pk)})
    r = json_post(client, "/api/my/wallet/memberships/cancel/")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert selling.current_membership(user) is not None
    Membership.objects.update(period_end=timezone.now() - timedelta(days=1))
    selling.end_lapsed(user)
    assert selling.current_membership(user) is None
    assert Membership.objects.get().status == "ended"


def test_renew_extends_from_the_period_end(catalogue, customer, plan):
    client, _ = customer
    json_post(client, "/api/my/wallet/memberships/join/", {"plan": str(plan.pk)})
    before = Membership.objects.get().period_end
    r = json_post(client, "/api/my/wallet/memberships/renew/")
    assert r.status_code == 200, r.content
    assert Membership.objects.get().period_end > before


def test_declined_membership_payment_changes_nothing(catalogue, customer, plan):
    client, _ = customer
    r = json_post(
        client, "/api/my/wallet/memberships/join/", {"plan": str(plan.pk), "outcome": "fail"}
    )
    assert r.status_code == 402
    assert Membership.objects.count() == 0 and Sale.objects.count() == 0


# --------------------------------------------------------------------------- isolation


def test_customers_only_see_their_own_wallet(catalogue, customer, make_user, package):
    _, user = customer
    selling.sell_package(package.pk, user, channel="pos", method="cash")
    other = make_user(role="customer", email="stranger@example.com")
    from django.test import Client

    from conftest import login

    c2 = Client()
    login(c2, other)
    mine = c2.get("/api/my/wallet/").json()
    assert mine["packages"] == [] and mine["gift_cards"] == [] and mine["membership"] is None


ADMIN_URLS = [
    ("get", "/api/admin/packages/"),
    ("get", "/api/admin/packages/purchases/"),
    ("get", "/api/admin/membership-plans/"),
    ("get", "/api/admin/memberships/"),
    ("get", "/api/admin/gift-cards/"),
    ("get", "/api/admin/sales/"),
    ("get", "/api/admin/waitlist/"),
]


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
@pytest.mark.parametrize("method,url", ADMIN_URLS)
def test_admin_wallet_endpoints_refuse_other_roles(logged_in, role, method, url):
    assert getattr(logged_in(role)[0], method)(url).status_code == 403


@pytest.mark.parametrize("method,url", ADMIN_URLS)
def test_admin_wallet_endpoints_refuse_guests(client, method, url):
    assert getattr(client, method)(url).status_code in (401, 403)


@pytest.mark.parametrize("role", ["stylist", "admin"])
def test_counter_selling_is_for_reception_staff_only_of_the_allowed_roles(
    logged_in, role, catalogue
):
    r = json_post(
        logged_in(role)[0],
        "/api/desk/wallet/sell/",
        {"kind": "gift_card", "method": "cash", "amount": "500", "buyer_name": "W"},
    )
    assert r.status_code in (201, 403)
    if role == "stylist":
        assert r.status_code == 403


@pytest.mark.parametrize("role", ["stylist"])
def test_customer_wallet_endpoints_refuse_staff(logged_in, role):
    c = logged_in(role)[0]
    assert c.get("/api/my/wallet/").status_code == 403
    assert c.get("/api/my/waitlist/").status_code == 403


def test_receptionist_cannot_refund_or_edit_packages(logged_in, catalogue, package):
    c = logged_in("receptionist")[0]
    assert (
        json_post(c, f"/api/admin/packages/purchases/{package.pk}/refund/", {}).status_code == 403
    )
    assert (
        c.patch(
            f"/api/admin/packages/{package.pk}/", {}, content_type="application/json"
        ).status_code
        == 403
    )
