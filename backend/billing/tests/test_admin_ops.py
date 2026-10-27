"""Task 5b: admin inventory (products, suppliers, ledger), refunds that put stock and loyalty back,
and the review of cash closes. All admin-only."""

import json
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import CashClose, InvoiceError, Refund
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    catalogue,
    customer,
    desk,
    scheduled_visit,
    serum,
    visit,
)
from inventory import stock
from inventory.models import Product, StockMovement, Supplier
from people.models import LoyaltyEntry

D = Decimal
BASE = "/api/admin/inventory"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


def level(product):
    return stock.level(Product.objects.get(pk=product.pk))


# --------------------------------------------------------------------------- products


def test_admin_adds_a_product_with_opening_stock_and_it_is_audited(admin):
    made = call(
        admin[0],
        "post",
        f"{BASE}/products/",
        {
            "sku": "shm-1",
            "name": "Shampoo",
            "category": "Hair",
            "unit_price": "450",
            "gst_percent": "18",
            "low_stock_level": 3,
            "is_active": True,
            "opening_stock": 8,
        },
    )
    assert made.status_code == 201, made.content
    assert made.json()["sku"] == "SHM-1" and made.json()["stock"] == 8
    (move,) = StockMovement.objects.all()
    assert move.reason == "opening" and move.delta == 8
    assert (
        AuditLog.objects.filter(action="product_changed", metadata__change="created").count() == 1
    )
    again = call(
        admin[0],
        "post",
        f"{BASE}/products/",
        {
            "sku": "SHM-1",
            "name": "Other",
            "category": "Hair",
            "unit_price": "10",
            "gst_percent": "18",
            "low_stock_level": 1,
            "is_active": True,
        },
    )
    assert again.status_code == 400 and "SKU" in json.dumps(again.json())


def test_a_products_stock_cannot_be_typed_in(admin, serum):
    for key in ("stock", "opening_stock"):
        response = call(admin[0], "patch", f"{BASE}/products/{serum.id}/", {key: 99})
        assert response.status_code == 400
    assert level(serum) == 5


def test_editing_a_product_records_old_and_new(admin, serum):
    response = call(admin[0], "patch", f"{BASE}/products/{serum.id}/", {"unit_price": "650"})
    assert response.status_code == 200
    entry = AuditLog.objects.filter(action="product_changed").latest("created_at")
    assert entry.metadata["changes"]["unit_price"] == ["590.00", "650.00"]
    call(admin[0], "patch", f"{BASE}/products/{serum.id}/", {"unit_price": "650"})
    assert AuditLog.objects.filter(action="product_changed").count() == 1  # no change, no entry


def test_a_product_with_history_is_hidden_not_deleted(admin, serum):
    assert call(admin[0], "delete", f"{BASE}/products/{serum.id}/").status_code == 409
    empty = Product.objects.create(sku="E-1", name="Empty", category="x", unit_price=D("10"))
    assert call(admin[0], "delete", f"{BASE}/products/{empty.id}/").status_code == 204


# --------------------------------------------------------------------------- ledger


def test_receive_adjust_and_wastage_move_the_level_through_the_ledger(admin, serum):
    supplier = Supplier.objects.create(name="Glow Wholesale")
    url = f"{BASE}/products/{serum.id}/stock/"
    got = call(
        admin[0],
        "post",
        url,
        {"kind": "receive", "quantity": 10, "supplier": str(supplier.id), "note": "invoice 77"},
    )
    assert got.status_code == 201 and got.json()["product"]["stock"] == 15
    assert got.json()["movement"]["supplier"] == "Glow Wholesale"
    adjusted = call(admin[0], "post", url, {"kind": "adjust", "quantity": -2, "note": "count"})
    assert adjusted.status_code == 201 and adjusted.json()["product"]["stock"] == 13
    lost = call(admin[0], "post", url, {"kind": "wastage", "quantity": 3, "note": "dropped"})
    assert lost.status_code == 201 and lost.json()["product"]["stock"] == 10
    movements = list(StockMovement.objects.filter(product=serum))
    assert sum(m.delta for m in movements) == level(serum) == 10
    assert [m.reason for m in movements] == ["opening", "purchase", "adjustment", "wastage"]
    ledger = call(admin[0], "get", f"{BASE}/ledger/?product={serum.id}").json()["results"]
    assert len(ledger) == 4 and ledger[0]["reason"] == "wastage"
    assert AuditLog.objects.filter(action="stock_moved").count() == 3


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "receive", "quantity": 0},
        {"kind": "receive", "quantity": -3},
        {"kind": "adjust", "quantity": 0, "note": "none"},
        {"kind": "adjust", "quantity": 3},  # reason missing
        {"kind": "wastage", "quantity": 2},  # reason missing
        {"kind": "wastage", "quantity": -2, "note": "oops"},
    ],
)
def test_bad_stock_movements_are_refused_and_change_nothing(admin, serum, body):
    response = call(admin[0], "post", f"{BASE}/products/{serum.id}/stock/", body)
    assert response.status_code == 400
    assert level(serum) == 5 and StockMovement.objects.count() == 1


def test_stock_cannot_be_written_off_below_zero(admin, serum):
    response = call(
        admin[0],
        "post",
        f"{BASE}/products/{serum.id}/stock/",
        {"kind": "wastage", "quantity": 6, "note": "too many"},
    )
    assert response.status_code == 409 and level(serum) == 5


def test_ledger_rows_cannot_be_changed(serum):
    row = StockMovement.objects.first()
    row.delta = 99
    with pytest.raises(ValueError):
        row.save()
    with pytest.raises(ValueError):
        row.delete()


def test_low_stock_is_flagged_in_the_list(admin, serum):
    call(
        admin[0],
        "post",
        f"{BASE}/products/{serum.id}/stock/",
        {"kind": "wastage", "quantity": 3, "note": "expired"},
    )
    data = call(admin[0], "get", f"{BASE}/products/").json()
    assert data["low_count"] == 1 and data["results"][0]["low"] is True


def test_suppliers_are_managed_and_a_used_one_is_only_hidden(admin, serum):
    made = call(admin[0], "post", f"{BASE}/suppliers/", {"name": "Glow Wholesale", "phone": "1"})
    assert made.status_code == 201
    sid = made.json()["id"]
    assert (
        call(admin[0], "post", f"{BASE}/suppliers/", {"name": "glow wholesale"}).status_code == 400
    )
    call(
        admin[0],
        "post",
        f"{BASE}/products/{serum.id}/stock/",
        {"kind": "receive", "quantity": 1, "supplier": sid},
    )
    assert call(admin[0], "delete", f"{BASE}/suppliers/{sid}/").status_code == 409
    hidden = call(admin[0], "patch", f"{BASE}/suppliers/{sid}/", {"is_active": False})
    assert hidden.status_code == 200 and hidden.json()["movement_count"] == 1
    other = call(admin[0], "post", f"{BASE}/suppliers/", {"name": "One-off"}).json()["id"]
    assert call(admin[0], "delete", f"{BASE}/suppliers/{other}/").status_code == 204


# --------------------------------------------------------------------------- refunds


def test_a_decided_refund_is_immutable(visit, desk, admin, serum):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id)
    done = call(
        admin[0],
        "post",
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {"amount": "50", "reason": "goodwill", "method": "cash"},
    ).json()
    refund = Refund.objects.get(pk=done["id"])
    refund.amount = D("1")
    with pytest.raises(InvoiceError):
        refund.save()
    with pytest.raises(InvoiceError):
        refund.delete()
    assert Refund.objects.get(pk=refund.pk).amount == D("50.00")


def test_refund_puts_products_back_and_takes_points_back_when_chosen(visit, desk, admin, serum):
    _, user, appt_id = visit
    invoice = billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 2}])
    assert level(serum) == 3
    earned = invoice["loyalty_earned"]
    assert earned > 0
    detail = desk[0].get(f"/api/desk/invoices/{invoice['id']}/").json()
    assert detail["returnable"] == [{"product": str(serum.id), "name": "Hair serum", "quantity": 2}]
    response = call(
        admin[0],
        "post",
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {
            "amount": "300",
            "reason": "one serum returned",
            "method": "upi",
            "restock": [{"product": str(serum.id), "quantity": 1}],
            "reverse_loyalty": True,
        },
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["restocked"][0]["quantity"] == 1 and level(serum) == 4
    row = StockMovement.objects.filter(reason="return").get()
    assert row.delta == 1 and str(row.invoice_id) == invoice["id"]
    assert body["loyalty_adjusted"] < 0
    taken = LoyaltyEntry.objects.filter(reason="refund").get()
    assert taken.points == body["loyalty_adjusted"]
    # What can still go back shrinks, and more than that is refused.
    again = call(
        admin[0],
        "post",
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {
            "amount": "10",
            "reason": "too many",
            "method": "upi",
            "restock": [{"product": str(serum.id), "quantity": 2}],
        },
    )
    assert again.status_code == 400 and level(serum) == 4
    assert not Refund.objects.filter(reason="too many").exists()  # rolled back with the attempt
    entry = AuditLog.objects.filter(action="refund_approved").latest("created_at")
    assert entry.metadata["restocked"][0]["quantity"] == 1


def test_nothing_is_reversed_unless_chosen(visit, desk, admin, serum):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 1}])
    call(
        admin[0],
        "post",
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {"amount": "100", "reason": "goodwill", "method": "cash"},
    )
    assert level(serum) == 4
    assert not StockMovement.objects.filter(reason="return").exists()
    assert not LoyaltyEntry.objects.filter(reason="refund").exists()


def test_receptionist_cannot_choose_reversals_but_admin_can_at_decision(visit, desk, admin, serum):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 1}])
    url = f"/api/desk/invoices/{invoice['id']}/refunds/"
    refused = call(
        desk[0],
        "post",
        url,
        {
            "amount": "100",
            "reason": "return",
            "restock": [{"product": str(serum.id), "quantity": 1}],
        },
    )
    assert refused.status_code == 400
    asked = call(desk[0], "post", url, {"amount": "100", "reason": "returned serum"}).json()
    decided = call(
        admin[0],
        "post",
        f"/api/desk/refunds/{asked['id']}/decision/",
        {
            "decision": "approve",
            "method": "cash",
            "restock": [{"product": str(serum.id), "quantity": 1}],
            "reverse_loyalty": True,
        },
    )
    assert decided.status_code == 200 and decided.json()["restocked"][0]["quantity"] == 1
    assert level(serum) == 5


def test_full_refund_gives_back_points_used_to_pay(catalogue, customer, desk, admin, serum):
    client, user = customer
    items = [{"product": str(serum.id), "quantity": 1}]
    first = scheduled_visit(client, desk, catalogue, hour=10)
    second = scheduled_visit(client, desk, catalogue, hour=14)
    billed(desk, first)
    appt_id = second
    invoice = billed(desk, appt_id, products=items, redeem_points=1)
    assert invoice["loyalty_redeemed"] == 1
    left = D(invoice["refundable"])
    before = sum(LoyaltyEntry.objects.filter(customer=user).values_list("points", flat=True))
    response = call(
        admin[0],
        "post",
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {"amount": str(left), "reason": "all back", "method": "cash", "reverse_loyalty": True},
    )
    assert response.status_code == 201, response.content
    after = sum(LoyaltyEntry.objects.filter(customer=user).values_list("points", flat=True))
    # earned points are taken back, the point used to pay is returned
    assert after == before - invoice["loyalty_earned"] + 1
    assert after >= 0


# --------------------------------------------------------------------------- cash close review


def make_close(user, difference="0.00", day=None):
    return CashClose.objects.create(
        business_date=day or timezone.localdate(),
        expected_cash=D("100"),
        expected_card=D("0"),
        expected_upi=D("0"),
        counted_cash=D("100") + D(difference),
        difference=D(difference),
        invoice_count=1,
        closed_by=user,
        closed_at=timezone.now(),
    )


def test_admin_reviews_a_cash_close_once(admin, desk):
    close = make_close(desk[1])
    listed = call(admin[0], "get", "/api/admin/cash-closes/?reviewed=no").json()
    assert listed["waiting"] == 1 and listed["results"][0]["closed_by"]
    done = call(admin[0], "post", f"/api/admin/cash-closes/{close.id}/review/", {})
    assert done.status_code == 200 and done.json()["reviewed"] is True
    again = call(admin[0], "post", f"/api/admin/cash-closes/{close.id}/review/", {})
    assert again.status_code == 409
    assert call(admin[0], "get", "/api/admin/cash-closes/?reviewed=no").json()["waiting"] == 0
    close = CashClose.objects.get(pk=close.pk)
    assert close.reviewed_by is not None and close.counted_cash == D("100")
    assert AuditLog.objects.filter(action="cash_close_reviewed").count() == 1


def test_a_close_with_a_difference_needs_a_note_to_be_reviewed(admin, desk):
    close = make_close(desk[1], difference="-40.00")
    url = f"/api/admin/cash-closes/{close.id}/review/"
    assert call(admin[0], "post", url, {}).status_code == 400
    ok = call(admin[0], "post", url, {"note": "Short by 40, paid to supplier"})
    assert ok.status_code == 200 and ok.json()["review_note"].startswith("Short")


def test_a_signed_cash_close_still_cannot_be_edited(desk):
    close = make_close(desk[1])
    close.counted_cash = D("1")
    with pytest.raises(InvoiceError):
        close.save()


# --------------------------------------------------------------------------- who may do what

ADMIN_ONLY = [
    ("get", f"{BASE}/products/"),
    ("post", f"{BASE}/products/"),
    ("patch", f"{BASE}/products/00000000-0000-0000-0000-000000000001/"),
    ("delete", f"{BASE}/products/00000000-0000-0000-0000-000000000001/"),
    ("post", f"{BASE}/products/00000000-0000-0000-0000-000000000001/stock/"),
    ("get", f"{BASE}/ledger/"),
    ("get", f"{BASE}/suppliers/"),
    ("post", f"{BASE}/suppliers/"),
    ("patch", f"{BASE}/suppliers/00000000-0000-0000-0000-000000000001/"),
    ("delete", f"{BASE}/suppliers/00000000-0000-0000-0000-000000000001/"),
    ("get", "/api/admin/cash-closes/"),
    ("post", "/api/admin/cash-closes/00000000-0000-0000-0000-000000000001/review/"),
]


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_only_the_admin_reaches_inventory_and_cash_review(logged_in, role, method, path):
    client, _ = logged_in(role)
    assert call(client, method, path, {}).status_code == 403


@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_guests_cannot_reach_inventory_and_cash_review(client, method, path):
    assert call(client, method, path, {}).status_code in (401, 403)
