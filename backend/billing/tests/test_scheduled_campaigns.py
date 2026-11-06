"""Task 5e-2: scheduled campaigns, the run_campaigns command and the "send due now" button."""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.tests.test_marketing import BASE, call, draft, opted_in
from billing.tests.test_pos import admin, catalogue, customer, desk  # noqa: F401  # noqa: F401
from conftest import login
from core.models import MailOutbox
from marketing import campaigns
from marketing.models import Campaign


def at(minutes):
    return (timezone.now() + timedelta(minutes=minutes)).isoformat()


def schedule(admin, camp, minutes=60):
    return call(
        admin[0], "post", f"{BASE}/campaigns/{camp['id']}/schedule/", {"send_at": at(minutes)}
    )


def make_due(camp):
    Campaign.objects.filter(pk=camp["id"]).update(
        scheduled_for=timezone.now() - timedelta(minutes=1)
    )


def test_a_scheduled_campaign_waits_and_cannot_be_edited_or_sent_by_hand(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    r = schedule(admin, camp)
    assert r.status_code == 200 and r.json()["status"] == "scheduled"
    assert r.json()["scheduled_for"]
    assert Campaign.objects.get().status == "scheduled" and not MailOutbox.objects.exists()
    edit = call(admin[0], "patch", f"{BASE}/campaigns/{camp['id']}/", {"subject": "x"})
    assert edit.status_code == 400 and "schedule" in edit.json()["detail"].lower()
    assert AuditLog.objects.filter(action="campaign_scheduled").count() == 1


def test_a_time_in_the_past_or_a_sent_campaign_cannot_be_scheduled(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    assert schedule(admin, camp, minutes=-5).status_code == 400
    assert call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/schedule/", {}).status_code == 400
    call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    assert schedule(admin, camp).status_code == 400


def test_unscheduling_returns_it_to_draft(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    assert call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/unschedule/").status_code == 400
    schedule(admin, camp)
    r = call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/unschedule/")
    assert r.status_code == 200 and r.json()["status"] == "draft"
    assert r.json()["scheduled_for"] is None
    assert (
        call(admin[0], "patch", f"{BASE}/campaigns/{camp['id']}/", {"subject": "x"}).status_code
        == 200
    )
    assert AuditLog.objects.filter(action="campaign_unscheduled").count() == 1


def test_only_due_campaigns_are_sent_and_only_once(admin, make_user):
    yes = opted_in(make_user, "yes@example.com")
    opted_in(make_user, "no@example.com", yes=False)
    later = draft(admin, name="Later")
    soon = draft(admin, name="Soon")
    schedule(admin, later, minutes=600)
    schedule(admin, soon)
    make_due(soon)
    assert campaigns.run_due() == 1
    assert campaigns.run_due() == 0
    (mail,) = MailOutbox.objects.filter(kind="marketing")
    assert mail.to_email == yes.email
    assert Campaign.objects.get(name="Soon").status == "sent"
    assert Campaign.objects.get(name="Later").status == "scheduled"
    entry = AuditLog.objects.get(action="campaign_sent")
    assert entry.metadata["scheduled"] is True and entry.metadata["recipients"] == 1


def test_a_due_campaign_with_nobody_to_reach_is_closed_not_retried(admin, make_user):
    opted_in(make_user, "no@example.com", yes=False)
    camp = draft(admin)
    schedule(admin, camp)
    make_due(camp)
    assert campaigns.run_due() == 1
    row = Campaign.objects.get()
    assert row.status == "sent" and row.recipient_count == 0
    assert campaigns.run_due() == 0 and not MailOutbox.objects.exists()


def test_the_management_command_sends_due_campaigns(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    schedule(admin, camp)
    make_due(camp)
    out = StringIO()
    call_command("run_campaigns", stdout=out)
    assert "1 campaign(s) sent." in out.getvalue()
    out = StringIO()
    call_command("run_campaigns", stdout=out)
    assert "0 campaign(s) sent." in out.getvalue()
    assert MailOutbox.objects.filter(kind="marketing").count() == 1


def test_send_due_now_button_runs_the_same_logic(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    schedule(admin, camp)
    make_due(camp)
    r = call(admin[0], "post", f"{BASE}/campaigns/run-due/")
    assert r.status_code == 200 and r.json()["sent"] == 1
    assert call(admin[0], "post", f"{BASE}/campaigns/run-due/").json()["sent"] == 0


def test_a_hand_sent_scheduled_campaign_cannot_be_sent_twice(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    schedule(admin, camp)
    first = call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    assert first.status_code == 200
    make_due(camp)
    assert campaigns.run_due() == 0
    assert MailOutbox.objects.filter(kind="marketing").count() == 1


def test_roles_that_must_not_schedule_or_run_campaigns(admin, desk, catalogue, customer, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    stylist = Client()
    login(stylist, make_user(role="stylist", email="st@example.com"))
    urls = [
        f"{BASE}/campaigns/{camp['id']}/schedule/",
        f"{BASE}/campaigns/{camp['id']}/unschedule/",
        f"{BASE}/campaigns/run-due/",
    ]
    for client in (desk[0], stylist, customer[0], Client()):
        for url in urls:
            assert call(client, "post", url, {"send_at": at(60)}).status_code in (401, 403)
    assert Campaign.objects.get().status == "draft"
