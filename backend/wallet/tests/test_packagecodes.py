"""Task 8.5 part 5: redeeming a package's long code at online booking.

Session lifecycle: RESERVED when the request is created with a valid code, CONSUMED when the
booking is confirmed, RELEASED if it is rejected, the payment link expires, or the customer
cancels for free. See wallet/packagecodes.py for the full module docstring.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from scheduling.models import Appointment
from scheduling.tests.test_booking import (  # noqa: F401
    catalogue,
    customer,
    day_at,
    desk,
    request_body,
)
from wallet import packagecodes, selling
from wallet.models import CodeAttempt, Package, PackageEntry, PackageItem, PackagePurchase
from website.models import SiteContent

D = Decimal


@pytest.fixture
def package(catalogue):
    pkg = Package.objects.create(name="Cut x3", price=D("750"), validity_days=90)
    PackageItem.objects.create(package=pkg, service=catalogue["haircut"], quantity=3)
    return pkg


@pytest.fixture
def purchase_and_code(package, customer):
    _, user = customer
    purchase = selling.sell_package(package.pk, user, channel="pos", method="cash")
    code = purchase.code_encrypted
    assert code and len(code.replace("-", "")) == 20
    return purchase, code


def send_with_code(client, cat, code, **overrides):
    return client.post(
        "/api/booking/requests/",
        request_body(cat, package_code=code, **overrides),
        content_type="application/json",
    )


# --------------------------------------------------------------------------- redeeming at booking


def test_a_valid_code_zeroes_the_price_and_reserves_a_session(
    catalogue, customer, purchase_and_code
):
    client, _ = customer
    purchase, code = purchase_and_code
    r = send_with_code(client, catalogue, code)
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["price_total"] == "0.00" and body["amount_payable"] == "0.00"
    assert body["package_used"]["purchase_id"] == str(purchase.id)
    assert body["package_used"]["status"] == "reserved"
    assert body["package_used"]["session_label"] == "session 1 of 3"
    appt = Appointment.objects.get(pk=body["id"])
    assert appt.package_purchase_id == purchase.id
    credit = purchase.credits.get()
    assert credit.remaining == 2  # held, not yet consumed


def test_a_code_never_shown_in_full_again(catalogue, customer, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    r = send_with_code(client, catalogue, code)
    masked = r.json()["package_used"]["masked"]
    assert code not in masked and masked.endswith(purchase.last4)


def test_a_wrong_code_is_refused_without_revealing_anything(catalogue, customer, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    r = send_with_code(client, catalogue, "WRONG-WRONG-WRONG-00")
    assert r.status_code == 400
    assert Appointment.objects.filter(package_purchase=purchase).count() == 0
    assert CodeAttempt.objects.filter(kind=CodeAttempt.Kind.PACKAGE).count() == 1


def test_another_customers_code_is_refused(catalogue, customer, purchase_and_code, make_user):
    client, _ = customer
    purchase, code = purchase_and_code
    other = make_user(role="customer", email="other@example.com")
    from django.test import Client

    from conftest import login

    c2 = Client()
    login(c2, other)
    r = send_with_code(c2, catalogue, code)
    assert r.status_code == 400
    assert Appointment.objects.filter(package_purchase=purchase).count() == 0


def test_a_code_for_another_service_is_refused(catalogue, customer, purchase_and_code):
    """A state the code-owning customer is told about plainly (not a "does this exist" leak),
    hence 409 rather than the generic 400 used for a code that just doesn't match at all."""
    client, _ = customer
    purchase, code = purchase_and_code
    r = send_with_code(client, catalogue, code, service="facial", variant=None)
    assert r.status_code == 409
    assert Appointment.objects.filter(package_purchase=purchase).count() == 0


def test_an_expired_package_code_is_refused(catalogue, customer, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    PackagePurchase.objects.filter(pk=purchase.pk).update(
        expires_at=timezone.now() - timedelta(days=1)
    )
    r = send_with_code(client, catalogue, code)
    assert r.status_code == 409


def test_a_package_with_no_sessions_left_is_refused(catalogue, customer, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    credit = purchase.credits.get()
    for _ in range(3):
        PackageEntry.objects.create(credit=credit, delta=-1, reason=PackageEntry.Reason.USED)
    r = send_with_code(client, catalogue, code)
    assert r.status_code == 409


def test_repeated_wrong_codes_are_rate_limited(catalogue, customer, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    for _ in range(packagecodes.USER_LIMIT):
        assert send_with_code(client, catalogue, "0000-0000-0000-0000").status_code == 400
    r = send_with_code(client, catalogue, code)  # even the real code is now locked out
    assert r.status_code == 429
    assert "wait" in r.json()["detail"].lower() or "many" in r.json()["detail"].lower()


# ----------------------------------------------------------------- confirm / reject / cancel


def test_confirming_consumes_the_session_and_goes_straight_to_scheduled(
    catalogue, customer, desk, purchase_and_code
):
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    r = desk[0].post(
        f"/api/desk/appointments/{appt_id}/confirm/",
        {"stylist": str(catalogue["asha"].id), "start": day_at(3, 11).isoformat()},
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert r.json()["status"] == "scheduled"
    assert purchase.credits.get().remaining == 2  # consumed entry has delta 0, stays at 2
    assert (
        PackageEntry.objects.filter(
            reason=PackageEntry.Reason.CONSUMED, appointment_id=appt_id
        ).count()
        == 1
    )


def test_rejecting_the_request_releases_the_session(catalogue, customer, desk, purchase_and_code):
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    r = desk[0].post(
        f"/api/desk/appointments/{appt_id}/reject/",
        {"reason": "Fully booked"},
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert purchase.credits.get().remaining == 3
    assert (
        PackageEntry.objects.filter(
            reason=PackageEntry.Reason.RELEASED, appointment_id=appt_id
        ).count()
        == 1
    )


def test_customer_cancelling_a_scheduled_package_booking_releases_the_session(
    catalogue, customer, desk, purchase_and_code
):
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    desk[0].post(
        f"/api/desk/appointments/{appt_id}/confirm/",
        {"stylist": str(catalogue["asha"].id), "start": day_at(3, 11).isoformat()},
        content_type="application/json",
    )
    r = client.post(f"/api/my/appointments/{appt_id}/cancel/")
    assert r.status_code == 200, r.content
    assert purchase.credits.get().remaining == 3  # given back


def test_a_second_reservation_on_a_released_session_works(
    catalogue, customer, desk, purchase_and_code
):
    """Reject gives the session back; the same code can be used again for a new request."""
    client, _ = customer
    purchase, code = purchase_and_code
    first = send_with_code(client, catalogue, code).json()["id"]
    desk[0].post(
        f"/api/desk/appointments/{first}/reject/",
        {"reason": "Fully booked"},
        content_type="application/json",
    )
    second = send_with_code(client, catalogue, code).json()["id"]
    assert Appointment.objects.get(pk=second).package_purchase_id == purchase.id
    assert purchase.credits.get().remaining == 2


# ------------------------------------------------------------- desk cancel / no-show + the setting


def test_desk_cancelling_a_scheduled_package_booking_keeps_the_session_by_default(
    catalogue, customer, desk, purchase_and_code
):
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    desk[0].post(
        f"/api/desk/appointments/{appt_id}/confirm/",
        {"stylist": str(catalogue["asha"].id), "start": day_at(3, 11).isoformat()},
        content_type="application/json",
    )
    r = desk[0].post(
        f"/api/desk/appointments/{appt_id}/cancel/",
        {"reason": "Salon closed that day"},
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert purchase.credits.get().remaining == 2  # default: no_show_consumes_session is True


def test_desk_cancelling_releases_the_session_when_the_setting_is_off(
    catalogue, customer, desk, purchase_and_code
):
    SiteContent.objects.create(key="packages", value={"no_show_consumes_session": False})
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    desk[0].post(
        f"/api/desk/appointments/{appt_id}/confirm/",
        {"stylist": str(catalogue["asha"].id), "start": day_at(3, 11).isoformat()},
        content_type="application/json",
    )
    r = desk[0].post(
        f"/api/desk/appointments/{appt_id}/cancel/",
        {"reason": "Salon closed that day"},
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert purchase.credits.get().remaining == 3  # given back because the setting is off


# --------------------------------------------------------------------- unit-level: no-op safety


def test_consume_and_release_are_no_ops_without_a_reservation(catalogue, customer):
    """An appointment never booked with a package code: both functions are safe to call."""
    client, _ = customer
    appt_id = client.post(
        "/api/booking/requests/", request_body(catalogue), content_type="application/json"
    ).json()["id"]
    appt = Appointment.objects.get(pk=appt_id)
    packagecodes.consume(appt)  # no reservation -> no-op, does not raise
    packagecodes.release(appt)
    assert PackageEntry.objects.count() == 0


def test_release_reverses_a_consumed_session_exactly_once(
    catalogue, customer, desk, purchase_and_code
):
    """A free cancellation after confirm gives the session back, same as refunding a captured
    payment -- but calling release a second time must not double-credit it."""
    client, _ = customer
    purchase, code = purchase_and_code
    appt_id = send_with_code(client, catalogue, code).json()["id"]
    desk[0].post(
        f"/api/desk/appointments/{appt_id}/confirm/",
        {"stylist": str(catalogue["asha"].id), "start": day_at(3, 11).isoformat()},
        content_type="application/json",
    )
    appt = Appointment.objects.get(pk=appt_id)
    assert purchase.credits.get().remaining == 2
    packagecodes.release(appt)
    assert purchase.credits.get().remaining == 3
    packagecodes.release(appt)  # already released: must not double-credit
    assert purchase.credits.get().remaining == 3
