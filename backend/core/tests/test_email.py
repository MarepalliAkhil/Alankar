"""Real email (SMTP) behaviour: configured, failing, and not configured."""

from urllib.parse import parse_qs, urlparse

import pytest
from django.core import mail
from django.core.mail.backends.base import BaseEmailBackend
from django.core.management import CommandError, call_command
from django.test import Client

from accounts.models import AuditLog, StaffInvite, User
from conftest import login
from core.models import MailOutbox

NEW_PASSWORD = "Another-Strong-Pass-77"


class FailingBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        raise ConnectionRefusedError("smtp down")


def post(client, url, data=None):
    return client.post(url, data or {}, content_type="application/json")


def admin_client(make_user) -> Client:
    admin = make_user(role="admin", email="owner@example.com", full_name="Akhil")
    client = Client()
    assert login(client, admin).status_code == 200
    return client


def invite(client, email="priya@example.com"):
    return post(
        client,
        "/api/staff/invites/",
        {"email": email, "role": "stylist", "full_name": "Priya Sharma"},
    )


def token_of(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


@pytest.fixture
def smtp(settings):
    settings.SALON_SMTP_CONFIGURED = True
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.SALON_DEV_TOOLS = False  # production-like: links work because SMTP is set
    return settings


# --- SMTP configured ------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_invite_is_emailed_after_commit_and_link_works(smtp, make_user):
    client = admin_client(make_user)
    response = invite(client)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "sent" and body["delivery"] == "email"
    assert "link" not in body  # never exposed when the email went out

    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["priya@example.com"]
    assert "invited" in message.subject.lower()
    html = message.alternatives[0][0]
    assert "Set your password" in html
    copy = MailOutbox.objects.get(kind="invite")
    assert copy.status == "sent" and copy.sent_at is not None  # copy always kept
    assert StaffInvite.objects.get().email_status == "sent"

    token = token_of(copy.link)
    assert token in message.body
    anonymous = Client()
    assert anonymous.get(f"/api/auth/invite/?token={token}").status_code == 200
    accepted = post(
        anonymous, "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD}
    )
    assert accepted.status_code == 200
    assert anonymous.get("/api/dev/mailbox/").status_code == 404  # still dev-only


@pytest.mark.django_db(transaction=True)
def test_password_reset_is_emailed(smtp, make_user):
    make_user(role="customer", email="c@example.com")
    response = post(Client(), "/api/auth/password-reset/", {"email": "c@example.com"})
    assert response.status_code == 200
    assert len(mail.outbox) == 1 and "reset" in mail.outbox[0].subject.lower()
    assert MailOutbox.objects.get(kind="password_reset").status == "sent"


@pytest.mark.django_db(transaction=True)
def test_send_test_email_command(smtp):
    call_command("send_test_email", to="check@example.com")
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["check@example.com"]
    assert MailOutbox.objects.get(kind="test").status == "sent"
    with pytest.raises(CommandError):
        call_command("send_test_email", to="not-an-email")


# --- SMTP failure ---------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_failed_invite_email_keeps_invite_valid_and_offers_copy_link(smtp, make_user):
    smtp.EMAIL_BACKEND = f"{__name__}.FailingBackend"
    client = admin_client(make_user)
    response = invite(client)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "failed"
    assert body["detail"] == "Email could not be sent. Copy the link instead."
    token = token_of(body["link"])

    entry = AuditLog.objects.get(action="email_failed")
    assert entry.metadata == {"kind": "invite", "error": "ConnectionRefusedError"}
    for log in AuditLog.objects.all():
        assert token not in str(log.metadata) and token not in log.email
    copy = MailOutbox.objects.get(kind="invite")
    assert copy.status == "failed" and token not in copy.error

    # The invite is still valid: the copied link works.
    staff = Client()
    assert staff.get(f"/api/auth/invite/?token={token}").status_code == 200

    # Invite list shows "failed"; resend issues a new link and the old one stops working.
    listed = client.get("/api/staff/invites/").json()
    assert listed[0]["status"] == "failed"
    resent = post(client, f"/api/staff/invites/{listed[0]['id']}/resend/").json()
    assert resent["status"] == "failed" and resent["send_count"] == 2
    new_token = token_of(resent["link"])
    assert new_token != token
    assert staff.get(f"/api/auth/invite/?token={token}").status_code == 404
    assert staff.get(f"/api/auth/invite/?token={new_token}").status_code == 200
    assert AuditLog.objects.filter(action="invite_resent").exists()


@pytest.mark.django_db(transaction=True)
def test_resend_after_smtp_recovers_marks_sent(smtp, make_user):
    smtp.EMAIL_BACKEND = f"{__name__}.FailingBackend"
    client = admin_client(make_user)
    invite_id = invite(client).json()["id"]
    smtp.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    resent = post(client, f"/api/staff/invites/{invite_id}/resend/")
    assert resent.status_code == 200
    assert resent.json()["status"] == "sent" and "link" not in resent.json()
    assert len(mail.outbox) == 1


@pytest.mark.django_db(transaction=True)
def test_failed_reset_email_is_audited_but_response_stays_generic(smtp, make_user):
    smtp.EMAIL_BACKEND = f"{__name__}.FailingBackend"
    make_user(role="customer", email="c@example.com")
    known = post(Client(), "/api/auth/password-reset/", {"email": "c@example.com"})
    unknown = post(Client(), "/api/auth/password-reset/", {"email": "x@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.content == unknown.content
    assert AuditLog.objects.get(action="email_failed").metadata["kind"] == "password_reset"


@pytest.mark.django_db(transaction=True)
def test_send_test_email_reports_failure(smtp):
    smtp.EMAIL_BACKEND = f"{__name__}.FailingBackend"
    with pytest.raises(CommandError, match="ConnectionRefusedError"):
        call_command("send_test_email", to="check@example.com")


# --- No SMTP configured (behaves as in Task 1) -----------------------------------------


@pytest.mark.django_db(transaction=True)
def test_without_smtp_emails_are_simulated(make_user, settings):
    settings.SALON_DEV_TOOLS = True
    client = admin_client(make_user)
    body = invite(client).json()
    assert body["status"] == "sent" and body["delivery"] == "dev_mailbox"
    assert "link" not in body
    assert len(mail.outbox) == 0
    assert MailOutbox.objects.get(kind="invite").status == "simulated"
    assert Client().get("/api/dev/mailbox/").status_code == 200


@pytest.mark.django_db
def test_without_smtp_or_debug_links_are_404(make_user, settings):
    client = admin_client(make_user)
    invite(client)
    token = token_of(MailOutbox.objects.get(kind="invite").link)
    settings.SALON_DEV_TOOLS = False
    assert Client().get(f"/api/auth/invite/?token={token}").status_code == 404


@pytest.mark.django_db
def test_send_test_email_without_smtp_explains(settings):
    with pytest.raises(CommandError, match="not configured"):
        call_command("send_test_email", to="check@example.com")


@pytest.mark.django_db
def test_resend_refused_for_accepted_invite(make_user, settings):
    settings.SALON_DEV_TOOLS = True
    client = admin_client(make_user)
    invite_id = invite(client).json()["id"]
    token = token_of(MailOutbox.objects.get(kind="invite").link)
    post(Client(), "/api/auth/invite/accept/", {"token": token, "password": NEW_PASSWORD})
    assert post(client, f"/api/staff/invites/{invite_id}/resend/").status_code == 400
    assert User.objects.get(email="priya@example.com").check_password(NEW_PASSWORD)
