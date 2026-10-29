"""Task 8.5 part 4: products inside a booking. Stock is held through the ledger, given back when
the visit does not happen, and billed at checkout without being taken from stock twice."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice, InvoiceItem
from billing.tests.test_concurrency_5e import run_together
from billing.tests.test_online_pricing import coupon
from billing.tests.test_pos import pay_in_full, quote
from conftest import login
from inventory import stock
from inventory.models import StockMovement
from scheduling.models import Appointment, AppointmentProduct, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures)
    catalogue,
    confirm,
    customer,
    day_at,
    desk,
    payment_token,
    request_body,
    send_request,
)
from shop.tests.test_shop import make_product, post

D = Decimal
S = AppointmentStatus


@pytest.fixture
def oil(catalogue):
    p = make_product("Argan Hair Oil", "450.00", qty=3)
    catalogue["haircut"].category.recommended_products.add(p)
    return p


def book(client, cat, products, **extra):
    return send_request(client, cat, products=products, **extra)


def with_oil(oil, qty=1):
    return [{"product": str(oil.id), "quantity": qty}]


def confirmed(customer, desk, cat, oil, qty=1):
    r = book(customer[0], cat, with_oil(oil, qty))
    assert r.status_code == 201, r.content
    appt_id = r.json()["id"]
    assert confirm(desk[0], appt_id, cat["asha"], day_at(3, 11)).status_code == 200
    return appt_id


def pay(client, appt_id, **extra):
    return post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": payment_token(appt_id), **extra},
    )


# --------------------------------------------------------------------------- booking sheet


def test_the_booking_sheet_offers_the_categorys_recommended_products(customer, catalogue, oil):
    make_product("Unlisted Wax", qty=4)  # not recommended for this category
    hidden = make_product("Counter Only", qty=4, sold_online=False)
    catalogue["haircut"].category.recommended_products.add(hidden)
    data = customer[0].get("/api/booking/options/?service=haircut").json()
    names = [p["name"] for p in data["recommended_products"]]
    assert names == ["Argan Hair Oil"]
    assert data["recommended_products"][0]["in_stock"] is True


def test_products_add_to_the_price_and_their_stock_is_held(customer, catalogue, oil):
    r = book(customer[0], catalogue, with_oil(oil, 2))
    assert r.status_code == 201, r.content
    data = r.json()
    assert D(data["price_total"]) == D("300")  # the service itself
    assert D(data["amount_payable"]) == D("300") + D("900")  # paid online with the products
    assert data["products"][0]["name"] == "Argan Hair Oil" and data["products"][0]["paid_online"]
    assert stock.level(oil) == 1
    move = StockMovement.objects.get(reason=StockMovement.Reason.BOOKING_HOLD)
    assert move.delta == -2 and str(move.appointment_id) == data["id"]


def test_out_of_stock_products_stop_the_request_and_nothing_is_held(customer, catalogue, oil):
    r = book(customer[0], catalogue, with_oil(oil, 4))
    assert r.status_code in (400, 409) and r.json()["field"] == "products"
    assert Appointment.objects.count() == 0 and stock.level(oil) == 3


def test_a_product_no_longer_sold_online_cannot_be_booked(customer, catalogue, oil):
    oil.sold_online = False
    oil.save()
    r = book(customer[0], catalogue, with_oil(oil))
    assert r.status_code == 400 and r.json()["field"] == "products"


# --------------------------------------------------------------------------- paying and billing


def test_the_payment_covers_service_and_products_with_the_coupon_shared(
    customer, desk, catalogue, oil
):
    coupon("TEN", value="10")
    appt_id = confirmed(customer, desk, catalogue, oil)
    token = payment_token(appt_id)
    q = customer[0].get(f"/api/my/appointments/{appt_id}/payment/?link={token}&coupon=TEN").json()
    assert q["quote"]["items_total"] == "750.00" and q["quote"]["coupon_amount"] == "75.00"
    assert pay(customer[0], appt_id, coupon="TEN").status_code == 200
    appt = Appointment.objects.get(pk=appt_id)
    assert sum(p.amount for p in appt.payments.all()) == D("675.00")


def test_checkout_bills_booked_products_without_taking_stock_twice(customer, desk, catalogue, oil):
    appt_id = confirmed(customer, desk, catalogue, oil)
    assert pay(customer[0], appt_id).status_code == 200
    assert stock.level(oil) == 2
    Appointment.objects.filter(pk=appt_id).update(status=S.CHECKED_IN)
    q = quote(desk[0], appt_id).json()
    booked = [ln for ln in q["lines"] if ln["from_booking"]]
    assert [ln["description"] for ln in booked] == ["Argan Hair Oil"]
    assert D(q["to_collect"]) == 0  # the online payment covered service and product
    assert pay_in_full(desk[0], appt_id).status_code == 201
    invoice = Invoice.objects.get(appointment_id=appt_id)
    assert InvoiceItem.objects.filter(invoice=invoice, product=oil).count() == 1
    assert stock.level(oil) == 2  # not taken again
    assert AppointmentProduct.objects.get(appointment_id=appt_id).status == "billed"


def test_checkout_carries_an_online_coupon_over_service_and_products(
    customer, desk, catalogue, oil
):
    coupon("FLAT50", "flat", "50")
    appt_id = confirmed(customer, desk, catalogue, oil)
    assert pay(customer[0], appt_id, coupon="FLAT50").status_code == 200
    Appointment.objects.filter(pk=appt_id).update(status=S.CHECKED_IN)
    q = quote(desk[0], appt_id).json()
    assert D(q["to_collect"]) == 0 and q["coupon_code"] == "FLAT50"
    assert pay_in_full(desk[0], appt_id).status_code == 201
    assert Invoice.objects.get(appointment_id=appt_id).total == D("700.00")


@pytest.mark.parametrize("how", ["reject", "expire", "customer_cancel", "salon_cancel", "no_show"])
def test_the_stock_comes_back_when_the_visit_does_not_happen(
    customer, desk, catalogue, oil, logged_in, how
):
    if how == "reject":
        appt_id = book(customer[0], catalogue, with_oil(oil)).json()["id"]
        r = post(desk[0], f"/api/desk/appointments/{appt_id}/reject/", {"reason": "Fully booked"})
        assert r.status_code == 200, r.content
    elif how == "expire":
        appt_id = confirmed(customer, desk, catalogue, oil)
        Appointment.objects.filter(pk=appt_id).update(
            awaiting_payment_until=timezone.now() - timedelta(minutes=1)
        )
        customer[0].get("/api/my/appointments/")
        assert Appointment.objects.get(pk=appt_id).status == S.PAYMENT_EXPIRED
    elif how == "customer_cancel":
        appt_id = confirmed(customer, desk, catalogue, oil)
        pay(customer[0], appt_id)
        r = post(customer[0], f"/api/my/appointments/{appt_id}/cancel/", {"reason": "sick"})
        assert r.status_code == 200, r.content
    elif how == "salon_cancel":
        appt_id = confirmed(customer, desk, catalogue, oil)
        pay(customer[0], appt_id)
        r = post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "Stylist ill"})
        assert r.status_code == 200, r.content
    else:
        appt_id = confirmed(customer, desk, catalogue, oil)
        pay(customer[0], appt_id)
        Appointment.objects.filter(pk=appt_id).update(start=timezone.now() - timedelta(hours=2))
        r = post(desk[0], f"/api/desk/appointments/{appt_id}/no-show/", {})
        assert r.status_code == 200, r.content
    assert stock.level(oil) == 3
    assert AppointmentProduct.objects.get(appointment_id=appt_id).status == "released"
    back = StockMovement.objects.filter(reason=StockMovement.Reason.BOOKING_RELEASE)
    assert back.count() == 1


# --------------------------------------------------------------------------- add to my next visit


def test_add_to_my_next_appointment_is_paid_at_the_salon(customer, desk, catalogue, oil):
    client = customer[0]
    assert client.get("/api/my/shop/next-visit/").json()["visit"] is None
    none = post(client, "/api/my/shop/next-visit/", {"product": str(oil.id)})
    assert none.status_code == 409
    appt_id = book(client, catalogue, []).json()["id"]
    assert confirm(desk[0], appt_id, catalogue["asha"], day_at(3, 11)).status_code == 200
    pay(client, appt_id)
    visit = client.get("/api/my/shop/next-visit/").json()["visit"]
    assert visit["id"] == appt_id
    r = post(client, "/api/my/shop/next-visit/", {"product": str(oil.id), "quantity": 2})
    assert r.status_code == 201
    row = r.json()["visit"]["products"][0]
    assert row["paid_online"] is False and stock.level(oil) == 1
    Appointment.objects.filter(pk=appt_id).update(status=S.CHECKED_IN)
    q = quote(desk[0], appt_id).json()
    assert D(q["to_collect"]) == D("900.00")  # the service was paid online; the oil is not


def test_a_pay_at_salon_product_can_be_taken_off_but_not_a_prepaid_one(
    customer, desk, catalogue, oil, logged_in
):
    client = customer[0]
    appt_id = confirmed(customer, desk, catalogue, oil)
    pay(client, appt_id)
    added = post(client, "/api/my/shop/next-visit/", {"product": str(oil.id)}).json()
    prepaid, later = sorted(
        added["visit"]["products"], key=lambda r: r["paid_online"], reverse=True
    )
    url = f"/api/my/shop/visit-products/{appt_id}/"
    assert client.delete(url + f"{prepaid['id']}/").status_code == 409
    other, _ = logged_in("customer")
    assert other.delete(url + f"{later['id']}/").status_code == 404
    assert client.delete(url + f"{later['id']}/").status_code == 200
    assert stock.level(oil) == 2  # only the pay-at-salon one came back


# --------------------------------------------------------------------------- admin and roles


def test_the_admin_picks_recommended_products_per_category_and_it_is_audited(logged_in, catalogue):
    admin, _ = logged_in("admin")
    serum = make_product("Serum", qty=2)
    category = catalogue["haircut"].category
    r = admin.patch(
        f"/api/admin/catalogue/categories/{category.id}/",
        {"recommended_products": [str(serum.id)]},
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert r.json()["recommended_products"] == [str(serum.id)]
    entry = AuditLog.objects.filter(metadata__name=category.name).latest("created_at")
    assert entry.metadata["changes"]["recommended_products"][1] == "Serum"


@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_only_customers_add_products_to_their_visits(logged_in, role):
    client, _ = logged_in(role)
    assert client.get("/api/my/shop/next-visit/").status_code == 403
    assert post(client, "/api/my/shop/next-visit/", {}).status_code == 403


# --------------------------------------------------------------------------- at the same moment


@pytest.mark.django_db(transaction=True)
def test_two_bookings_for_the_last_bottle_only_one_gets_it(catalogue, make_user):
    last = make_product("Last Bottle", qty=1)
    clients = []
    for n in (1, 2):
        c = Client()
        login(c, make_user(role="customer", email=f"bk{n}@example.com"))
        clients.append(c)
    hours = (11, 15)
    results = run_together(
        *[
            lambda c=c, h=h: (
                c.post(
                    "/api/booking/requests/",
                    request_body(
                        catalogue,
                        start=day_at(3, h).isoformat(),
                        products=[{"product": str(last.id), "quantity": 1}],
                    ),
                    content_type="application/json",
                ).status_code
            )
            for c, h in zip(clients, hours, strict=True)
        ]
    )
    assert sorted(results) == [201, 409], results
    assert stock.level(last) == 0
