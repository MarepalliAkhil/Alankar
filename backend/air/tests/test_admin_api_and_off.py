"""Admin endpoints, audited settings, and proof that with everything off nothing changes."""

import json

import pytest
from django.core.management import call_command
from django.test import Client

from accounts.models import AuditLog
from air import config, cover
from air.models import AIActionLog, AirRequestState, CoverPeriod, SlotHold
from conftest import login
from core import jobs
from scheduling.models import Appointment
from scheduling.tests.test_booking import (  # noqa: F401
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
)


def admin_client(make_user):
    user = make_user(role="admin")
    client = Client()
    assert login(client, user).status_code == 200
    return client, user


def patch(client, body):
    return client.patch("/api/admin/air/settings/", body, content_type="application/json")


# ---------------------------------------------------------------- settings


@pytest.mark.django_db
def test_defaults_are_all_off_with_the_documented_values(make_user):
    client, _ = admin_client(make_user)
    data = client.get("/api/admin/air/settings/").json()
    assert data["master_enabled"] is False and data["air_enabled"] is False
    assert data["stylist_timeout_minutes"] == 15 and data["payment_link_minutes"] == 45
    assert data["key_configured"] is False and data["provider"] == "fake"
    assert "AI_TEXT_API_KEY" not in json.dumps(data)


@pytest.mark.django_db
def test_changing_settings_is_validated_and_audited(make_user, monkeypatch):
    monkeypatch.setenv("AI_TEXT_API_KEY", "sk-test-do-not-leak")
    client, admin = admin_client(make_user)
    response = patch(client, {"air_enabled": True, "stylist_timeout_minutes": 20})
    assert response.status_code == 200
    body = response.json()
    assert body["air_enabled"] is True and body["stylist_timeout_minutes"] == 20
    assert body["key_configured"] is True  # yes / no only
    assert "sk-test-do-not-leak" not in response.content.decode()
    row = AuditLog.objects.get(action="air_settings_changed")
    assert row.actor_id == admin.pk
    assert row.metadata["changes"]["stylist_timeout_minutes"] == {"from": "15", "to": "20"}
    assert "sk-test" not in json.dumps(row.metadata)
    # Nothing changed -> nothing audited.
    patch(client, {"stylist_timeout_minutes": 20})
    assert AuditLog.objects.filter(action="air_settings_changed").count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "body",
    [
        {"stylist_timeout_minutes": 0},
        {"stylist_timeout_minutes": "15"},
        {"payment_link_minutes": 100000},
        {"master_enabled": "yes"},
        {"monthly_spend_cap_rupees": "lots"},
        {"monthly_spend_cap_rupees": "-5"},
        {"api_key": "sk-nope"},
        {"ai_text_api_key": "sk-nope"},
        {"provider": "anthropic"},
    ],
)
def test_bad_or_unknown_settings_are_refused_and_a_key_cannot_be_stored(make_user, body):
    client, _ = admin_client(make_user)
    assert patch(client, body).status_code == 400
    assert AuditLog.objects.filter(action="air_settings_changed").count() == 0
    assert "sk-nope" not in json.dumps(client.get("/api/admin/air/settings/").json())


@pytest.mark.django_db
def test_turning_air_on_starts_cover_straight_away(make_user):
    client, _ = admin_client(make_user)
    assert client.get("/api/admin/air/cover/").json()["active"] is False
    patch(client, {"air_enabled": True})
    assert client.get("/api/admin/air/cover/").json()["active"] is True
    patch(client, {"air_enabled": False})
    assert client.get("/api/admin/air/cover/").json()["active"] is False
    assert CoverPeriod.objects.filter(ended_at__isnull=False).count() == 1


# ---------------------------------------------------------------- cover control


@pytest.mark.django_db
def test_forcing_cover_needs_a_reason_and_is_audited(make_user):
    client, admin = admin_client(make_user)
    patch(client, {"air_enabled": True})
    post = lambda body: client.post(  # noqa: E731
        "/api/admin/air/cover/", body, content_type="application/json"
    )
    assert post({"mode": "off", "reason": ""}).status_code == 400
    assert post({"mode": "off", "reason": "x"}).status_code == 400
    assert post({"mode": "sideways", "reason": "please"}).status_code == 400
    response = post({"mode": "off", "reason": "Manager is covering the desk"})
    assert response.status_code == 200 and response.json()["active"] is False
    row = AuditLog.objects.get(action="air_cover_forced")
    assert row.metadata["reason"] == "Manager is covering the desk" and row.actor_id == admin.pk
    assert post({"mode": "auto", "reason": "Normal rules again"}).json()["active"] is True


# ---------------------------------------------------------------- the log endpoint


@pytest.mark.django_db
def test_the_log_endpoint_is_read_only_and_hides_nothing_secret(make_user, shopper, catalogue):
    from air.tests.conftest import make_hold

    client, _ = admin_client(make_user)
    patch(client, {"air_enabled": True})
    make_hold(shopper, catalogue)
    rows = client.get("/api/admin/air/log/").json()["results"]
    assert rows and rows[0]["action_type"] == "hold_slot" and rows[0]["actor"] == "air"
    assert client.get("/api/admin/air/log/?action_type=nothing").json()["results"] == []
    assert client.post("/api/admin/air/log/", {}, content_type="application/json").status_code in (
        403,
        405,
    )
    assert shopper.email not in json.dumps(rows)


# ---------------------------------------------------------------- everything off = as before


@pytest.mark.django_db
def test_with_everything_off_a_normal_booking_works_exactly_as_before(catalogue, customer, desk):
    appt_id = awaiting(customer[0], desk[0], catalogue)
    token = payment_token(appt_id)
    assert pay(customer[0], appt_id, link=token).status_code == 200
    assert Appointment.objects.get(pk=appt_id).status == "scheduled"
    # AIR left no trace anywhere.
    assert SlotHold.objects.count() == 0 and AirRequestState.objects.count() == 0
    assert AIActionLog.objects.count() == 0 and CoverPeriod.objects.count() == 0
    from billing.models import PaymentLink

    assert not PaymentLink.objects.filter(sent_by_air=True).exists()
    assert cover.is_active() is False
    assert config.get_settings().air_enabled is False


@pytest.mark.django_db
def test_the_scheduler_job_and_command_are_harmless_when_everything_is_off(capsys):
    assert "air_expire_holds" in [name for name, _ in jobs.JOBS]
    results = jobs.run_all(only=["air_expire_holds"])
    assert results == {"air_expire_holds": 0}
    call_command("expire_holds")
    assert "cover active: False" in capsys.readouterr().out
    assert AIActionLog.objects.count() == 0 and CoverPeriod.objects.count() == 0


@pytest.mark.django_db
def test_the_expire_holds_command_ends_overdue_holds(air_on, shopper, catalogue, capsys):
    from datetime import timedelta

    from django.utils import timezone

    from air.tests.conftest import make_hold

    hold = make_hold(shopper, catalogue)
    SlotHold.objects.filter(pk=hold.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    call_command("expire_holds")
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.EXPIRED
    assert "cover active: True" in capsys.readouterr().out
