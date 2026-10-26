from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, StaffInvite, User
from accounts.tokens import hash_token
from conftest import PASSWORD, login
from core.models import MailOutbox

NEW_PASSWORD = "Another-Strong-Pass-77"


def post(client, url, data=None):
    return client.post(url, data or {}, content_type="application/json")


def invite(client, email="priya@example.com", role="stylist", name="Priya Sharma"):
    return post(client, "/api/staff/invites/", {"email": email, "role": role, "full_name": name})


def token_from_outbox(email: str) -> str:
    message = MailOutbox.objects.filter(to_email=email, kind="invite").first()
    return parse_qs(urlparse(message.link).query)["token"][0]


@pytest.mark.django_db
def test_admin_invites_staff_and_invite_flow_works(logged_in):
    admin_client, admin = logged_in("admin")
    response = invite(admin_client)
    assert response.status_code == 201
    assert response.json()["status"] == "pending"

    user = User.objects.get(email="priya@example.com")
    assert user.role == "stylist" and not user.is_active and not user.has_usable_password()
    token = token_from_outbox("priya@example.com")
    stored = StaffInvite.objects.get(user=user)
    assert stored.token_hash == hash_token(token) and token not in stored.token_hash
    assert AuditLog.objects.filter(action="invite_sent", actor=admin, target=user).exists()

    staff_client = Client()
    # Cannot sign in before accepting.
    assert login(staff_client, user, password=NEW_PASSWORD).status_code == 401

    check = staff_client.get(f"/api/auth/invite/?token={token}")
    assert check.status_code == 200
    assert check.json() == {"email": user.email, "full_name": "Priya Sharma", "role": "stylist"}

    accepted = post(
        staff_client, "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD}
    )
    assert accepted.status_code == 200
    user.refresh_from_db()
    assert user.is_active and user.check_password(NEW_PASSWORD)
    assert AuditLog.objects.filter(action="invite_accepted", target=user).exists()

    # Sign in with the right tab only.
    assert login(staff_client, user, role="admin", password=NEW_PASSWORD).status_code == 401
    assert login(staff_client, user, role="stylist", password=NEW_PASSWORD).status_code == 200

    # Link is single use.
    again = post(Client(), "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD})
    assert again.status_code == 400


@pytest.mark.django_db
def test_invite_rejects_bad_role_duplicate_and_weak_password(logged_in, make_user):
    admin_client, _ = logged_in("admin")
    assert invite(admin_client, role="admin").status_code == 400
    assert invite(admin_client, role="customer").status_code == 400
    make_user(role="customer", email="taken@example.com")
    assert invite(admin_client, email="taken@example.com").status_code == 400

    assert invite(admin_client, email="weak@example.com").status_code == 201
    token = token_from_outbox("weak@example.com")
    weak = post(Client(), "/api/auth/invite/accept/", {"token": token, "password": "123"})
    assert weak.status_code == 400
    assert not User.objects.get(email="weak@example.com").is_active


@pytest.mark.django_db
def test_expired_or_unknown_invite_is_rejected(logged_in):
    admin_client, _ = logged_in("admin")
    invite(admin_client)
    token = token_from_outbox("priya@example.com")
    StaffInvite.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    assert Client().get(f"/api/auth/invite/?token={token}").status_code == 404
    accept = post(Client(), "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD})
    assert accept.status_code == 400
    assert Client().get("/api/auth/invite/?token=made-up").status_code == 404


@pytest.mark.django_db
def test_dev_tools_answer_404_in_production_mode(logged_in, settings):
    admin_client, _ = logged_in("admin")
    invite(admin_client)
    token = token_from_outbox("priya@example.com")
    settings.SALON_DEV_TOOLS = False
    anonymous = Client()
    assert anonymous.get("/api/dev/mailbox/").status_code == 404
    assert anonymous.get(f"/api/auth/invite/?token={token}").status_code == 404
    accept = post(anonymous, "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD})
    assert accept.status_code == 404
    settings.SALON_DEV_TOOLS = True
    assert anonymous.get("/api/dev/mailbox/").status_code == 200


@pytest.mark.django_db
def test_deactivation_stops_existing_session_immediately(logged_in):
    admin_client, admin = logged_in("admin")
    staff_client, staff = logged_in("receptionist")
    assert staff_client.get("/api/auth/me/").status_code == 200

    response = post(admin_client, f"/api/staff/{staff.pk}/deactivate/")
    assert response.status_code == 200 and response.json()["status"] == "deactivated"

    # Same access cookie, next request: rejected (checked on every request).
    assert staff_client.get("/api/auth/me/").status_code == 401
    # Refresh is revoked too.
    assert post(staff_client, "/api/auth/refresh/").status_code == 401
    # And a new login fails with the generic error.
    assert login(Client(), staff).status_code == 401
    assert AuditLog.objects.filter(action="staff_deactivated", actor=admin, target=staff).exists()

    reactivated = post(admin_client, f"/api/staff/{staff.pk}/reactivate/")
    assert reactivated.status_code == 200 and reactivated.json()["status"] == "active"
    assert login(Client(), staff).status_code == 200
    assert AuditLog.objects.filter(action="staff_reactivated", target=staff).exists()


@pytest.mark.django_db
def test_admin_cannot_deactivate_admins_or_customers(logged_in, make_user):
    admin_client, admin = logged_in("admin")
    customer = make_user(role="customer")
    other_admin = make_user(role="admin")
    for target in (customer, other_admin, admin):
        assert post(admin_client, f"/api/staff/{target.pk}/deactivate/").status_code == 404


@pytest.mark.django_db
def test_reactivating_a_pending_invite_is_refused(logged_in):
    admin_client, _ = logged_in("admin")
    invite(admin_client)
    pending = User.objects.get(email="priya@example.com")
    assert post(admin_client, f"/api/staff/{pending.pk}/reactivate/").status_code == 400


@pytest.mark.django_db
def test_staff_list_and_invites_list_for_admin(logged_in, make_user):
    admin_client, _ = logged_in("admin")
    make_user(role="stylist", email="arun@example.com", full_name="Arun")
    make_user(role="customer", email="guest@example.com")
    invite(admin_client)
    staff = admin_client.get("/api/staff/").json()
    emails = {row["email"] for row in staff}
    assert "arun@example.com" in emails and "priya@example.com" in emails
    assert "guest@example.com" not in emails
    statuses = {row["email"]: row["status"] for row in staff}
    assert statuses["priya@example.com"] == "invited"
    invites = admin_client.get("/api/staff/invites/").json()
    assert invites[0]["email"] == "priya@example.com"
    audit = admin_client.get("/api/audit/").json()
    assert {"invite_sent", "login_success"} <= {row["action"] for row in audit}
    assert all("token" not in str(row["metadata"]).lower() for row in audit)


@pytest.mark.django_db
def test_role_change_is_audited(make_user):
    user = make_user(role="stylist")
    user.role = "receptionist"
    user.save()
    entry = AuditLog.objects.get(action="role_changed", target=user)
    assert entry.metadata == {"old_role": "stylist", "new_role": "receptionist"}


@pytest.mark.django_db
def test_create_admin_command(monkeypatch):
    from django.core.management import CommandError, call_command

    monkeypatch.setenv("SALON_ADMIN_PASSWORD", PASSWORD)
    call_command("create_admin", email="Owner@Example.com", name="Akhil M")
    owner = User.objects.get(email="owner@example.com")
    assert owner.role == "admin" and owner.is_active and owner.password.startswith("argon2")
    with pytest.raises(CommandError):
        call_command("create_admin", email="owner@example.com", name="Again")
    monkeypatch.setenv("SALON_ADMIN_PASSWORD", "123")
    with pytest.raises(CommandError):
        call_command("create_admin", email="weak@example.com", name="Weak")
