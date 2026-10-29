"""Task 5a: the admin edits team details, links profiles, and decides days-off requests.
Everything is admin-only and audited; approved days off and weekly hours really block booking."""

import json
from datetime import date, datetime, time, timedelta

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, User
from conftest import login
from core.models import MailOutbox
from people import dayoff
from people.models import DayOffRequest, StylistProfile
from people.tests.test_stylist import asha, booked, catalogue, customer, desk, ravi  # noqa: F401
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import confirm, day_at, requested, send_request

S = AppointmentStatus


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None:
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


def details_url(user):
    return f"/api/admin/staff/{user.id}/details/"


# --------------------------------------------------------------------------- details


@pytest.mark.django_db
def test_admin_reads_and_edits_a_stylists_details_with_an_audit_trail(admin, asha, catalogue):
    client, _ = admin
    body = call(client, "get", details_url(asha[1])).json()
    assert body["role"] == "stylist" and body["profile"]["display_name"] == "Asha"
    assert {s["name"] for s in body["services"]} >= {"Haircut", "Facial"}
    assert [p["display_name"] for p in body["unlinked_profiles"]]  # e.g. Meena

    facial = catalogue["facial"]
    response = call(
        client,
        "patch",
        details_url(asha[1]),
        {
            "title": "Senior Stylist",
            "specialization": "Cuts and colour",
            "divisions": ["salon", "beauty-parlor"],
            "service_ids": [str(catalogue["haircut"].id), str(facial.id)],
            "weekly_hours": {"mon": ["10:00", "14:00"], "sun": None},
            "is_public": False,
        },
    )
    assert response.status_code == 200, response.content
    profile = StylistProfile.objects.get(user=asha[1])
    assert profile.title == "Senior Stylist" and profile.is_public is False
    assert profile.weekly_hours == {"mon": ["10:00", "14:00"], "sun": None}
    assert set(profile.services.values_list("name", flat=True)) == {"Haircut", "Facial"}
    entry = AuditLog.objects.filter(action=AuditLog.Action.STAFF_PROFILE_UPDATED).get()
    changes = entry.metadata["changes"]
    assert changes["title"][1] == "Senior Stylist" and changes["is_public"] == ["True", "False"]
    assert "Facial" in changes["services"][1]
    assert entry.actor == admin[1] and entry.target == asha[1]

    # Saving the same values again changes nothing and writes no new entry.
    call(client, "patch", details_url(asha[1]), {"title": "Senior Stylist"})
    assert AuditLog.objects.filter(action=AuditLog.Action.STAFF_PROFILE_UPDATED).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "bad",
    [
        {"weekly_hours": {"mon": ["18:00", "10:00"]}},
        {"weekly_hours": {"funday": ["10:00", "12:00"]}},
        {"weekly_hours": {"mon": ["ten", "noon"]}},
        {"weekly_hours": {"mon": ["10:00"]}},
        {"divisions": ["casino"]},
        {"service_ids": ["00000000-0000-0000-0000-000000000000"]},
        {"display_name": ""},
    ],
)
def test_bad_details_are_refused_and_nothing_changes(admin, asha, bad):
    before = StylistProfile.objects.values().get(user=asha[1])
    assert call(admin[0], "patch", details_url(asha[1]), bad).status_code == 400
    assert StylistProfile.objects.values().get(user=asha[1]) == before
    assert not AuditLog.objects.filter(action=AuditLog.Action.STAFF_PROFILE_UPDATED).exists()


@pytest.mark.django_db
def test_receptionist_and_unlinked_stylist_cases(admin, make_user):
    desk_user = make_user(role="receptionist")
    body = call(admin[0], "get", details_url(desk_user)).json()
    assert body["role"] == "receptionist" and "hourly_rate" in body
    assert call(admin[0], "patch", details_url(desk_user), {"title": "x"}).status_code == 400
    lone = make_user(role="stylist")
    assert call(admin[0], "get", details_url(lone)).json()["profile"] is None
    assert call(admin[0], "patch", details_url(lone), {"title": "x"}).status_code == 409
    assert call(admin[0], "get", f"/api/admin/staff/{admin[1].id}/details/").status_code == 404


@pytest.mark.django_db
def test_publish_and_unpublish_show_on_the_public_team_at_once(admin, asha, client):
    names = lambda: {m["display_name"] for m in client.get("/api/public/team/").json()}  # noqa: E731
    assert "Asha" in names()
    call(admin[0], "patch", details_url(asha[1]), {"is_public": False})
    assert "Asha" not in names()
    call(admin[0], "patch", details_url(asha[1]), {"is_public": True})
    assert "Asha" in names()


@pytest.mark.django_db
def test_a_deactivated_stylist_is_locked_out_at_once_and_leaves_the_public_team(
    admin, asha, client
):
    assert asha[0].get("/api/stylist/appointments/").status_code == 200
    response = call(admin[0], "post", f"/api/staff/{asha[1].id}/deactivate/")
    assert response.status_code == 200, response.content
    assert asha[0].get("/api/stylist/appointments/").status_code in (401, 403)
    assert asha[0].get("/api/chat/threads/").status_code in (401, 403)
    assert "Asha" not in {m["display_name"] for m in client.get("/api/public/team/").json()}
    assert login(Client(), asha[1]).status_code != 200  # and cannot sign in again


@pytest.mark.django_db
def test_admin_links_an_account_to_an_existing_profile(admin, make_user, catalogue):
    user = make_user(role="stylist", full_name="New Stylist")
    meena = catalogue["meena"]
    url = f"/api/admin/staff/{user.id}/link-profile/"
    assert call(admin[0], "post", url, {"profile": str(meena.id)}).status_code == 200
    meena.refresh_from_db()
    assert meena.user == user
    assert AuditLog.objects.filter(action=AuditLog.Action.STYLIST_LINKED).count() == 1
    other = make_user(role="stylist")
    again = call(
        admin[0], "post", f"/api/admin/staff/{other.id}/link-profile/", {"profile": str(meena.id)}
    )
    assert again.status_code == 409  # one profile belongs to one account
    assert call(admin[0], "post", url, {"profile": "bad"}).status_code == 400


# --------------------------------------------------------------------------- booking rules

# Task 8.5 bugfix (reported on the owner's PC, 2026-10-29): this used to anchor "day" to
# `timezone.localdate() + timedelta(days=3)` and then assert a hard-coded "closes at 18:00 or
# later" expectation. That is only true on 6 days out of 7 -- the shop's own seeded weekly hours
# close two hours earlier on Sunday (10:00-18:00 vs 10:00-20:00 every other day), so the test
# failed deterministically, every single time, whenever "today" was a Thursday (today + 3 =
# Sunday) -- which it was both in the sandbox and on the owner's PC when this was reported. It is
# not a flake and not an environment difference: proven by walking all 7 possible "today" values
# with the real shop-hours configuration (see docs/PROGRESS.md "Task 8.5: decisions" for the
# per-weekday table). Fixed by no longer assuming which real-world weekday "today" is: the two
# tests below each pick a day by the shop's own *configured* hours for that day (the longest day
# of the week for the "normal" case, the shortest for the "short day" case) and derive every
# expected hour from that configuration instead of a literal number.


def _closing(weekly_hours: dict, weekday_index: int) -> float | None:
    """Closing time of the given weekday (0=Monday) as a float hour (18:30 -> 18.5), or None if
    the shop is closed that day."""
    hours = weekly_hours.get(booking.WEEKDAYS[weekday_index])
    if not hours:
        return None
    hour, minute = (int(p) for p in hours[1].split(":"))
    return hour + minute / 60


def _pick_day(min_days_ahead: int, *, longest: bool) -> date:
    """The first day at least `min_days_ahead` out whose shop closing time is the week's latest
    (longest=True) or earliest (longest=False), per the shop's own current weekly-hours setting --
    so the test is correct on every real-world calendar date, not just the one it happened to be
    written on."""
    weekly = booking.booking_settings()["weekly_hours"]
    closings = [c for c in (_closing(weekly, i) for i in range(7)) if c is not None]
    assert closings, "The shop has no open days configured at all."
    target_close = max(closings) if longest else min(closings)
    day = timezone.localdate() + timedelta(days=min_days_ahead)
    for _ in range(14):  # two full weeks is always enough to find a match
        if _closing(weekly, day.weekday()) == target_close:
            return day
        day += timedelta(days=1)
    raise AssertionError("No matching day found within two weeks.")


def _expected_last_start_hour(day: date, duration_minutes: int) -> int:
    """The last slot-grid start on `day` that still fits `duration_minutes` before closing,
    computed directly from the shop's open/close/step settings -- independent of
    `booking.grid_starts`, so this isn't just testing the production code against itself."""
    settings = booking.booking_settings()
    key = booking.WEEKDAYS[day.weekday()]
    open_at, close_at = settings["weekly_hours"][key]
    tz = timezone.get_current_timezone()
    open_dt = datetime.combine(day, time.fromisoformat(open_at), tzinfo=tz)
    close_dt = datetime.combine(day, time.fromisoformat(close_at), tzinfo=tz)
    step = timedelta(minutes=settings["slot_step_minutes"])
    duration = timedelta(minutes=duration_minutes)
    steps = int((close_dt - duration - open_dt) // step)
    assert steps >= 0, "The service does not fit inside this day's hours at all."
    return (open_dt + steps * step).hour


@pytest.mark.django_db
def test_a_stylists_weekly_hours_limit_the_slots_and_confirmation(catalogue, customer, desk):
    asha = catalogue["asha"]
    day = _pick_day(3, longest=True)
    key = booking.WEEKDAYS[day.weekday()]
    asha.weekly_hours = {key: ["10:00", "13:00"]}
    asha.save()
    tz = timezone.get_current_timezone()

    def hours(stylist_id):
        return {t.astimezone(tz).hour for t, _ in booking.free_starts(day, 45, [stylist_id])}

    assert hours(asha.id) and max(hours(asha.id)) <= 12  # nothing after 13:00 - 45 min
    expected_ravi_last_hour = _expected_last_start_hour(day, 45)
    ravi_hours = hours(catalogue["ravi"].id)
    assert ravi_hours and max(ravi_hours) == expected_ravi_last_hour

    days_ahead = (day - timezone.localdate()).days
    late = requested(customer[0], catalogue, start=day_at(days_ahead, 16).isoformat())
    refused = confirm(desk[0], late, asha, day_at(days_ahead, 16))
    assert refused.status_code == 400 and "not working" in refused.json()["detail"]
    assert confirm(desk[0], late, catalogue["ravi"], day_at(days_ahead, 16)).status_code == 200
    ok = requested(customer[0], catalogue, start=day_at(days_ahead, 11).isoformat())
    assert confirm(desk[0], ok, asha, day_at(days_ahead, 11)).status_code == 200

    asha.weekly_hours = {key: None}
    asha.save()
    assert booking.free_starts(day, 45, [asha.id]) == []


@pytest.mark.django_db
def test_the_shops_short_hours_day_limits_ravis_slots_too(catalogue, customer):
    """Added alongside the bugfix above: the shop's shortest day (Sunday, by the current seeded
    hours) on purpose, deliberately exercising the case the old test's hard-coded ">= 18"
    assumption got wrong."""
    day = _pick_day(3, longest=False)
    hours = {
        t.astimezone(timezone.get_current_timezone()).hour
        for t, _ in booking.free_starts(day, 45, [catalogue["ravi"].id])
    }
    expected_last_hour = _expected_last_start_hour(day, 45)
    assert hours and max(hours) == expected_last_hour
    # The shop's current seed data makes Sunday the short day; if that ever changes, this still
    # proves the short day is genuinely shorter than the long one rather than hard-coding "17".
    assert expected_last_hour < _expected_last_start_hour(_pick_day(3, longest=True), 45)

    days_ahead = (day - timezone.localdate()).days
    # A time right at closing is refused on the short day, even though the same clock time
    # would be well inside the longer days' hours.
    _, close_at = booking.booking_settings()["weekly_hours"][booking.WEEKDAYS[day.weekday()]]
    close_hour, close_minute = (int(p) for p in close_at.split(":"))
    too_late = day_at(days_ahead, close_hour, close_minute)
    refused = send_request(customer[0], catalogue, start=too_late.isoformat())
    assert refused.status_code == 400


# --------------------------------------------------------------------------- days off


def make_request(profile, days_ahead=10, length=1, reason="Family function"):
    start = timezone.localdate() + timedelta(days=days_ahead)
    return dayoff.request_days_off(
        profile, start=start, end=start + timedelta(days=length - 1), reason=reason
    )


def decide(client, row, **body):
    return call(client, "post", f"/api/admin/days-off/{row.id}/decide/", body)


@pytest.mark.django_db
def test_approving_days_off_blocks_the_stylist_and_tells_them(
    admin, asha, catalogue, customer, desk
):
    row = make_request(catalogue["asha"], 10, 2)
    listed = call(admin[0], "get", "/api/admin/days-off/").json()["results"]
    assert listed[0]["id"] == str(row.id) and listed[0]["stylist"]["name"] == "Asha"
    assert listed[0]["conflicts"] == []

    response = decide(admin[0], row, decision="approve", reason="Enjoy")
    assert response.status_code == 200, response.content
    row.refresh_from_db()
    assert row.status == "approved" and row.decided_by == admin[1] and row.decision_note == "Enjoy"
    entry = AuditLog.objects.filter(action=AuditLog.Action.DAY_OFF_DECIDED).get()
    assert entry.metadata["decision"] == "approved" and entry.metadata["reason"] == "Enjoy"
    assert (
        "approved" in MailOutbox.objects.filter(to_email=asha[1].email).latest("created_at").subject
    )

    day = row.start_date
    assert booking.free_starts(day, 45, [catalogue["asha"].id]) == []
    assert booking.free_starts(day, 45, [catalogue["ravi"].id])  # others unaffected
    request_id = requested(customer[0], catalogue, start=day_at(10, 11).isoformat())
    refused = confirm(desk[0], request_id, catalogue["asha"], day_at(10, 11))
    assert refused.status_code == 400 and "not working" in refused.json()["detail"]
    mine = asha[0].get("/api/stylist/schedule/").json()["days_off"][0]
    assert mine["status"] == "approved" and mine["decision_note"] == "Enjoy"
    board = desk[0].get(f"/api/desk/schedule/?date={day}").json()
    assert {"stylist": str(catalogue["asha"].id), "name": "Asha", "reason": "Day off"} in board[
        "off"
    ]


@pytest.mark.django_db
def test_approval_warns_about_scheduled_visits_and_needs_confirmation(
    admin, asha, catalogue, customer, desk
):
    row = make_request(catalogue["asha"], 10)  # asked first; a visit was booked afterwards
    appt_id = booked(customer, desk, catalogue, days=10)
    listed = call(admin[0], "get", "/api/admin/days-off/").json()["results"][0]
    assert len(listed["conflicts"]) == 1

    blocked = decide(admin[0], row, decision="approve")
    assert blocked.status_code == 409 and blocked.json()["code"] == "visits"
    assert blocked.json()["visits"][0]["id"] == appt_id
    row.refresh_from_db()
    assert row.status == "pending"

    done = decide(admin[0], row, decision="approve", acknowledge_conflicts=True)
    assert done.status_code == 200 and done.json()["status"] == "approved"
    assert (
        Appointment.objects.get(pk=appt_id).status == S.SCHEDULED
    )  # the visit stays; desk moves it
    assert AuditLog.objects.get(action=AuditLog.Action.DAY_OFF_DECIDED).metadata["visits_left"] == 1


@pytest.mark.django_db
def test_declining_needs_a_reason_and_a_request_is_decided_only_once(admin, asha, catalogue):
    row = make_request(catalogue["asha"])
    assert decide(admin[0], row, decision="decline").status_code == 400
    assert decide(admin[0], row, decision="decline", reason="  ").status_code == 400
    assert decide(admin[0], row, decision="maybe").status_code == 400
    ok = decide(admin[0], row, decision="decline", reason="Too busy that week")
    assert ok.status_code == 200 and ok.json()["status"] == "declined"
    assert decide(admin[0], row, decision="approve").status_code == 409
    assert booking.free_starts(row.start_date, 45, [catalogue["asha"].id])  # still bookable
    assert (
        "declined" in MailOutbox.objects.filter(to_email=asha[1].email).latest("created_at").subject
    )
    assert call(admin[0], "get", "/api/admin/days-off/?status=pending").json()["results"] == []
    assert (
        decide(
            admin[0],
            type("R", (), {"id": "00000000-0000-0000-0000-000000000000"}),
            decision="approve",
        ).status_code
        == 404
    )


@pytest.mark.django_db
def test_waiting_requests_are_listed_first(admin, catalogue):
    old = make_request(catalogue["asha"], 20)
    decide(admin[0], old, decision="approve")
    new = make_request(catalogue["ravi"], 12)
    results = call(admin[0], "get", "/api/admin/days-off/").json()["results"]
    assert [r["id"] for r in results] == [str(new.id), str(old.id)]


# --------------------------------------------------------------------------- admin only

ENDPOINTS = [
    ("get", "/api/admin/staff/{u}/details/", None),
    ("patch", "/api/admin/staff/{u}/details/", {"title": "x"}),
    (
        "post",
        "/api/admin/staff/{u}/link-profile/",
        {"profile": "00000000-0000-0000-0000-000000000000"},
    ),
    ("get", "/api/admin/days-off/", None),
    ("post", "/api/admin/days-off/{d}/decide/", {"decision": "approve"}),
]


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
def test_nobody_but_the_admin_can_use_the_team_endpoints(role, logged_in, asha, catalogue):
    row = make_request(catalogue["asha"])
    client, _ = logged_in(role)
    for method, url, body in ENDPOINTS:
        response = call(client, method, url.format(u=asha[1].id, d=row.id), body)
        assert response.status_code == 403, (role, method, url)
    row.refresh_from_db()
    assert row.status == "pending"
    assert not AuditLog.objects.filter(action=AuditLog.Action.STAFF_PROFILE_UPDATED).exists()


@pytest.mark.django_db
def test_guests_are_turned_away_from_the_team_endpoints(client, asha, catalogue):
    row = make_request(catalogue["asha"])
    for method, url, body in ENDPOINTS:
        response = call(client, method, url.format(u=asha[1].id, d=row.id), body)
        assert response.status_code in (401, 403), (method, url)
