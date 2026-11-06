"""Task 5e-3: purchase orders - draft, send, receive in parts, close, history, who may."""

import json
import threading
from decimal import Decimal

import pytest
from django.db import connection
from django.test import Client

from accounts.models import AuditLog
from conftest import login
from core.models import MailOutbox
from inventory import purchasing, stock
from inventory.models import (
    Product,
    PurchaseOrder,
    PurchaseReceiptLine,
    StockMovement,
    Supplier,
)

D = Decimal
BASE = "/api/admin/inventory"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    kwargs = {"content_type": "application/json", **headers}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    return getattr(client, method)(url, **kwargs)


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


@pytest.fixture
def shop(db):
    supplier = Supplier.objects.create(
        name="Glow Supplies", contact_person="Ravi", email="ravi@glow.example"
    )
    serum = Product.objects.create(
        sku="SER-1", name="Hair serum", category="Hair", unit_price=D("590"), low_stock_level=2
    )
    mask = Product.objects.create(
        sku="MSK-1", name="Face mask", category="Skin", unit_price=D("300"), low_stock_level=2
    )
    stock.move(serum, 5, StockMovement.Reason.OPENING)
    return supplier, serum, mask


def make_order(admin, shop, **over):
    supplier, serum, mask = shop
    body = {
        "supplier": str(supplier.id),
        "lines": [
            {"product": str(serum.id), "quantity": 10, "unit_cost": "250.00"},
            {"product": str(mask.id), "quantity": 4, "unit_cost": "100.00"},
        ],
        "notes": "Please pack separately",
        **over,
    }
    r = call(admin[0], "post", f"{BASE}/purchase-orders/", body)
    assert r.status_code == 201, r.content
    return r.json()


def sent(admin, shop):
    order = make_order(admin, shop)
    r = call(admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/send/")
    assert r.status_code == 200, r.content
    return r.json()


def receive(admin, order, quantities, note=""):
    """quantities: [serum, mask] (the lines are sorted by product name, so look them up by SKU)."""
    by_sku = {line["sku"]: line["id"] for line in order["lines"]}
    items = [
        {"line": by_sku["SER-1"], "quantity": quantities[0]},
        {"line": by_sku["MSK-1"], "quantity": quantities[1]},
    ]
    return call(
        admin[0],
        "post",
        f"{BASE}/purchase-orders/{order['id']}/receive/",
        {"items": items, "note": note},
    )


def level(product):
    return stock.level(Product.objects.get(pk=product.pk))


# --------------------------------------------------------------------------- draft and send


def test_a_draft_has_a_number_totals_and_changes_no_stock(admin, shop):
    _, serum, _ = shop
    order = make_order(admin, shop)
    assert order["number"].startswith("PO-") and order["number"].endswith("-0001")
    assert order["status"] == "draft" and order["ordered_value"] == "2900.00"
    assert order["units_ordered"] == 14 and order["units_received"] == 0
    assert level(serum) == 5
    assert make_order(admin, shop)["number"].endswith("-0002")
    assert AuditLog.objects.filter(action="po_created").count() == 2


def test_bad_orders_are_refused(admin, shop):
    supplier, serum, _ = shop
    line = {"product": str(serum.id), "quantity": 1, "unit_cost": "10"}
    url = f"{BASE}/purchase-orders/"
    for body in (
        {"supplier": str(supplier.id), "lines": []},
        {"supplier": str(supplier.id), "lines": [line, line]},
        {"supplier": str(supplier.id), "lines": [{**line, "quantity": 0}]},
        {"supplier": str(supplier.id), "lines": [{**line, "unit_cost": "-1"}]},
        {"supplier": "00000000-0000-0000-0000-000000000001", "lines": [line]},
        {
            "supplier": str(supplier.id),
            "lines": [{**line, "product": "00000000-0000-0000-0000-000000000001"}],
        },
    ):
        assert call(admin[0], "post", url, body).status_code == 400, body
    Supplier.objects.filter(pk=supplier.pk).update(is_active=False)
    assert (
        call(admin[0], "post", url, {"supplier": str(supplier.id), "lines": [line]}).status_code
        == 400
    )
    assert not PurchaseOrder.objects.exists()


def test_a_draft_can_be_changed_but_a_sent_order_cannot(admin, shop):
    _, serum, _ = shop
    order = make_order(admin, shop)
    url = f"{BASE}/purchase-orders/{order['id']}/"
    r = call(
        admin[0],
        "patch",
        url,
        {"lines": [{"product": str(serum.id), "quantity": 3, "unit_cost": "200"}], "notes": "New"},
    )
    assert (
        r.status_code == 200
        and r.json()["ordered_value"] == "600.00"
        and r.json()["notes"] == "New"
    )
    assert len(r.json()["lines"]) == 1
    call(admin[0], "post", f"{url}send/")
    assert call(admin[0], "patch", url, {"notes": "late"}).status_code == 409


def test_sending_emails_the_supplier_once_and_marks_it_sent(admin, shop):
    order = make_order(admin, shop)
    r = call(admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/send/")
    assert r.status_code == 200 and r.json()["status"] == "sent" and r.json()["emailed"] is True
    mail = MailOutbox.objects.get(to_email="ravi@glow.example")
    assert order["number"] in mail.body and "Hair serum" in mail.body and "2900.00" in mail.body
    again = call(admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/send/")
    assert (
        again.status_code == 409
        and MailOutbox.objects.filter(to_email="ravi@glow.example").count() == 1
    )
    assert AuditLog.objects.filter(action="po_sent").count() == 1


def test_a_supplier_without_an_email_is_still_marked_sent(admin, shop):
    Supplier.objects.update(email="")
    order = make_order(admin, shop)
    r = call(admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/send/")
    assert r.status_code == 200 and r.json()["emailed"] is False and not MailOutbox.objects.exists()


# --------------------------------------------------------------------------- receiving


def test_receiving_in_parts_books_stock_and_tracks_what_is_still_due(admin, shop):
    supplier, serum, mask = shop
    order = sent(admin, shop)
    first = receive(admin, order, [6, 0], note="Box 1")
    assert first.status_code == 200, first.content
    data = first.json()
    assert data["status"] == "partly_received" and data["units_received"] == 6
    assert {ln["sku"]: ln["outstanding"] for ln in data["lines"]} == {"SER-1": 4, "MSK-1": 4}
    assert level(serum) == 11 and level(mask) == 0
    move = StockMovement.objects.filter(reason="purchase").get()
    assert move.delta == 6 and move.supplier_id == supplier.id and order["number"] in move.note
    assert PurchaseReceiptLine.objects.get().movement_id == move.id
    second = receive(admin, order, [4, 4])
    done = second.json()
    assert done["status"] == "received" and done["received_value"] == "2900.00"
    assert level(serum) == 15 and level(mask) == 4
    assert len(done["receipts"]) == 2 and done["closed_at"]
    assert AuditLog.objects.filter(action="po_received").count() == 2


def test_cannot_receive_more_than_is_due_or_on_the_wrong_order(admin, shop):
    _, serum, _ = shop
    draft = make_order(admin, shop)
    assert receive(admin, draft, [1, 0]).status_code == 409  # not sent yet
    order = sent(admin, shop)
    too_many = receive(admin, order, [11, 0])
    assert too_many.status_code == 409 and "Only 10" in too_many.json()["detail"]
    assert receive(admin, order, [0, 0]).status_code == 409
    assert level(serum) == 5 and not PurchaseReceiptLine.objects.exists()
    other = sent(admin, shop)
    foreign = call(
        admin[0],
        "post",
        f"{BASE}/purchase-orders/{order['id']}/receive/",
        {"items": [{"line": other["lines"][0]["id"], "quantity": 1}]},
    )
    assert foreign.status_code == 409
    receive(admin, order, [10, 4])
    assert receive(admin, order, [1, 0]).status_code == 409  # already complete


def test_a_failed_receipt_changes_nothing(admin, shop):
    _, serum, mask = shop
    order = sent(admin, shop)
    # the first line is fine but the second is too many: nothing at all is booked
    r = receive(admin, order, [5, 9])
    assert r.status_code == 409
    assert level(serum) == 5 and level(mask) == 0
    assert PurchaseOrder.objects.get(pk=order["id"]).status == "sent"
    assert not PurchaseReceiptLine.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_two_people_receiving_at_once_never_book_more_than_ordered(shop, make_user):
    supplier, serum, mask = shop
    boss = make_user(role="admin", email="a@example.com")
    order = purchasing.create(
        supplier=supplier,
        lines=[{"product": serum.id, "quantity": 10, "unit_cost": D("250")}],
        expected_on=None,
        notes="",
        actor=boss,
    )
    purchasing.send(order.pk, actor=boss)
    line = order.lines.get()
    results = []

    def book():
        try:
            purchasing.receive(order.pk, [{"line": line.id, "quantity": 7}], note="", actor=boss)
            results.append("ok")
        except purchasing.PurchaseError:
            results.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=book) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == ["ok", "refused"]
    assert stock.level(Product.objects.get(pk=serum.pk)) == 5 + 7


# --------------------------------------------------------------------------- closing


def test_a_draft_or_untouched_order_is_cancelled(admin, shop):
    draft = make_order(admin, shop)
    r = call(admin[0], "post", f"{BASE}/purchase-orders/{draft['id']}/close/", {})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    order = sent(admin, shop)
    needs_reason = call(admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/close/", {})
    assert needs_reason.status_code == 409
    ok = call(
        admin[0],
        "post",
        f"{BASE}/purchase-orders/{order['id']}/close/",
        {"reason": "Supplier cannot deliver"},
    )
    assert (
        ok.json()["status"] == "cancelled"
        and ok.json()["close_reason"] == "Supplier cannot deliver"
    )
    assert receive(admin, order, [1, 0]).status_code == 409
    assert (
        call(
            admin[0], "post", f"{BASE}/purchase-orders/{order['id']}/close/", {"reason": "again"}
        ).status_code
        == 409
    )
    assert AuditLog.objects.filter(action="po_closed").count() == 2


def test_a_part_delivered_order_is_closed_short_and_stock_stays(admin, shop):
    _, serum, _ = shop
    order = sent(admin, shop)
    receive(admin, order, [4, 0])
    r = call(
        admin[0],
        "post",
        f"{BASE}/purchase-orders/{order['id']}/close/",
        {"reason": "Rest is discontinued"},
    )
    assert r.json()["status"] == "closed" and r.json()["received_value"] == "1000.00"
    assert level(serum) == 9


# --------------------------------------------------------------------------- history and ledger


def test_supplier_history_adds_up_to_the_orders_and_the_ledger(admin, shop):
    supplier, serum, mask = shop
    a = sent(admin, shop)
    receive(admin, a, [10, 4])
    b = sent(admin, shop)
    receive(admin, b, [5, 0])
    make_order(admin, shop)  # a draft does not count
    r = call(admin[0], "get", f"{BASE}/suppliers/{supplier.id}/history/").json()
    assert r["supplier"]["name"] == "Glow Supplies" and len(r["orders"]) == 3
    s = r["summary"]
    assert s["orders"] == 2 and s["open"] == 1
    assert s["ordered_value"] == "5800.00" and s["received_value"] == "4150.00"
    booked = sum(
        m.delta * D(ln.unit_cost)
        for ln in [x for o in PurchaseOrder.objects.all() for x in o.lines.all()]
        for m in StockMovement.objects.filter(receipt_line__line=ln)
    )
    assert booked == D(s["received_value"])
    ledger = StockMovement.objects.filter(reason="purchase", supplier=supplier)
    assert sum(m.delta for m in ledger) == 10 + 4 + 5


def test_a_supplier_with_orders_cannot_be_deleted(admin, shop):
    supplier, _, _ = shop
    make_order(admin, shop)
    r = call(admin[0], "delete", f"{BASE}/suppliers/{supplier.id}/")
    assert r.status_code == 409
    assert Supplier.objects.filter(pk=supplier.pk).exists()


def test_receipts_cannot_be_changed_or_deleted(admin, shop):
    order = sent(admin, shop)
    receive(admin, order, [1, 0])
    row = PurchaseReceiptLine.objects.get()
    with pytest.raises(ValueError):
        row.delete()
    with pytest.raises(ValueError):
        row.receipt.delete()


# --------------------------------------------------------------------------- who may


URLS = [
    ("get", "/purchase-orders/"),
    ("post", "/purchase-orders/"),
    ("get", "/purchase-orders/{po}/"),
    ("patch", "/purchase-orders/{po}/"),
    ("post", "/purchase-orders/{po}/send/"),
    ("post", "/purchase-orders/{po}/receive/"),
    ("post", "/purchase-orders/{po}/close/"),
    ("get", "/suppliers/{sup}/history/"),
]


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist", "guest"])
def test_nobody_but_the_admin_touches_purchase_orders(admin, shop, logged_in, role):
    order = make_order(admin, shop)
    client = Client() if role == "guest" else logged_in(role)[0]
    for method, path in URLS:
        url = BASE + path.format(po=order["id"], sup=shop[0].id)
        r = call(client, method, url, {})
        assert r.status_code in (401, 403), (method, path, r.status_code)
    assert PurchaseOrder.objects.get().status == "draft"


def test_a_signed_in_admin_reaches_them(make_user):
    boss = make_user(role="admin", email="b@example.com")
    c = Client()
    login(c, boss)
    assert c.get(f"{BASE}/purchase-orders/").status_code == 200
