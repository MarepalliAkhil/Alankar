"""Task 8.5 part 3: coupons and the online money engine.

Fixed numbers for each combination, in the order the rules apply online:
items -> coupon -> membership -> package -> delivery -> gift card (last)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing import online
from billing.models import Invoice
from billing.pos import CheckoutError
from billing.tests.test_concurrency_5e import run_together
from billing.tests.test_pos import checkout_call, pay_in_full, quote
from conftest import login
from marketing.models import Coupon, CouponRedemption
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures)
    awaiting,
    catalogue,
    customer,
    desk,
    payment_token,
)
from shop.models import Order
from shop.tests.test_shop import ADDRESS, cart, make_product, paid_order, place, post
from wallet import selling
from wallet.models import GiftCard, Membership

D = Decimal


def coupon(code="SAVE10", kind="percent", value="10", **extra) -> Coupon:
    return Coupon.objects.create(code=code, name=code, kind=kind, value=D(value), **extra)


def member(user, percent="10", products=False) -> Membership:
    now = timezone.now()
    return Membership.objects.create(
        customer=user,
        plan_name="Gold",
        price=D("1000"),
        period_months=1,
        discount_percent=D(percent),
        applies_to_products=products,
        started_at=now,
        period_start=now,
        period_end=now + timedelta(days=30),
    )


def gift_card(amount="300"):
    card, code = selling.sell_gift_card(
        amount=D(amount), channel="pos", method="cash", buyer_name="Walk-in buyer"
    )
    return card, code


def service(amount="1000"):
    return online.Item(kind="service", description="Haircut", amount=D(amount))


def product(amount="500"):
    return online.Item(kind="product", description="Oil", amount=D(amount))


# --------------------------------------------------------------------------- the engine


@pytest.mark.django_db
def test_items_only(make_user):
    b = online.calculate([service(), product()], customer=make_user())
    assert (b.items_total, b.discount, b.total, b.due) == (D("1500"), 0, D("1500"), D("1500"))


@pytest.mark.django_db
def test_percent_coupon_on_the_whole_cart(make_user):
    b = online.calculate([service(), product()], customer=make_user(), coupon=coupon())
    assert b.coupon_amount == D("150.00") and b.total == D("1350.00")


@pytest.mark.django_db
def test_flat_coupon_comes_off_before_the_membership_percent(make_user):
    user = make_user()
    member(user, "10")
    b = online.calculate([service()], customer=user, coupon=coupon("FLAT100", "flat", "100"))
    # 1000 - 100 coupon = 900, then 10% membership = 90 -> 810
    assert (b.coupon_amount, b.member_amount, b.total) == (D("100.00"), D("90.00"), D("810.00"))


@pytest.mark.django_db
def test_a_products_only_coupon_and_a_services_only_membership(make_user):
    user = make_user()
    member(user, "20", products=False)
    c = coupon("PROD50", "flat", "50", applies_to=Coupon.AppliesTo.PRODUCTS)
    b = online.calculate([service(), product()], customer=user, coupon=c)
    s, p = b.items
    assert (s.coupon, p.coupon) == (0, D("50.00"))
    assert (s.member, p.member) == (D("200.00"), 0)  # products are not in this plan
    assert b.total == D("800.00") + D("450.00")


@pytest.mark.django_db
def test_membership_on_products_when_the_plan_says_so(make_user):
    user = make_user()
    member(user, "10", products=True)
    b = online.calculate([product("500")], customer=user)
    assert b.member_amount == D("50.00") and b.total == D("450.00")


@pytest.mark.django_db
def test_package_then_gift_card_last(make_user):
    user = make_user()
    member(user, "10")
    b = online.calculate(
        [service("1000"), product("500")],
        customer=user,
        coupon=coupon(),  # 10% of 1500 = 150, shared 100 / 50
        package_amount=D("900"),  # the service line after coupon (900) and member (90) is 810
        delivery_fee=D("49"),
        gift_balance=D("300"),
    )
    s, p = b.items
    assert s.after == 0 and b.package_amount == D("810.00")
    assert p.after == D("450.00")
    assert b.total == D("499.00")  # 450 product + 49 delivery
    assert b.gift_amount == D("300.00") and b.due == D("199.00")


@pytest.mark.django_db
def test_gift_card_never_pays_more_than_owed_or_its_balance(make_user):
    b = online.calculate([product("200")], customer=make_user(), gift_balance=D("1000"))
    assert (b.gift_amount, b.due) == (D("200.00"), 0)
    b = online.calculate(
        [product("200")], customer=make_user(), gift_balance=D("1000"), gift_wanted=D("50")
    )
    assert (b.gift_amount, b.due) == (D("50.00"), D("150.00"))


@pytest.mark.django_db
def test_percent_coupon_respects_its_cap(make_user):
    c = coupon("BIG50", value="50", max_discount=D("200"))
    b = online.calculate([service("1000")], customer=make_user(), coupon=c)
    assert b.coupon_amount == D("200.00")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "extra, message",
    [
        ({"is_active": False}, "switched off"),
        ({"ends_on": "past"}, "expired"),
        ({"starts_on": "future"}, "not valid yet"),
        ({"total_limit": 0}, "fully used"),
        ({"min_bill": D("5000")}, "at least"),
        ({"applies_to": Coupon.AppliesTo.SERVICES}, "does not apply"),
    ],
)
def test_coupon_rules_are_checked_on_the_server(make_user, extra, message):
    today = timezone.localdate()
    if extra.get("ends_on") == "past":
        extra["ends_on"] = today - timedelta(days=1)
    if extra.get("starts_on") == "future":
        extra["starts_on"] = today + timedelta(days=1)
    coupon("RULES", **extra)
    user = make_user()
    with pytest.raises(CheckoutError, match=message):
        c = online.find_coupon("rules", user)
        online.calculate([product()], customer=user, coupon=c)


@pytest.mark.django_db
def test_a_private_coupon_looks_invalid_to_anyone_else(make_user):
    owner, other = make_user(), make_user()
    coupon("JUSTYOU", customer=owner)
    assert online.find_coupon("JUSTYOU", owner).code == "JUSTYOU"
    with pytest.raises(CheckoutError, match="not valid"):
        online.find_coupon("JUSTYOU", other)


# --------------------------------------------------------------------------- shop checkout


@pytest.fixture
def shopper(logged_in):
    return logged_in("customer")


def test_shop_quote_and_order_use_the_coupon_and_membership(shopper):
    client, user = shopper
    member(user, "10", products=True)
    coupon("SHOP10")
    oil = make_product(price="600.00")
    body = {"items": cart((oil, 2)), "coupon": "shop10", "discount": "999"}
    q = post(client, "/api/my/shop/quote/", body).json()
    # 1200 - 10% coupon (120) = 1080, - 10% member (108) = 972; delivery free (items >= 999)
    assert (q["coupon_amount"], q["member_amount"], q["total"]) == ("120.00", "108.00", "972.00")
    r = place(client, cart((oil, 2)), coupon="SHOP10")
    assert r.status_code == 201
    order = r.json()
    assert (order["coupon_code"], order["discount"], order["total"]) == (
        "SHOP10",
        "228.00",
        "972.00",
    )
    redemption = CouponRedemption.objects.get(order_id=order["id"])
    assert redemption.amount == D("120.00") and redemption.invoice_id is None
    assert AuditLog.objects.get(action="order_placed").metadata["coupon"] == "SHOP10"


def test_a_bad_coupon_is_named_on_the_coupon_field(shopper):
    oil = make_product()
    r = post(shopper[0], "/api/my/shop/quote/", {"items": cart((oil, 1)), "coupon": "NOPE"})
    assert r.status_code == 400 and r.json()["field"] == "coupon"
    r = place(shopper[0], cart((oil, 1)), coupon="NOPE")
    assert r.status_code == 400 and Order.objects.count() == 0


def test_a_cancelled_order_gives_the_coupon_use_back(shopper):
    client, _ = shopper
    coupon("ONCE", per_customer_limit=1)
    oil = make_product(qty=5)
    first = place(client, cart((oil, 1)), coupon="ONCE").json()
    again = place(client, cart((oil, 1)), coupon="ONCE")
    assert again.status_code == 400 and "already been used" in again.json()["detail"]
    post(client, f"/api/my/orders/{first['id']}/cancel/", {})
    assert place(client, cart((oil, 1)), coupon="ONCE").status_code == 201


def test_gift_card_pays_part_and_comes_back_on_cancel(shopper):
    client, _ = shopper
    card, code = gift_card("300")
    oil = make_product(price="450.00")
    order = place(client, cart((oil, 1))).json()  # 450 + 49 delivery = 499
    url = f"/api/my/orders/{order['id']}/pay/"
    failed = post(client, url, {"outcome": "fail", "gift_card_code": code})
    assert failed.status_code == 402
    card.refresh_from_db()
    assert card.balance == D("300.00")  # nothing taken when the gateway part fails
    paid = post(client, url, {"outcome": "success", "gift_card_code": code})
    assert paid.status_code == 200
    data = paid.json()
    assert (data["gift_card_paid"], data["paid"]) == ("300.00", "499.00")
    card.refresh_from_db()
    assert card.balance == D("0.00")
    post(client, f"/api/my/orders/{order['id']}/cancel/", {})
    card.refresh_from_db()
    assert card.balance == D("300.00")


def test_a_wrong_gift_card_code_is_refused_and_counted(shopper):
    client, _ = shopper
    order = place(client, cart((make_product(), 1))).json()
    r = post(client, f"/api/my/orders/{order['id']}/pay/", {"gift_card_code": "WRONG-CODE"})
    assert r.status_code == 400 and r.json()["field"] == "gift_card_code"
    assert Order.objects.get(pk=order["id"]).status == "pending_payment"


def test_gift_card_can_pay_the_whole_order(shopper):
    client, _ = shopper
    _, code = gift_card("1000")
    order = place(client, cart((make_product(), 1))).json()
    r = post(
        client, f"/api/my/orders/{order['id']}/pay/", {"outcome": "fail", "gift_card_code": code}
    )
    assert r.status_code == 200 and r.json()["status"] == "placed"  # no gateway part at all


# --------------------------------------------------------------------------- booking payment


def test_booking_payment_quote_and_pay_with_coupon_and_membership(catalogue, customer, desk):
    pay_booking_with_coupon(catalogue, customer, desk)


def pay_booking_with_coupon(catalogue, customer, desk):
    client, user = customer
    member(user, "10")
    coupon("FLAT100", "flat", "100")
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    price = D(client.get(f"/api/my/appointments/{appt_id}/payment/?link={token}").json()["amount"])
    q = client.get(f"/api/my/appointments/{appt_id}/payment/?link={token}&coupon=flat100").json()
    expected = (price - 100) - ((price - 100) * D("0.10")).quantize(D("0.01"))
    assert q["quote"]["coupon_amount"] == "100.00" and D(q["quote"]["total"]) == expected
    bad = client.get(f"/api/my/appointments/{appt_id}/payment/?link={token}&coupon=NOPE").json()
    assert bad["coupon_error"] and D(bad["quote"]["coupon_amount"]) == 0
    r = post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": token, "coupon": "FLAT100"},
    )
    assert r.status_code == 200
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.status == AppointmentStatus.SCHEDULED
    assert sum(p.amount for p in appt.payments.all()) == expected
    assert CouponRedemption.objects.get(appointment=appt).amount == D("100.00")
    return appt_id, expected


def test_checkout_carries_the_online_coupon_so_nothing_more_is_owed(catalogue, customer, desk):
    appt_id, paid = pay_booking_with_coupon(catalogue, customer, desk)
    Appointment.objects.filter(pk=appt_id).update(status=AppointmentStatus.CHECKED_IN)
    other = quote(desk[0], appt_id, coupon="SOMETHINGELSE")
    assert other.status_code == 400 and "already used coupon FLAT100" in other.json()["detail"]
    q = quote(desk[0], appt_id).json()
    assert D(q["to_collect"]) == 0
    done = pay_in_full(desk[0], appt_id)
    assert done.status_code == 201, done.content
    invoice = Invoice.objects.get(appointment_id=appt_id)
    assert invoice.coupon_code == "FLAT100" and invoice.total == paid
    redemption = CouponRedemption.objects.get(appointment_id=appt_id)
    assert redemption.invoice_id == invoice.id
    assert CouponRedemption.objects.filter(coupon__code="FLAT100").count() == 1


def test_a_free_cancellation_gives_the_booking_coupon_back(catalogue, customer, desk):
    client, _ = customer
    coupon("ONEUSE", per_customer_limit=1)
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": token, "coupon": "ONEUSE"},
    )
    r = post(client, f"/api/my/appointments/{appt_id}/cancel/", {"reason": "plans changed"})
    assert r.status_code == 200, r.content
    assert CouponRedemption.objects.get(appointment_id=appt_id).released_at is not None
    assert online.find_coupon("ONEUSE", customer[1]).code == "ONEUSE"


def test_a_coupon_that_does_not_fit_the_booking_is_refused(catalogue, customer, desk):
    client, _ = customer
    coupon("PRODONLY", applies_to=Coupon.AppliesTo.PRODUCTS)
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    r = post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": token, "coupon": "PRODONLY"},
    )
    assert r.status_code == 400 and r.json()["field"] == "coupon"
    assert Appointment.objects.get(pk=appt_id).status == AppointmentStatus.AWAITING_PAYMENT


# --------------------------------------------------------------------------- at the same moment


@pytest.mark.django_db(transaction=True)
def test_two_orders_cannot_both_take_a_coupons_last_use(make_user):
    coupon("LASTONE", total_limit=1)
    oil = make_product(qty=5)
    clients = []
    for n in (1, 2):
        c = Client()
        login(c, make_user(role="customer", email=f"cpn{n}@example.com"))
        clients.append(c)
    results = run_together(
        *[
            lambda c=c: (
                post(
                    c,
                    "/api/my/orders/",
                    {"items": cart((oil, 1)), "address": ADDRESS, "coupon": "LASTONE"},
                ).status_code
            )
            for c in clients
        ]
    )
    assert sorted(results) == [201, 400], results
    assert CouponRedemption.objects.filter(coupon__code="LASTONE").count() == 1


@pytest.mark.django_db(transaction=True)
def test_one_gift_card_paying_two_orders_at_once_never_goes_below_zero(make_user):
    _, code = gift_card("500")
    c = Client()
    login(c, make_user(role="customer", email="giftrace@example.com"))
    oil = make_product(price="400.00", qty=5)
    a = place(c, cart((oil, 1))).json()
    b = place(c, cart((oil, 1))).json()
    results = run_together(
        *[
            lambda o=o: (
                post(
                    c,
                    f"/api/my/orders/{o['id']}/pay/",
                    {"outcome": "fail", "gift_card_code": code},
                ).status_code
            )
            for o in (a, b)
        ]
    )
    card = GiftCard.objects.get()
    assert card.balance >= 0
    # 449 each: the first pays in full from the card; the second finds only 51 left and its
    # gateway part fails, so nothing is taken.
    assert sorted(results) in ([200, 402], [200, 409]), results
    assert card.balance == D("51.00")


def test_paid_order_helper_still_works(shopper):
    # the shared helper used by other suites keeps working with the engine in place
    assert paid_order(shopper[0], cart((make_product(), 1)))["status"] == "placed"
