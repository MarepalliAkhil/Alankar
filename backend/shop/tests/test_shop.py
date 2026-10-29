"""Task 8.5 part 2: the online shop. Prices come from the server, stock is a ledger, delivery
details are encrypted, every step is audited, and each role sees only what it may."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.tests.test_concurrency_5e import run_together
from conftest import login
from inventory import stock
from inventory.models import Product, StockMovement
from shop import orders
from shop.models import Address, Order, OrderStatus
from website.models import SiteContent

D = Decimal
S = OrderStatus

ADDRESS = {
    "full_name": "Priya Customer",
    "mobile": "+91 98765 43210",
    "line1": "12, MG Road, Flat 4B",
    "line2": "Benz Circle",
    "landmark": "Opposite the park",
    "city": "Vijayawada",
    "state": "Andhra Pradesh",
    "pincode": "520010",
}


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


def patch(client, path, data):
    return client.patch(path, data, content_type="application/json")


def make_product(name="Argan Hair Oil", price="450.00", qty=5, **extra):
    p = Product.objects.create(
        sku=f"SKU-{Product.objects.count() + 1}",
        name=name,
        category=extra.pop("category", "Hair care"),
        unit_price=D(price),
        **extra,
    )
    if qty:
        stock.move(p, qty, StockMovement.Reason.OPENING)
    return p


@pytest.fixture
def oil(db):
    return make_product()


@pytest.fixture
def mask(db):
    return make_product("Clay Face Mask", "300.00", qty=3, category="Skin care")


@pytest.fixture
def shopper(logged_in):
    return logged_in("customer")


@pytest.fixture
def other(logged_in):
    return logged_in("customer")


@pytest.fixture
def desk(logged_in):
    return logged_in("receptionist")


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


def cart(*pairs):
    return [{"product": str(p.id), "quantity": q} for p, q in pairs]


def place(client, items, address=None, **extra):
    return post(client, "/api/my/orders/", {"items": items, "address": address or ADDRESS, **extra})


def placed_order(client, items):
    r = place(client, items)
    assert r.status_code == 201, r.content
    return r.json()


def paid_order(client, items):
    order = placed_order(client, items)
    r = post(client, f"/api/my/orders/{order['id']}/pay/", {"outcome": "success"})
    assert r.status_code == 200, r.content
    return r.json()


# --------------------------------------------------------------------------- catalogue and price


def test_the_shop_lists_only_active_online_products_with_stock_flags(shopper, oil):
    oil.low_stock_level = 2
    oil.save()
    make_product("Counter-only Wax", qty=4, sold_online=False)
    make_product("Old Shampoo", qty=4, is_active=False)
    make_product("Sold Out Serum", qty=0)
    make_product("Last Few Toner", qty=2)
    data = shopper[0].get("/api/my/shop/products/").json()
    names = {p["name"]: p for p in data["products"]}
    assert set(names) == {"Argan Hair Oil", "Sold Out Serum", "Last Few Toner"}
    assert names["Sold Out Serum"]["in_stock"] is False
    assert names["Last Few Toner"]["low_stock"] is True
    assert names["Argan Hair Oil"]["low_stock"] is False
    assert data["delivery"]["delivery_fee"] == "49.00"


def test_prices_come_from_the_server_not_the_browser(shopper, oil, mask):
    items = cart((oil, 2), (mask, 1))
    items[0]["price"] = "1.00"  # anything the page says about money is ignored
    q = post(shopper[0], "/api/my/shop/quote/", {"items": items}).json()
    assert q["items_total"] == "1200.00"
    assert q["delivery_fee"] == "0.00"  # 1200 is over the free-delivery line (999)
    assert q["total"] == "1200.00"
    gst = D("900") * 18 / 118 + D("300") * 18 / 118
    assert abs(D(q["gst_included"]) - gst) <= D("0.02")


def test_a_small_cart_pays_the_delivery_charge_and_the_admin_can_change_it(shopper, mask):
    q = post(shopper[0], "/api/my/shop/quote/", {"items": cart((mask, 1))}).json()
    assert (q["delivery_fee"], q["total"]) == ("49.00", "349.00")
    SiteContent.objects.create(key="shop", value={"delivery_fee": 30, "free_delivery_over": 250})
    q = post(shopper[0], "/api/my/shop/quote/", {"items": cart((mask, 1))}).json()
    assert (q["delivery_fee"], q["total"]) == ("0.00", "300.00")


@pytest.mark.parametrize(
    "items, message",
    [
        ([], "empty"),
        ([{"product": "x", "quantity": 1}], "no longer sold online"),
        ("OIL", "quantity"),
        ("ZERO", "at least 1"),
        ("ELEVEN", "at most 10"),
    ],
)
def test_bad_carts_are_refused(shopper, oil, items, message):
    if items == "OIL":
        items = [{"product": str(oil.id), "quantity": "two"}]
    elif items == "ZERO":
        items = cart((oil, 0))
    elif items == "ELEVEN":
        items = [{"product": str(oil.id), "quantity": 6}, {"product": str(oil.id), "quantity": 5}]
    r = post(shopper[0], "/api/my/shop/quote/", {"items": items})
    assert r.status_code == 400
    assert message in r.json()["detail"]


def test_a_product_taken_off_the_online_shop_cannot_be_ordered(shopper, oil):
    oil.sold_online = False
    oil.save()
    r = place(shopper[0], cart((oil, 1)))
    assert r.status_code == 400 and r.json()["field"] == "items"
    assert Order.objects.count() == 0


# --------------------------------------------------------------------------- addresses


@pytest.mark.parametrize(
    "change, field",
    [
        ({"mobile": "12345"}, "mobile"),
        ({"mobile": "5876543210"}, "mobile"),
        ({"pincode": "52001"}, "pincode"),
        ({"pincode": "020010"}, "pincode"),
        ({"line1": ""}, "line1"),
        ({"full_name": "A"}, "full_name"),
        ({"city": ""}, "city"),
    ],
)
def test_delivery_details_are_mandatory_and_checked(shopper, oil, change, field):
    r = place(shopper[0], cart((oil, 1)), {**ADDRESS, **change})
    assert r.status_code == 400 and r.json()["field"] == field
    assert Order.objects.count() == 0 and stock.level(oil) == 5


def test_delivery_details_are_encrypted_at_rest(shopper, oil):
    order = placed_order(shopper[0], cart((oil, 1)))
    post(shopper[0], "/api/my/shop/addresses/", ADDRESS)
    with connection.cursor() as cur:
        cur.execute("SELECT ship_mobile, ship_line1 FROM shop_order WHERE id = %s", [order["id"]])
        mobile, line1 = cur.fetchone()
        cur.execute("SELECT mobile, line1 FROM shop_address")
        saved = cur.fetchone()
    for raw in (mobile, line1, *saved):
        assert "9876543210" not in raw and "MG Road" not in raw
    assert order["address"]["mobile"] == "9876543210"


def test_saved_addresses_default_edit_and_remove(shopper, other):
    client = shopper[0]
    first = post(client, "/api/my/shop/addresses/", {**ADDRESS, "label": "Home"}).json()
    assert first["is_default"] is True
    second = post(client, "/api/my/shop/addresses/", {**ADDRESS, "label": "Work"}).json()
    assert second["is_default"] is False
    r = patch(client, f"/api/my/shop/addresses/{second['id']}/", {"is_default": True})
    assert r.status_code == 200 and r.json()["is_default"] is True
    rows = client.get("/api/my/shop/addresses/").json()["addresses"]
    assert [a["label"] for a in rows] == ["Work", "Home"]
    bad = patch(client, f"/api/my/shop/addresses/{second['id']}/", {"pincode": "1"})
    assert bad.status_code == 400 and bad.json()["field"] == "pincode"
    # someone else can neither change nor remove it
    assert patch(other[0], f"/api/my/shop/addresses/{second['id']}/", {}).status_code == 404
    assert other[0].delete(f"/api/my/shop/addresses/{second['id']}/").status_code == 404
    assert other[0].get("/api/my/shop/addresses/").json()["addresses"] == []
    assert client.delete(f"/api/my/shop/addresses/{second['id']}/").status_code == 204
    left = client.get("/api/my/shop/addresses/").json()["addresses"]
    assert len(left) == 1 and left[0]["is_default"] is True


def test_ordering_to_a_saved_address_and_saving_a_new_one(shopper, other, oil):
    client = shopper[0]
    saved = post(client, "/api/my/shop/addresses/", ADDRESS).json()
    r = post(client, "/api/my/orders/", {"items": cart((oil, 1)), "address_id": saved["id"]})
    assert r.status_code == 201 and r.json()["address"]["city"] == "Vijayawada"
    # another customer cannot ship to (or learn) this address
    r = post(other[0], "/api/my/orders/", {"items": cart((oil, 1)), "address_id": saved["id"]})
    assert r.status_code == 404
    r = place(other[0], cart((oil, 1)), save_address=True)
    assert r.status_code == 201
    assert Address.objects.filter(customer=other[1]).count() == 1


# --------------------------------------------------------------------------- order lifecycle


def test_placing_an_order_holds_the_stock_and_waits_for_payment(shopper, oil):
    order = placed_order(shopper[0], cart((oil, 2)))
    assert order["status"] == "pending_payment" and order["actions"] == ["pay", "cancel"]
    assert order["number"].startswith(f"ORD-{timezone.localdate().year}-")
    assert order["pay_until"] is not None
    assert stock.level(oil) == 3
    move = StockMovement.objects.get(reason=StockMovement.Reason.ORDER)
    assert move.delta == -2 and str(move.order_id) == order["id"]
    assert AuditLog.objects.filter(action="order_placed").count() == 1


def test_paying_places_the_order_and_starts_the_timeline(shopper, oil):
    order = paid_order(shopper[0], cart((oil, 1)))
    assert order["status"] == "placed" and order["paid"] == "499.00"
    steps = {s["status"]: s["done"] for s in order["timeline"]}
    assert steps == {"placed": True, "packed": False, "shipped": False, "delivered": False}
    assert AuditLog.objects.filter(action="order_paid").count() == 1
    again = post(shopper[0], f"/api/my/orders/{order['id']}/pay/", {"outcome": "success"})
    assert again.status_code == 409


def test_a_declined_payment_takes_nothing_and_the_order_still_waits(shopper, oil):
    order = placed_order(shopper[0], cart((oil, 1)))
    r = post(shopper[0], f"/api/my/orders/{order['id']}/pay/", {"outcome": "fail"})
    assert r.status_code == 402 and r.json()["status"] == "pending_payment"
    assert r.json()["paid"] == "0.00"


def test_not_enough_stock_is_a_conflict_and_nothing_is_held(shopper, mask):
    r = place(shopper[0], cart((mask, 4)))
    assert r.status_code == 409 and "only 3 left" in r.json()["detail"]
    assert stock.level(mask) == 3 and Order.objects.count() == 0


def test_an_unpaid_order_expires_and_the_stock_comes_back(shopper, oil):
    order = placed_order(shopper[0], cart((oil, 2)))
    Order.objects.filter(pk=order["id"]).update(pay_until=timezone.now() - timedelta(minutes=1))
    data = shopper[0].get(f"/api/my/orders/{order['id']}/").json()
    assert data["status"] == "payment_expired" and data["actions"] == []
    assert stock.level(oil) == 5
    r = post(shopper[0], f"/api/my/orders/{order['id']}/pay/", {"outcome": "success"})
    assert r.status_code == 409 and "ran out" in r.json()["detail"]
    assert AuditLog.objects.filter(action="order_expired").count() == 1


def test_the_customer_cancels_before_packing_and_is_refunded(shopper, oil):
    order = paid_order(shopper[0], cart((oil, 2)))
    r = post(shopper[0], f"/api/my/orders/{order['id']}/cancel/", {"reason": "Bought elsewhere"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "cancelled" and data["refunded"] == "949.00"
    assert stock.level(oil) == 5
    entry = AuditLog.objects.get(action="order_cancelled")
    assert entry.metadata["by"] == "customer" and entry.metadata["refunded"] == "949.00"


def test_the_customer_cannot_cancel_once_it_is_packed(shopper, desk, oil):
    order = paid_order(shopper[0], cart((oil, 1)))
    assert post(desk[0], f"/api/orders/{order['id']}/advance/", {"to": "packed"}).status_code == 200
    r = post(shopper[0], f"/api/my/orders/{order['id']}/cancel/", {})
    assert r.status_code == 409
    assert stock.level(oil) == 4


def test_the_desk_moves_an_order_through_packed_shipped_delivered(shopper, desk, oil):
    order = paid_order(shopper[0], cart((oil, 1)))
    url = f"/api/orders/{order['id']}/advance/"
    assert post(desk[0], url, {"to": "shipped"}).status_code == 409  # cannot skip packing
    r = post(desk[0], url, {"to": "packed"})
    assert r.status_code == 200 and r.json()["actions"] == ["mark_shipped"]
    r = post(desk[0], url, {"to": "shipped", "note": "Courier: BlueDart AWB 1234"})
    assert r.json()["tracking_note"] == "Courier: BlueDart AWB 1234"
    r = post(desk[0], url, {"to": "delivered"})
    assert r.json()["status"] == "delivered" and r.json()["actions"] == []
    assert post(desk[0], url, {"to": "delivered"}).status_code == 409
    mine = shopper[0].get(f"/api/my/orders/{order['id']}/").json()
    assert all(s["done"] for s in mine["timeline"])
    assert mine["tracking_note"] == "Courier: BlueDart AWB 1234"
    assert "by" not in mine["events"][0]  # staff names stay on the staff side
    assert AuditLog.objects.filter(action="order_advanced").count() == 3


def test_an_unpaid_order_cannot_be_packed(shopper, desk, oil):
    order = placed_order(shopper[0], cart((oil, 1)))
    r = post(desk[0], f"/api/orders/{order['id']}/advance/", {"to": "packed"})
    assert r.status_code == 409


def test_the_admin_cancels_a_shipped_order_with_a_reason_and_refund(shopper, desk, admin, oil):
    order = paid_order(shopper[0], cart((oil, 1)))
    post(desk[0], f"/api/orders/{order['id']}/advance/", {"to": "packed"})
    post(desk[0], f"/api/orders/{order['id']}/advance/", {"to": "shipped"})
    url = f"/api/orders/{order['id']}/cancel/"
    assert post(admin[0], url, {"reason": ""}).status_code == 400
    r = post(admin[0], url, {"reason": "Lost by the courier"})
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled" and r.json()["refunded"] == "499.00"
    assert stock.level(oil) == 5
    entry = AuditLog.objects.get(action="order_cancelled")
    assert entry.metadata["by"] == "salon" and entry.metadata["reason"] == "Lost by the courier"
    assert post(admin[0], url, {"reason": "again"}).status_code == 409


def test_staff_list_filters_and_counts(shopper, other, desk, oil, mask):
    a = paid_order(shopper[0], cart((oil, 1)))
    placed_order(other[0], cart((mask, 1)))
    data = desk[0].get("/api/orders/?status=placed").json()
    assert [o["number"] for o in data["orders"]] == [a["number"]]
    assert data["counts"]["placed"] == 1
    assert data["orders"][0]["customer"]["email"] == shopper[1].email
    assert data["orders"][0]["actions"] == ["mark_packed"]  # receptionist: no cancel
    assert len(desk[0].get("/api/orders/?status=open").json()["orders"]) == 2
    found = desk[0].get(f"/api/orders/?q={other[1].email}").json()["orders"]
    assert len(found) == 1 and found[0]["status"] == "pending_payment"
    today = timezone.localdate().isoformat()
    assert len(desk[0].get(f"/api/orders/?from={today}&to={today}").json()["orders"]) == 2


# --------------------------------------------------------------------------- who may


def test_customers_only_ever_see_their_own_orders(shopper, other, oil):
    order = placed_order(shopper[0], cart((oil, 1)))
    client = other[0]
    assert client.get("/api/my/orders/").json()["orders"] == []
    assert client.get(f"/api/my/orders/{order['id']}/").status_code == 404
    pay = post(client, f"/api/my/orders/{order['id']}/pay/", {"outcome": "success"})
    assert pay.status_code == 404
    assert post(client, f"/api/my/orders/{order['id']}/cancel/", {}).status_code == 404
    assert Order.objects.get(pk=order["id"]).status == S.PENDING_PAYMENT


@pytest.mark.parametrize(
    "role, method, path, expected",
    [
        ("customer", "get", "/api/orders/", 403),
        ("customer", "post", "/api/orders/{id}/advance/", 403),
        ("stylist", "get", "/api/orders/", 403),
        ("stylist", "get", "/api/my/orders/", 403),
        ("stylist", "get", "/api/my/shop/products/", 403),
        ("receptionist", "post", "/api/orders/{id}/cancel/", 403),
        ("receptionist", "post", "/api/my/orders/", 403),
        ("admin", "post", "/api/my/orders/", 403),
    ],
)
def test_roles_are_denied_what_they_may_not_do(
    logged_in, shopper, oil, role, method, path, expected
):
    order = paid_order(shopper[0], cart((oil, 1)))
    client, _ = logged_in(role)
    url = path.format(id=order["id"])
    r = getattr(client, method)(
        url, {"to": "packed", "reason": "x" * 5}, content_type="application/json"
    )
    assert r.status_code == expected
    assert Order.objects.get(pk=order["id"]).status == S.PLACED


def test_guests_are_turned_away(client, oil):
    assert client.get("/api/my/shop/products/").status_code in (401, 403)
    assert client.get("/api/orders/").status_code in (401, 403)
    assert post(client, "/api/my/orders/", {"items": cart((oil, 1))}).status_code in (401, 403)


# --------------------------------------------------------------------------- at the same moment


@pytest.mark.django_db(transaction=True)
def test_two_customers_buying_the_last_bottle_together_only_one_gets_it(make_user):
    last = make_product("Last Bottle", qty=1)
    clients = []
    for n in (1, 2):
        c = Client()
        login(c, make_user(role="customer", email=f"race{n}@example.com"))
        clients.append(c)
    results = run_together(*[lambda c=c: place(c, cart((last, 1))).status_code for c in clients])
    assert sorted(results) == [201, 409], results
    assert stock.level(last) == 0 and Order.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_paying_twice_at_the_same_moment_charges_once(make_user):
    item = make_product("Race Oil", qty=3)
    c = Client()
    login(c, make_user(role="customer", email="twice@example.com"))
    order = placed_order(c, cart((item, 1)))
    url = f"/api/my/orders/{order['id']}/pay/"
    results = run_together(
        lambda: post(c, url, {"outcome": "success"}).status_code,
        lambda: post(c, url, {"outcome": "success"}).status_code,
    )
    assert sorted(results) == [200, 409], results
    assert D(orders.paid_total(Order.objects.get(pk=order["id"]))) == D("499.00")


# --------------------------------------------------------------------------- privacy


def test_export_and_anonymize_cover_orders_and_addresses(shopper, desk, oil):
    from people import privacy

    client, user = shopper
    post(client, "/api/my/shop/addresses/", ADDRESS)
    order = paid_order(client, cart((oil, 1)))
    assert "shop order" in " ".join(privacy.blockers(user))
    exported = privacy.export_data(user)
    assert exported["orders"][0]["number"] == order["number"]
    assert exported["addresses"][0]["pincode"] == "520010"
    for step in ("packed", "shipped", "delivered"):
        post(desk[0], f"/api/orders/{order['id']}/advance/", {"to": step})
    assert privacy.blockers(user) == []
    privacy.anonymize(user)
    assert Address.objects.filter(customer=user).count() == 0
    kept = Order.objects.get(pk=order["id"])
    assert kept.ship_mobile == "" and kept.ship_line1 == "" and kept.total == D("499.00")
