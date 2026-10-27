"""Task 5a: the admin edits team details, links profiles, and decides days-off requests.
Everything is admin-only and audited; approved days off and weekly hours really block booking."""

import json
from datetime import timedelta

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
from scheduling.tests.test_booking import confirm, day_at, requested

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


def next_weekday_key(days_ahead):
    return booking.WEEKDAYS[(timezone.localdate() + timedelta(days=days_ahead)).weekday()]


@pytest.mark.django_db
def test_a_stylists_weekly_hours_limit_the_slots_and_confirmation(catalogue, customer, desk):
    asha = catalogue["asha"]
    day = timezone.localdate() + timedelta(days=3)
    key = next_weekday_key(3)
    asha.weekly_hours = {key: ["10:00", "13:00"]}
    asha.save()
    hours = lambda s: {t.astimezone().hour for t, _ in booking.free_starts(day, 45, [s])}  # noqa: E731
    assert hours(asha.id) and max(hours(asha.id)) <= 12  # nothing after 13:00 - 45 min
    assert hours(catalogue["ravi"].id) and max(hours(catalogue["ravi"].id)) >= 18

    late = requested(customer[0], catalogue, start=day_at(3, 16).isoformat())
    refused = confirm(desk[0], late, asha, day_at(3, 16))
    assert refused.status_code == 400 and "not working" in refused.json()["detail"]
    assert confirm(desk[0], late, catalogue["ravi"], day_at(3, 16)).status_code == 200
    ok = requested(customer[0], catalogue, start=day_at(3, 11).isoformat())
    assert confirm(desk[0], ok, asha, day_at(3, 11)).status_code == 200

    asha.weekly_hours = {key: None}
    asha.save()
    assert booking.free_starts(day, 45, [asha.id]) == []


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
