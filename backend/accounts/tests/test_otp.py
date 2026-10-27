"""Customer email codes: registration and every customer sign-in."""

import re
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, OtpChallenge, User
from conftest import login
from core.models import MailOutbox
from people.models import CustomerProfile
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    catalogue,
    day_at,
    desk,
    send_request,
)

PASSWORD = "Strong-Pass-2026!"
REGISTER = {
    "full_name": "Ananya Rao",
    "email": "ananya@example.com",
    "phone": "9876543210",
    "password": PASSWORD,
    "consent": True,
}


@pytest.fixture(autouse=True)
def otp_on(settings):
    settings.SALON_CUSTOMER_OTP = True
    settings.SALON_DEV_TOOLS = True  # the dev mailbox can deliver the code


def post(client, path, data):
    return client.post(path, data, content_type="application/json")


def last_code(email="ananya@example.com") -> str:
    mail = MailOutbox.objects.filter(kind="otp", to_email=email).first()
    assert mail is not None, "no code email was saved"
    return re.search(r"\b(\d{6})\b", mail.body).group(1)


def login_step(client, user, role="customer", password=PASSWORD):
    return post(
        client, "/api/auth/login/", {"role": role, "email": user.email, "password": password}
    )


def wrong_code(code: str) -> str:
    return "000000" if code != "000000" else "111111"


@pytest.mark.django_db
def test_registration_sends_a_code_and_verifying_signs_in():
    client = Client()
    response = post(client, "/api/auth/register/", REGISTER)
    assert response.status_code == 201
    assert response.json()["otp_required"] is True
    user = User.objects.get(email="ananya@example.com")
    assert user.email_verified_at is None
    assert "salon_access" not in response.cookies

    verified = post(
        client,
        "/api/auth/otp/verify/",
        {"email": REGISTER["email"], "code": last_code(), "purpose": "register"},
    )
    assert verified.status_code == 200
    assert verified.json()["role"] == "customer"
    assert "salon_access" in verified.cookies
    user.refresh_from_db()
    assert user.email_verified_at is not None
    assert client.get("/api/auth/me/").status_code == 200


@pytest.mark.django_db
def test_customer_sign_in_needs_the_code_before_any_session(make_user):
    user = make_user(email="ananya@example.com")
    client = Client()
    step = login_step(client, user)
    assert step.status_code == 200
    assert step.json()["otp_required"] is True
    assert "salon_access" not in step.cookies
    assert client.get("/api/auth/me/").status_code in (401, 403)

    done = post(
        client,
        "/api/auth/otp/verify/",
        {"email": user.email, "code": last_code(), "purpose": "login"},
    )
    assert done.status_code == 200
    assert client.get("/api/auth/me/").status_code == 200
    assert AuditLog.objects.filter(action="login_success", actor=user).exists()


@pytest.mark.django_db
def test_wrong_password_still_gets_the_generic_error_and_no_code(make_user):
    user = make_user(email="ananya@example.com")
    response = login_step(Client(), user, password="Wrong-Pass-2026!")
    assert response.status_code == 401
    assert not MailOutbox.objects.filter(kind="otp").exists()


@pytest.mark.django_db
def test_staff_sign_in_never_asks_for_a_code(make_user):
    for role in ("admin", "receptionist", "stylist"):
        user = make_user(role=role)
        response = login_step(Client(), user, role=role)
        assert response.status_code == 200, role
        assert "otp_required" not in response.json()
    assert not MailOutbox.objects.filter(kind="otp").exists()


@pytest.mark.django_db
def test_code_is_stored_hashed_and_expires_in_ten_minutes(make_user):
    user = make_user(email="ananya@example.com")
    login_step(Client(), user)
    code = last_code()
    challenge = OtpChallenge.objects.get()
    assert code not in challenge.code_hash
    assert len(challenge.code_hash) == 64
    window = challenge.expires_at - challenge.created_at
    assert timedelta(minutes=9, seconds=30) < window <= timedelta(minutes=10, seconds=5)


@pytest.mark.django_db
def test_wrong_codes_burn_the_challenge_after_five_tries(make_user):
    user = make_user(email="ananya@example.com")
    client = Client()
    login_step(client, user)
    good = last_code()
    for _ in range(5):
        bad = post(
            client,
            "/api/auth/otp/verify/",
            {"email": user.email, "code": wrong_code(good), "purpose": "login"},
        )
        assert bad.status_code == 400
        assert bad.json()["detail"] == "That code is incorrect or has expired."
    # Even the right code no longer works: sign in with the password again.
    late = post(
        client, "/api/auth/otp/verify/", {"email": user.email, "code": good, "purpose": "login"}
    )
    assert late.status_code == 400
    assert AuditLog.objects.filter(action="login_failed", metadata__reason="bad_otp").count() >= 5


@pytest.mark.django_db
def test_expired_code_is_rejected(make_user):
    user = make_user(email="ananya@example.com")
    client = Client()
    login_step(client, user)
    code = last_code()
    OtpChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    response = post(
        client, "/api/auth/otp/verify/", {"email": user.email, "code": code, "purpose": "login"}
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_code_works_only_once(make_user):
    user = make_user(email="ananya@example.com")
    client = Client()
    login_step(client, user)
    payload = {"email": user.email, "code": last_code(), "purpose": "login"}
    assert post(client, "/api/auth/otp/verify/", payload).status_code == 200
    assert post(Client(), "/api/auth/otp/verify/", payload).status_code == 400


@pytest.mark.django_db
def test_a_login_code_cannot_be_used_as_a_register_code(make_user):
    user = make_user(email="ananya@example.com")
    login_step(Client(), user)
    response = post(
        Client(),
        "/api/auth/otp/verify/",
        {"email": user.email, "code": last_code(), "purpose": "register"},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_unknown_email_and_staff_email_get_the_same_generic_failure(make_user):
    staff = make_user(role="admin", email="boss@example.com")
    for email in ("nobody@example.com", staff.email):
        response = post(
            Client(),
            "/api/auth/otp/verify/",
            {"email": email, "code": "123456", "purpose": "login"},
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "That code is incorrect or has expired."}


@pytest.mark.django_db
def test_code_format_is_validated():
    for code in ("12345", "1234567", "abcdef", ""):
        response = post(
            Client(),
            "/api/auth/otp/verify/",
            {"email": "a@example.com", "code": code, "purpose": "login"},
        )
        assert response.status_code == 400


@pytest.mark.django_db
def test_resend_replaces_the_old_code_and_has_a_cool_down(make_user):
    user = make_user(email="ananya@example.com")
    client = Client()
    login_step(client, user)
    first = last_code()
    payload = {"email": user.email, "purpose": "login"}

    too_soon = post(client, "/api/auth/otp/resend/", payload)
    assert too_soon.status_code == 200
    assert MailOutbox.objects.filter(kind="otp").count() == 1

    OtpChallenge.objects.update(created_at=timezone.now() - timedelta(seconds=61))
    cache.clear()
    assert post(client, "/api/auth/otp/resend/", payload).status_code == 200
    assert MailOutbox.objects.filter(kind="otp").count() == 2
    second = last_code()
    assert OtpChallenge.objects.filter(closed_at__isnull=True).count() == 1
    if first != second:
        old = post(
            client,
            "/api/auth/otp/verify/",
            {"email": user.email, "code": first, "purpose": "login"},
        )
        assert old.status_code == 400
    ok = post(
        client, "/api/auth/otp/verify/", {"email": user.email, "code": second, "purpose": "login"}
    )
    assert ok.status_code == 200


@pytest.mark.django_db
def test_resend_without_a_pending_code_sends_nothing_and_leaks_nothing(make_user):
    make_user(email="ananya@example.com")
    known = post(
        Client(), "/api/auth/otp/resend/", {"email": "ananya@example.com", "purpose": "login"}
    )
    unknown = post(
        Client(), "/api/auth/otp/resend/", {"email": "x@example.com", "purpose": "login"}
    )
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert not MailOutbox.objects.filter(kind="otp").exists()


@pytest.mark.django_db
def test_at_most_five_codes_per_hour(make_user, settings):
    user = make_user(email="ananya@example.com")
    for _ in range(5):
        OtpChallenge.objects.create(
            user=user,
            purpose="login",
            code_hash="x" * 64,
            expires_at=timezone.now() + timedelta(minutes=5),
            closed_at=timezone.now(),
        )
    response = login_step(Client(), user)
    assert response.status_code == 429


@pytest.mark.django_db
def test_registering_an_existing_email_gives_no_code_and_the_same_answer(make_user):
    make_user(email="ananya@example.com")
    first = post(Client(), "/api/auth/register/", REGISTER)
    fresh = post(Client(), "/api/auth/register/", {**REGISTER, "email": "new@example.com"})
    assert first.json() == fresh.json()
    assert not MailOutbox.objects.filter(kind="otp", to_email="ananya@example.com").exists()
    assert MailOutbox.objects.filter(kind="otp", to_email="new@example.com").exists()


@pytest.mark.django_db
def test_deactivated_customer_cannot_use_a_code(make_user):
    user = make_user(email="ananya@example.com")
    login_step(Client(), user)
    code = last_code()
    user.is_active = False
    user.save()
    response = post(
        Client(), "/api/auth/otp/verify/", {"email": user.email, "code": code, "purpose": "login"}
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_without_a_way_to_deliver_the_code_the_step_is_skipped(make_user, settings):
    settings.SALON_DEV_TOOLS = False
    settings.SALON_SMTP_CONFIGURED = False
    user = make_user(email="ananya@example.com")
    response = login_step(Client(), user)
    assert response.status_code == 200
    assert "salon_access" in response.cookies
    assert not MailOutbox.objects.filter(kind="otp").exists()


@pytest.mark.django_db
def test_with_real_email_the_code_is_delivered_after_commit(
    make_user, settings, mailoutbox, django_capture_on_commit_callbacks
):
    settings.SALON_DEV_TOOLS = False
    settings.SALON_SMTP_CONFIGURED = True
    user = make_user(email="ananya@example.com")
    with django_capture_on_commit_callbacks(execute=True):
        step = login_step(Client(), user)
    assert step.json()["otp_required"] is True
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["ananya@example.com"]
    assert re.search(r"\b\d{6}\b", mailoutbox[0].body)
    assert MailOutbox.objects.get(kind="otp").status == "sent"


# ----------------------------------------------- unverified accounts: no sign-in, no booking


@pytest.mark.django_db
def test_unverified_customer_cannot_sign_in_with_the_password_alone(make_user):
    user = make_user(email="ananya@example.com", verified=False)
    client = Client()
    step = login_step(client, user)
    assert step.status_code == 200
    assert step.json()["otp_required"] is True
    assert step.json()["purpose"] == "register"  # the server asks for the registration code
    assert "salon_access" not in step.cookies
    assert client.get("/api/auth/me/").status_code in (401, 403)
    user.refresh_from_db()
    assert user.email_verified_at is None


@pytest.mark.django_db
def test_entering_the_code_verifies_the_account_and_signs_in(make_user):
    user = make_user(email="ananya@example.com", verified=False)
    client = Client()
    login_step(client, user)
    wrong_purpose = post(
        client,
        "/api/auth/otp/verify/",
        {"email": user.email, "code": last_code(), "purpose": "login"},
    )
    assert wrong_purpose.status_code == 400
    assert wrong_purpose.json()["detail"] == "That code is incorrect or has expired."
    assert OtpChallenge.objects.get().attempts == 0  # a wrong purpose does not use up a try

    ok = post(
        client,
        "/api/auth/otp/verify/",
        {"email": user.email, "code": last_code(), "purpose": "register"},
    )
    assert ok.status_code == 200
    user.refresh_from_db()
    assert user.email_verified_at is not None
    # From now on the normal sign-in code is used.
    again = login_step(Client(), user)
    assert again.json()["purpose"] == "login"


@pytest.mark.django_db
def test_a_verified_customer_cannot_use_the_register_purpose(make_user):
    user = make_user(email="ananya@example.com")
    login_step(Client(), user)
    response = post(
        Client(),
        "/api/auth/otp/verify/",
        {"email": user.email, "code": last_code(), "purpose": "register"},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_resend_with_the_wrong_purpose_sends_nothing(make_user):
    user = make_user(email="ananya@example.com", verified=False)
    client = Client()
    login_step(client, user)
    OtpChallenge.objects.update(created_at=timezone.now() - timedelta(seconds=61))
    cache.clear()
    answer = post(client, "/api/auth/otp/resend/", {"email": user.email, "purpose": "login"})
    assert answer.status_code == 200
    assert MailOutbox.objects.filter(kind="otp").count() == 1


@pytest.mark.django_db
def test_failures_look_the_same_whoever_the_email_belongs_to(make_user):
    make_user(email="ananya@example.com", verified=False)
    make_user(email="meera@example.com")
    make_user(role="admin", email="boss@example.com")
    answers = set()
    for email in (
        "ananya@example.com",
        "meera@example.com",
        "boss@example.com",
        "nobody@example.com",
    ):
        response = post(
            Client(),
            "/api/auth/otp/verify/",
            {"email": email, "code": "000000", "purpose": "register"},
        )
        answers.add((response.status_code, response.content))
    assert len(answers) == 1


@pytest.fixture
def booking_setup(catalogue, desk, make_user, settings):  # noqa: F811
    """A signed-in customer. The session is started with codes off, then they are switched on."""
    settings.SALON_CUSTOMER_OTP = False
    user = make_user(email="priya@example.com")
    profile = CustomerProfile(user=user)
    profile.set_phone("9876543210")
    profile.save()
    client = Client()
    assert login(client, user).status_code == 200
    settings.SALON_CUSTOMER_OTP = True
    return catalogue, client, user


@pytest.mark.django_db
def test_an_unverified_customer_cannot_book(booking_setup):
    cat, client, user = booking_setup
    user.email_verified_at = None
    user.save(update_fields=["email_verified_at"])
    response = send_request(client, cat, start=day_at(3, 11).isoformat())
    assert response.status_code == 403
    assert response.json()["code"] == "email_unverified"
    from scheduling.models import Appointment

    assert not Appointment.objects.exists()


@pytest.mark.django_db
def test_a_verified_customer_can_book(booking_setup):
    cat, client, user = booking_setup
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    assert send_request(client, cat, start=day_at(3, 11).isoformat()).status_code == 201


@pytest.mark.django_db
def test_booking_is_not_blocked_when_email_codes_are_off(booking_setup, settings):
    cat, client, user = booking_setup
    settings.SALON_CUSTOMER_OTP = False
    user.email_verified_at = None
    user.save(update_fields=["email_verified_at"])
    assert send_request(client, cat, start=day_at(3, 11).isoformat()).status_code == 201
