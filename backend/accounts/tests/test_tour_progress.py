"""Task 15D: guided tour and page-tip state is kept on the server, per account."""

import pytest
from django.test import Client

from accounts.models import TourProgress
from conftest import login

URL = "/api/auth/tours/"


def put(client, data):
    return client.put(URL, data, content_type="application/json")


def test_anonymous_is_denied(db):
    assert Client().get(URL).status_code in (401, 403)
    assert put(Client(), {"key": "tour:customer", "status": "completed"}).status_code in (401, 403)


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist", "admin"])
def test_every_signed_in_role_has_its_own_state(logged_in, role):
    client, _ = logged_in(role)
    assert client.get(URL).json() == {"progress": {}}
    assert put(client, {"key": f"tour:{role}", "status": "skipped"}).status_code == 200
    assert client.get(URL).json() == {"progress": {f"tour:{role}": "skipped"}}


def test_completion_persists_across_sessions(make_user):
    user = make_user()
    first = Client()
    login(first, user)
    assert put(first, {"key": "tour:customer", "status": "completed"}).status_code == 200
    second = Client()  # a different browser
    login(second, user)
    assert second.get(URL).json()["progress"] == {"tour:customer": "completed"}


def test_restart_clears_the_key_and_tips_are_independent(logged_in):
    client, _ = logged_in("customer")
    put(client, {"key": "tour:customer", "status": "completed"})
    put(client, {"key": "tip:booking", "status": "dismissed"})
    assert client.delete(URL + "?key=tour:customer").status_code == 200
    assert client.get(URL).json()["progress"] == {"tip:booking": "dismissed"}


def test_state_is_per_account(logged_in, make_user):
    client, _ = logged_in("customer")
    put(client, {"key": "tour:customer", "status": "completed"})
    other = Client()
    login(other, make_user())
    assert other.get(URL).json() == {"progress": {}}
    assert TourProgress.objects.count() == 1


@pytest.mark.parametrize(
    "body",
    [
        {"key": "tour:customer", "status": "nope"},
        {"key": "../etc", "status": "completed"},
        {"key": "tour:" + "a" * 60, "status": "completed"},
        {},
    ],
)
def test_bad_input_is_rejected(logged_in, body):
    client, _ = logged_in("customer")
    assert put(client, body).status_code == 400
    assert TourProgress.objects.count() == 0
