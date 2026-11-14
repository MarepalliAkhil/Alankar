"""The customer and admin endpoints, the chat answer, and who may use them (allowed AND denied)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from conftest import login
from people.models import Rating
from recommendations import build
from recommendations.models import CustomerPrefs, NotInterested, RecEvent, RecSettings
from recommendations.tests.conftest import customer_with_profile, visit
from scheduling.models import AppointmentStatus
from website.models import Offer

pytestmark = pytest.mark.django_db
MY = "/api/my/recommendations/"
ADMIN = "/api/admin/recommendations/"
J = "application/json"


@pytest.fixture
def ready(crowd, shop, me):
    client, user = me
    visit(user, shop["cut"], 40, shop["asha"])
    visit(user, shop["mani"], 10, shop["meena"])
    build.build()
    return client, user


def test_dashboard_block_lists_reasons_rebook_and_quiet_times(ready, shop):
    client, user = ready
    data = client.get(MY).json()
    assert data["available"] and data["enabled"] and data["notice_seen"] is False
    names = [i["service"]["name"] for i in data["for_you"]]
    assert "Pedi" in names and "Cut" not in names
    pedi = next(i for i in data["for_you"] if i["service"]["name"] == "Pedi")
    assert pedi["reasons"][0] == "Often booked together with Mani"
    assert [r["service"]["name"] for r in data["rebook"]] == ["Cut"]
    assert data["rebook"][0]["slots"] and data["rebook"][0]["stylist"]["name"] == "Asha"
    assert len(data["quiet_times"]) == 3
    shown = RecEvent.objects.filter(user=user, kind="impression", placement="dashboard")
    assert shown.count() == len(data["for_you"])


def test_one_time_notice_switch_and_interests(ready, shop):
    client, user = ready
    seen = client.patch(f"{MY}prefs/", content_type=J, data={"notice_seen": True})
    assert seen.status_code == 200 and seen.json()["notice_seen"] is True
    chosen = client.patch(
        f"{MY}prefs/", content_type=J, data={"interests": [str(shop["colour_cat"].pk)]}
    )
    assert chosen.json()["interests"] == [str(shop["colour_cat"].pk)]
    reasons = [r for i in client.get(MY).json()["for_you"] for r in i["reasons"]]
    assert "Matches your interest: Colour" in reasons
    off = client.patch(f"{MY}prefs/", content_type=J, data={"enabled": False})
    assert off.json()["enabled"] is False
    data = client.get(MY).json()
    assert data["for_you"] == [] and data["rebook"] == [] and data["aftercare"] is None
    entry = AuditLog.objects.get(action="recommendations_consent")
    assert entry.metadata == {"enabled": False}


def test_not_interested_and_undo(ready, shop):
    client, user = ready
    body = {"action": "not_interested", "service": str(shop["pedi"].pk)}
    assert client.post(f"{MY}feedback/", body, content_type=J).status_code == 200
    names = [i["service"]["name"] for i in client.get(MY).json()["for_you"]]
    assert "Pedi" not in names
    listed = client.get(f"{MY}prefs/").json()["not_interested"]
    assert listed == [{"id": str(shop["pedi"].pk), "name": "Pedi"}]
    client.post(
        f"{MY}feedback/", content_type=J, data={"action": "undo", "service": str(shop["pedi"].pk)}
    )
    assert not NotInterested.objects.exists()


def test_rate_your_last_visit_is_first(ready, shop):
    client, user = ready
    appt = visit(user, shop["wash"], 1, shop["asha"])
    Rating.objects.create(appointment=appt, customer=user, stylist=shop["asha"])
    assert client.get(MY).json()["rate_first"]["service"] == "Wash"


def test_admin_switch_exclude_and_pinned_offer(ready, shop, logged_in):
    client, user = ready
    admin, _ = logged_in("admin")
    offer = Offer.objects.create(title="Monsoon glow", description="10% off facials")
    changed = admin.patch(
        f"{ADMIN}settings/",
        content_type=J,
        data={"excluded_services": [str(shop["pedi"].pk)], "pinned_offer": offer.pk},
    )
    assert changed.status_code == 200
    data = client.get(MY).json()
    assert "Pedi" not in [i["service"]["name"] for i in data["for_you"]]
    assert data["pinned_offer"]["title"] == "Monsoon glow"
    admin.patch(f"{ADMIN}settings/", content_type=J, data={"enabled": False})
    data = client.get(MY).json()
    assert data["available"] is False and data["for_you"] == [] and data["pinned_offer"] is None
    assert AuditLog.objects.filter(action="recommendations_changed").count() == 2


def test_admin_results_count_shown_clicked_and_booked_within_seven_days(ready, shop, logged_in):
    client, user = ready
    client.get(MY)
    client.post(
        f"{MY}feedback/", content_type=J, data={"action": "click", "service": str(shop["pedi"].pk)}
    )
    booked = visit(user, shop["pedi"], -3, shop["meena"], status=AppointmentStatus.REQUESTED)
    assert booked.created_at <= timezone.now() + timedelta(seconds=1)
    admin, _ = logged_in("admin")
    data = admin.get(ADMIN).json()
    row = next(r for r in data["metrics"] if r["placement"] == "dashboard")
    assert row["impressions"] >= 1 and row["clicks"] == 1 and row["bookings"] == 1
    assert row["conversion"] == 1.0
    assert data["evaluation"]["status"] in ("not_enough_data", "too_few", "ok")
    rebuilt = admin.post(f"{ADMIN}rebuild/")
    assert rebuilt.status_code == 200 and rebuilt.json()["built_at"]


def test_addon_endpoint(ready, shop):
    client, _ = ready
    start = (timezone.localtime() + timedelta(days=2)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    found = client.get(
        f"{MY}addon/",
        {"service": "mani", "stylist": str(shop["meena"].pk), "start": start.isoformat()},
    ).json()["addon"]
    assert found["service"]["name"] == "Pedi" and found["stylist"]["name"] == "Meena"
    none = client.get(
        f"{MY}addon/",
        {"service": "mani", "stylist": str(shop["asha"].pk), "start": start.isoformat()},
    ).json()
    assert none == {"addon": None}
    bad = client.get(f"{MY}addon/", {"service": "mani", "stylist": "x", "start": "nope"})
    assert bad.status_code == 400


def test_chat_answers_what_do_you_recommend_from_the_customers_own_visits(ready):
    client, user = ready
    answer = client.post(
        "/api/chatbot/ask/", content_type=J, data={"message": "what do you recommend?"}
    ).json()["reply"]
    assert answer["intent"] == "recommend"
    assert "Picked for you" in answer["text"] and "Cut" in answer["text"]
    assert RecEvent.objects.filter(user=user, placement="chat").exists()
    CustomerPrefs.objects.filter(user=user).update(enabled=False)
    again = client.post(
        "/api/chatbot/ask/", content_type=J, data={"message": "what do you recommend?"}
    ).json()["reply"]
    assert "Picked for you" not in again["text"]
    guest = (
        Client()
        .post("/api/chatbot/ask/", content_type=J, data={"message": "what do you recommend?"})
        .json()["reply"]
    )
    assert "Picked for you" not in guest["text"]


def test_nobody_sees_another_customers_recommendations(ready, shop, make_user):
    client, user = ready
    other = customer_with_profile(make_user, "other@example.com")
    other_client = Client()
    login(other_client, other)
    data = other_client.get(MY).json()
    assert data["rebook"] == [] and data["rate_first"] is None
    other_client.post(
        f"{MY}feedback/",
        content_type=J,
        data={"action": "not_interested", "service": str(shop["pedi"].pk)},
    )
    assert not NotInterested.objects.filter(user=user).exists()


MY_CALLS = [
    ("get", MY),
    ("get", f"{MY}prefs/"),
    ("patch", f"{MY}prefs/"),
    ("post", f"{MY}feedback/"),
    ("get", f"{MY}addon/"),
]
ADMIN_CALLS = [("get", ADMIN), ("patch", f"{ADMIN}settings/"), ("post", f"{ADMIN}rebuild/")]


@pytest.mark.parametrize("role", ["receptionist", "stylist", "admin"])
@pytest.mark.parametrize("method,url", MY_CALLS)
def test_staff_cannot_use_customer_recommendations(logged_in, role, method, url):
    client, _ = logged_in(role)
    assert getattr(client, method)(url).status_code == 403


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
@pytest.mark.parametrize("method,url", ADMIN_CALLS)
def test_only_the_admin_sees_and_changes_recommendation_settings(logged_in, role, method, url):
    client, _ = logged_in(role)
    assert getattr(client, method)(url).status_code == 403
    assert RecSettings.objects.filter(enabled=False).count() == 0


@pytest.mark.parametrize("method,url", MY_CALLS + ADMIN_CALLS)
def test_guests_are_turned_away(method, url, db):
    assert getattr(Client(), method)(url).status_code in (401, 403)
