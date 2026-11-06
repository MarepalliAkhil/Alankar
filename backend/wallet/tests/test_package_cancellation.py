"""Task 8.5 part 5b: a customer-initiated request to cancel a package for a pro-rata refund,
decided by the admin. See wallet/cancellation.py for the full module docstring."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing.tests.test_pos import admin  # noqa: F401
from scheduling.tests.test_booking import catalogue, customer  # noqa: F401
from wallet import selling
from wallet.models import Package, PackageCancelRequest, PackageEntry, PackageItem, PackagePurchase
from website.models import SiteContent

D = Decimal


@pytest.fixture
def package(catalogue):
    pkg = Package.objects.create(name="Cut x3", price=D("750"), validity_days=90)
    PackageItem.objects.create(package=pkg, service=catalogue["haircut"], quantity=3)
    return pkg


@pytest.fixture
def purchase(package, customer):
    _, user = customer
    return selling.sell_package(package.pk, user, channel="pos", method="cash")


def json_post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


# --------------------------------------------------------------------------- customer request


def test_customer_requests_a_cancellation_and_sees_the_estimate_first(customer, purchase):
    client, _ = customer
    estimate = client.get(f"/api/my/wallet/packages/{purchase.pk}/cancel-estimate/").json()
    assert D(estimate["estimated_refund"]) == D("750.00")  # nothing used yet, no fee by default
    r = json_post(
        client,
        f"/api/my/wallet/packages/{purchase.pk}/cancel-request/",
        {"reason": "Moving to another city"},
    )
    assert r.status_code == 201, r.content
    assert D(r.json()["estimated_refund"]) == D("750.00")
    purchase.refresh_from_db()
    assert purchase.cancel_status == PackagePurchase.CancelStatus.PENDING
    req = PackageCancelRequest.objects.get()
    assert req.status == "pending" and req.remaining_sessions == 3 and req.total_sessions == 3
    assert AuditLog.objects.filter(action="package_cancel_requested").count() == 1


def test_estimate_accounts_for_sessions_already_used_and_a_cancellation_fee(customer, purchase):
    SiteContent.objects.create(key="packages", value={"cancellation_fee_percent": 10})
    client, _ = customer
    credit = purchase.credits.get()
    PackageEntry.objects.create(credit=credit, delta=-1, reason=PackageEntry.Reason.USED)
    estimate = client.get(f"/api/my/wallet/packages/{purchase.pk}/cancel-estimate/").json()
    # 2 of 3 sessions left, unit_value 250 each -> 500 gross, 10% fee -> 450
    assert D(estimate["estimated_refund"]) == D("450.00")


def test_cannot_request_twice_while_one_is_pending(customer, purchase):
    client, _ = customer
    json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    again = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    assert again.status_code == 409
    assert PackageCancelRequest.objects.count() == 1


def test_a_fully_used_package_has_nothing_to_cancel(customer, purchase):
    client, _ = customer
    credit = purchase.credits.get()
    for _ in range(3):
        PackageEntry.objects.create(credit=credit, delta=-1, reason=PackageEntry.Reason.USED)
    r = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    assert r.status_code == 409


def test_an_expired_package_cannot_be_cancelled_by_default(customer, purchase):
    PackagePurchase.objects.filter(pk=purchase.pk).update(
        expires_at=timezone.now() - timedelta(days=1)
    )
    client, _ = customer
    r = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    assert r.status_code == 409


def test_refund_window_blocks_a_late_request(customer, purchase):
    SiteContent.objects.create(key="packages", value={"refund_window_days": 7})
    PackagePurchase.objects.filter(pk=purchase.pk).update(
        purchased_at=timezone.now() - timedelta(days=8)
    )
    client, _ = customer
    r = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    assert r.status_code == 409


def test_a_pending_cancellation_blocks_the_code_at_booking(customer, purchase):
    client, _ = customer
    json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    )
    from wallet import packagecodes

    with pytest.raises(packagecodes.PackageCodeError):
        packagecodes.find_for_service(
            purchase.code_encrypted,
            customer=purchase.customer,
            service=purchase.credits.get().service,
            ip=None,
        )


def test_stranger_cannot_request_or_see_someone_elses_package(customer, purchase, make_user):
    other = make_user(role="customer", email="stranger@example.com")
    from django.test import Client

    from conftest import login

    c2 = Client()
    login(c2, other)
    assert c2.get(f"/api/my/wallet/packages/{purchase.pk}/cancel-estimate/").status_code == 404
    r = json_post(c2, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "x" * 5})
    assert r.status_code == 404
    assert PackageCancelRequest.objects.count() == 0


# --------------------------------------------------------------------------- admin decides


def test_admin_approves_at_the_estimated_amount(customer, purchase, admin):
    client, _ = customer
    req_id = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    ).json()["id"]
    r = json_post(
        admin[0],
        f"/api/admin/package-cancel-requests/{req_id}/approve/",
        {"method": "cash", "reason": "Approved as asked"},
    )
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["status"] == "approved" and D(body["decided_amount"]) == D("750.00")
    purchase.refresh_from_db()
    assert purchase.cancel_status == PackagePurchase.CancelStatus.CANCELLED
    assert purchase.credits.get().remaining == 0
    assert AuditLog.objects.filter(action="package_cancel_approved").count() == 1


def test_admin_can_approve_at_a_different_amount(customer, purchase, admin):
    client, _ = customer
    req_id = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    ).json()["id"]
    r = json_post(
        admin[0],
        f"/api/admin/package-cancel-requests/{req_id}/approve/",
        {"method": "cash", "amount": "400", "reason": "Goodwill reduction"},
    )
    assert r.status_code == 200, r.content
    assert D(r.json()["decided_amount"]) == D("400.00")


def test_admin_cannot_approve_more_than_what_was_paid(customer, purchase, admin):
    client, _ = customer
    req_id = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    ).json()["id"]
    r = json_post(
        admin[0],
        f"/api/admin/package-cancel-requests/{req_id}/approve/",
        {"method": "cash", "amount": "900"},
    )
    assert r.status_code == 400
    assert PackageCancelRequest.objects.get().status == "pending"


def test_admin_rejects_and_the_code_works_again(customer, purchase, admin, catalogue):
    client, _ = customer
    req_id = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    ).json()["id"]
    r = json_post(
        admin[0],
        f"/api/admin/package-cancel-requests/{req_id}/reject/",
        {"reason": "Still has 60 days of validity left"},
    )
    assert r.status_code == 200, r.content
    assert r.json()["status"] == "rejected"
    purchase.refresh_from_db()
    assert purchase.cancel_status == PackagePurchase.CancelStatus.NONE
    assert AuditLog.objects.filter(action="package_cancel_rejected").count() == 1
    from wallet import packagecodes

    found, _ = packagecodes.find_for_service(
        purchase.code_encrypted,
        customer=purchase.customer,
        service=catalogue["haircut"],
        ip=None,
    )
    assert found.pk == purchase.pk


def test_cannot_decide_the_same_request_twice(customer, purchase, admin):
    client, _ = customer
    req_id = json_post(
        client, f"/api/my/wallet/packages/{purchase.pk}/cancel-request/", {"reason": "Moving"}
    ).json()["id"]
    json_post(admin[0], f"/api/admin/package-cancel-requests/{req_id}/approve/", {"method": "cash"})
    again = json_post(
        admin[0], f"/api/admin/package-cancel-requests/{req_id}/approve/", {"method": "cash"}
    )
    assert again.status_code == 404


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
def test_cancel_request_admin_endpoints_refuse_other_roles(logged_in, role):
    c = logged_in(role)[0]
    assert c.get("/api/admin/package-cancel-requests/").status_code == 403
