"""Task 8b: run_jobs is the single, repeat-safe entry point for timed work."""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts.models import LoginAttempt, PasswordResetToken
from core import jobs
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import awaiting, catalogue, customer, desk  # noqa: F401

pytestmark = pytest.mark.django_db


def run(*args):
    out = StringIO()
    call_command("run_jobs", *args, stdout=out)
    return out.getvalue()


def test_run_jobs_on_an_empty_database_reports_every_step():
    text = run()
    for name, _ in jobs.JOBS:
        assert f"{name}: 0" in text


def test_expired_hold_is_released_once_and_a_second_run_changes_nothing(catalogue, customer, desk):  # noqa: F811
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(
        awaiting_payment_until=timezone.now() - timedelta(minutes=1)
    )
    first = jobs.run_all()
    assert first["expire_unpaid_holds"] == 1
    assert Appointment.objects.get(pk=appt_id).status == AppointmentStatus.PAYMENT_EXPIRED
    second = jobs.run_all()
    assert second["expire_unpaid_holds"] == 0


def test_old_tokens_and_attempts_are_purged_but_recent_ones_stay(make_user):
    user = make_user(role="customer")
    now = timezone.now()
    PasswordResetToken.objects.create(
        user=user, token_hash="old", expires_at=now - timedelta(days=30)
    )
    PasswordResetToken.objects.create(
        user=user, token_hash="new", expires_at=now + timedelta(minutes=30)
    )
    old = LoginAttempt.objects.create(email="a@example.com", succeeded=False)
    LoginAttempt.objects.filter(pk=old.pk).update(created_at=now - timedelta(days=200))
    LoginAttempt.objects.create(email="b@example.com", succeeded=False)
    jobs.run_all()
    assert list(PasswordResetToken.objects.values_list("token_hash", flat=True)) == ["new"]
    assert list(LoginAttempt.objects.values_list("email", flat=True)) == ["b@example.com"]
    assert jobs.run_all()["purge_old_rows"] == 0


def test_one_failing_step_does_not_stop_the_others(monkeypatch):
    def boom(now):
        raise RuntimeError("secret detail must not be printed")

    monkeypatch.setattr(jobs, "JOBS", [("first", boom), ("second", lambda now: 3)])
    results = jobs.run_all()
    assert results == {"first": "failed: RuntimeError", "second": 3}
    with pytest.raises(CommandError):
        run()


def test_only_runs_just_the_named_steps():
    text = run("--only", "campaigns")
    assert "campaigns: 0" in text and "waitlist" not in text
