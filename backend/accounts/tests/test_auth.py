from datetime import timedelta

import pytest
from django.conf import settings
from django.db import connection
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, LoginLock, User
from accounts.serializers import GENERIC_LOGIN_ERROR
from conftest import PASSWORD, login
from core.models import MailOutbox
from people.models import CustomerProfile, phone_index

ACCESS = settings.SALON_AUTH["ACCESS_COOKIE"]
REFRESH = settings.SALON_AUTH["REFRESH_COOKIE"]

REGISTER = {
    "full_name": "Ananya Rao",
    "email": "Ananya@Example.com",
    "phone": "+91 98765 43210",
    "password": PASSWORD,
    "consent": True,
}


def post(client, url, data=None):
    return client.post(url, data or {}, content_type="application/json")


# --- Register -----------------------------------------------------------------------


@pytest.mark.django_db
def test_register_creates_customer_with_encrypted_phone(client):
    response = post(client, "/api/auth/register/", REGISTER)
    assert response.status_code == 201
    user = User.objects.get(email="ananya@example.com")
    assert user.role == "customer"
    assert user.password.startswith("argon2")
    profile = CustomerProfile.objects.get(user=user)
    assert profile.phone == "9876543210"
    assert profile.phone_index == phone_index("9876543210")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT phone FROM people_customerprofile WHERE user_id = %s", [str(user.pk)]
        )
        stored = cursor.fetchone()[0]
    assert "9876543210" not in stored and stored.startswith("v1:")
    assert AuditLog.objects.filter(action="register", target=user).exists()


@pytest.mark.django_db
def test_register_ignores_role_from_client(client):
    response = post(client, "/api/auth/register/", {**REGISTER, "role": "admin"})
    assert response.status_code == 201
    assert User.objects.get(email="ananya@example.com").role == "customer"


@pytest.mark.django_db
def test_register_existing_email_gives_identical_response(client, make_user):
    make_user(role="stylist", email="ananya@example.com")
    first = post(client, "/api/auth/register/", REGISTER)
    assert first.status_code == 201
    assert User.objects.filter(email__iexact="ananya@example.com").count() == 1
    assert User.objects.get(email="ananya@example.com").role == "stylist"
    fresh = post(client, "/api/auth/register/", {**REGISTER, "email": "new@example.com"})
    assert first.json() == fresh.json()
    assert MailOutbox.objects.filter(to_email="ananya@example.com", kind="notice").exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "field,value",
    [
        ("phone", "12345"),
        ("phone", "5876543210"),
        ("password", "short"),
        ("password", "ananya@example.com"),
        ("consent", False),
        ("email", "not-an-email"),
        ("full_name", "A"),
    ],
)
def test_register_validates_on_server(client, field, value):
    response = post(client, "/api/auth/register/", {**REGISTER, field: value})
    assert response.status_code == 400
    assert field in response.json()
    assert not User.objects.exists()


# --- Login --------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist", "admin"])
def test_login_success_sets_httponly_cookies(client, make_user, role):
    user = make_user(role=role)
    response = login(client, user)
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == role and body["email"] == user.email
    assert body["home"].startswith("/")
    assert response.cookies[ACCESS]["httponly"] and response.cookies[REFRESH]["httponly"]
    assert response.cookies[ACCESS]["samesite"] == "Lax"
    assert "token" not in str(body).lower()
    assert AuditLog.objects.filter(action="login_success", target=user).exists()
    me = client.get("/api/auth/me/")
    assert me.status_code == 200 and me.json()["id"] == str(user.pk)


@pytest.mark.django_db
def test_login_failures_are_indistinguishable(client, make_user):
    customer = make_user(role="customer", email="c@example.com")
    make_user(role="stylist", email="inactive@example.com", active=False)
    cases = [
        {"role": "customer", "email": "c@example.com", "password": "wrong-password"},
        {"role": "customer", "email": "nobody@example.com", "password": PASSWORD},
        {"role": "admin", "email": "c@example.com", "password": PASSWORD},  # tab mismatch
        {"role": "stylist", "email": "inactive@example.com", "password": PASSWORD},
    ]
    for case in cases:
        response = post(client, "/api/auth/login/", case)
        assert response.status_code == 401
        assert response.json() == {"detail": GENERIC_LOGIN_ERROR}
        assert ACCESS not in response.cookies
    mismatch = AuditLog.objects.get(action="login_failed", metadata__reason="role_mismatch")
    assert mismatch.target == customer


@pytest.mark.django_db
def test_staff_cannot_sign_in_through_customer_tab(client, make_user):
    admin = make_user(role="admin")
    assert login(client, admin, role="customer").status_code == 401
    assert login(client, admin, role="admin").status_code == 200


@pytest.mark.django_db
def test_lockout_after_five_failures(client, make_user):
    user = make_user(role="customer", email="lock@example.com")
    for _ in range(5):
        assert login(client, user, password="wrong-password").status_code == 401
    locked = login(client, user)  # correct password, but locked
    assert locked.status_code == 429
    assert "15 minutes" in locked.json()["detail"]
    assert AuditLog.objects.filter(action="lockout", email="lock@example.com").count() == 1
    # Lock expires after 15 minutes.
    LoginLock.objects.filter(email="lock@example.com").update(
        locked_until=timezone.now() - timedelta(seconds=1)
    )
    assert login(client, user).status_code == 200
    assert not LoginLock.objects.filter(email="lock@example.com").exists()


@pytest.mark.django_db
def test_lockout_also_applies_to_unknown_emails(client):
    body = {"role": "customer", "email": "ghost@example.com", "password": "nope-nope"}
    for _ in range(5):
        assert post(client, "/api/auth/login/", body).status_code == 401
    assert post(client, "/api/auth/login/", body).status_code == 429


@pytest.mark.django_db
def test_auth_endpoints_are_rate_limited(client, settings):
    from django.core.cache import cache

    cache.clear()
    statuses = [
        post(client, "/api/auth/password-reset/", {"email": f"x{i}@example.com"}).status_code
        for i in range(25)
    ]
    assert statuses[0] == 200 and 429 in statuses


# --- Session --------------------------------------------------------------------------


@pytest.mark.django_db
def test_me_requires_session(client):
    assert client.get("/api/auth/me/").status_code == 401


@pytest.mark.django_db
def test_refresh_rotates_and_old_refresh_is_rejected(logged_in):
    client, _ = logged_in("customer")
    old_refresh = client.cookies[REFRESH].value
    first = post(client, "/api/auth/refresh/")
    assert first.status_code == 204
    assert client.cookies[REFRESH].value != old_refresh
    replay = Client()
    replay.cookies[REFRESH] = old_refresh
    assert post(replay, "/api/auth/refresh/").status_code == 401
    assert client.get("/api/auth/me/").status_code == 200


@pytest.mark.django_db
def test_refresh_without_cookie_is_401(client):
    assert post(client, "/api/auth/refresh/").status_code == 401


@pytest.mark.django_db
def test_logout_clears_session_and_revokes_refresh(logged_in):
    client, user = logged_in("stylist")
    refresh = client.cookies[REFRESH].value
    response = post(client, "/api/auth/logout/")
    assert response.status_code == 204
    assert response.cookies[ACCESS].value == "" and response.cookies[REFRESH].value == ""
    assert client.get("/api/auth/me/").status_code == 401
    replay = Client()
    replay.cookies[REFRESH] = refresh
    assert post(replay, "/api/auth/refresh/").status_code == 401
    assert AuditLog.objects.filter(action="logout", target=user).exists()


@pytest.mark.django_db
def test_garbage_access_cookie_is_anonymous_not_500(client):
    client.cookies[ACCESS] = "not-a-jwt"
    assert client.get("/api/auth/me/").status_code == 401
    assert client.get("/api/health/").status_code == 200


# --- CSRF -----------------------------------------------------------------------------


@pytest.mark.django_db
def test_csrf_is_enforced_on_unsafe_requests(make_user):
    user = make_user(role="customer")
    client = Client(enforce_csrf_checks=True)
    body = {"role": "customer", "email": user.email, "password": PASSWORD}
    no_token = client.post("/api/auth/login/", body, content_type="application/json")
    assert no_token.status_code == 403
    assert client.get("/api/auth/csrf/").status_code == 204
    token = client.cookies["csrftoken"].value
    ok = client.post(
        "/api/auth/login/", body, content_type="application/json", HTTP_X_CSRFTOKEN=token
    )
    assert ok.status_code == 200
    # Login rotates the CSRF token; the new cookie must be used from now on.
    new_token = client.cookies["csrftoken"].value
    assert client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN="wrong").status_code == 403
    assert client.post("/api/auth/logout/", HTTP_X_CSRFTOKEN=new_token).status_code == 204


# --- Session endpoint (no 401 noise for guests) ----------------------------------------


@pytest.mark.django_db
def test_session_is_null_for_guests_with_200(client):
    response = client.get("/api/auth/session/")
    assert response.status_code == 200 and response.json() == {"user": None}


@pytest.mark.django_db
def test_session_returns_user_and_renews_from_refresh_cookie(logged_in):
    client, user = logged_in("receptionist")
    assert client.get("/api/auth/session/").json()["user"]["id"] == str(user.pk)
    old_refresh = client.cookies[REFRESH].value
    del client.cookies[ACCESS]  # access cookie expired
    renewed = client.get("/api/auth/session/")
    assert renewed.status_code == 200 and renewed.json()["user"]["role"] == "receptionist"
    assert renewed.cookies[ACCESS].value and client.cookies[REFRESH].value != old_refresh


@pytest.mark.django_db
def test_session_is_null_for_deactivated_user_and_clears_cookies(logged_in):
    client, user = logged_in("stylist")
    User.objects.filter(pk=user.pk).update(is_active=False)
    response = client.get("/api/auth/session/")
    assert response.json() == {"user": None}
    assert response.cookies[REFRESH].value == ""
