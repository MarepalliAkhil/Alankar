"""Task 8a: token, session and lockout hardening."""

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, LoginLock, StaffInvite, User
from accounts.tests.test_staff_and_invites import invite, token_from_outbox
from conftest import PASSWORD, login

NEW_PASSWORD = "Another-Strong-Pass-77"

pytestmark = pytest.mark.django_db


def post(client, url, data=None):
    return client.post(url, data or {}, content_type="application/json")


def test_access_token_stops_working_after_password_reset(make_user):
    user = make_user(role="customer", email="c@example.com")
    session = Client()
    assert login(session, user).status_code == 200
    assert session.get("/api/auth/me/").status_code == 200
    post(Client(), "/api/auth/password-reset/", {"email": user.email})
    from accounts.tests.test_password_reset import reset_token

    done = post(
        Client(),
        "/api/auth/password-reset/confirm/",
        {"token": reset_token(user.email), "password": NEW_PASSWORD},
    )
    assert done.status_code == 200
    # The old access cookie is still inside its 15 minutes but must be refused now.
    assert session.get("/api/auth/me/").status_code == 401


def test_lockout_ignores_email_case(make_user):
    make_user(role="customer", email="case@example.com")
    client = Client()
    for variant in ("case@example.com", "CASE@example.com", "Case@Example.com") * 2:
        post(client, "/api/auth/login/", {"role": "customer", "email": variant, "password": "bad"})
    right = post(
        client,
        "/api/auth/login/",
        {"role": "customer", "email": "case@example.com", "password": PASSWORD},
    )
    assert right.status_code in (401, 403, 423, 429)
    assert LoginLock.objects.filter(email="case@example.com").exists()


def test_deactivated_user_loses_access_at_once_and_cannot_refresh(logged_in):
    session, user = logged_in("stylist")
    assert session.get("/api/auth/me/").status_code == 200
    User.objects.filter(pk=user.pk).update(is_active=False)
    assert session.get("/api/auth/me/").status_code == 401
    assert post(session, "/api/auth/refresh/").status_code == 401


def test_refresh_token_cannot_be_used_twice(make_user):
    user = make_user(role="customer")
    session = Client()
    login(session, user)
    name = next(k for k in session.cookies if "refresh" in k)
    old_refresh = session.cookies[name].value
    assert post(session, "/api/auth/refresh/").status_code in (200, 204)
    replay = Client()
    replay.cookies[name] = old_refresh
    assert post(replay, "/api/auth/refresh/").status_code == 401


def test_deactivating_a_pending_invite_withdraws_the_link(logged_in):
    admin_client, admin = logged_in("admin")
    assert invite(admin_client).status_code == 201
    pending = User.objects.get(email="priya@example.com")
    token = token_from_outbox("priya@example.com")
    assert post(admin_client, f"/api/staff/{pending.pk}/deactivate/").status_code == 200
    assert Client().get(f"/api/auth/invite/?token={token}").status_code == 404
    accept = post(Client(), "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD})
    assert accept.status_code == 400
    pending.refresh_from_db()
    assert not pending.is_active and not pending.has_usable_password()
    entry = AuditLog.objects.filter(action="staff_deactivated", target=pending).first()
    assert entry is not None and entry.metadata.get("invite_withdrawn") is True
    assert StaffInvite.objects.get(user=pending).expires_at <= timezone.now()


def test_invite_token_is_stored_hashed_and_not_guessable(logged_in):
    admin_client, _ = logged_in("admin")
    invite(admin_client)
    token = token_from_outbox("priya@example.com")
    assert len(token) >= 32
    assert not StaffInvite.objects.filter(token_hash=token).exists()
    assert Client().get("/api/auth/invite/?token=" + "a" * len(token)).status_code == 404
