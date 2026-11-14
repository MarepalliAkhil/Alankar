"""Coupons at payment (docs/COUPONS.md): pricing, validity, apply/remove, concurrency, expiry,
cancellation, refunds, rate limit, permissions, receipts and reports."""

from __future__ import annotations

import threading
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test import Client, override_settings
from django.utils import timezone

from accounts.models import AuditLog
from air import actor
from billing import online
from billing.models import Payment, PaymentLink, Refund
from billing.pos import CheckoutError
from conftest import login
from core import demo, policy
from core.models import MailOutbox
from marketing import coupons
from marketing.models import Coupon, CouponRedemption
from people.models import CustomerProfile
from people.pay import task_base
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (fixtures)
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    payment_token,
)

S = AppointmentStatus
D = Decimal


def make_coupon(code="SAVE10", **kw) -> Coupon:
    spec = {"name": code.title(), "kind": "percent", "value": D("10")}
    spec.update(kw)
    return Coupon.objects.create(code=code, **spec)


def item(kind="service", amount="1000", **kw) -> online.Item:
    return online.Item(kind=kind, description=kind, amount=D(amount), **kw)


def price(items, coupon=None, customer=None):
    return online.calculate(items, customer=customer, coupon=coupon, use_membership=False)


# --------------------------------------------------------------------------- pricing


@pytest.mark.django_db
def test_percent_is_capped_at_the_maximum():
    b = price([item(amount="3000")], make_coupon(max_discount=D("200")))
    assert b.coupon_amount == D("200") and b.total == D("2800")


@pytest.mark.django_db
def test_flat_is_capped_at_the_eligible_subtotal():
    coupon = make_coupon("FLAT500", kind="flat", value=D("500"), applies_to="products")
    b = price([item(amount="1000"), item("product", "300")], coupon)
    assert b.eligible_total == D("300")
    assert b.coupon_amount == D("300") and b.total == D("1000")


@pytest.mark.django_db
def test_minimum_order_value():
    coupon = make_coupon("FLAT100", kind="flat", value=D("100"), min_bill=D("999"))
    with pytest.raises(CheckoutError) as err:
        price([item(amount="600")], coupon)
    assert err.value.code == "minimum" and "at least Rs 999" in err.value.message
    assert price([item(amount="999")], coupon).total == D("899")


@pytest.mark.django_db
def test_only_eligible_items_get_the_discount(catalogue):
    coupon = make_coupon("FACIAL10", applies_to="chosen")
    coupon.services.add(catalogue["facial"])
    items = [
        item(amount="300", ref_id=str(catalogue["haircut"].id), division="salon"),
        item(amount="800", ref_id=str(catalogue["facial"].id), division="beauty-parlor"),
    ]
    b = price(items, coupon)
    assert b.eligible_total == D("800") and b.coupon_amount == D("80")
    assert items[0].coupon == 0 and items[1].coupon == D("80")
    by_division = make_coupon("SALON10", applies_to="chosen", divisions=["salon"])
    assert price([item(amount="300", division="salon")], by_division).coupon_amount == D("30")
    with pytest.raises(CheckoutError) as err:
        price([item(amount="300", division="spa")], by_division)
    assert err.value.code == "wrong_items"


@pytest.mark.django_db
def test_discount_comes_before_gst():
    b = price([item(amount="1180")], make_coupon("FLAT", kind="flat", value=D("100")))
    # GST is worked out on the discounted price: 1080 * 18 / 118.
    assert b.gst_included == D("164.75")
    assert b.taxable_value == D("915.25")
    assert b.total == D("1080")


@pytest.mark.django_db
def test_rounding_is_half_up_to_the_paisa():
    b = price([item(amount="333.35")], make_coupon(value=D("10")))
    assert b.coupon_amount == D("33.34")  # 33.335 -> 33.34
    assert b.total == D("300.01")


@pytest.mark.django_db
def test_total_never_goes_below_zero():
    b = price([item(amount="300")], make_coupon("BIG", kind="flat", value=D("1000")))
    assert b.coupon_amount == D("300") and b.total == D("0")


# --------------------------------------------------------------------------- validity


@pytest.mark.django_db
@pytest.mark.parametrize(
    "spec,code",
    [
        ({"starts_on": 1}, "not_started"),
        ({"ends_on": -1}, "expired"),
        ({"is_active": False}, "inactive"),
    ],
)
def test_dates_and_the_active_flag(spec, code):
    # Day offsets are turned into dates when the test runs (not when it is collected), so a run
    # that crosses midnight still checks the right day.
    today = timezone.localdate()
    spec = {k: today + timedelta(days=v) if k.endswith("_on") else v for k, v in spec.items()}
    with pytest.raises(CheckoutError) as err:
        coupons.check_usable(make_coupon(**spec), None, D("0"))
    assert err.value.code == code


@pytest.mark.django_db
def test_first_visit_only(catalogue, customer, desk):
    client, user = customer
    coupon = make_coupon("WELCOME", first_visit_only=True)
    coupons.check_usable(coupon, user, D("0"))  # no visits yet
    appt_id = awaiting(client, desk[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(status=S.COMPLETED)
    with pytest.raises(CheckoutError) as err:
        coupons.check_usable(coupon, user, D("0"))
    assert err.value.code == "first_visit"


@pytest.mark.django_db
def test_per_customer_and_total_limits(make_user):
    one, two = make_user(), make_user()
    coupon = make_coupon(total_limit=2, per_customer_limit=1)
    CouponRedemption.objects.create(coupon=coupon, customer=one, amount=D("10"))
    with pytest.raises(CheckoutError) as err:
        coupons.check_usable(coupon, one, D("0"))
    assert err.value.code == "used"
    coupons.check_usable(coupon, two, D("0"))
    CouponRedemption.objects.create(coupon=coupon, customer=make_user(), amount=D("10"))
    with pytest.raises(CheckoutError) as err:
        coupons.check_usable(coupon, two, D("0"))
    assert err.value.code == "limit"


@pytest.mark.django_db
def test_terms_are_short_and_plain():
    coupon = make_coupon(
        max_discount=D("200"),
        min_bill=D("500"),
        ends_on=timezone.localdate().replace(month=11, day=30),
    )
    assert (
        coupons.terms(coupon) == "10% off, up to Rs 200 · minimum order Rs 500 · valid till 30 Nov"
    )


# --------------------------------------------------------------------------- payment page


def url(appt_id) -> str:
    return f"/api/my/appointments/{appt_id}/payment/coupon/"


def apply(client, appt_id, code, link):
    return client.post(url(appt_id), {"code": code, "link": link}, content_type="application/json")


def remove(client, appt_id, link):
    return client.delete(f"{url(appt_id)}?link={link}")


def quote(client, appt_id, link):
    return client.get(f"/api/my/appointments/{appt_id}/payment/?link={link}").json()


@pytest.fixture
def due(catalogue, customer, desk):
    client, user = customer
    appt_id = awaiting(client, desk[0], catalogue)
    return client, user, appt_id, payment_token(appt_id)


def test_apply_and_remove_restore_the_exact_total(due):
    client, user, appt_id, link = due
    make_coupon("SAVE10")
    before = quote(client, appt_id, link)
    full = before["quote"]["total"]
    assert [c["code"] for c in before["coupons"]] == ["SAVE10"]
    assert before["coupons"][0]["terms"] == "10% off" and before["coupons"][0]["eligible"]
    response = apply(client, appt_id, "save10", link)
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["applied_coupon"] == "SAVE10"
    assert D(body["quote"]["coupon_amount"]) == D(full) / 10
    assert quote(client, appt_id, link)["applied_coupon"] == "SAVE10"
    assert PaymentLink.objects.get(status="active").coupon_amount == D(full) / 10
    assert not CouponRedemption.objects.exists()  # counted only when the payment succeeds
    removed = remove(client, appt_id, link).json()
    assert removed["applied_coupon"] == "" and removed["quote"]["total"] == full
    actions = list(AuditLog.objects.values_list("action", flat=True))
    assert AuditLog.Action.COUPON_APPLIED in actions and AuditLog.Action.COUPON_REMOVED in actions


def test_one_coupon_per_payment_the_new_code_replaces_the_old(due):
    client, _, appt_id, link = due
    make_coupon("SAVE10")
    make_coupon("FLAT50", kind="flat", value=D("50"))
    apply(client, appt_id, "SAVE10", link)
    body = apply(client, appt_id, "FLAT50", link).json()
    assert body["applied_coupon"] == "FLAT50" and body["quote"]["coupon_amount"] == "50.00"


def test_unknown_and_private_codes_get_one_generic_message(due, make_user):
    client, _, appt_id, link = due
    make_coupon("THEIRS", customer=make_user())
    for code in ("NOPE99", "THEIRS"):
        response = apply(client, appt_id, code, link)
        assert response.status_code == 400
        assert response.json()["detail"] == coupons.UNKNOWN


def test_errors_are_short_and_plain(due):
    client, _, appt_id, link = due
    make_coupon("OLD", ends_on=timezone.localdate() - timedelta(days=1))
    make_coupon("FLAT100", kind="flat", value=D("100"), min_bill=D("999"))
    assert apply(client, appt_id, "OLD", link).json()["detail"] == "OLD has expired."
    assert "at least Rs 999" in apply(client, appt_id, "FLAT100", link).json()["detail"]


def test_browser_sent_amounts_are_ignored_and_payment_uses_the_applied_coupon(due):
    client, user, appt_id, link = due
    make_coupon("SAVE10")
    full = D(quote(client, appt_id, link)["quote"]["total"])
    apply(client, appt_id, "SAVE10", link)
    response = client.post(
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": link, "amount": "1", "total": "1", "coupon_amount": "999"},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    paid = Payment.objects.get(appointment_id=appt_id, status="succeeded")
    assert paid.amount == full - full / 10
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.status == S.SCHEDULED and appt.prepay_coupon.code == "SAVE10"
    assert CouponRedemption.objects.get().amount == full / 10
    mail = MailOutbox.objects.filter(subject__icontains="payment").latest("created_at")
    assert "Coupon SAVE10" in mail.body


def test_a_zero_total_is_paid_and_covered_by_the_coupon(due):
    client, _, appt_id, link = due
    make_coupon("FREE", value=D("100"))
    apply(client, appt_id, "FREE", link)
    response = client.post(
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "fail", "link": link},  # no gateway step is needed at all
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    assert Appointment.objects.get(pk=appt_id).status == S.SCHEDULED
    payment = Payment.objects.get(appointment_id=appt_id)
    assert payment.amount == 0 and payment.method == "coupon"
    assert MailOutbox.objects.filter(body__contains="Rs 0, covered by coupon").exists()


def test_a_coupon_no_longer_valid_at_payment_takes_no_money(due):
    client, _, appt_id, link = due
    coupon = make_coupon("SAVE10")
    full = quote(client, appt_id, link)["quote"]["total"]
    apply(client, appt_id, "SAVE10", link)
    Coupon.objects.filter(pk=coupon.pk).update(is_active=False)
    response = client.post(
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": link},
        content_type="application/json",
    )
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "coupon_changed" and "No money was taken" in body["detail"]
    assert f"Rs {D(full):,.0f}" in body["detail"]
    assert not Payment.objects.filter(appointment_id=appt_id).exists()
    assert quote(client, appt_id, link)["applied_coupon"] == ""
    # The customer confirms the new total by paying again.
    again = client.post(
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": link},
        content_type="application/json",
    )
    assert again.status_code == 200
    assert Payment.objects.get(appointment_id=appt_id).amount == D(full)


def test_link_expiry_releases_the_coupon(due):
    client, _, appt_id, link = due
    make_coupon("SAVE10")
    apply(client, appt_id, "SAVE10", link)
    Appointment.objects.filter(pk=appt_id).update(
        awaiting_payment_until=timezone.now() - timedelta(minutes=1)
    )
    booking.expire_due()
    expired = PaymentLink.objects.get(appointment_id=appt_id)
    assert expired.status == "expired" and expired.coupon is None
    assert not CouponRedemption.objects.exists()


def pay_with(client, appt_id, link, code):
    apply(client, appt_id, code, link)
    response = client.post(
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": link},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content


def test_salon_cancellation_gives_the_use_back_and_refunds_only_what_was_paid(due, desk):
    client, user, appt_id, link = due
    make_coupon("SAVE10", per_customer_limit=1)
    pay_with(client, appt_id, link, "SAVE10")
    paid = Payment.objects.get(appointment_id=appt_id).amount
    response = desk[0].post(
        f"/api/desk/appointments/{appt_id}/cancel/",
        {"reason": "stylist_unavailable"},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    assert CouponRedemption.objects.get().released_at is not None
    assert Refund.objects.get().amount == paid  # never the coupon's rupees
    coupons.check_usable(Coupon.objects.get(), user, D("0"))  # usable again


def test_rate_limit_blocks_and_audits(due):
    client, _, appt_id, link = due
    with override_settings(SALON_COUPON_ATTEMPTS=2):
        assert apply(client, appt_id, "NOPE1", link).status_code == 400
        assert apply(client, appt_id, "NOPE2", link).status_code == 400
        blocked = apply(client, appt_id, "NOPE3", link)
    assert blocked.status_code == 429
    assert AuditLog.objects.filter(action=AuditLog.Action.COUPON_APPLY_BLOCKED).exists()


# --------------------------------------------------------------------------- concurrency


@pytest.mark.django_db(transaction=True)
def test_two_customers_racing_for_the_last_use_only_one_wins(catalogue, desk, make_user):
    coupon = make_coupon("LAST1", total_limit=1)
    payers = []
    for hour, name in ((11, "asha"), (12, "ravi")):
        user = make_user(role="customer", full_name=f"Racer {hour}")
        CustomerProfile.objects.create(user=user, phone="9876543210", phone_index=str(hour))
        client = Client()
        assert login(client, user).status_code == 200
        appt_id = awaiting(client, desk[0], catalogue, hour=hour, stylist=name)
        link = payment_token(appt_id)
        assert apply(client, appt_id, "LAST1", link).status_code == 200
        payers.append((user, appt_id, link))

    barrier = threading.Barrier(2)
    results: list = []

    def run(user, appt_id, link):
        try:
            barrier.wait()
            booking.pay(appt_id, customer=user, token=link, succeed=True)
            results.append("paid")
        except booking.BookingError as exc:
            results.append(exc.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=p) for p in payers]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == ["coupon_changed", "paid"]
    assert CouponRedemption.objects.filter(coupon=coupon).count() == 1
    # The one who lost paid nothing and is asked to confirm the full total.
    assert Payment.objects.filter(status="succeeded").count() == 1


# --------------------------------------------------------------------------- permissions


def test_customers_apply_only_to_their_own_payment(due, logged_in):
    _, _, appt_id, link = due
    make_coupon("SAVE10")
    other, _ = logged_in("customer")
    assert apply(other, appt_id, "SAVE10", link).status_code == 404


@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_staff_cannot_apply_coupons_to_payments(due, logged_in, role):
    _, _, appt_id, link = due
    client, _ = logged_in(role)
    assert apply(client, appt_id, "SAVE10", link).status_code == 403
    assert not policy.role_can(role, "my.payment.coupon")


@pytest.mark.parametrize("role", ["receptionist", "stylist", "customer"])
def test_only_the_admin_manages_coupons(logged_in, role):
    client, _ = logged_in(role)
    body = {"code": "NEW10", "name": "New", "kind": "percent", "value": "10"}
    assert (
        client.post(
            "/api/admin/marketing/coupons/", body, content_type="application/json"
        ).status_code
        == 403
    )
    assert client.get("/api/admin/marketing/coupons/report/").status_code == 403
    admin, _ = logged_in("admin")
    response = admin.post("/api/admin/marketing/coupons/", body, content_type="application/json")
    assert response.status_code == 201, response.content


@pytest.mark.django_db
@pytest.mark.parametrize("action", ["coupon.create", "coupon.apply", "coupon.remove"])
def test_air_never_touches_coupons(action):
    assert actor.allowed(action) is False
    assert policy.service_actor_can("air", action) is False
    assert "my.payment.coupon" not in actor.CUSTOMER_ASSIST


def test_the_desk_and_the_stylist_see_the_coupon_read_only(due, desk):
    client, _, appt_id, link = due
    make_coupon("SAVE10")
    pay_with(client, appt_id, link, "SAVE10")
    row = desk[0].get(f"/api/desk/appointments/{appt_id}/").json()
    assert row["coupon_code"] == "SAVE10" and D(row["coupon_discount"]) > 0
    mine = client.get(f"/api/my/appointments/{appt_id}/").json()
    assert mine["coupon_code"] == "SAVE10"


# --------------------------------------------------------------------------- reports, payroll


def test_the_report_counts_uses_discount_and_revenue(due, logged_in):
    client, _, appt_id, link = due
    make_coupon("SAVE10")
    pay_with(client, appt_id, link, "SAVE10")
    admin, _ = logged_in("admin")
    body = admin.get("/api/admin/marketing/coupons/report/").json()
    assert body["coupons"][0]["code"] == "SAVE10" and body["coupons"][0]["uses"] == 1
    assert D(body["total_discount"]) > 0
    assert body["with_coupon"]["bookings"] == 1 and body["without_coupon"]["bookings"] == 0
    paid = Payment.objects.get(appointment_id=appt_id).amount
    assert D(body["with_coupon"]["revenue"]) == paid


def test_stylist_pay_ignores_the_coupon(due):
    client, _, appt_id, link = due
    before = task_base(Appointment.objects.get(pk=appt_id))
    make_coupon("SAVE10")
    pay_with(client, appt_id, link, "SAVE10")
    assert task_base(Appointment.objects.get(pk=appt_id)) == before


@pytest.mark.django_db
def test_demo_coupons_are_made_once():
    assert sorted(demo.ensure_demo_coupons()) == ["EXPIRED20", "FLAT100", "WELCOME10"]
    assert demo.ensure_demo_coupons() == []
    assert Coupon.objects.get(code="WELCOME10").first_visit_only
    assert Coupon.objects.get(code="FLAT100").min_bill == D("999")
    assert Coupon.objects.get(code="EXPIRED20").ends_on < timezone.localdate()
