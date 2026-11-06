"""Task 8.5 part 8: the chatbot knows the shop, orders, coupons, products with a visit, packages
and memberships. Order answers use only the asker's own orders and never show an address."""

import pytest
from django.test import Client

from chatbot.tests.test_api import ask, shop  # noqa: F401
from shop.tests.test_shop import ADDRESS, cart, make_product, place
from website.models import SiteContent


@pytest.mark.parametrize(
    "question, intent, words",
    [
        ("do you deliver products to my home", "shop_delivery", ["deliver", "Rs 49", "999"]),
        ("what is the delivery charge", "shop_delivery", ["Rs 49"]),
        ("how do i cancel my order", "order_cancel", ["My Orders", "packed"]),
        ("how do I use a coupon code", "coupon_howto", ["Coupon box", "One coupon"]),
        ("where do i apply a promo code", "coupon_howto", ["Apply"]),
        ("can i add products to my appointment", "products_with_booking", ["Add to my next"]),
        ("how to cancel my package and get refund", "package_cancel", ["Cancel for a refund"]),
        ("how do i renew my membership", "membership_manage", ["Renew"]),
        ("can i buy membership again after it ended", "membership_manage", ["Buy again"]),
    ],
)
def test_the_new_questions_get_their_answers(shop, question, intent, words):  # noqa: F811
    reply = ask(Client(), question).json()["reply"]
    assert reply["intent"] == intent, reply
    for word in words:
        assert word in reply["text"], (word, reply["text"])


def test_the_delivery_answer_follows_the_admins_settings(shop):  # noqa: F811
    SiteContent.objects.update_or_create(
        key="shop", defaults={"value": {"delivery_fee": 60, "free_delivery_over": 1500}}
    )
    from chatbot import registry

    registry.rebuild()
    reply = ask(Client(), "what is the delivery charge").json()["reply"]
    assert "Rs 60" in reply["text"] and "1500" in reply["text"]


def test_where_is_my_order_shows_only_my_own_orders(shop, logged_in):  # noqa: F811
    me, _ = logged_in("customer")
    other, _ = logged_in("customer")
    oil = make_product(qty=5)
    mine = place(me, cart((oil, 1))).json()
    theirs = place(other, cart((oil, 1))).json()
    reply = ask(me, "where is my order").json()["reply"]
    assert reply["intent"] == "my_orders"
    assert mine["number"] in reply["text"] and theirs["number"] not in reply["text"]
    assert ADDRESS["line1"] not in reply["text"] and "9876543210" not in reply["text"]
    assert reply["actions"][0]["url"] == "/customer/orders"


def test_a_guest_asking_about_their_order_is_asked_to_log_in(shop):  # noqa: F811
    reply = ask(Client(), "track my order").json()["reply"]
    assert reply["needs_login"] is True


def test_a_customer_without_orders_is_told_so(shop, logged_in):  # noqa: F811
    me, _ = logged_in("customer")
    reply = ask(me, "what is my order status").json()["reply"]
    assert reply["intent"] == "my_orders" and "no shop orders" in reply["text"]
