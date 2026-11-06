"""Task 5e-4: a customer can never see or act on another customer's wallet or waitlist."""

import uuid

from waitlist.models import WaitlistEntry
from waitlist.tests.test_waitlist import (  # noqa: F401
    booked,
    catalogue,
    customer,
    desk,
    join_body,
    json_post,
    pay,
    payment_token,
    second_customer,
)


def test_another_customer_cannot_cancel_or_see_my_waitlist_entry(catalogue, customer, make_user):
    mine, _ = customer
    entry = json_post(mine, "/api/my/waitlist/", join_body(catalogue)).json()
    other, _ = second_customer(make_user)
    assert other.get("/api/my/waitlist/").json() == []
    r = json_post(other, f"/api/my/waitlist/{entry['id']}/cancel/")
    assert r.status_code == 404
    assert WaitlistEntry.objects.get(pk=entry["id"]).status == "waiting"


def test_unknown_or_foreign_offers_are_not_found(customer):
    client, _ = customer
    for verb in ("accept", "decline"):
        r = json_post(client, f"/api/my/waitlist/offers/{uuid.uuid4()}/{verb}/")
        assert r.status_code == 404


def test_membership_and_gift_card_actions_need_something_of_your_own(customer):
    client, _ = customer
    assert json_post(client, "/api/my/wallet/memberships/cancel/").status_code in (400, 404, 409)
    assert json_post(client, "/api/my/wallet/memberships/renew/").status_code in (400, 404, 409)
    assert client.get("/api/my/wallet/").json()["gift_cards"] == []
