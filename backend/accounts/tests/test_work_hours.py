"""Task 3d: receptionist work sessions, idle sign-out, My Hours & Pay and admin corrections."""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts import work
from accounts.models import AuditLog, WorkSession
from conftest import login

D = Decimal


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


@pytest.fixture
def desk(make_user):
    user = make_user(role="receptionist", full_name="Desk Staff")
    user.hourly_rate = D("200.00")
    user.save()
    client = Client()
    assert login(client, user).status_code == 200
    return client, user


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


def only_session(user) -> WorkSession:
    return WorkSession.objects.get(user=user)


def make_session(user, hours_ago_start, hours_ago_end, **extra):
    now = timezone.now()
    start = now - timedelta(hours=hours_ago_start)
    end = now - timedelta(hours=hours_ago_end) if hours_ago_end is not None else None
    return WorkSession.objects.create(
        user=user, started_at=start, last_seen_at=end or now, ended_at=end, **extra
    )


# --------------------------------------------------------------------------- sessions


def test_only_receptionists_get_a_work_session(make_user, logged_in):
    _, desk_user = logged_in("receptionist")
    logged_in("admin")
    logged_in("stylist")
    logged_in("customer")
    assert WorkSession.objects.count() == 1
    assert WorkSession.objects.get().user == desk_user


def test_signing_out_ends_the_session(desk):
    client, user = desk
    assert only_session(user).ended_at is None
    assert post(client, "/api/auth/logout/").status_code == 204
    session = only_session(user)
    assert session.ended_at is not None and session.end_reason == "logout"


def test_signing_in_again_closes_the_old_session_at_its_last_activity(desk):
    _, user = desk
    first = only_session(user)
    other = Client()
    assert login(other, user).status_code == 200
    first.refresh_from_db()
    assert first.end_reason == "replaced" and first.ended_at is not None
    assert WorkSession.objects.filter(user=user, ended_at__isnull=True).count() == 1


def test_activity_pings_keep_the_session_alive(desk):
    client, user = desk
    session = only_session(user)
    session.last_seen_at = timezone.now() - timedelta(minutes=10)
    session.save()
    assert post(client, "/api/auth/activity/").status_code == 204
    session.refresh_from_db()
    assert timezone.now() - session.last_seen_at < timedelta(seconds=30)


def test_background_requests_do_not_count_as_activity(desk):
    client, user = desk
    session = only_session(user)
    seen = timezone.now() - timedelta(minutes=5)
    session.last_seen_at = seen
    session.save()
    assert client.get("/api/desk/inventory/").status_code == 200
    session.refresh_from_db()
    assert session.last_seen_at == seen


def test_fifteen_idle_minutes_sign_the_receptionist_out(desk):
    client, user = desk
    session = only_session(user)
    seen = timezone.now() - timedelta(minutes=16)
    session.started_at = seen - timedelta(hours=1)
    session.last_seen_at = seen
    session.save()
    assert client.get("/api/desk/inventory/").status_code == 401
    session.refresh_from_db()
    assert session.end_reason == "idle" and session.ended_at == seen
    # the refresh cookie cannot bring the session back, and the page learns it is signed out
    assert post(client, "/api/auth/refresh/").status_code == 401
    assert client.get("/api/auth/session/").json() == {"user": None}
    # signing in again starts a fresh session
    assert login(client, user).status_code == 200
    assert client.get("/api/desk/inventory/").status_code == 200
    assert WorkSession.objects.filter(user=user).count() == 2


def test_a_ping_after_going_idle_is_refused(desk):
    client, user = desk
    session = only_session(user)
    session.last_seen_at = timezone.now() - timedelta(minutes=20)
    session.save()
    assert post(client, "/api/auth/activity/").status_code == 401


def test_idle_time_is_not_paid(desk):
    client, user = desk
    session = only_session(user)
    start = timezone.now() - timedelta(hours=3)
    session.started_at = start
    session.last_seen_at = start + timedelta(hours=1)
    session.save()
    client.get("/api/desk/inventory/")
    session.refresh_from_db()
    assert work.worked_seconds(session) == 3600


# --------------------------------------------------------------------------- hours and pay


def test_my_hours_adds_up_sessions_and_pay(desk):
    client, user = desk
    make_session(user, 5, 3, end_reason="logout")  # 2 hours
    make_session(user, 2.5, 1, end_reason="logout")  # 1.5 hours
    data = client.get("/api/desk/my-hours/").json()
    assert D(data["total_hours"]) >= D("3.50")
    assert data["hourly_rate"] == "200.00" and data["working_now"] is True
    seconds = sum(work.worked_seconds(s) for s in WorkSession.objects.filter(user=user))
    assert D(data["estimated_pay"]) == work.pay(seconds, D("200"))
    assert len(data["sessions"]) == 3


def test_pay_is_hours_times_the_hourly_rate(desk):
    _, user = desk
    assert work.pay(3600 * 3 + 1800, D("200.00")) == D("700.00")
    assert work.hours(5400) == D("1.50")
    assert work.pay(3600, None) is None


def test_no_rate_means_no_pay_figure(desk):
    client, user = desk
    user.hourly_rate = None
    user.save()
    data = client.get("/api/desk/my-hours/").json()
    assert data["hourly_rate"] is None and data["estimated_pay"] is None


def test_months_are_separate(desk):
    client, user = desk
    old = timezone.now() - timedelta(days=70)
    WorkSession.objects.create(
        user=user,
        started_at=old,
        last_seen_at=old + timedelta(hours=4),
        ended_at=old + timedelta(hours=4),
        end_reason="logout",
    )
    month = timezone.localtime(old).strftime("%Y-%m")
    past = client.get(f"/api/desk/my-hours/?month={month}").json()
    assert past["total_hours"] == "4.00" and len(past["sessions"]) == 1
    now = client.get("/api/desk/my-hours/").json()
    assert now["total_hours"] != "4.00" or len(now["sessions"]) == 1
    assert client.get("/api/desk/my-hours/?month=nonsense").status_code == 200


def test_a_receptionist_only_sees_their_own_hours(desk, make_user):
    client, user = desk
    other = make_user(role="receptionist")
    make_session(other, 6, 2)
    data = client.get("/api/desk/my-hours/").json()
    assert all(s["id"] != str(WorkSession.objects.get(user=other).id) for s in data["sessions"])
    assert client.get(f"/api/staff/{other.id}/hours/").status_code == 403


# --------------------------------------------------------------------------- access


@pytest.mark.parametrize("role", ["customer", "stylist", "admin"])
def test_other_roles_have_no_my_hours_and_cannot_ping(logged_in, role):
    client, _ = logged_in(role)
    assert client.get("/api/desk/my-hours/").status_code == 403
    assert post(client, "/api/auth/activity/").status_code == 403


def test_guests_are_turned_away(client):
    assert client.get("/api/desk/my-hours/").status_code in (401, 403)
    assert post(client, "/api/auth/activity/").status_code in (401, 403)


@pytest.mark.parametrize("role", ["customer", "stylist"])
def test_only_the_admin_reads_or_corrects_staff_hours(logged_in, desk, role):
    client, _ = logged_in(role)
    _, user = desk
    session = only_session(user)
    assert client.get(f"/api/staff/{user.id}/hours/").status_code == 403
    body = {
        "started_at": timezone.now().isoformat(),
        "ended_at": timezone.now().isoformat(),
        "reason": "x",
    }
    assert post(client, f"/api/staff/work-sessions/{session.id}/correct/", body).status_code == 403


# --------------------------------------------------------------------------- admin correction


def iso(hours_ago):
    return (timezone.now() - timedelta(hours=hours_ago)).isoformat()


def test_admin_reads_a_receptionists_hours(desk, admin):
    _, user = desk
    data = admin[0].get(f"/api/staff/{user.id}/hours/").json()
    assert data["name"] == "Desk Staff" and data["working_now"] is True
    assert admin[0].get(f"/api/staff/{uuid.uuid4()}/hours/").status_code == 404


def test_admin_correction_changes_the_hours_and_is_audited(desk, admin):
    client, user = desk
    session = make_session(user, 10, 6, end_reason="logout")
    done = post(
        admin[0],
        f"/api/staff/work-sessions/{session.id}/correct/",
        {"started_at": iso(10), "ended_at": iso(5), "reason": "Forgot to sign out"},
    )
    assert done.status_code == 200, done.content
    assert done.json()["corrected"] is True and done.json()["hours"] == "5.00"
    session.refresh_from_db()
    assert session.corrected_by is not None and session.correction_reason == "Forgot to sign out"
    entry = AuditLog.objects.get(action="work_session_corrected")
    assert entry.metadata["reason"] == "Forgot to sign out" and entry.metadata["old_end"]
    mine = client.get("/api/desk/my-hours/").json()["sessions"]
    row = next(s for s in mine if s["id"] == str(session.id))
    assert row["corrected"] is True and row["correction_reason"] == "Forgot to sign out"


@pytest.mark.parametrize(
    "start,end,reason,code",
    [
        (4, 5, "backwards", 400),
        (3, -2, "future", 400),
        (30, 1, "too long", 400),
        (8, 7, "", 400),
    ],
)
def test_bad_corrections_are_refused(desk, admin, start, end, reason, code):
    _, user = desk
    session = make_session(user, 12, 10, end_reason="logout")
    body = {"started_at": iso(start), "ended_at": iso(end), "reason": reason}
    response = post(admin[0], f"/api/staff/work-sessions/{session.id}/correct/", body)
    assert response.status_code == code
    session.refresh_from_db()
    assert not session.corrected_by_id


def test_a_correction_cannot_overlap_another_session(desk, admin):
    _, user = desk
    make_session(user, 9, 7, end_reason="logout")
    other = make_session(user, 6, 4, end_reason="logout")
    body = {"started_at": iso(8), "ended_at": iso(5), "reason": "overlap"}
    response = post(admin[0], f"/api/staff/work-sessions/{other.id}/correct/", body)
    assert response.status_code == 409


def test_correcting_an_unknown_session_is_a_404(admin):
    body = {"started_at": iso(3), "ended_at": iso(2), "reason": "none"}
    assert (
        post(admin[0], f"/api/staff/work-sessions/{uuid.uuid4()}/correct/", body).status_code == 404
    )
