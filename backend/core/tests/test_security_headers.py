"""Task 8a: response headers, cookies, CORS, throttling, parsers, log redaction."""

import logging

import pytest
from django.test import Client, override_settings

from conftest import PASSWORD, login
from core.logging_filters import redact

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return Client()


def test_api_responses_have_csp_and_no_store(client):
    r = client.get("/api/health/")
    assert r["Content-Security-Policy"].startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in r["Content-Security-Policy"]
    assert r["Cache-Control"] == "no-store"
    assert "camera=()" in r["Permissions-Policy"]
    assert r["X-Content-Type-Options"] == "nosniff"


def test_api_docs_are_not_given_the_strict_csp(client):
    r = client.get("/api/docs/")
    assert "Content-Security-Policy" not in r


def test_secure_request_gets_hsts_when_not_debug(client, settings):
    settings.SECURE_HSTS_SECONDS = 31536000
    settings.SECURE_SSL_REDIRECT = False
    r = client.get("/api/health/", secure=True)
    assert "max-age=31536000" in r["Strict-Transport-Security"]


def test_cors_does_not_allow_unknown_origin(client):
    r = client.get("/api/health/", HTTP_ORIGIN="https://evil.example.org")
    assert "Access-Control-Allow-Origin" not in r


def test_session_cookies_are_httponly_and_samesite(client, make_user):
    user = make_user(role="admin")
    r = login(client, user)
    assert r.status_code == 200
    morsels = [m for m in r.cookies.values() if m.key != "csrftoken"]
    assert morsels
    for m in morsels:
        assert m["httponly"], m.key
        assert m["samesite"] in ("Lax", "Strict"), m.key


def test_multipart_and_form_bodies_are_rejected(client, make_user):
    user = make_user(role="admin")
    r = client.post(
        "/api/auth/login/", {"email": user.email, "password": PASSWORD, "role": "admin"}
    )
    assert r.status_code == 415


def test_forged_forwarded_for_does_not_bypass_login_throttle(client, make_user):
    user = make_user(role="customer")
    codes = []
    for i in range(40):
        r = client.post(
            "/api/auth/login/",
            {"role": "customer", "email": f"nobody{i}@example.com", "password": "x"},
            content_type="application/json",
            HTTP_X_FORWARDED_FOR=f"10.0.0.{i}",
        )
        codes.append(r.status_code)
    assert 429 in codes
    assert user  # fixture used


def test_booking_request_is_rate_limited(logged_in):
    client, _ = logged_in("customer")
    codes = [
        client.post("/api/booking/requests/", {}, content_type="application/json").status_code
        for _ in range(40)
    ]
    assert 429 in codes


def test_redact_removes_tokens_passwords_and_cards():
    text = (
        "GET /api/auth/invite/?token=abc123SECRET ok password=hunter2 "
        "Authorization: Bearer eyJhbGciOi.eyJzdWIi.sig card 4111111111111111 code=482913"
    )
    out = redact(text)
    for secret in ("abc123SECRET", "hunter2", "eyJhbGciOi", "4111111111111111", "482913"):
        assert secret not in out


def test_redact_keeps_normal_text():
    assert redact("Booked haircut at 10:00") == "Booked haircut at 10:00"


def test_redact_filter_is_installed_on_console_handler():
    from django.conf import settings

    assert "redact" in settings.LOGGING["filters"]
    assert "redact" in settings.LOGGING["handlers"]["console"]["filters"]
    rec = logging.LogRecord("x", logging.INFO, "f", 1, "token=%s", ("SECRETVALUE",), None)
    from core.logging_filters import RedactFilter

    RedactFilter().filter(rec)
    assert "SECRETVALUE" not in rec.getMessage()


@override_settings(DEBUG=False)
def test_unhandled_error_response_has_no_traceback(client):
    r = client.get("/api/no-such-endpoint/")
    assert r.status_code == 404
    assert b"Traceback" not in r.content
