"""Task 6b: admin work-hours screens: flags, shifts, punctuality and receptionist pay."""

import uuid
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts import work_admin
from accounts.models import AuditLog, ShiftSchedule, WorkSession
from conftest import login
from website.models import SiteContent

D = Decimal
BASE = "/api/admin/work/receptionists"
TZ = timezone.get_current_timezone()


def put(client, url, body):
    return client.put(url, body, content_type="application/json")


def post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


@pytest.fixture
def desk(make_user):
    user = make_user(role="receptionist", full_name="Desk Staff")
    user.hourly_rate = D("200.00")
    user.save()
    client = Client()
    assert login(client, user).status_code == 200
    WorkSession.objects.all().delete()  # the login opened one; tests build their own
    return client, user


def sign_in_again(user):
    """The fixture removed the login session; give the receptionist a live one again."""
    now = timezone.now()
    return WorkSession.objects.create(user=user, started_at=now, last_seen_at=now)


def at(day, hh, mm=0):
    return datetime.combine(day, time(hh, mm), tzinfo=TZ)


def session(user, start, end, **extra):
    return WorkSession.objects.create(
        user=user, started_at=start, last_seen_at=end or start, ended_at=end, **extra
    )


def this_month():
    return timezone.localdate().strftime("%Y-%m")


def past_monday(weeks=2):
    today = timezone.localdate().replace(day=1)
    day = today
    # a Monday inside the current month that is already past, if possible, else last month
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


# --------------------------------------------------------------------------- flags


def test_flags_very_long_overlapping_idle_and_stale_sessions(desk):
    _, user = desk
    day = timezone.localdate() - timedelta(days=3)
    long_one = session(user, at(day, 1), at(day, 15))  # 14 hours
    a = session(user, at(day + timedelta(days=1), 9), at(day + timedelta(days=1), 12))
    b = session(user, at(day + timedelta(days=1), 11), at(day + timedelta(days=1), 13))
    idle = session(
        user,
        at(day + timedelta(days=2), 9),
        at(day + timedelta(days=2), 10),
        end_reason="idle",
    )
    stale = WorkSession.objects.create(
        user=user,
        started_at=timezone.now() - timedelta(hours=5),
        last_seen_at=timezone.now() - timedelta(hours=4),
    )
    flags = work_admin.flag_sessions([long_one, a, b, idle, stale])
    assert flags[long_one.id] == ["long"]
    assert flags[a.id] == ["overlap"] and flags[b.id] == ["overlap"]
    assert flags[idle.id] == ["idle"]
    assert flags[stale.id] == ["stale"]


def test_a_normal_session_has_no_flags(desk):
    _, user = desk
    day = timezone.localdate() - timedelta(days=2)
    normal = session(user, at(day, 9), at(day, 17))
    assert work_admin.flag_sessions([normal]) == {normal.id: []}


# --------------------------------------------------------------------------- pay


def test_monthly_pay_is_hours_times_rate_with_corrections_applied(desk, admin):
    _, user = desk
    day = timezone.localdate().replace(day=1)
    s = session(user, at(day, 9), at(day, 13))  # 4 h
    session(user, at(day + timedelta(days=1), 9), at(day + timedelta(days=1), 11))  # 2 h
    url = f"{BASE}/{user.pk}/?month={this_month()}"
    data = admin[0].get(url).json()
    assert data["pay"]["hours"] == "6.00" and data["pay"]["pay"] == "1200.00"
    assert data["pay"]["corrected_sessions"] == 0
    r = post(
        admin[0],
        f"/api/staff/work-sessions/{s.id}/correct/",
        {
            "started_at": at(day, 9).isoformat(),
            "ended_at": at(day, 12).isoformat(),
            "reason": "Left early, forgot to sign out",
        },
    )
    assert r.status_code == 200
    data = admin[0].get(url).json()
    assert data["pay"]["hours"] == "5.00" and data["pay"]["pay"] == "1000.00"
    assert data["pay"]["corrected_sessions"] == 1
    row = next(x for x in data["sessions"] if x["id"] == str(s.id))
    assert row["corrected"] and row["corrected_by"] and row["correction_reason"]
    entry = AuditLog.objects.get(action="work_session_corrected")
    assert entry.metadata["reason"] == "Left early, forgot to sign out"
    assert entry.metadata["old_end"] and entry.metadata["new_end"]


def test_no_rate_means_no_pay_but_hours_still_count(make_user, admin):
    user = make_user(role="receptionist")
    day = timezone.localdate().replace(day=1)
    session(user, at(day, 9), at(day, 11))
    data = admin[0].get(f"{BASE}/{user.pk}/?month={this_month()}").json()
    assert data["pay"]["hours"] == "2.00" and data["pay"]["pay"] is None
    assert data["pay"]["hourly_rate"] is None


def test_the_list_has_totals_that_add_up(desk, admin, make_user):
    _, user = desk
    other = make_user(role="receptionist", full_name="Other")
    other.hourly_rate = D("100")
    other.save()
    day = timezone.localdate().replace(day=1)
    session(user, at(day, 9), at(day, 13))
    session(other, at(day, 9), at(day, 11))
    data = admin[0].get(f"{BASE}/?month={this_month()}").json()
    assert len(data["receptionists"]) == 2
    assert data["totals"] == {"hours": "6.00", "pay": "1000.00"}
    assert data["grace_minutes"] == 10 and data["long_hours"] == 12


# --------------------------------------------------------------------------- shifts and punctuality


def test_without_a_shift_punctuality_says_no_shift_set(desk, admin):
    _, user = desk
    data = admin[0].get(f"{BASE}/{user.pk}/?month={this_month()}").json()
    assert data["punctuality"]["has_shifts"] is False
    assert data["punctuality"]["label"] == "No shift set"
    assert data["shifts"] == [None] * 7


def test_admin_sets_weekly_shifts_and_it_is_audited(desk, admin):
    _, user = desk
    body = {"days": [{"weekday": 0, "start": "09:00", "end": "17:00"}]}
    r = put(admin[0], f"{BASE}/{user.pk}/shifts/", body)
    assert r.status_code == 200 and r.json()["shifts"][0] == {"start": "09:00", "end": "17:00"}
    assert ShiftSchedule.objects.filter(user=user).count() == 1
    entry = AuditLog.objects.get(action="shifts_changed")
    assert entry.metadata["after"][0]["start"] == "09:00" and entry.metadata["before"][0] is None
    # a full replace: sending no days clears them
    assert put(admin[0], f"{BASE}/{user.pk}/shifts/", {"days": []}).status_code == 200
    assert ShiftSchedule.objects.filter(user=user).count() == 0


@pytest.mark.parametrize(
    "days",
    [
        [{"weekday": 0, "start": "17:00", "end": "09:00"}],
        [{"weekday": 0, "start": "09:00", "end": "09:00"}],
        [{"weekday": 7, "start": "09:00", "end": "17:00"}],
        [{"weekday": 0, "start": "9am", "end": "17:00"}],
        [
            {"weekday": 1, "start": "09:00", "end": "12:00"},
            {"weekday": 1, "start": "13:00", "end": "17:00"},
        ],
    ],
)
def test_bad_shifts_are_refused(desk, admin, days):
    _, user = desk
    assert put(admin[0], f"{BASE}/{user.pk}/shifts/", {"days": days}).status_code == 400
    assert ShiftSchedule.objects.count() == 0


def test_on_time_late_and_missed_use_the_grace_period(desk, admin):
    _, user = desk
    # every weekday 09:00-17:00
    ShiftSchedule.objects.bulk_create(
        ShiftSchedule(user=user, weekday=d, start_time=time(9), end_time=time(17)) for d in range(7)
    )
    today = timezone.localdate()
    d1, d2, d3, d4 = (today - timedelta(days=n) for n in (4, 3, 2, 1))
    session(user, at(d1, 9, 9), at(d1, 17))  # 9 minutes after: on time (grace 10)
    session(user, at(d2, 9, 25), at(d2, 17))  # 25 minutes after: late
    session(user, at(d3, 8, 50), at(d3, 17))  # early: on time
    # d4: no session at all -> missed
    p = work_admin.receptionist_punctuality(user, at(d1, 0), at(today, 0), now=timezone.now())
    states = {d["date"]: d for d in p["days"]}
    assert states[d1.isoformat()]["state"] == "on_time"
    assert (
        states[d2.isoformat()]["state"] == "late" and states[d2.isoformat()]["minutes_late"] == 25
    )
    assert states[d3.isoformat()]["state"] == "on_time"
    assert states[d4.isoformat()]["state"] == "missed"
    assert (p["on_time"], p["late"], p["missed"]) == (2, 1, 1) and p["on_time_rate"] == "50.0"


def test_the_grace_period_is_a_setting(desk):
    _, user = desk
    ShiftSchedule.objects.bulk_create(
        ShiftSchedule(user=user, weekday=d, start_time=time(9), end_time=time(17)) for d in range(7)
    )
    day = timezone.localdate() - timedelta(days=2)
    session(user, at(day, 9, 25), at(day, 17))
    SiteContent.objects.create(key="security", value={"late_grace_minutes": 30})
    p = work_admin.receptionist_punctuality(user, at(day, 0), at(day + timedelta(days=1), 0))
    assert p["days"][0]["state"] == "on_time"


# --------------------------------------------------------------------------- who may

URLS = [
    ("get", "/"),
    ("get", "/{id}/"),
    ("get", "/{id}/shifts/"),
    ("put", "/{id}/shifts/"),
]


@pytest.mark.parametrize("method,path", URLS)
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_other_roles_are_denied(logged_in, desk, role, method, path):
    _, user = desk
    client = logged_in(role)[0]
    url = BASE + path.format(id=user.pk)
    response = getattr(client, method)(url, {"days": []}, content_type="application/json")
    assert response.status_code == 403
    assert AuditLog.objects.filter(action="shifts_changed").count() == 0


@pytest.mark.parametrize("method,path", URLS)
def test_guests_are_denied(client, desk, method, path):
    url = BASE + path.format(id=desk[1].pk)
    assert getattr(client, method)(url).status_code in (401, 403)


def test_a_receptionist_cannot_correct_their_own_session(desk):
    client, user = desk
    sign_in_again(user)
    s = session(
        user,
        at(timezone.localdate() - timedelta(days=1), 9),
        at(timezone.localdate() - timedelta(days=1), 17),
    )
    r = post(
        client,
        f"/api/staff/work-sessions/{s.id}/correct/",
        {
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat(),
            "reason": "more",
        },
    )
    assert r.status_code == 403


def test_only_receptionists_can_be_looked_up(admin, make_user):
    stylist = make_user(role="stylist")
    assert admin[0].get(f"{BASE}/{stylist.pk}/").status_code == 404
    assert admin[0].get(f"{BASE}/{uuid.uuid4()}/shifts/").status_code == 404
    assert put(admin[0], f"{BASE}/{stylist.pk}/shifts/", {"days": []}).status_code == 404


def test_the_receptionist_sees_corrected_by_admin_but_not_the_flags(desk, admin):
    client, user = desk
    sign_in_again(user)
    day = timezone.localdate() - timedelta(days=1)
    s = session(user, at(day, 9), at(day, 17))
    post(
        admin[0],
        f"/api/staff/work-sessions/{s.id}/correct/",
        {
            "started_at": at(day, 9).isoformat(),
            "ended_at": at(day, 16).isoformat(),
            "reason": "Left at four",
        },
    )
    mine = client.get(f"/api/desk/my-hours/?month={this_month()}").json()
    row = next(x for x in mine["sessions"] if x["id"] == str(s.id))
    assert row["corrected"] is True and row["correction_reason"] == "Left at four"
    assert "flags" not in row and "corrected_by" not in row
