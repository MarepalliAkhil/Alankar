"""Task 5e-3: optional two-step sign-in for admins."""

import json
import time

import pyotp
import pytest
from django.core.management import call_command
from django.test import Client

from accounts import qr, twofactor
from accounts.models import AuditLog, BackupCode, TwoFactor
from conftest import PASSWORD, login
from core.models import MailOutbox

BASE = "/api/admin/security/two-factor"


def post(client, url, body=None):
    client.get("/api/auth/csrf/")
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return client.post(url, json.dumps(body or {}), content_type="application/json", **headers)


@pytest.fixture
def admin_user(make_user):
    return make_user(role="admin", email="boss@example.com")


@pytest.fixture
def signed_in(admin_user):
    client = Client()
    assert login(client, admin_user).status_code == 200
    return client


CLOCK = {"steps": 0}


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Codes are one per 30 seconds and a used one is refused, so tests move the clock on."""
    CLOCK["steps"] = 0
    real = time.time
    monkeypatch.setattr(twofactor, "_now", lambda: real() + 30 * CLOCK["steps"])
    return CLOCK


def current_code(secret, back=0):
    """The code for the next unused time step (the clock moves on first)."""
    CLOCK["steps"] += 1
    return pyotp.TOTP(secret).at(int(twofactor._now()))


def enable(client):
    made = post(client, f"{BASE}/setup/").json()
    done = post(client, f"{BASE}/confirm/", {"code": current_code(made["secret"])})
    assert done.status_code == 200, done.content
    return made["secret"], done.json()["backup_codes"]


# --------------------------------------------------------------------------- set up


def test_setup_gives_a_secret_a_link_and_a_qr_grid(signed_in):
    made = post(signed_in, f"{BASE}/setup/")
    assert made.status_code == 200
    data = made.json()
    assert data["uri"].startswith("otpauth://totp/") and data["secret"] in data["uri"]
    assert "boss%40example.com" in data["uri"]
    rows = data["qr"]
    assert len(rows) == len(rows[0]) and set("".join(rows)) <= {"0", "1"}
    assert signed_in.get(f"{BASE}/").json()["enabled"] is False  # not on until a code is right


def test_a_wrong_code_does_not_switch_it_on(signed_in, admin_user):
    post(signed_in, f"{BASE}/setup/")
    assert post(signed_in, f"{BASE}/confirm/", {"code": "000000"}).status_code == 400
    assert not twofactor.is_enabled(admin_user)


def test_a_right_code_switches_it_on_and_shows_ten_backup_codes_once(signed_in, admin_user):
    secret, codes = enable(signed_in)
    assert len(codes) == len(set(codes)) == 10 and all(len(c) == 11 for c in codes)
    status = signed_in.get(f"{BASE}/").json()
    assert status["enabled"] is True and status["backup_codes_left"] == 10
    assert codes[0].replace("-", "") not in " ".join(
        BackupCode.objects.values_list("code_hash", flat=True)
    )
    assert secret not in TwoFactor.objects.get().secret  # stored encrypted
    assert AuditLog.objects.filter(action="two_factor_enabled").count() == 1
    assert post(signed_in, f"{BASE}/setup/").status_code == 409  # already on


# --------------------------------------------------------------------------- signing in


def sign_in_step_one(admin_user):
    client = Client()
    first = login(client, admin_user)
    assert first.status_code == 200
    return client, first.json()


def test_password_alone_no_longer_signs_an_admin_in(signed_in, admin_user):
    enable(signed_in)
    client, first = sign_in_step_one(admin_user)
    assert first["two_factor_required"] is True and "challenge" in first
    assert "sessionid" not in client.cookies and not client.cookies.get("access")
    assert client.get("/api/auth/me/").status_code in (401, 403)


def test_the_app_code_completes_the_sign_in(signed_in, admin_user):
    secret, _ = enable(signed_in)
    _, first = sign_in_step_one(admin_user)
    client = Client()
    r = post(
        client,
        "/api/auth/two-factor/verify/",
        {"challenge": first["challenge"], "code": current_code(secret)},
    )
    assert r.status_code == 200, r.content
    assert r.json()["role"] == "admin" and client.get("/api/auth/me/").status_code == 200


def test_a_code_cannot_be_used_twice(signed_in, admin_user):
    secret, _ = enable(signed_in)
    code = current_code(secret)
    _, first = sign_in_step_one(admin_user)
    ok = post(
        Client(), "/api/auth/two-factor/verify/", {"challenge": first["challenge"], "code": code}
    )
    assert ok.status_code == 200
    _, again = sign_in_step_one(admin_user)
    replay = post(
        Client(), "/api/auth/two-factor/verify/", {"challenge": again["challenge"], "code": code}
    )
    assert replay.status_code == 400


def test_a_backup_code_works_once_and_is_audited(signed_in, admin_user):
    _, codes = enable(signed_in)
    _, first = sign_in_step_one(admin_user)
    ok = post(
        Client(),
        "/api/auth/two-factor/verify/",
        {"challenge": first["challenge"], "code": codes[0]},
    )
    assert ok.status_code == 200
    assert twofactor.backup_codes_left(admin_user) == 9
    _, second = sign_in_step_one(admin_user)
    again = post(
        Client(),
        "/api/auth/two-factor/verify/",
        {"challenge": second["challenge"], "code": codes[0]},
    )
    assert again.status_code == 400
    assert AuditLog.objects.filter(action="two_factor_backup_used").count() == 1


def test_wrong_codes_lock_the_account_like_wrong_passwords(signed_in, admin_user):
    enable(signed_in)
    for _ in range(5):
        _, first = sign_in_step_one(admin_user)
        r = post(
            Client(),
            "/api/auth/two-factor/verify/",
            {"challenge": first["challenge"], "code": "123456"},
        )
        assert r.status_code == 400
    # locked now: even the right password is refused
    assert login(Client(), admin_user).status_code == 429
    assert (
        AuditLog.objects.filter(action="login_failed", metadata__reason="bad_two_factor").count()
        == 5
    )
    assert AuditLog.objects.filter(action="lockout").count() == 1


def test_a_forged_or_old_challenge_is_refused(signed_in, admin_user, make_user):
    secret, _ = enable(signed_in)
    code = current_code(secret)
    assert (
        post(
            Client(), "/api/auth/two-factor/verify/", {"challenge": "nonsense", "code": code}
        ).status_code
        == 400
    )
    other = make_user(role="admin", email="other@example.com")
    stranger = twofactor.make_challenge(other)  # signed, but they have no two-step sign-in
    assert (
        post(
            Client(), "/api/auth/two-factor/verify/", {"challenge": stranger, "code": code}
        ).status_code
        == 400
    )


def test_other_roles_and_admins_without_it_sign_in_as_before(make_user):
    for role in ("customer", "receptionist", "stylist", "admin"):
        user = make_user(role=role)
        r = login(Client(), user)
        assert r.status_code == 200 and "two_factor_required" not in r.json()


# --------------------------------------------------------------------------- switch off and codes


def test_switching_off_needs_the_password_and_a_code(signed_in, admin_user):
    secret, _ = enable(signed_in)
    bad_password = post(
        signed_in, f"{BASE}/disable/", {"password": "nope", "code": current_code(secret)}
    )
    assert bad_password.status_code == 400 and twofactor.is_enabled(admin_user)
    bad_code = post(signed_in, f"{BASE}/disable/", {"password": PASSWORD, "code": "111111"})
    assert bad_code.status_code == 400 and twofactor.is_enabled(admin_user)
    ok = post(signed_in, f"{BASE}/disable/", {"password": PASSWORD, "code": current_code(secret)})
    assert ok.status_code == 200 and not twofactor.is_enabled(admin_user)
    assert not BackupCode.objects.exists()
    assert AuditLog.objects.filter(action="two_factor_disabled").count() == 1


def test_new_backup_codes_replace_the_old_ones(signed_in, admin_user):
    secret, old = enable(signed_in)
    r = post(
        signed_in, f"{BASE}/backup-codes/", {"password": PASSWORD, "code": current_code(secret)}
    )
    assert r.status_code == 200
    new = r.json()["backup_codes"]
    assert len(new) == 10 and not set(new) & set(old)
    assert twofactor.verify(admin_user, old[0]) is None
    assert twofactor.verify(admin_user, new[0]) == "backup"
    assert AuditLog.objects.filter(action="two_factor_codes").count() == 1


# --------------------------------------------------------------------------- recovery


def test_a_second_admin_can_reset_a_lost_phone(signed_in, admin_user, make_user):
    enable(signed_in)
    helper = make_user(role="admin", email="helper@example.com")
    client = Client()
    login(client, helper)
    listed = client.get(f"{BASE}/").json()["admins"]
    assert listed == [
        {
            "id": str(admin_user.pk),
            "name": "Test User",
            "email": "boss@example.com",
            "two_factor": True,
        }
    ]
    r = post(client, f"{BASE}/{admin_user.pk}/reset/", {"reason": "Lost the phone on the train"})
    assert r.status_code == 200 and not twofactor.is_enabled(admin_user)
    entry = AuditLog.objects.get(action="two_factor_reset")
    assert entry.actor_id == helper.pk and entry.target_id == admin_user.pk
    assert entry.metadata["reason"] == "Lost the phone on the train"
    assert MailOutbox.objects.filter(to_email="boss@example.com", kind="notice").exists()
    assert post(signed_in, "/api/auth/refresh/").status_code in (401, 403)  # their sessions end
    assert "two_factor_required" not in login(Client(), admin_user).json()


def test_nobody_can_reset_their_own_and_a_reason_is_needed(signed_in, admin_user, make_user):
    enable(signed_in)
    assert (
        post(signed_in, f"{BASE}/{admin_user.pk}/reset/", {"reason": "I want it off"}).status_code
        == 403
    )
    helper = make_user(role="admin", email="helper@example.com")
    client = Client()
    login(client, helper)
    assert post(client, f"{BASE}/{admin_user.pk}/reset/", {"reason": "x"}).status_code == 400
    assert post(
        client, f"{BASE}/{helper.pk}/reset/", {"reason": "not even enabled"}
    ).status_code in (403, 409)
    assert twofactor.is_enabled(admin_user)


def test_the_server_command_resets_the_only_admin(signed_in, admin_user, capsys):
    enable(signed_in)
    call_command("reset_admin_2fa", "boss@example.com")
    assert not twofactor.is_enabled(admin_user)
    assert AuditLog.objects.filter(action="two_factor_reset").exists()
    call_command("reset_admin_2fa", "boss@example.com")  # nothing to do the second time
    with pytest.raises(Exception, match="No admin"):
        call_command("reset_admin_2fa", "nobody@example.com")


# --------------------------------------------------------------------------- denied


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_other_roles_cannot_touch_two_factor(logged_in, role, admin_user):
    client, _ = logged_in(role)
    for url in (f"{BASE}/", f"{BASE}/setup/", f"{BASE}/confirm/", f"{BASE}/disable/"):
        assert client.get(url).status_code == 403
        assert post(client, url, {"code": "1", "password": "x"}).status_code == 403
    assert post(client, f"{BASE}/{admin_user.pk}/reset/", {"reason": "because"}).status_code == 403


def test_guests_cannot_either(admin_user):
    guest = Client()
    assert guest.get(f"{BASE}/").status_code in (401, 403)
    assert post(guest, f"{BASE}/setup/").status_code in (401, 403)


# --------------------------------------------------------------------------- the QR encoder


def test_the_qr_grid_is_square_and_has_finder_patterns():
    rows = qr.encode("otpauth://totp/Shop:me@example.com?secret=ABCDEFGHIJKLMNOP&issuer=Shop")
    n = len(rows)
    assert n in (29, 33, 37, 41) and all(len(r) == n for r in rows)
    corner = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"]
    for top, left in ((0, 0), (0, n - 7), (n - 7, 0)):
        assert [rows[top + i][left : left + 7] for i in range(7)] == corner


def test_qr_text_that_is_too_long_is_refused():
    with pytest.raises(qr.QrTooLong):
        qr.encode("x" * 400)
