"""Task 8d: reset_demo is hard to run by accident; the demo story is fictional and consistent."""

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from accounts.models import User
from billing.models import Invoice
from core import demo, demo_story, integrity
from core.models import MailOutbox
from people.models import PayrollRun, Rating
from scheduling.models import Appointment

pytestmark = pytest.mark.django_db


def test_reset_demo_needs_yes():
    with pytest.raises(CommandError, match="--yes"):
        call_command("reset_demo", stdout=StringIO())


def test_reset_demo_refuses_a_database_that_does_not_look_like_a_demo():
    # The test database is called test_<name>, which has no "demo" in it.
    demo.ensure_user("customer", "keep@demo.example.com", "Keep Me", "x-Pass-2026!")
    with pytest.raises(CommandError, match="does not look like a demo database"):
        call_command("reset_demo", "--yes", stdout=StringIO())
    with pytest.raises(CommandError, match="does not look like a demo database"):
        call_command("reset_demo", "--yes", "--really-wipe", "some_other_name", stdout=StringIO())
    assert User.objects.filter(email="keep@demo.example.com").exists()  # nothing was wiped


def test_the_demo_story_is_fictional_consistent_and_healthy(monkeypatch):
    monkeypatch.setattr(demo_story, "HISTORY_DAYS", 45)
    call_command("seed_demo", verbosity=0)
    demo_story.build(write=lambda *_: None)

    # Fictional: every person and every email address is at the reserved example.com domain.
    assert not User.objects.exclude(email__endswith="@demo.example.com").exists()
    assert not Invoice.objects.exclude(customer_email__endswith="@demo.example.com").exists()
    assert not MailOutbox.objects.exclude(to_email__endswith="@demo.example.com").exists()
    # A real history: billed visits, ratings, a paid payroll run for last month.
    assert Invoice.objects.count() > 20
    assert Rating.objects.filter(status="submitted").count() > 10
    assert PayrollRun.objects.filter(status="paid").count() == 1
    # Things are dated across the weeks, and the desk has live work.
    first, last = (
        Invoice.objects.order_by("issued_at").first(),
        Invoice.objects.order_by("-issued_at").first(),
    )
    assert (last.issued_at - first.issued_at).days >= 30
    assert Appointment.objects.filter(status="requested").exists()
    # The same checks the live system runs find nothing wrong.
    assert integrity.run_checks() == []
    # No demo email was queued for real delivery.
    assert not MailOutbox.objects.filter(status="queued").exists()
    # Logins work with the documented password.
    assert User.objects.get(email="owner@demo.example.com").check_password(demo.DEMO_PASSWORD)
