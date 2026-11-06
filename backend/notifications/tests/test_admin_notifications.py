"""The admin gets the notification bell too, with the same rule as everybody: own notifications only."""

import pytest
from django.test import Client

from notifications.models import Notification


def make_note(user, title="Hello"):
    return Notification.objects.create(
        user=user, kind=Notification.Kind.REQUEST_UPDATE, title=title, body="Body"
    )


@pytest.mark.django_db
def test_admin_with_no_notifications_sees_an_empty_list(logged_in):
    admin, _ = logged_in("admin")
    response = admin.get("/api/notifications/")
    assert response.status_code == 200
    assert response.json() == {"unread": 0, "results": []}


@pytest.mark.django_db
def test_admin_reads_and_clears_only_their_own_notifications(logged_in):
    admin, admin_user = logged_in("admin")
    _, customer_user = logged_in("customer")
    mine = make_note(admin_user, "For the admin")
    theirs = make_note(customer_user, "For the customer")

    listing = admin.get("/api/notifications/").json()
    assert [n["id"] for n in listing["results"]] == [str(mine.id)]
    assert listing["unread"] == 1
    assert str(theirs.id) not in str(listing)

    # Asking to mark somebody else's notification as read changes nothing for them.
    admin.post(
        "/api/notifications/read/",
        {"ids": [str(theirs.id)]},
        content_type="application/json",
    )
    theirs.refresh_from_db()
    assert theirs.read_at is None

    response = admin.post("/api/notifications/read/", {}, content_type="application/json")
    assert response.status_code == 200 and response.json() == {"unread": 0}
    mine.refresh_from_db()
    assert mine.read_at is not None
    theirs.refresh_from_db()
    assert theirs.read_at is None


@pytest.mark.django_db
def test_other_roles_still_only_see_their_own(logged_in):
    admin_client, admin_user = logged_in("admin")
    make_note(admin_user, "Admin only")
    for role in ("customer", "receptionist", "stylist"):
        client, _ = logged_in(role)
        assert client.get("/api/notifications/").json() == {"unread": 0, "results": []}


@pytest.mark.django_db
def test_signed_out_visitors_are_denied():
    client = Client()
    assert client.get("/api/notifications/").status_code in (401, 403)
    posted = client.post("/api/notifications/read/", {}, content_type="application/json")
    assert posted.status_code in (401, 403)
