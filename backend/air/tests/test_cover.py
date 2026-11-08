"""Desk cover mode: AIR covers only when nobody is on shift and nobody is signed in."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from accounts import work
from accounts.models import AuditLog, ShiftSchedule, WorkSession
from air import cover
from air.models import AIActionLog, AirRequestState, CoverPeriod
from air.tests.conftest import make_hold, stylist_says_yes, submit

IST = ZoneInfo("Asia/Kolkata")


def monday(hour, minute=0):
    return datetime(2026, 11, 2, hour, minute, tzinfo=IST)  # a Monday


@pytest.mark.django_db
def test_cover_is_off_by_default_even_with_nobody_in():
    assert cover.is_active() is False
    assert cover.evaluate()[1] == "air_disabled"
    assert CoverPeriod.objects.count() == 0


@pytest.mark.django_db
def test_cover_is_on_when_air_is_on_and_nobody_is_on_shift_or_signed_in(air_on):
    assert cover.is_active() is True
    assert CoverPeriod.objects.filter(ended_at__isnull=True).count() == 1
    assert cover.is_active() is True  # asking again does not open a second period
    assert CoverPeriod.objects.count() == 1


@pytest.mark.django_db
def test_cover_is_off_while_a_receptionist_is_on_shift(air_on, reception_user):
    ShiftSchedule.objects.create(
        user=reception_user, weekday=0, start_time=monday(9).time(), end_time=monday(17).time()
    )
    assert cover.is_active(monday(10)) is False
    assert cover.evaluate(monday(10))[1] == "receptionist_on_shift"
    assert cover.is_active(monday(18)) is True  # after the shift, nobody signed in
    assert cover.is_active(monday(8, 59)) is True
    tuesday = monday(10) + timedelta(days=1)
    assert cover.is_active(tuesday) is True  # no shift on Tuesday


@pytest.mark.django_db
def test_shift_times_are_read_in_asia_kolkata(air_on, reception_user):
    ShiftSchedule.objects.create(
        user=reception_user, weekday=0, start_time=monday(9).time(), end_time=monday(17).time()
    )
    ten_ist_in_utc = monday(10).astimezone(ZoneInfo("UTC"))
    assert cover.receptionist_on_shift(ten_ist_in_utc) is True
    assert cover.receptionist_on_shift(monday(10).astimezone(ZoneInfo("America/New_York"))) is True
    assert cover.receptionist_on_shift(monday(20).astimezone(ZoneInfo("UTC"))) is False


@pytest.mark.django_db
def test_cover_is_off_while_a_receptionist_is_signed_in(air_on, reception_user):
    now = timezone.now()
    WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    assert cover.is_active(now) is False
    assert cover.evaluate(now)[1] == "receptionist_logged_in"


@pytest.mark.django_db
def test_a_stale_open_session_does_not_keep_cover_off(air_on, reception_user):
    now = timezone.now()
    long_ago = now - work.idle_limit() - timedelta(minutes=5)
    WorkSession.objects.create(user=reception_user, started_at=long_ago, last_seen_at=long_ago)
    assert cover.is_active(now) is True


@pytest.mark.django_db
def test_cover_ends_the_moment_a_receptionist_signs_in(air_on, reception_user):
    assert cover.is_active() is True
    period = CoverPeriod.objects.get()
    work.start(reception_user)  # what the real sign-in does
    period.refresh_from_db()
    assert period.ended_at is not None
    assert period.ended_reason == "receptionist_logged_in"
    assert cover.is_active() is False


@pytest.mark.django_db
def test_only_receptionists_end_cover(air_on, make_user):
    assert cover.is_active() is True
    stylist = make_user(role="stylist")
    now = timezone.now()
    WorkSession.objects.create(user=stylist, started_at=now, last_seen_at=now)
    assert cover.is_active() is True


@pytest.mark.django_db
def test_admin_can_force_cover_off_and_on_with_a_reason_and_it_is_audited(
    air_on, admin_user, reception_user
):
    now = monday(10)
    ShiftSchedule.objects.create(
        user=reception_user, weekday=0, start_time=monday(9).time(), end_time=monday(17).time()
    )
    assert cover.is_active(now) is False  # on shift

    result = cover.force("on", actor=admin_user, reason="Desk is unmanned today", now=now)
    assert result["active"] is True and result["force"] == "on"
    assert cover.is_active(now) is True

    cover.force("off", actor=admin_user, reason="Receptionist is back", now=now)
    assert cover.is_active(now) is False
    assert cover.is_active(monday(20)) is False  # forced off stays off until set back to auto

    cover.force("auto", actor=admin_user, reason="Back to the normal rules", now=now)
    assert cover.is_active(monday(20)) is True

    rows = list(AuditLog.objects.filter(action="air_cover_forced").order_by("created_at"))
    assert [r.metadata["after"] for r in rows] == ["on", "off", "auto"]
    assert rows[0].metadata["reason"] == "Desk is unmanned today"
    assert rows[0].actor_id == admin_user.pk


@pytest.mark.django_db
def test_force_needs_a_reason_and_a_valid_mode(air_on, admin_user):
    with pytest.raises(cover.CoverError):
        cover.force("on", actor=admin_user, reason="  ")
    with pytest.raises(cover.CoverError):
        cover.force("maybe", actor=admin_user, reason="because")
    assert AuditLog.objects.filter(action="air_cover_forced").count() == 0


@pytest.mark.django_db
def test_force_on_does_nothing_while_air_is_switched_off(admin_user):
    cover.force("on", actor=admin_user, reason="testing the switch")
    assert cover.is_active() is False  # the master AIR switch wins


@pytest.mark.django_db
def test_forcing_off_ends_the_period_and_hands_work_to_the_desk(
    air_on, admin_user, shopper, catalogue
):
    hold = make_hold(shopper, catalogue)
    appt = submit(shopper, hold)
    assert AirRequestState.objects.get(appointment=appt).handed_to_desk is False
    cover.force("off", actor=admin_user, reason="A person is taking over")
    state = AirRequestState.objects.get(appointment=appt)
    assert state.handed_to_desk is True
    assert AIActionLog.objects.filter(action_type="handoff_to_desk", booking_ref=appt.pk).exists()
    stylist_says_yes(appt, catalogue)  # the people carry on normally
