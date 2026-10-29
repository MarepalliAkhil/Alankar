"""Task 8a: every state-changing endpoint rejects a cookie-authenticated call with no CSRF header.

test_sweep.py uses force_authenticate, which skips the browser cookie path, so this file covers
the real thing: a signed-in session cookie, enforce_csrf_checks on, no X-CSRFToken header.
"""

import json

import pytest
from django.test import Client

from conftest import PASSWORD
from core import policy
from core.tests.test_policy import ROLES
from core.tests.test_sweep import ALL

UNSAFE = [(u, m, a) for u, m, a in ALL if m != "GET"]


def signed_in(user):
    client = Client(enforce_csrf_checks=True)
    client.get("/api/auth/csrf/")
    token = client.cookies["csrftoken"].value
    r = client.post(
        "/api/auth/login/",
        json.dumps({"role": user.role, "email": user.email, "password": PASSWORD}),
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert r.status_code == 200, r.content
    return client


def test_there_are_many_unsafe_endpoints():
    assert len(UNSAFE) > 100


@pytest.mark.django_db
@pytest.mark.parametrize("role", ROLES)
def test_no_unsafe_endpoint_accepts_a_cookie_session_without_csrf_header(make_user, role):
    client = signed_in(make_user(role=role))
    bad = []
    for url, method, _action in UNSAFE:
        r = getattr(client, method.lower())(url, "{}", content_type="application/json")
        if r.status_code != 403:
            bad.append((method, url, r.status_code))
    assert not bad, bad


@pytest.mark.django_db
def test_guest_without_csrf_cookie_cannot_post_even_public_actions():
    client = Client(enforce_csrf_checks=True)
    bad = []
    for url, method, action in UNSAFE:
        if not policy.is_public_action(action):
            continue
        r = getattr(client, method.lower())(url, "{}", content_type="application/json")
        if r.status_code != 403:
            bad.append((method, url, r.status_code))
    assert not bad, bad


@pytest.mark.django_db
def test_wrong_csrf_token_is_rejected(make_user):
    client = signed_in(make_user(role="customer"))
    r = client.post(
        "/api/auth/logout/", "{}", content_type="application/json", HTTP_X_CSRFTOKEN="wrong"
    )
    assert r.status_code == 403
