"""Shared fixtures for the AIR tests. Every test uses the FAKE provider only, and any attempt to
open an outbound network connection from Python fails the test."""

import http.client
import socket
import urllib.request
from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import ShiftSchedule, User
from air import config
from air.llm import providers
from people.models import CustomerProfile
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    catalogue,
    day_at,
)


@pytest.fixture(autouse=True)
def _fake_provider_and_no_network(monkeypatch):
    monkeypatch.setenv("AI_TEXT_PROVIDER", "fake")
    monkeypatch.setenv("AI_TEXT_MODEL", "fake-model")
    monkeypatch.delenv("AI_TEXT_API_KEY", raising=False)
    providers.FAKE.reset()

    def blocked(*args, **kwargs):
        raise AssertionError("An outbound network request left the adapter")

    monkeypatch.setattr(urllib.request, "urlopen", blocked)
    monkeypatch.setattr(http.client.HTTPConnection, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    yield
    providers.FAKE.reset()


@pytest.fixture
def air_on(db):
    """AIR switched on (cover mode can start). The language-model layer stays OFF."""
    obj = config.get_settings()
    obj.air_enabled = True
    obj.save()
    return obj


@pytest.fixture
def llm_on(air_on):
    obj = config.get_settings()
    obj.master_enabled = True
    obj.save()
    return obj


def new_customer(make_user, name="Priya Customer"):
    user = make_user(role="customer", full_name=name)
    profile = CustomerProfile(user=user)
    profile.set_phone("9876543210")
    profile.save()
    return user


@pytest.fixture
def shopper(make_user):
    return new_customer(make_user)


@pytest.fixture
def other_shopper(make_user):
    return new_customer(make_user, "Other Person")


@pytest.fixture
def reception_user(make_user):
    return make_user(role="receptionist", full_name="Rita Desk")


@pytest.fixture
def admin_user(make_user):
    return make_user(role="admin", full_name="Admin Person")


def shift_around(user, now, *, hours=2):
    """A shift for `user` that covers `now` (Asia/Kolkata)."""
    from air.cover import IST

    local = now.astimezone(IST)
    start = (local - timedelta(hours=hours)).time()
    end = (local + timedelta(hours=hours)).time()
    if local.hour < hours or local.hour + hours >= 24:
        pytest.skip("too close to midnight for this shift helper")
    return ShiftSchedule.objects.create(
        user=user, weekday=local.weekday(), start_time=start, end_time=end
    )


def make_hold(user, cat, *, hour=11, days=3, stylist="asha", key="", session="sess-1", now=None):
    from air import holds

    return holds.create_hold(
        customer=user,
        service=cat["haircut"],
        variant_id=cat["short"].id,
        addon_ids=[],
        stylist=cat[stylist],
        start=day_at(days, hour),
        session_id=session,
        idempotency_key=key,
        now=now,
    )


def contact_of(user):
    return {"name": user.full_name, "email": user.email, "phone": ""}


def submit(user, hold, *, session="sess-1", now=None):
    from air import service

    return service.submit_booking(
        customer=user,
        hold_id=hold.pk,
        contact=contact_of(user),
        session_id=session,
        customer_confirmed=True,
        now=now,
    )


def stylist_says_yes(appt, cat, who="asha"):
    from scheduling import approvals

    return approvals.stylist_accept(appt.pk, profile=cat[who], actor=None)


def payment_token_for(appt):
    from core.models import MailOutbox

    mail = MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).latest("created_at")
    assert f"/customer/pay/{appt.pk}?link=" in mail.link
    return mail.link.split("link=")[1]


def utc_now():
    return timezone.now()


def is_user(obj):
    return isinstance(obj, User)
