"""Task 13D: "Remember this device for 30 days" (customers only) and fresh codes for sensitive
actions."""

import re
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts import trusted
from accounts.models import AuditLog, TrustedDevice, User
from accounts.tokens import hash_token
from conftest import PASSWORD, login
from core.models import MailOutbox

CHROME_WIN = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


@pytest.fixture(autouse=True)
def otp_on(settings):
    settings.SALON_CUSTOMER_OTP = True
    settings.SALON_DEV_TOOLS = True


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


def last_code(user) -> str:
    mail = MailOutbox.objects.filter(kind="otp", to_email=user.email).first()
    assert mail is not None
    return re.search(r"\b(\d{6})\b", mail.body).group(1)


def sign_in_with_code(client, user, remember=False):
    """Password, then the emailed code. Returns the verify response."""
    first = login(client, user)
    assert first.json()["otp_required"] is True
    return client.post(
        "/api/auth/otp/verify/",
        {
            "email": user.email,
            "code": last_code(user),
            "purpose": "login",
            "remember_device": remember,
        },
        content_type="application/json",
        HTTP_USER_AGENT=CHROME_WIN,
    )


def trusted_browser(user) -> Client:
    """A browser that has signed in once with the box ticked (so it holds the cookie)."""
    client = Client()
    response = sign_in_with_code(client, user, remember=True)
    assert response.status_code == 200
    assert trusted.COOKIE in response.cookies
    client.post("/api/auth/logout/")
    return client


@pytest.fixture
def customer(make_user):
    return make_user("customer", email="priya@example.com")


# ----------------------------------------------------------------------------------- remembering


@pytest.mark.django_db
def test_ticking_the_box_after_the_code_remembers_the_device(customer):
    response = sign_in_with_code(Client(), customer, remember=True)
    cookie = response.cookies[trusted.COOKIE]
    assert cookie["httponly"]
    assert cookie["samesite"] == "Lax"
    assert cookie["path"] == "/api/auth/"
    assert 29 * 86400 < int(cookie["max-age"]) <= 30 * 86400
    device = TrustedDevice.objects.get(user=customer)
    assert device.label == "Chrome on Windows"
    assert device.expires_at > timezone.now() + timedelta(days=29)
    assert AuditLog.objects.filter(action=AuditLog.Action.TRUSTED_DEVICE_ADDED).exists()


@pytest.mark.django_db
def test_cookie_is_secure_when_not_in_debug(customer, settings):
    settings.SALON_AUTH = {**settings.SALON_AUTH, "COOKIE_SECURE": True}
    response = sign_in_with_code(Client(), customer, remember=True)
    assert response.cookies[trusted.COOKIE]["secure"]


@pytest.mark.django_db
def test_box_is_off_by_default_so_nothing_is_remembered(customer):
    response = sign_in_with_code(Client(), customer)
    assert trusted.COOKIE not in response.cookies
    assert not TrustedDevice.objects.exists()


@pytest.mark.django_db
def test_token_is_long_random_and_only_its_hash_is_stored(customer):
    response = sign_in_with_code(Client(), customer, remember=True)
    token = response.cookies[trusted.COOKIE].value
    assert len(token) >= 43  # 256 bits, url-safe base64
    device = TrustedDevice.objects.get()
    assert device.token_hash == hash_token(token)
    assert token not in (device.token_hash, device.label, device.previous_hash)
    assert not TrustedDevice.objects.filter(token_hash=token).exists()


# --------------------------------------------------------------------------------------- skipping


@pytest.mark.django_db
def test_remembered_device_with_right_password_skips_the_code(customer):
    browser = trusted_browser(customer)
    mails = MailOutbox.objects.filter(kind="otp").count()
    response = login(browser, customer)
    assert response.status_code == 200
    assert response.json().get("otp_required") is None
    assert response.json()["role"] == "customer"
    assert browser.get("/api/auth/me/").status_code == 200
    assert MailOutbox.objects.filter(kind="otp").count() == mails  # no new code was sent
    assert AuditLog.objects.filter(action=AuditLog.Action.TRUSTED_DEVICE_USED).exists()


@pytest.mark.django_db
def test_wrong_password_never_skips_anything(customer):
    browser = trusted_browser(customer)
    response = login(browser, customer, password="Wrong-Pass-2026!")
    assert response.status_code == 401
    assert "salon_access" not in response.cookies


@pytest.mark.django_db
def test_token_rotates_on_every_use_and_the_old_one_stops_working(customer):
    browser = trusted_browser(customer)
    old = browser.cookies[trusted.COOKIE].value
    response = login(browser, customer)
    new = response.cookies[trusted.COOKIE].value
    assert new != old
    assert TrustedDevice.objects.get().token_hash == hash_token(new)
    browser.post("/api/auth/logout/")

    copied = Client()
    copied.cookies[trusted.COOKIE] = old  # someone replays the old cookie
    again = login(copied, customer)
    assert again.json()["otp_required"] is True
    # Replaying a rotated token is a sign of theft: that device is cancelled.
    assert TrustedDevice.objects.get().revoked_at is not None
    stolen = login(browser, customer)
    assert stolen.json()["otp_required"] is True


@pytest.mark.django_db
def test_token_of_another_account_does_not_skip(customer, make_user):
    browser = trusted_browser(customer)
    other = make_user("customer", email="ravi@example.com")
    attacker = Client()
    attacker.cookies[trusted.COOKIE] = browser.cookies[trusted.COOKIE].value
    response = login(attacker, other)
    assert response.json()["otp_required"] is True
    assert AuditLog.objects.filter(
        action=AuditLog.Action.TRUSTED_DEVICE_REJECTED, metadata__reason="other_account"
    ).exists()
    # ... and the owner's device still works.
    assert login(browser, customer).json().get("otp_required") is None


@pytest.mark.django_db
def test_expired_revoked_and_tampered_tokens_fail(customer):
    browser = trusted_browser(customer)
    token = browser.cookies[trusted.COOKIE].value

    tampered = Client()
    tampered.cookies[trusted.COOKIE] = token[:-2] + ("AA" if token[-2:] != "AA" else "BB")
    assert login(tampered, customer).json()["otp_required"] is True

    TrustedDevice.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert login(browser, customer).json()["otp_required"] is True

    TrustedDevice.objects.update(expires_at=timezone.now() + timedelta(days=1))
    assert login(browser, customer).json().get("otp_required") is None  # valid again
    browser.post("/api/auth/logout/")
    TrustedDevice.objects.update(revoked_at=timezone.now())
    assert login(browser, customer).json()["otp_required"] is True


@pytest.mark.django_db
def test_an_account_that_never_proved_its_email_always_gets_the_code(make_user):
    user = make_user("customer", email="new@example.com", verified=False)
    browser = Client()
    browser.cookies[trusted.COOKIE] = "x" * 43
    assert login(browser, user).json()["otp_required"] is True


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_staff_never_skip_a_second_step_and_never_get_the_cookie(make_user, role):
    staff = make_user(role)
    client = Client()
    first = login(client, staff)
    assert first.status_code == 200 and "salon_access" in first.cookies
    # Staff have no emailed-code step; asking to remember a device does nothing for them.
    response = client.post(
        "/api/auth/otp/verify/",
        {"email": staff.email, "code": "123456", "purpose": "login", "remember_device": True},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert not TrustedDevice.objects.exists()
    assert trusted.COOKIE not in response.cookies
    # A cookie from a customer's device is worthless for staff.
    assert trusted.check(staff, _request_with_cookie("anything")) is None


def _request_with_cookie(value):
    from django.test import RequestFactory

    request = RequestFactory().get("/")
    request.COOKIES[trusted.COOKIE] = value
    return request


# ---------------------------------------------------------------------------------- the settings


@pytest.mark.django_db
def test_customer_lists_and_revokes_their_own_devices(customer, make_user):
    browser = trusted_browser(customer)
    login(browser, customer)
    rows = browser.get("/api/auth/trusted-devices/").json()["results"]
    assert len(rows) == 1
    assert set(rows[0]) == {
        "id",
        "label",
        "created_at",
        "last_used_at",
        "expires_at",
        "this_device",
    }
    assert rows[0]["this_device"] is True
    assert rows[0]["last_used_at"]

    other = make_user("customer", email="ravi@example.com")
    other_client = Client()
    login(other_client, other)
    other_client = Client()
    sign_in_with_code(other_client, other, remember=True)
    assert (
        other_client.get("/api/auth/trusted-devices/").json()["results"][0]["id"] != rows[0]["id"]
    )
    # One customer cannot revoke another's device.
    denied = other_client.delete(f"/api/auth/trusted-devices/{rows[0]['id']}/")
    assert denied.status_code == 404
    assert TrustedDevice.objects.get(pk=rows[0]["id"]).revoked_at is None

    assert browser.delete(f"/api/auth/trusted-devices/{rows[0]['id']}/").status_code == 200
    assert browser.get("/api/auth/trusted-devices/").json()["results"] == []
    browser.post("/api/auth/logout/")
    assert login(browser, customer).json()["otp_required"] is True


@pytest.mark.django_db
def test_revoke_all_forgets_every_device(customer):
    first = trusted_browser(customer)
    second = trusted_browser(customer)
    assert TrustedDevice.objects.filter(revoked_at__isnull=True).count() == 2
    login(first, customer)  # skips the code on this device
    response = first.delete("/api/auth/trusted-devices/")
    assert response.json()["revoked"] == 2
    assert not TrustedDevice.objects.filter(revoked_at__isnull=True).exists()
    assert login(second, customer).json()["otp_required"] is True


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
def test_staff_and_guests_cannot_use_the_trusted_device_endpoints(logged_in, role):
    staff, _ = logged_in(role)
    assert staff.get("/api/auth/trusted-devices/").status_code == 403
    assert staff.delete("/api/auth/trusted-devices/").status_code == 403
    assert Client().get("/api/auth/trusted-devices/").status_code in (401, 403)


# ------------------------------------------------------------------------- automatic revocation


@pytest.mark.django_db
def test_password_change_signs_out_every_remembered_device(customer):
    browser = trusted_browser(customer)
    live = Client()
    sign_in_with_code(live, customer)
    assert post(live, "/api/auth/step-up/").json()["method"] == "email"
    verified = post(live, "/api/auth/step-up/verify/", {"code": last_code(customer)})
    assert verified.status_code == 200
    changed = post(
        live,
        "/api/auth/password/change/",
        {"current_password": PASSWORD, "new_password": "Brand-New-Pass-2027!"},
    )
    assert changed.status_code == 200
    assert TrustedDevice.objects.get().revoked_at is not None
    assert login(browser, customer, password="Brand-New-Pass-2027!").json()["otp_required"] is True


@pytest.mark.django_db
def test_email_change_and_account_lock_revoke_devices(customer):
    trusted_browser(customer)
    customer.email = "priya.new@example.com"
    customer.save()
    assert not TrustedDevice.objects.filter(revoked_at__isnull=True).exists()

    trusted_browser(customer)
    assert TrustedDevice.objects.filter(revoked_at__isnull=True).count() == 1
    for _ in range(5):
        login(Client(), customer, password="Wrong-Pass-2026!")
    assert not TrustedDevice.objects.filter(revoked_at__isnull=True).exists()
    why = set(
        AuditLog.objects.filter(action=AuditLog.Action.TRUSTED_DEVICE_REVOKED).values_list(
            "metadata__why", flat=True
        )
    )
    assert {"email_changed", "account_locked"} <= why


@pytest.mark.django_db
def test_deactivated_account_loses_its_devices(customer):
    trusted_browser(customer)
    customer.is_active = False
    customer.save()
    assert not TrustedDevice.objects.filter(revoked_at__isnull=True).exists()


# ------------------------------------------------------------------------- fresh code, always


@pytest.mark.django_db
def test_sensitive_actions_ask_for_a_fresh_code_even_on_a_trusted_device(customer):
    browser = trusted_browser(customer)
    assert login(browser, customer).json().get("otp_required") is None  # signed in, no code

    body = {"current_password": PASSWORD, "new_password": "Brand-New-Pass-2027!"}
    blocked = post(browser, "/api/auth/password/change/", body)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "fresh_otp_required"
    user = User.objects.get(pk=customer.pk)
    assert user.check_password(PASSWORD)

    delete = post(browser, "/api/my/data-requests/", {"kind": "delete"})
    assert delete.status_code == 403
    assert delete.json()["code"] == "fresh_otp_required"

    assert post(browser, "/api/auth/step-up/").status_code == 200
    wrong = post(browser, "/api/auth/step-up/verify/", {"code": "000000"})
    assert wrong.status_code == 400
    assert (
        post(browser, "/api/auth/step-up/verify/", {"code": last_code(customer)}).status_code == 200
    )
    ok = post(browser, "/api/my/data-requests/", {"kind": "delete"})
    assert ok.status_code == 201
    assert AuditLog.objects.filter(action=AuditLog.Action.FRESH_OTP_REQUIRED).count() >= 2


@pytest.mark.django_db
def test_a_fresh_code_is_for_one_account_only(customer, make_user):
    one = Client()
    sign_in_with_code(one, customer)
    post(one, "/api/auth/step-up/")
    verified = post(one, "/api/auth/step-up/verify/", {"code": last_code(customer)})
    stolen_cookie = verified.cookies["salon_fresh"].value

    other = make_user("customer", email="ravi@example.com")
    two = Client()
    sign_in_with_code(two, other)
    two.cookies["salon_fresh"] = stolen_cookie
    blocked = post(two, "/api/my/data-requests/", {"kind": "delete"})
    assert blocked.status_code == 403


@pytest.mark.django_db
def test_step_up_endpoints_need_a_signed_in_user():
    assert post(Client(), "/api/auth/step-up/").status_code in (401, 403)
    assert post(Client(), "/api/auth/step-up/verify/", {"code": "123456"}).status_code in (401, 403)


@pytest.mark.django_db
def test_payment_settings_need_a_fresh_code_for_an_admin_with_two_step(make_user):
    import pyotp

    from accounts import twofactor

    admin = make_user("admin")
    row = twofactor.begin(admin)
    secret = row["secret"]
    client = Client()
    assert login(client, admin).status_code == 200
    client.get("/api/auth/csrf/")
    csrf = {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}
    twofactor_row = admin.two_factor
    twofactor_row.confirmed_at = timezone.now()
    twofactor_row.save()
    assert twofactor.applies_to(admin)
    assert pyotp.TOTP(secret).now()
    blocked = client.patch(
        "/api/admin/settings/",
        {"billing": {"discount_cap_percent": 20}},
        content_type="application/json",
        **csrf,
    )
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "fresh_otp_required"
    # An admin without two-step has no code to give, so nothing extra is asked of them.
    plain = make_user("admin", email="plain@example.com")
    other = Client()
    login(other, plain)
    other.get("/api/auth/csrf/")
    ok = other.patch(
        "/api/admin/settings/",
        {"billing": {"discount_cap_percent": 20}},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=other.cookies["csrftoken"].value,
    )
    assert ok.status_code == 200
