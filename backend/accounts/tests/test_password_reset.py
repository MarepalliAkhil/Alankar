from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, PasswordResetToken
from conftest import login
from core.models import MailOutbox

NEW_PASSWORD = "Fresh-Strong-Pass-55"


def post(client, url, data=None):
    return client.post(url, data or {}, content_type="application/json")


def reset_token(email: str) -> str:
    message = MailOutbox.objects.filter(to_email=email, kind="password_reset").first()
    return parse_qs(urlparse(message.link).query)["token"][0]


@pytest.mark.django_db
def test_reset_request_is_generic(client, make_user):
    make_user(role="customer", email="c@example.com")
    make_user(role="stylist", email="s@example.com")
    responses = [
        post(client, "/api/auth/password-reset/", {"email": email})
        for email in ("c@example.com", "nobody@example.com", "s@example.com")
    ]
    assert {r.status_code for r in responses} == {200}
    assert len({r.content for r in responses}) == 1
    assert MailOutbox.objects.filter(kind="password_reset").count() == 1  # customers only
    stored = PasswordResetToken.objects.get()
    assert stored.expires_at - stored.created_at <= timedelta(minutes=60, seconds=5)


@pytest.mark.django_db
def test_reset_confirm_changes_password_once_and_revokes_sessions(make_user):
    user = make_user(role="customer", email="c@example.com")
    session = Client()
    assert login(session, user).status_code == 200
    post(Client(), "/api/auth/password-reset/", {"email": "c@example.com"})
    token = reset_token("c@example.com")
    assert token not in PasswordResetToken.objects.get().token_hash

    done = post(
        Client(), "/api/auth/password-reset/confirm/", {"token": token, "password": NEW_PASSWORD}
    )
    assert done.status_code == 200
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert post(session, "/api/auth/refresh/").status_code == 401  # old sessions revoked
    reused = post(
        Client(), "/api/auth/password-reset/confirm/", {"token": token, "password": NEW_PASSWORD}
    )
    assert reused.status_code == 400
    assert AuditLog.objects.filter(action="password_reset_done", target=user).exists()


@pytest.mark.django_db
def test_reset_token_expires_after_one_hour(make_user):
    make_user(role="customer", email="c@example.com")
    post(Client(), "/api/auth/password-reset/", {"email": "c@example.com"})
    token = reset_token("c@example.com")
    PasswordResetToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    expired = post(
        Client(), "/api/auth/password-reset/confirm/", {"token": token, "password": NEW_PASSWORD}
    )
    assert expired.status_code == 400


@pytest.mark.django_db
def test_reset_rejects_weak_password(make_user):
    make_user(role="customer", email="c@example.com")
    post(Client(), "/api/auth/password-reset/", {"email": "c@example.com"})
    token = reset_token("c@example.com")
    weak = post(Client(), "/api/auth/password-reset/confirm/", {"token": token, "password": "1234"})
    assert weak.status_code == 400
    assert PasswordResetToken.objects.get().used_at is None
