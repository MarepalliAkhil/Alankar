"""Task 5b: the admin's business settings. Every change is audited with old and new values and
reaches the places that use it (public site, booking rules, billing, pay bands, idle limit)."""

import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.test import Client

from accounts import work
from accounts.models import AuditLog
from people import pay

URL = "/api/admin/settings/"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in, db):
    call_command("seed_demo")
    return logged_in("admin")


def audits(section=None):
    rows = AuditLog.objects.filter(action="settings_changed").order_by("-created_at")
    return [r for r in rows if section is None or r.metadata["section"] == section]


def test_reads_the_current_settings(admin):
    data = call(admin[0], "get", URL).json()
    assert data["booking"] == {
        "free_cancel_hours": 24,
        "hold_hours": 6,
        "waitlist_offer_minutes": 15,
    }
    assert data["billing"]["discount_cap_percent"] == 20
    assert data["security"]["idle_minutes"] == 15
    assert data["shop"]["phone"]
    assert data["rating"]["bands"][0] == {"min_average": "4.50", "multiplier": "1.20"}


def test_shop_details_show_on_the_public_site_at_once_and_are_audited(admin):
    old_phone = call(admin[0], "get", URL).json()["shop"]["phone"]
    done = call(
        admin[0],
        "patch",
        URL,
        {"shop": {"phone": "+91 98765 43210", "gst_number": "37abcde1234f1z5"}},
    )
    assert done.status_code == 200, done.content
    assert done.json()["shop"]["gst_number"] == "37ABCDE1234F1Z5"
    site = Client().get("/api/public/site/").json()
    assert site["contact"]["phone"] == "+91 98765 43210"
    assert site["contact"]["gst_number"] == "37ABCDE1234F1Z5"
    (entry,) = audits("shop")
    assert entry.metadata["changes"]["phone"] == [old_phone, "+91 98765 43210"]
    assert entry.metadata["changes"]["gst_number"] == ["", "37ABCDE1234F1Z5"]


def test_a_bad_gst_number_is_refused(admin):
    response = call(admin[0], "patch", URL, {"shop": {"gst_number": "12345"}})
    assert response.status_code == 400 and audits() == []


def test_unchanged_settings_write_no_audit_entry(admin):
    current = call(admin[0], "get", URL).json()
    call(admin[0], "patch", URL, {"booking": current["booking"], "shop": current["shop"]})
    assert audits() == []


def test_opening_hours_drive_booking_and_the_public_list(admin):
    weekly = {"mon": None, "sun": ["11:00", "17:00"]}
    done = call(admin[0], "patch", URL, {"hours": {"weekly_hours": weekly}})
    assert done.status_code == 200
    saved = done.json()["hours"]["weekly_hours"]
    assert saved["mon"] is None and saved["sun"] == ["11:00", "17:00"]
    assert saved["tue"] == ["10:00", "20:00"]
    rows = Client().get("/api/public/site/").json()["hours"]
    assert {"days": "Monday", "open": "Closed", "close": "", "closed": True} in rows
    assert {"days": "Tuesday – Saturday", "open": "10:00", "close": "20:00"} in rows
    assert {"days": "Sunday", "open": "11:00", "close": "17:00"} in rows
    (entry,) = audits("hours")
    assert entry.metadata["changes"]["weekly_hours"][0]["mon"] == ["10:00", "20:00"]
    bad = call(admin[0], "patch", URL, {"hours": {"weekly_hours": {"tue": ["18:00", "09:00"]}}})
    assert bad.status_code == 400


def test_cancellation_window_and_payment_hold_are_used_by_the_booking_rules(admin):
    done = call(admin[0], "patch", URL, {"booking": {"free_cancel_hours": 48, "hold_hours": 3}})
    assert done.status_code == 200
    from website.content import booking_settings

    rules = booking_settings()
    assert rules["free_cancel_hours"] == 48 and rules["hold_hours"] == 3
    assert rules["deposit_percent"] == 100  # other rules are left alone
    (entry,) = audits("booking")
    assert entry.metadata["changes"] == {
        "free_cancel_hours": [24, 48],
        "hold_hours": [6, 3],
    }
    for bad in ({"hold_hours": 0}, {"free_cancel_hours": -1}, {"hold_hours": 500}):
        assert call(admin[0], "patch", URL, {"booking": bad}).status_code == 400


def test_discount_cap_is_shared_with_the_desk(admin, logged_in):
    call(admin[0], "patch", URL, {"billing": {"discount_cap_percent": 5}})
    desk, _ = logged_in("receptionist")
    assert call(desk, "get", "/api/settings/pos/").json()["discount_cap_percent"] == 5
    (entry,) = audits("billing")
    assert entry.metadata["changes"]["discount_cap_percent"] == [20, 5]
    assert (
        call(admin[0], "patch", URL, {"billing": {"discount_cap_percent": 101}}).status_code == 400
    )


def test_idle_timeout_changes_the_receptionist_limit(admin):
    assert work.idle_limit() == timedelta(minutes=15)
    assert call(admin[0], "patch", URL, {"security": {"idle_minutes": 30}}).status_code == 200
    assert work.idle_limit() == timedelta(minutes=30)
    assert audits("security")[0].metadata["changes"]["idle_minutes"] == [15, 30]
    for bad in (1, 4, 500):
        assert call(admin[0], "patch", URL, {"security": {"idle_minutes": bad}}).status_code == 400


def test_rating_bands_change_the_pay_multipliers(admin):
    bands = [
        {"min_average": "4.80", "multiplier": "1.50"},
        {"min_average": "4.0", "multiplier": "1.00"},
        {"min_average": "0", "multiplier": "0.70"},
    ]
    done = call(admin[0], "patch", URL, {"rating": {"bands": bands, "min_ratings": 3}})
    assert done.status_code == 200, done.content
    assert pay.multiplier_for(Decimal("4.9")) == Decimal("1.50")
    assert pay.multiplier_for(Decimal("4.2")) == Decimal("1.00")
    assert pay.multiplier_for(Decimal("2.0")) == Decimal("0.70")
    changes = audits("rating")[0].metadata["changes"]
    assert changes["min_ratings"] == [5, 3]
    assert changes["bands"][0][0] == {"min_average": "4.50", "multiplier": "1.20"}
    assert changes["bands"][1][0] == {"min_average": "4.80", "multiplier": "1.50"}


@pytest.mark.parametrize(
    "bands",
    [
        [],
        [{"min_average": "4", "multiplier": "1"}],  # does not reach 0
        [
            {"min_average": "3", "multiplier": "1"},
            {"min_average": "4", "multiplier": "1.1"},
            {"min_average": "0", "multiplier": "0.8"},
        ],  # not highest first
        [
            {"min_average": "4", "multiplier": "1"},
            {"min_average": "4", "multiplier": "1.1"},
            {"min_average": "0", "multiplier": "0.8"},
        ],  # repeated average
        [{"min_average": "0", "multiplier": "9"}],  # multiplier out of range
    ],
)
def test_bad_rating_bands_are_refused(admin, bands):
    response = call(admin[0], "patch", URL, {"rating": {"bands": bands}})
    assert response.status_code == 400 and audits() == []


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
@pytest.mark.parametrize("method", ["get", "patch"])
def test_only_the_admin_reaches_the_settings(logged_in, role, method):
    client, _ = logged_in(role)
    assert call(client, method, URL, {"shop": {"phone": "1"}}).status_code == 403


@pytest.mark.parametrize("method", ["get", "patch"])
def test_guests_cannot_reach_the_settings(client, method):
    assert call(client, method, URL, {}).status_code in (401, 403)
