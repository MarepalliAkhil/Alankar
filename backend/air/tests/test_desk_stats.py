"""AIR Task 3: statistics, needs-you claim/resolve, Undo, phone reveal, briefing and permissions."""

from contextlib import contextmanager
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from unittest import mock

import pytest
from conftest import login
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, LoginAttempt, WorkSession
from air import actionlog, briefing, config, holds, lifecycle, stats
from air.llm.providers import FAKE
from air.models import AIActionLog, AirRequestState, NeedsYouState, SlotHold
from air.tests.conftest import make_hold, new_customer, payment_token_for, stylist_says_yes, submit
from billing.models import PaymentLink
from scheduling import approvals, booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
UTC = dt_timezone.utc


@contextmanager
def at(moment):
    """Rows created inside get this creation time (auto_now_add reads timezone.now)."""
    with mock.patch("django.utils.timezone.now", return_value=moment):
        yield


def signed_in(user):
    client = Client()
    assert login(client, user).status_code == 200
    return client


@pytest.fixture
def day(air_on, make_user, catalogue):
    """Five AIR requests: paid, declined, stylist timed out, link expired, still waiting."""
    paid_c = new_customer(make_user, "Asha Paid")
    declined_c = new_customer(make_user, "Bina Declined")
    timeout_c = new_customer(make_user, "Chitra Timeout")
    expired_c = new_customer(make_user, "Divya Expired")
    waiting_c = new_customer(make_user, "Esha Waiting")

    paid = submit(paid_c, make_hold(paid_c, catalogue, hour=10, session="s1"), session="s1")
    stylist_says_yes(paid, catalogue)
    lifecycle.sync_request(paid.pk)
    booking.pay(paid.pk, customer=paid_c, token=payment_token_for(paid), succeed=True)
    lifecycle.sync_request(paid.pk)

    declined = submit(
        declined_c, make_hold(declined_c, catalogue, hour=12, session="s2"), session="s2"
    )
    approvals.stylist_decline(
        declined.pk, profile=catalogue["asha"], actor=None, reason="personal_plans"
    )
    lifecycle.sync_request(declined.pk)

    timed = submit(timeout_c, make_hold(timeout_c, catalogue, hour=14, session="s3"), session="s3")
    expired = submit(
        expired_c, make_hold(expired_c, catalogue, hour=16, session="s4"), session="s4"
    )
    stylist_says_yes(expired, catalogue)
    lifecycle.sync_request(expired.pk)
    holds.expire_due(timezone.now() + timedelta(minutes=46))  # timeout + unpaid link

    waiting = submit(
        waiting_c, make_hold(waiting_c, catalogue, hour=17, session="s5"), session="s5"
    )
    return {
        "paid": paid,
        "declined": declined,
        "timed": timed,
        "expired": expired,
        "waiting": waiting,
        "customers": [paid_c, declined_c, timeout_c, expired_c, waiting_c],
    }


def today(user, minutes=1):
    return stats.window_for("today", user, timezone.now() + timedelta(minutes=minutes))


# ---------------------------------------------------------------- counts and the funnel


@pytest.mark.django_db
def test_counts_and_funnel_arithmetic(day, reception_user):
    for appt, status in (
        ("paid", S.SCHEDULED),
        ("declined", S.DECLINED_BY_STYLIST),
        ("timed", S.EXPIRED),
        ("expired", S.PAYMENT_EXPIRED),
        ("waiting", S.REQUESTED),
    ):
        day[appt].refresh_from_db()
        assert day[appt].status == status, appt
    c = stats.counts(today(reception_user))
    assert c["booking_requests"] == 5
    assert c["reception_accepted"] == 5  # cover was on: AIR took the desk side of each
    assert c["stylist_accepted"] == 2 and c["declined"] == 1 and c["timed_out"] == 1
    assert c["awaiting_stylist"] == 1
    assert (
        c["stylist_accepted"] + c["declined"] + c["timed_out"] + c["awaiting_stylist"]
        == c["booking_requests"]
    )
    assert c["links_sent"] == 2 and c["links_paid"] == 1 and c["links_expired"] == 1
    assert c["links_pending"] == 0 and c["confirmed"] == 1
    data = stats.build(today(reception_user))
    funnel = [r["count"] for r in data["tables"]["funnel"]["rows"]]
    assert funnel == [5, 5, 2, 2, 1] and funnel == sorted(funnel, reverse=True)
    lost = {r["step"]: r["count"] for r in data["tables"]["lost"]["rows"]}
    assert lost == {"Declined": 1, "Stylist did not answer in time": 1, "Payment link expired": 1}
    links = data["tables"]["links"]
    assert sum(r["count"] for r in links["rows"]) == links["totals"]["count"] == 2


@pytest.mark.django_db
def test_hourly_totals_match_the_log_and_stylist_rows_add_up(day, reception_user):
    data = stats.build(today(reception_user))
    hourly = data["tables"]["hourly"]
    actions = AIActionLog.objects.exclude(action_type__in=stats.NOT_ACTIONS).count()
    assert hourly["totals"]["total"] == actions > 0
    assert len(hourly["rows"]) == 24
    for row in hourly["rows"]:
        assert row["total"] == sum(row[t] for t in stats.TYPES)
    asha = next(r for r in data["tables"]["stylists"]["rows"] if r["name"] == "Asha")
    assert asha["accepted"] == 2 and asha["declined"] == 1 and asha["timed_out"] == 1
    assert asha["waiting"] == 1 and asha["total"] == 5


@pytest.mark.django_db
def test_customers_panel_lists_who_air_dealt_with(day, reception_user):
    rows = stats.build(today(reception_user))["customers"]
    names = {r["name"] for r in rows}
    assert {"Asha Paid", "Bina Declined", "Esha Waiting"} <= names
    paid = next(r for r in rows if r["name"] == "Asha Paid")
    assert paid["bookings"] == 1 and any("Sent a booking request" in d for d in paid["did"])
    assert "9876543210" not in str(rows)


# ---------------------------------------------------------------- ranges, IST and comparison


def test_ist_midnight_and_ranges():
    now = datetime(2026, 11, 7, 18, 31, tzinfo=UTC)  # 00:01 on 8 Nov in India
    assert stats.ist_midnight(now) == datetime(2026, 11, 7, 18, 30, tzinfo=UTC)
    user = mock.Mock(email="x@example.com")
    w = stats.window_for("today", user, now)
    assert w.start == datetime(2026, 11, 7, 18, 30, tzinfo=UTC) and w.end == now
    w7 = stats.window_for("7d", user, now)
    assert w7.start == datetime(2026, 11, 1, 18, 30, tzinfo=UTC)
    w30 = stats.window_for("30d", user, now)
    assert w30.start == datetime(2026, 10, 9, 18, 30, tzinfo=UTC)
    assert w7.previous.end == w7.start and w7.previous.start == w7.start - (w7.end - w7.start)
    with pytest.raises(stats.StatsError):
        stats.window_for("year", user, now)


@pytest.mark.django_db
def test_rows_fall_on_the_right_side_of_ist_midnight(reception_user):
    late = datetime(2026, 11, 7, 18, 29, tzinfo=UTC)  # 23:59 on 7 Nov IST
    early = datetime(2026, 11, 7, 18, 31, tzinfo=UTC)  # 00:01 on 8 Nov IST
    with at(late):
        actionlog.write("conversation", session_id="a", now=late)
    with at(early):
        actionlog.write("conversation", session_id="b", now=early)
        actionlog.write("callback_note", status=AIActionLog.Status.HANDED_OFF, now=early)
    now = datetime(2026, 11, 8, 4, 30, tzinfo=UTC)  # 10:00 IST
    w = stats.window_for("today", reception_user, now)
    assert stats.counts(w)["conversations"] == 1
    assert stats.counts(w.previous)["conversations"] == 1
    hourly = stats.hourly(w)
    assert hourly[0]["hour"] == "00:00" and hourly[0]["handoff"] == 1


@pytest.mark.django_db
def test_previous_period_comparison(reception_user):
    now = timezone.now()
    w = stats.window_for("today", reception_user, now)
    before = w.start - timedelta(minutes=1)
    with at(before):
        for i in range(2):
            actionlog.write("conversation", session_id=f"p{i}", now=before)
    for i in range(3):
        actionlog.write("conversation", session_id=f"c{i}", now=now)
    actionlog.write("callback_note", status=AIActionLog.Status.HANDED_OFF, now=now)
    kpis = stats.build(stats.window_for("today", reception_user, now + timedelta(seconds=5)))[
        "kpis"
    ]
    assert kpis["conversations"] == {"value": 3, "previous": 2, "change_pct": 50.0}
    assert kpis["handed_off"]["value"] == 1 and kpis["handed_off"]["change_pct"] is None
    assert kpis["handover_rate"]["value"] == 33.3


@pytest.mark.django_db
def test_since_last_session_uses_the_last_finished_work_session(reception_user, admin_user):
    now = timezone.now()
    ended = now - timedelta(hours=5)
    WorkSession.objects.create(
        user=reception_user,
        started_at=ended - timedelta(hours=8),
        last_seen_at=ended,
        ended_at=ended,
        end_reason="logout",
    )
    assert stats.window_for("since_last", reception_user, now).start == ended
    # the admin has no work sessions: the sign-in before this one
    first = now - timedelta(days=2)
    with at(first):
        LoginAttempt.objects.create(email=admin_user.email, succeeded=True)
    LoginAttempt.objects.create(email=admin_user.email, succeeded=True)
    later = timezone.now() + timedelta(seconds=1)
    assert stats.window_for("since_last", admin_user, later).start == first
    # never more than 30 days back
    old = now - timedelta(days=90)
    WorkSession.objects.filter(user=reception_user).delete()
    WorkSession.objects.create(
        user=reception_user, started_at=old, last_seen_at=old, ended_at=old, end_reason="logout"
    )
    assert stats.window_for("since_last", reception_user, now).start == now - timedelta(days=30)


# ---------------------------------------------------------------- needs you


@pytest.mark.django_db
def test_needs_you_lists_waiting_and_expired_items(day):
    items = stats.needs_you()
    kinds = {(i["kind"], i["customer"]) for i in items}
    assert ("awaiting_stylist", "Esha Waiting") in kinds
    assert ("expired_link", "Divya Expired") in kinds


@pytest.mark.django_db
def test_claim_is_one_person_at_a_time_and_resolve_clears_the_item(day, make_user, admin_user):
    rita = make_user(role="receptionist", full_name="Rita Desk")
    ravi = make_user(role="receptionist", full_name="Ravi Desk")
    ref = str(day["waiting"].pk)
    body = {"kind": "awaiting_stylist", "ref": ref}
    first, second = signed_in(rita), signed_in(ravi)
    r = first.post("/api/air/desk/needs/claim/", body, content_type="application/json")
    assert r.status_code == 200 and r.json()["claimed_by"] == "Rita Desk"
    assert AirRequestState.objects.get(appointment=day["waiting"]).handled_by == "human"
    r = second.post("/api/air/desk/needs/claim/", body, content_type="application/json")
    assert r.status_code == 409 and "Rita Desk" in r.json()["detail"]
    r = second.post("/api/air/desk/needs/resolve/", body, content_type="application/json")
    assert r.status_code == 409
    item = next(i for i in stats.needs_you() if i["ref"] == ref)
    assert item["claimed_by"] == "Rita Desk"
    r = first.post("/api/air/desk/needs/resolve/", body, content_type="application/json")
    assert r.status_code == 200 and r.json()["resolved"] is True
    assert ref not in {i["ref"] for i in stats.needs_you()}
    assert AuditLog.objects.filter(action="air_needs_you_claimed").count() == 1
    assert AuditLog.objects.filter(action="air_needs_you_resolved").count() == 1
    bad = first.post(
        "/api/air/desk/needs/claim/",
        {"kind": "callback", "ref": ref},
        content_type="application/json",
    )
    assert bad.status_code == 404


@pytest.mark.django_db
def test_the_admin_may_resolve_an_item_someone_else_claimed(day, make_user, admin_user):
    rita = make_user(role="receptionist", full_name="Rita Desk")
    body = {
        "kind": "expired_link",
        "ref": str(PaymentLink.objects.get(appointment=day["expired"]).pk),
    }
    signed_in(rita).post("/api/air/desk/needs/claim/", body, content_type="application/json")
    r = signed_in(admin_user).post(
        "/api/air/desk/needs/resolve/", body, content_type="application/json"
    )
    assert r.status_code == 200
    assert NeedsYouState.objects.get(kind="expired_link").resolved_by == admin_user


# ---------------------------------------------------------------- undo


@pytest.mark.django_db
def test_staff_undo_releases_a_hold_and_refuses_a_paid_booking(
    day, air_on, shopper, catalogue, reception_user
):
    hold = make_hold(shopper, catalogue, hour=18, session="s9")
    client = signed_in(reception_user)
    rows = client.get("/api/air/desk/activity/?range=today").json()["results"]
    hold_row = next(
        r
        for r in rows
        if r["action"] == "Held a time" and r["can_undo"] and r["customer"] == "Priya Customer"
    )
    r = client.post(f"/api/air/desk/activity/{hold_row['id']}/undo/")
    assert r.status_code == 200
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.RELEASED
    undo = AIActionLog.objects.get(undo_of_id=hold_row["id"])
    assert undo.reason_code == "undo_by_staff" and undo.status == AIActionLog.Status.UNDONE
    assert AuditLog.objects.filter(action="air_action_undone_by_staff").exists()
    # the paid booking's request row can never be undone
    paid_row = AIActionLog.objects.get(
        action_type="submit_booking_request", booking_ref=day["paid"].pk
    )
    shown = next(
        r
        for r in client.get("/api/air/desk/activity/?range=today").json()["results"]
        if r["id"] == str(paid_row.pk)
    )
    assert shown["can_undo"] is False
    r = client.post(f"/api/air/desk/activity/{paid_row.pk}/undo/")
    assert r.status_code == 409 and r.json()["code"] == "paid_booking"
    day["paid"].refresh_from_db()
    assert day["paid"].status == S.SCHEDULED


@pytest.mark.django_db
def test_staff_undo_cancels_an_unpaid_request(day, reception_user):
    row = AIActionLog.objects.get(
        action_type="submit_booking_request", booking_ref=day["waiting"].pk
    )
    r = signed_in(reception_user).post(f"/api/air/desk/activity/{row.pk}/undo/")
    assert r.status_code == 200
    day["waiting"].refresh_from_db()
    assert day["waiting"].status == S.CANCELLED


@pytest.mark.django_db
def test_undo_is_refused_after_the_window(day, reception_user):
    row = AIActionLog.objects.get(
        action_type="submit_booking_request", booking_ref=day["waiting"].pk
    )
    later = timezone.now() + timedelta(minutes=config.get_settings().undo_window_minutes + 1)
    with at(later):
        r = signed_in(reception_user).post(f"/api/air/desk/activity/{row.pk}/undo/")
    assert r.status_code == 409 and r.json()["code"] == "not_undoable"


# ---------------------------------------------------------------- the activity table and phones


@pytest.mark.django_db
def test_activity_filters_and_masked_phones(day, reception_user):
    client = signed_in(reception_user)
    rows = client.get("/api/air/desk/activity/?range=today").json()["results"]
    assert rows and all(r["phone_masked"] in ("", "••••••3210") for r in rows)
    assert "9876543210" not in str(rows)
    payments = client.get("/api/air/desk/activity/?range=today&type=payment").json()["results"]
    assert payments and all(r["type"] == "payment" for r in payments)
    who = str(day["customers"][0].pk)
    mine = client.get(f"/api/air/desk/activity/?range=today&customer={who}").json()["results"]
    assert mine and all(r["customer_id"] == who for r in mine)
    r = client.get(f"/api/air/desk/customers/{who}/phone/")
    assert r.status_code == 200 and r.json()["phone"] == "9876543210"
    assert AuditLog.objects.filter(action="air_phone_revealed").count() == 1


# ---------------------------------------------------------------- permissions


ENDPOINTS = [
    ("get", "/api/air/desk/stats/?range=today"),
    ("get", "/api/air/desk/activity/"),
    ("get", "/api/air/desk/briefing/"),
    ("post", "/api/air/desk/needs/claim/"),
    ("post", "/api/air/desk/needs/resolve/"),
    ("post", "/api/air/desk/activity/00000000-0000-0000-0000-000000000000/undo/"),
    ("get", "/api/air/desk/customers/00000000-0000-0000-0000-000000000000/phone/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "stylist"])
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_customers_and_stylists_are_refused(logged_in, role, method, url):
    client, _ = logged_in(role)
    assert getattr(client, method)(url, {}, content_type="application/json").status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_guests_are_refused(method, url):
    response = getattr(Client(), method)(url, {}, content_type="application/json")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_receptionist_and_admin_may_read(logged_in, role):
    client, _ = logged_in(role)
    for key in stats.RANGES:
        r = client.get(f"/api/air/desk/stats/?range={key}")
        assert r.status_code == 200 and r.json()["range"] == key
    assert client.get("/api/air/desk/stats/?range=year").status_code == 400
    assert client.get("/api/air/desk/briefing/").status_code == 200


@pytest.mark.django_db
def test_air_settings_and_usage_are_admin_only_and_audited(logged_in):
    desk, _ = logged_in("receptionist")
    assert desk.get("/api/admin/air/settings/").status_code == 403
    assert desk.get("/api/admin/air/usage/").status_code == 403
    assert (
        desk.patch(
            "/api/admin/air/settings/", {"air_enabled": True}, content_type="application/json"
        ).status_code
        == 403
    )
    boss, _ = logged_in("admin")
    usage = boss.get("/api/admin/air/usage/").json()
    assert usage["cost_is_estimate"] is True and usage["month_requests"] == 0
    before = AuditLog.objects.count()
    for change in (
        {"air_enabled": True},
        {"stylist_timeout_minutes": 20},
        {"payment_link_minutes": 40},
        {"max_order_quantity": 3},
        {"monthly_spend_cap_rupees": "250"},
    ):
        assert (
            boss.patch(
                "/api/admin/air/settings/", change, content_type="application/json"
            ).status_code
            == 200
        )
    assert AuditLog.objects.count() == before + 5
    r = boss.post(
        "/api/admin/air/cover/",
        {"mode": "on", "reason": "Desk closed for training"},
        content_type="application/json",
    )
    assert r.status_code == 200
    assert AuditLog.objects.count() == before + 6
    settings = boss.get("/api/admin/air/settings/").json()
    assert settings["key_configured"] in (True, False) and "api_key" not in settings


# ---------------------------------------------------------------- the popup briefing


@pytest.mark.django_db
def test_briefing_has_counts_only_never_names_or_phones(day, reception_user):
    data = briefing.build(reception_user, timezone.now() + timedelta(minutes=1))
    text = data["text"]
    assert data["numbers"]["booking_requests"] == 5 and data["numbers"]["links_paid"] == 1
    assert "5 booking requests" in text and "1 payment link was paid" in text
    for c in day["customers"]:
        assert c.full_name.split()[0] not in text and c.email not in text
    assert "9876543210" not in text and "@" not in text
    assert not set(__import__("re").findall(r"\d+", text)) - {
        str(v) for v in data["numbers"].values()
    }
    assert data["mood"] in ("concerned", "attention")
    assert data["wording_by_ai"] is False


@pytest.mark.django_db
def test_a_quiet_session_says_so_briefly(reception_user):
    data = briefing.build(reception_user)
    assert data["did_nothing"] and data["text"].startswith(
        "Since your last session AIR had nothing"
    )
    assert data["mood"] == "idle"


def _n(**over):
    base = dict.fromkeys(briefing.NUMBER_KEYS, 0)
    base.update(
        conversations=4, booking_requests=3, reception_accepted=3, stylist_accepted=2, links_paid=2
    )
    base.update(over)
    return base


def test_the_number_checker_rejects_changed_added_or_dropped_numbers_and_names():
    n = _n()
    text = briefing.template(n)
    assert briefing.acceptable(
        text.replace("Since your last session", "Since you were away"), text, n
    )
    assert not briefing.acceptable(text.replace("3 booking", "30 booking"), text, n)
    assert not briefing.acceptable(text.replace("3 booking", "three booking"), text, n)
    assert not briefing.acceptable(text + " Call 9876543210.", text, n)
    assert not briefing.acceptable(text + " Priya Customer was lovely.", text, n)
    assert not briefing.acceptable(text + " See https://x.example", text, n)


@pytest.mark.django_db
def test_the_optional_polish_is_off_by_default_and_checked_when_on(reception_user, llm_on):
    from air.llm.providers import FAKE as fake

    # master switch on with the fake provider: a reworded text keeping every number is used
    def reword(call):
        import json

        text = json.loads(call["messages"][0]["content"])["briefing"]
        return {"text": text.replace("Since your last session", "While you were away,")}

    fake.script = [reword]
    actionlog.write("conversation", session_id="x")
    data = briefing.build(reception_user)
    assert data["wording_by_ai"] is True and data["text"].startswith("While you were away")
    assert "Customer" not in str(fake.calls)  # only the template went to the provider
    fake.script = [{"text": "AIR had 99 conversations."}]
    data = briefing.build(reception_user)
    assert data["wording_by_ai"] is False and data["text"] == data["template_text"]


@pytest.mark.django_db
def test_the_polish_never_runs_with_the_master_switch_off(reception_user):
    FAKE.script = [{"text": "anything"}]
    briefing.build(reception_user)
    assert FAKE.calls == []


@pytest.mark.django_db
def test_mood_follows_the_numbers():
    assert briefing.mood(_n(links_expired=1)) == "concerned"
    assert briefing.mood(_n(needs_you=2)) == "attention"
    assert briefing.mood(_n(links_paid=3)) == "celebrate"
    assert briefing.mood(_n()) == "report"
    assert briefing.mood(dict.fromkeys(briefing.NUMBER_KEYS, 0)) == "idle"


# ---------------------------------------------------------------- conversations are counted


@pytest.mark.django_db
def test_each_chat_conversation_is_counted_once_without_text(shopper, catalogue):
    client = signed_in(shopper)
    sid = client.post(
        "/api/air/chat/", {"message": "hello", "basic_mode": True}, content_type="application/json"
    ).json()["session_id"]
    client.post(
        "/api/air/chat/",
        {"message": "opening hours", "session_id": sid, "basic_mode": True},
        content_type="application/json",
    )
    rows = AIActionLog.objects.filter(action_type="conversation")
    assert rows.count() == 1 and rows.get().channel == "chat"
    assert rows.get().customer_ref == shopper.pk and rows.get().input_hash == ""
    assert Appointment.objects.count() == 0
