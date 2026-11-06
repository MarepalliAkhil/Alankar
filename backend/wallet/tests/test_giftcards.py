"""Task 5e-1: gift cards - random codes shown once, one payment path, no guessing, no overspend."""

import threading
from decimal import Decimal

import pytest
from django.db import connection
from django.test import Client

from accounts.models import AuditLog
from billing.models import Invoice, Payment
from billing.tests.test_pos import (  # noqa: F401
    admin,
    checkout_call,
    quote,
    scheduled_visit,
    serum,
    visit,
)
from conftest import login
from core.models import MailOutbox
from scheduling.models import Appointment
from scheduling.tests.test_booking import (  # noqa: F401
    awaiting,
    catalogue,
    customer,
    desk,
    pay,
    payment_token,
)
from wallet import giftcards
from wallet.models import CodeAttempt, GiftCard, GiftCardEntry

D = Decimal


def json_post(client, url, body=None, **extra):
    return client.post(url, body or {}, content_type="application/json", **extra)


def buy_at_desk(desk_client, amount="1000", **extra):
    r = json_post(
        desk_client,
        "/api/desk/wallet/sell/",
        {"kind": "gift_card", "method": "cash", "amount": amount, "buyer_name": "Walk-in", **extra},
    )
    assert r.status_code == 201, r.content
    return r.json()


def test_codes_are_long_random_and_never_stored(catalogue, desk):
    a = buy_at_desk(desk[0])["code"]
    b = buy_at_desk(desk[0])["code"]
    assert a != b and len(giftcards.normalize(a)) == 20
    card = GiftCard.objects.order_by("issued_at").first()
    assert a.replace("-", "") not in card.code_hash and card.last4 == giftcards.normalize(a)[-4:]
    assert not hasattr(card, "code")


def test_lists_show_only_the_last_four(catalogue, desk, admin):
    code = buy_at_desk(desk[0])["code"]
    listing = admin[0].get("/api/admin/gift-cards/")
    assert listing.status_code == 200
    text = listing.content.decode()
    assert code not in text and code.replace("-", "") not in text
    assert "last4" in text


def test_recipient_gets_the_code_by_email_and_the_buyer_sees_it_once(catalogue, customer):
    client, user = customer
    r = json_post(
        client,
        "/api/my/wallet/gift-cards/buy/",
        {
            "amount": "500",
            "recipient_name": "Meera",
            "recipient_email": "meera@example.com",
            "message": "Happy birthday",
        },
    )
    assert r.status_code == 201, r.content
    code = r.json()["code"]
    mail = MailOutbox.objects.filter(kind="gift_card").get()
    assert mail.to_email == "meera@example.com" and code in mail.body
    again = client.get("/api/my/wallet/").content.decode()
    assert code not in again and "•••• " in again
    assert AuditLog.objects.filter(action="gift_card_sold").count() == 1


def test_a_declined_online_purchase_issues_no_card(catalogue, customer):
    r = json_post(
        customer[0], "/api/my/wallet/gift-cards/buy/", {"amount": "500", "outcome": "fail"}
    )
    assert r.status_code == 402 and GiftCard.objects.count() == 0


@pytest.mark.parametrize("amount", ["50", "99999"])
def test_amount_limits(catalogue, customer, amount):
    r = json_post(customer[0], "/api/my/wallet/gift-cards/buy/", {"amount": amount})
    assert r.status_code == 400 and GiftCard.objects.count() == 0


def test_redeem_at_the_counter_in_two_parts_and_the_balance_never_goes_negative(visit, desk, serum):
    _, user, appt_id = visit
    code = buy_at_desk(desk[0], "100")["code"]
    items = {"products": [{"product": str(serum.id), "quantity": 1}]}
    q = quote(desk[0], appt_id, **items).json()
    due = D(q["to_collect"])
    check = json_post(desk[0], "/api/desk/wallet/gift-cards/check/", {"code": code})
    assert check.status_code == 200 and D(check.json()["balance"]) == D("100")
    rest = due - D("100")
    done = checkout_call(
        desk[0],
        appt_id,
        **items,
        payments=[
            {"method": "gift_card", "amount": "100", "code": code},
            {"method": "cash", "amount": str(rest)},
        ],
    )
    assert done.status_code == 201, done.content
    card = GiftCard.objects.get()
    assert card.balance == 0
    assert Payment.objects.filter(method="gift_card").count() == 1
    assert AuditLog.objects.filter(action="gift_card_redeemed").count() == 1
    # the empty card cannot pay again
    again = json_post(desk[0], "/api/desk/wallet/gift-cards/check/", {"code": code})
    assert again.status_code == 400


def test_paying_more_than_the_balance_is_refused_and_nothing_is_written(visit, desk, serum):
    _, _, appt_id = visit
    code = buy_at_desk(desk[0], "200")["code"]
    items = {"products": [{"product": str(serum.id), "quantity": 1}]}
    due = D(quote(desk[0], appt_id, **items).json()["to_collect"])
    r = checkout_call(
        desk[0],
        appt_id,
        **items,
        payments=[{"method": "gift_card", "amount": str(due), "code": code}],
    )
    assert r.status_code in (400, 409)
    assert Invoice.objects.count() == 0 and GiftCard.objects.get().balance == D("200")


def test_online_booking_payment_with_a_card_and_the_gateway_for_the_rest(catalogue, customer, desk):
    client, user = customer
    code = buy_at_desk(desk[0], "200")["code"]
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    r = json_post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": token, "gift_card_code": code, "gift_card_amount": "200"},
    )
    assert r.status_code == 200, r.content
    assert Appointment.objects.get(pk=appt_id).status == "scheduled"
    assert GiftCard.objects.get().balance == 0


def test_a_failed_gateway_takes_nothing_from_the_card(catalogue, customer, desk):
    client, _ = customer
    code = buy_at_desk(desk[0], "200")["code"]
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    r = json_post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "fail", "link": token, "gift_card_code": code, "gift_card_amount": "100"},
    )
    assert r.status_code in (200, 402)
    assert GiftCard.objects.get().balance == D("200")
    assert Appointment.objects.get(pk=appt_id).status == "awaiting_payment"


def test_cancelling_a_booking_paid_by_card_returns_the_money_to_the_card(catalogue, customer, desk):
    client, _ = customer
    code = buy_at_desk(desk[0], "5000")["code"]
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    json_post(
        client,
        f"/api/my/appointments/{appt_id}/payment/",
        {"outcome": "success", "link": token, "gift_card_code": code},
    )
    card = GiftCard.objects.get()
    spent = D("5000") - card.balance
    assert spent > 0
    r = json_post(client, f"/api/my/appointments/{appt_id}/cancel/")
    assert r.status_code == 200, r.content
    assert GiftCard.objects.get().balance == D("5000")
    assert GiftCardEntry.objects.filter(reason="refunded").count() == 1


# --------------------------------------------------------------------------- guessing


def test_wrong_codes_are_limited_per_user(catalogue, customer):
    client, _ = customer
    for _ in range(giftcards.USER_LIMIT):
        r = json_post(
            client, "/api/my/wallet/gift-cards/check/", {"code": "AAAAA-BBBBB-CCCCC-DDDDD"}
        )
        assert r.status_code == 400
    r = json_post(client, "/api/my/wallet/gift-cards/check/", {"code": "AAAAA-BBBBB-CCCCC-DDDDD"})
    assert r.status_code == 429
    assert AuditLog.objects.filter(action="gift_code_locked").count() == 1


def test_a_locked_user_cannot_use_a_right_code_either(catalogue, customer, desk):
    client, _ = customer
    code = buy_at_desk(desk[0])["code"]
    for _ in range(giftcards.USER_LIMIT):
        json_post(client, "/api/my/wallet/gift-cards/check/", {"code": "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ"})
    assert json_post(client, "/api/my/wallet/gift-cards/check/", {"code": code}).status_code == 429


def test_wrong_codes_are_limited_per_ip_across_accounts(catalogue, make_user):
    for i in range(giftcards.IP_LIMIT):
        user = make_user(role="customer", email=f"guess{i}@example.com")
        c = Client()
        login(c, user)
        r = json_post(
            c,
            "/api/my/wallet/gift-cards/check/",
            {"code": "QQQQQ-QQQQQ-QQQQQ-QQQQQ"},
            REMOTE_ADDR="10.9.8.7",
        )
        assert r.status_code == 400
    fresh = make_user(role="customer", email="fresh@example.com")
    c = Client()
    login(c, fresh)
    r = json_post(
        c,
        "/api/my/wallet/gift-cards/check/",
        {"code": "QQQQQ-QQQQQ-QQQQQ-QQQQQ"},
        REMOTE_ADDR="10.9.8.7",
    )
    assert r.status_code == 429


def test_the_error_does_not_reveal_whether_a_code_exists(catalogue, customer, desk):
    code = buy_at_desk(desk[0])["code"]
    bad = json_post(
        customer[0], "/api/my/wallet/gift-cards/check/", {"code": "AAAAA-AAAAA-AAAAA-AAAAA"}
    )
    short = json_post(customer[0], "/api/my/wallet/gift-cards/check/", {"code": code[:-1]})
    assert bad.json() == short.json()


# --------------------------------------------------------------------------- void, expiry, privacy


def test_admin_voids_a_card_and_it_stops_working(catalogue, desk, admin, customer):
    sold = buy_at_desk(desk[0])
    r = json_post(
        admin[0], f"/api/admin/gift-cards/{sold['card']['id']}/void/", {"reason": "lost card"}
    )
    assert r.status_code == 200, r.content
    assert (
        json_post(
            customer[0], "/api/my/wallet/gift-cards/check/", {"code": sold["code"]}
        ).status_code
        == 400
    )
    assert AuditLog.objects.filter(action="gift_card_voided").count() == 1


def test_an_expired_card_is_not_usable(catalogue, desk, customer):
    from datetime import timedelta

    from django.utils import timezone

    sold = buy_at_desk(desk[0])
    GiftCard.objects.update(expires_at=timezone.now() - timedelta(days=1))
    r = json_post(customer[0], "/api/my/wallet/gift-cards/check/", {"code": sold["code"]})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_only_the_buyer_and_the_recipient_see_a_card(catalogue, customer, make_user):
    client, user = customer
    json_post(
        client,
        "/api/my/wallet/gift-cards/buy/",
        {"amount": "400", "recipient_email": "rec@example.com"},
    )
    rec = make_user(role="customer", email="rec@example.com")
    stranger = make_user(role="customer", email="nosy@example.com")
    seen = {}
    for who in (rec, stranger):
        c = Client()
        login(c, who)
        seen[who.email] = len(c.get("/api/my/wallet/").json()["gift_cards"])
    assert seen == {"rec@example.com": 1, "nosy@example.com": 0}
    assert len(client.get("/api/my/wallet/").json()["gift_cards"]) == 1


@pytest.mark.django_db(transaction=True)
def test_two_payments_at_once_never_overspend_one_card(catalogue, make_user):
    card_user = make_user(role="customer", email="spender@example.com")
    from wallet import selling

    card, _ = selling.sell_gift_card(
        amount=D("500"), channel="pos", method="cash", actor=None, buyer=card_user
    )
    results = []

    def spend():
        try:
            giftcards.redeem(card.pk, D("400"), payment=None)
            results.append("ok")
        except giftcards.GiftCardError:
            results.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=spend) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    card.refresh_from_db()
    assert sorted(results) == ["ok", "refused"] and card.balance == D("100")


# --------------------------------------------------------------------------- Task 8.5: code reveal


def test_owner_can_reveal_the_full_code_again_later(catalogue, customer):
    client, user = customer
    code = json_post(client, "/api/my/wallet/gift-cards/buy/", {"amount": "500"}).json()["code"]
    card = GiftCard.objects.get(buyer=user)
    wallet = client.get("/api/my/wallet/").json()
    row = wallet["gift_cards"][0]
    assert row["code_available"] is True and "code" not in row
    r = json_post(client, f"/api/my/wallet/gift-cards/{card.pk}/reveal/")
    assert r.status_code == 200 and r.json()["code"] == code


def test_recipient_can_reveal_a_card_sent_to_them(catalogue, customer, make_user):
    client, user = customer
    code = json_post(
        client,
        "/api/my/wallet/gift-cards/buy/",
        {"amount": "500", "recipient_email": "rec8.5@example.com"},
    ).json()["code"]
    card = GiftCard.objects.get(buyer=user)
    rec = make_user(role="customer", email="rec8.5@example.com")
    rec_client = Client()
    login(rec_client, rec)
    r = json_post(rec_client, f"/api/my/wallet/gift-cards/{card.pk}/reveal/")
    assert r.status_code == 200 and r.json()["code"] == code


def test_another_customer_cannot_reveal_someone_elses_card(catalogue, customer, make_user):
    client, user = customer
    json_post(client, "/api/my/wallet/gift-cards/buy/", {"amount": "500"})
    card = GiftCard.objects.get(buyer=user)
    stranger = make_user(role="customer", email="stranger8.5@example.com")
    stranger_client = Client()
    login(stranger_client, stranger)
    r = json_post(stranger_client, f"/api/my/wallet/gift-cards/{card.pk}/reveal/")
    assert r.status_code == 404


def test_a_card_issued_before_the_field_existed_cannot_be_revealed(catalogue, customer):
    client, user = customer
    json_post(client, "/api/my/wallet/gift-cards/buy/", {"amount": "500"})
    card = GiftCard.objects.get(buyer=user)
    card.code_encrypted = ""
    card.save(update_fields=["code_encrypted"])
    wallet = client.get("/api/my/wallet/").json()
    assert wallet["gift_cards"][0]["code_available"] is False
    r = json_post(client, f"/api/my/wallet/gift-cards/{card.pk}/reveal/")
    assert r.status_code == 409


def test_admin_reveal_is_masked_until_revealed_and_is_audited(catalogue, desk, admin):
    code = buy_at_desk(desk[0])["code"]
    card = GiftCard.objects.order_by("issued_at").first()
    detail = admin[0].get(f"/api/admin/gift-cards/{card.pk}/").json()
    assert "code" not in detail and detail["masked"] == giftcards.mask(card.last4)
    assert AuditLog.objects.filter(action="gift_card_code_revealed").count() == 0
    r = json_post(admin[0], f"/api/admin/gift-cards/{card.pk}/reveal/")
    assert r.status_code == 200 and r.json()["code"] == code
    entry = AuditLog.objects.get(action="gift_card_code_revealed")
    assert card.last4 in entry.metadata["card"]
    assert code not in str(entry.metadata) and code.replace("-", "") not in str(entry.metadata)
