"""Task 3c: POS checkout, stock ledger, loyalty, refunds, cash close and the inventory view."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError
from django.utils import timezone

from accounts.models import AuditLog
from billing import checkout
from billing.models import CashClose, Invoice, InvoiceError, Payment, Refund
from billing.pos import CheckoutError
from billing.tests.helpers import admin_actor, bill
from billing.tests.test_invoices_ratings import post, scheduled
from core.models import MailOutbox
from inventory import stock
from inventory.models import Product, StockMovement
from people.models import LoyaltyEntry, Rating
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures)
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
)

D = Decimal


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


@pytest.fixture
def serum(db):
    product = Product.objects.create(
        sku="SER-1", name="Hair serum", category="Hair", unit_price=D("590"), low_stock_level=2
    )
    stock.move(product, 5, StockMovement.Reason.OPENING)
    return product


@pytest.fixture
def visit(catalogue, customer, desk):
    client, user = customer
    appt_id = scheduled_visit(client, desk, catalogue)
    return client, user, appt_id


def scheduled_visit(client, desk_pair, cat, hour=11):
    appt_id = scheduled(client, desk_pair[0], cat, hour=hour)
    Appointment.objects.filter(pk=appt_id).update(status=AppointmentStatus.CHECKED_IN)
    return appt_id


def body(appt_id, **extra):
    return {"appointment": str(appt_id), **extra}


def quote(client, appt_id, **extra):
    return client.post(
        "/api/desk/pos/quote/", body(appt_id, **extra), content_type="application/json"
    )


def checkout_call(client, appt_id, **extra):
    return client.post(
        "/api/desk/pos/checkout/", body(appt_id, **extra), content_type="application/json"
    )


def pay_in_full(client, appt_id, method="cash", **extra):
    q = quote(client, appt_id, **extra).json()
    due = D(q["to_collect"])
    payments = [{"method": method, "amount": str(due)}] if due > 0 else []
    return checkout_call(client, appt_id, payments=payments, **extra)


# --------------------------------------------------------------------------- checkout


def test_quote_writes_nothing_and_checkout_matches_it(visit, desk, serum):
    _, _, appt_id = visit
    extra = {"products": [{"product": str(serum.id), "quantity": 2}], "tip": "50"}
    q = quote(desk[0], appt_id, **extra)
    assert q.status_code == 200
    assert Invoice.objects.count() == 0 and stock.level(serum) == 5
    total = D(q.json()["total"])
    assert total == D("300") + D("1180") or total > D("1180")
    done = pay_in_full(desk[0], appt_id, **extra)
    assert done.status_code == 201, done.content
    assert D(done.json()["total"]) == total
    assert stock.level(serum) == 3
    sale = StockMovement.objects.get(reason="sale")
    assert sale.delta == -2 and sale.invoice_id is not None
    assert Appointment.objects.get(pk=appt_id).status == "completed"
    assert Rating.objects.filter(appointment_id=appt_id).exists()
    assert AuditLog.objects.filter(action="invoice_created").count() == 1
    assert MailOutbox.objects.filter(kind="invoice").count() == 1


def test_gst_is_the_part_inside_the_price(visit, desk, serum):
    _, _, appt_id = visit
    q = quote(desk[0], appt_id, products=[{"product": str(serum.id), "quantity": 1}]).json()
    # product 590 at 18% includes 90.00 GST; the service adds its own share
    assert D(q["gst_amount"]) >= D("90.00")
    assert D(q["subtotal"]) + D(q["gst_amount"]) == D(q["total"])


def test_receptionist_discount_is_capped_but_admin_can_go_further(visit, desk, admin):
    _, _, appt_id = visit
    over = quote(desk[0], appt_id, discount_percent="30", discount_reason="friend")
    assert over.status_code == 400 and "20" in over.json()["detail"]
    ok = quote(desk[0], appt_id, discount_percent="20", discount_reason="friend")
    assert ok.status_code == 200 and D(ok.json()["discount_amount"]) > 0
    assert (
        quote(admin[0], appt_id, discount_percent="30", discount_reason="owner").status_code == 200
    )


def test_a_discount_needs_a_reason(visit, desk):
    _, _, appt_id = visit
    assert quote(desk[0], appt_id, discount_percent="10").status_code == 400


def test_payments_must_add_up_to_the_amount_and_tip(visit, desk):
    _, _, appt_id = visit
    q = quote(desk[0], appt_id, tip="20").json()
    due = D(q["to_collect"])
    short = checkout_call(desk[0], appt_id, tip="20", payments=[{"method": "cash", "amount": "1"}])
    assert short.status_code == 400
    assert Invoice.objects.count() == 0
    assert Appointment.objects.get(pk=appt_id).status == "checked_in"
    half = (due / 2).quantize(D("0.01"))
    split = [{"method": "cash", "amount": str(half)}, {"method": "upi", "amount": str(due - half)}]
    done = checkout_call(desk[0], appt_id, tip="20", payments=split)
    assert done.status_code == 201, done.content
    assert Payment.objects.filter(kind="checkout").count() == 2
    assert Invoice.objects.get().tip_amount == D("20.00")


def test_unknown_payment_method_is_refused(visit, desk):
    _, _, appt_id = visit
    due = quote(desk[0], appt_id).json()["to_collect"]
    bad = checkout_call(desk[0], appt_id, payments=[{"method": "cheque", "amount": due}])
    assert bad.status_code == 400


def test_stock_cannot_go_below_zero_and_nothing_is_saved(visit, desk, serum):
    _, _, appt_id = visit
    extra = {"products": [{"product": str(serum.id), "quantity": 6}]}
    response = quote(desk[0], appt_id, **extra)
    assert response.status_code == 409 and response.json()["code"] == "stock"
    assert "Only 5" in response.json()["detail"]
    assert Invoice.objects.count() == 0 and stock.level(serum) == 5


def test_a_visit_is_billed_only_once(visit, desk):
    _, _, appt_id = visit
    assert pay_in_full(desk[0], appt_id).status_code == 201
    again = checkout_call(desk[0], appt_id, payments=[])
    assert again.status_code == 400
    assert Invoice.objects.count() == 1


def test_a_failed_checkout_rolls_everything_back(visit, desk, serum, monkeypatch):
    _, _, appt_id = visit

    def boom(*args, **kwargs):
        raise RuntimeError("mail down")

    monkeypatch.setattr(checkout, "queue_mail", boom)
    extra = {"products": [{"product": str(serum.id), "quantity": 1}]}
    due = D(quote(desk[0], appt_id, **extra).json()["to_collect"])
    with pytest.raises(RuntimeError):
        checkout.checkout(
            appt_id,
            {**body(appt_id, **extra), "payments": [{"method": "cash", "amount": str(due)}]},
            actor=admin_actor(),
        )
    assert Invoice.objects.count() == 0 and Payment.objects.filter(kind="checkout").count() == 0
    assert stock.level(serum) == 5
    assert Appointment.objects.get(pk=appt_id).status == "checked_in"


def test_loyalty_points_are_earned_and_can_be_used(catalogue, customer, desk, serum):
    client, user = customer
    items = [{"product": str(serum.id), "quantity": 1}]
    first = scheduled_visit(client, desk, catalogue, hour=10)
    second = scheduled_visit(client, desk, catalogue, hour=14)
    assert pay_in_full(desk[0], first).status_code == 201
    earned = LoyaltyEntry.objects.get(reason="earned")
    assert earned.points >= 1 and earned.customer == user
    q = quote(desk[0], second, products=items).json()
    assert q["points_balance"] == earned.points and q["max_redeemable"] >= 1
    too_many = quote(desk[0], second, products=items, redeem_points=q["max_redeemable"] + 1)
    assert too_many.status_code == 400
    done = pay_in_full(desk[0], second, products=items, redeem_points=1)
    assert done.status_code == 201, done.content
    assert LoyaltyEntry.objects.get(reason="redeemed").points == -1
    assert done.json()["loyalty_redeemed"] == 1


def test_online_payment_larger_than_the_bill_makes_a_pending_refund(visit, desk):
    _, _, appt_id = visit
    appt = Appointment.objects.get(pk=appt_id)
    paid = checkout.prepaid_amount(appt)
    assert paid > 0
    response = pay_in_full(desk[0], appt_id, discount_percent="20", discount_reason="loyal guest")
    assert response.status_code == 201, response.content
    total = D(response.json()["total"])
    if total < paid:
        refund = Refund.objects.get()
        assert refund.status == "pending_approval" and refund.amount == paid - total


# --------------------------------------------------------------------------- immutability


def test_ledgers_and_records_cannot_be_edited_or_deleted(visit, desk, serum):
    _, _, appt_id = visit
    assert pay_in_full(desk[0], appt_id).status_code == 201
    move = StockMovement.objects.get(product=serum)
    move.delta = 99
    with pytest.raises(Exception):  # noqa: B017
        move.save()
    with pytest.raises(Exception):  # noqa: B017
        move.delete()
    entry = LoyaltyEntry.objects.first()
    entry.points = 999
    with pytest.raises(Exception):  # noqa: B017
        entry.save()
    with pytest.raises(Exception):  # noqa: B017
        entry.delete()
    with pytest.raises(InvoiceError):
        Invoice.objects.get().delete()
    with pytest.raises(IntegrityError):
        StockMovement.objects.create(product=serum, delta=0, reason="adjustment")


# --------------------------------------------------------------------------- refunds


def billed(desk, appt_id, **extra):
    response = pay_in_full(desk[0], appt_id, **extra)
    assert response.status_code == 201, response.content
    return response.json()


def test_receptionist_requests_and_admin_decides(visit, desk, admin):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id)
    url = f"/api/desk/invoices/{invoice['id']}/refunds/"
    asked = post(desk[0], url, {"amount": "100", "reason": "unhappy with service"})
    assert asked.status_code == 201 and asked.json()["status"] == "pending_approval"
    refund_id = asked.json()["id"]
    assert desk[0].get("/api/desk/refunds/").status_code == 403
    assert (
        desk[0]
        .post(
            f"/api/desk/refunds/{refund_id}/decision/",
            {"decision": "approve", "method": "cash"},
            content_type="application/json",
        )
        .status_code
        == 403
    )
    listed = admin[0].get("/api/desk/refunds/")
    assert listed.status_code == 200 and len(listed.json()) == 1
    decided = post(
        admin[0],
        f"/api/desk/refunds/{refund_id}/decision/",
        {"decision": "approve", "method": "cash"},
    )
    assert decided.status_code == 200 and decided.json()["status"] == "processed"
    assert (
        post(
            admin[0],
            f"/api/desk/refunds/{refund_id}/decision/",
            {"decision": "approve", "method": "cash"},
        ).status_code
        == 409
    )
    assert AuditLog.objects.filter(action="refund_approved").count() == 1


def test_rejecting_needs_a_reason_and_refund_is_capped(visit, desk, admin):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id)
    url = f"/api/desk/invoices/{invoice['id']}/refunds/"
    left = D(invoice["refundable"])
    assert post(desk[0], url, {"amount": str(left + 1), "reason": "too much"}).status_code == 400
    ok = post(desk[0], url, {"amount": str(left), "reason": "everything back"}).json()
    assert post(desk[0], url, {"amount": "1", "reason": "again"}).status_code == 400
    decision = f"/api/desk/refunds/{ok['id']}/decision/"
    assert post(admin[0], decision, {"decision": "reject"}).status_code == 400
    rejected = post(admin[0], decision, {"decision": "reject", "note": "within policy"})
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    assert post(desk[0], url, {"amount": "1", "reason": "try again"}).status_code == 201


def test_admin_refund_is_processed_at_once(visit, desk, admin, serum):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 1}])
    url = f"/api/desk/invoices/{invoice['id']}/refunds/"
    done = post(admin[0], url, {"amount": "50", "reason": "goodwill", "method": "upi"})
    assert done.status_code == 201 and done.json()["status"] == "processed"


# --------------------------------------------------------------------------- cash close


def test_cash_close_adds_up_and_is_signed_once(visit, desk, serum):
    _, _, appt_id = visit
    billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 1}])
    day = timezone.localdate().isoformat()
    summary = desk[0].get(f"/api/desk/cash-close/?date={day}").json()
    expected = D(summary["methods"]["cash"]["expected"])
    assert expected > 0 and summary["invoice_count"] == 1 and summary["closed"] is None
    wrong = post(
        desk[0], "/api/desk/cash-close/", {"date": day, "counted_cash": str(expected - 10)}
    )
    assert wrong.status_code == 400
    signed = post(
        desk[0],
        "/api/desk/cash-close/",
        {"date": day, "counted_cash": str(expected - 10), "note": "short by ten"},
    )
    assert signed.status_code == 201
    assert D(signed.json()["closed"]["difference"]) == D("-10.00")
    again = post(desk[0], "/api/desk/cash-close/", {"date": day, "counted_cash": str(expected)})
    assert again.status_code == 409
    assert AuditLog.objects.filter(action="cash_close_signed").count() == 1
    record = CashClose.objects.get()
    record.counted_cash = 0
    with pytest.raises(Exception):  # noqa: B017
        record.save()


def test_cash_close_refuses_future_days_and_refunds_reduce_cash(visit, desk, admin, serum):
    _, _, appt_id = visit
    invoice = billed(desk, appt_id, products=[{"product": str(serum.id), "quantity": 1}])
    future = (timezone.localdate() + timedelta(days=2)).isoformat()
    assert (
        post(desk[0], "/api/desk/cash-close/", {"date": future, "counted_cash": "0"}).status_code
        == 400
    )
    day = timezone.localdate().isoformat()
    before = D(
        desk[0].get(f"/api/desk/cash-close/?date={day}").json()["methods"]["cash"]["expected"]
    )
    post(
        admin[0],
        f"/api/desk/invoices/{invoice['id']}/refunds/",
        {"amount": "40", "reason": "adjustment", "method": "cash"},
    )
    after = D(
        desk[0].get(f"/api/desk/cash-close/?date={day}").json()["methods"]["cash"]["expected"]
    )
    assert before - after == D("40")


# --------------------------------------------------------------------------- inventory and access


def test_inventory_view_lists_levels_and_flags_low_stock(desk, admin, serum):
    stock.move(serum, -4, StockMovement.Reason.ADJUSTMENT)
    for client in (desk[0], admin[0]):
        data = client.get("/api/desk/inventory/").json()
        row = next(r for r in data["results"] if r["sku"] == "SER-1")
        assert row["stock"] == 1 and row["low"] is True and data["low_count"] == 1


def test_seed_demo_creates_products_with_opening_stock(db):
    from django.core.management import call_command

    call_command("seed_demo")
    assert Product.objects.count() >= 10
    assert all(stock.level(p) > 0 for p in Product.objects.all())
    call_command("seed_demo")
    assert StockMovement.objects.filter(reason="opening").count() == Product.objects.count()


PATHS = [
    ("get", "/api/desk/pos/queue/"),
    ("get", "/api/desk/invoices/"),
    ("get", "/api/desk/inventory/"),
    ("get", "/api/desk/cash-close/"),
    ("post", "/api/desk/pos/quote/"),
    ("post", "/api/desk/pos/checkout/"),
    ("post", "/api/desk/cash-close/"),
]


@pytest.mark.parametrize("role", ["customer", "stylist"])
@pytest.mark.parametrize("method,path", PATHS)
def test_customers_and_stylists_cannot_reach_the_counter(logged_in, role, method, path):
    client, _ = logged_in(role)
    assert getattr(client, method)(path, {}, content_type="application/json").status_code == 403


@pytest.mark.parametrize("method,path", PATHS)
def test_guests_cannot_reach_the_counter(client, method, path):
    assert getattr(client, method)(path, {}, content_type="application/json").status_code in (
        401,
        403,
    )


def test_admin_does_not_close_the_cash_drawer(admin):
    assert admin[0].get("/api/desk/cash-close/").status_code == 403
    assert (
        post(
            admin[0], "/api/desk/cash-close/", {"date": "2020-01-01", "counted_cash": "0"}
        ).status_code
        == 403
    )
