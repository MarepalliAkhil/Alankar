"""AIR desk cover for requests made through the NORMAL booking form (not the chat).

The bug: a request from the booking form stayed at "Front desk: Waiting" even after the stylist
accepted, because AIR only ever looked at requests it had created itself in the chat, nothing ran
after a form request was created, and there was no sweeper. These tests run the exact failing
scenario with the language-model layer OFF.
"""

from datetime import timedelta

import pytest
from conftest import login  # noqa: F401
from django.core.management import call_command
from django.db import connection
from django.test import Client
from django.utils import timezone

from accounts.models import ShiftSchedule, User, WorkSession
from air import actor, config, cover, desk
from air.models import AIActionLog, AirRequestState, CoverState
from air.tests.conftest import payment_token_for, shift_around
from billing.models import PaymentLink
from core import policy
from people.models import CustomerProfile
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus
from scheduling.tests.test_booking import day_at, request_body
from scheduling.tests.test_dual_approval import post, stylist_pair

S = AppointmentStatus
A = ApprovalStatus
L = AIActionLog.Status


@pytest.fixture
def customer(shopper):
    """(a signed-in browser for the customer, the customer)."""
    client = Client()
    assert login(client, shopper).status_code == 200
    return client, shopper


@pytest.fixture
def asha(make_user, catalogue):
    return stylist_pair(make_user, catalogue["asha"])


@pytest.fixture
def commits(django_capture_on_commit_callbacks):
    """Runs the after-commit hooks, as the real server does when a request finishes."""

    def run():
        return django_capture_on_commit_callbacks(execute=True)

    return run


def send_form(client, cat, commits, **overrides):
    overrides.setdefault("stylist", str(cat["asha"].id))
    with commits():
        response = client.post(
            "/api/booking/requests/",
            request_body(cat, **overrides),
            content_type="application/json",
        )
    assert response.status_code == 201, response.content
    return Appointment.objects.get(pk=response.json()["id"])


def rows(appt, **filters):
    return AIActionLog.objects.filter(booking_ref=appt.pk, **filters)


def stylist_accepts(asha_pair, appt, commits):
    with commits():
        response = post(asha_pair[0], f"/api/stylist/requests/{appt.pk}/accept/")
    assert response.status_code == 200, response.content
    appt.refresh_from_db()


# ------------------------------------------------ the exact failing scenario


@pytest.mark.django_db
def test_form_request_is_accepted_by_air_then_paid_with_every_step_logged(
    air_on, customer, asha, catalogue, commits
):
    assert config.get_settings().master_enabled is False  # the language-model layer is OFF
    client, shopper = customer
    appt = send_form(client, catalogue, commits)

    # 1. AIR took the front-desk side as soon as the request existed (no chat, no earlier hold).
    assert appt.reception_status == A.ACCEPTED and appt.status == S.REQUESTED
    assert appt.stylist_status == A.PENDING  # AIR never answers for the stylist
    state = AirRequestState.objects.get(appointment=appt)
    assert state.source == "form" and state.accepted_at is not None
    accepted = rows(appt, action_type="accept_reception")
    assert accepted.count() == 1 and accepted.get().status == L.DONE
    assert accepted.get().reason_code == "desk_cover"

    # 2. The stylist says yes: awaiting payment exactly once, one link, 45 minutes.
    stylist_accepts(asha, appt, commits)
    assert appt.status == S.AWAITING_PAYMENT
    links = PaymentLink.objects.filter(appointment=appt)
    assert links.count() == 1
    link = links.get()
    minutes = (link.expires_at - link.sent_at).total_seconds() / 60
    assert 44 <= minutes <= 46
    assert link.sent_by_air is True
    assert rows(appt, action_type="create_payment_link").count() == 1

    # 3. Paid -> scheduled, and the step is logged.
    token = payment_token_for(appt)
    with commits():
        paid, ok = booking.pay(appt.pk, customer=shopper, token=token, succeed=True)
    assert ok and paid.status == S.SCHEDULED
    assert rows(appt, action_type="payment_link_paid").count() == 1
    kinds = set(rows(appt).values_list("action_type", flat=True))
    assert {"accept_reception", "create_payment_link", "payment_link_paid"} <= kinds
    assert Appointment.objects.get(pk=appt.pk).status == S.SCHEDULED


@pytest.mark.django_db
def test_the_stylist_can_accept_before_air_and_the_request_still_moves(
    air_on, customer, asha, catalogue, commits
):
    client, _ = customer
    # AIR is off while the request is made, so the stylist gets there first.
    obj = config.get_settings()
    obj.air_enabled = False
    obj.save()
    appt = send_form(client, catalogue, commits)
    assert appt.reception_status == A.PENDING
    assert rows(appt, reason_code="switch_off", status=L.SKIPPED).count() == 1
    stylist_accepts(asha, appt, commits)
    assert appt.status == S.REQUESTED and appt.stylist_status == A.ACCEPTED

    obj.air_enabled = True
    obj.save()
    counts = desk.sweep()
    appt.refresh_from_db()
    assert counts["accepted"] == 1
    assert appt.status == S.AWAITING_PAYMENT
    assert PaymentLink.objects.filter(appointment=appt).count() == 1
    assert rows(appt, action_type="accept_reception").count() == 1


@pytest.mark.django_db
def test_the_hook_and_the_sweeper_together_have_exactly_one_winner(
    air_on, customer, asha, catalogue, commits
):
    client, _ = customer
    appt = send_form(client, catalogue, commits)  # the hook already accepted it
    for _ in range(3):
        desk.process(appt.pk, trigger="sweep")
        desk.sweep()
    appt.refresh_from_db()
    assert appt.reception_status == A.ACCEPTED
    assert rows(appt, action_type="accept_reception").count() == 1
    assert AirRequestState.objects.filter(appointment=appt).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor == "sqlite", reason="needs real row locks (PostgreSQL)")
def test_two_threads_racing_for_one_request_have_one_winner(air_on, customer, catalogue):
    from concurrent.futures import ThreadPoolExecutor

    client, _ = customer
    response = client.post(
        "/api/booking/requests/",
        request_body(catalogue, stylist=str(catalogue["asha"].id)),
        content_type="application/json",
    )
    appt = Appointment.objects.get(pk=response.json()["id"])
    # Commits run for real in this test, so AIR already accepted once when the request was made.
    # Put the desk side back to "waiting" and let four runs race: exactly one more accept.
    before = rows(appt, action_type="accept_reception").count()
    Appointment.objects.filter(pk=appt.pk).update(reception_status=A.PENDING)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: desk.process(appt.pk, trigger="sweep"), range(4)))
    assert rows(appt, action_type="accept_reception").count() == before + 1


# ------------------------------------------------ AIR does not act (and says why)


def one_row(appt, status, reason):
    found = rows(appt, status=status, reason_code=reason)
    assert found.count() == 1, list(rows(appt).values_list("action_type", "status", "reason_code"))
    return found.get()


def assert_not_accepted(appt):
    appt.refresh_from_db()
    assert appt.reception_status == A.PENDING and appt.status == S.REQUESTED
    assert not rows(appt, action_type="accept_reception").exists()


@pytest.mark.django_db
def test_cover_setting_off_is_logged_and_nothing_is_accepted(customer, catalogue, commits):
    assert config.get_settings().air_enabled is False  # the default
    appt = send_form(customer[0], catalogue, commits)
    assert_not_accepted(appt)
    one_row(appt, L.SKIPPED, "switch_off")
    assert desk.sweep()["skipped"] == 1
    assert rows(appt, reason_code="switch_off").count() == 1  # not logged again every minute


@pytest.mark.django_db
def test_a_signed_in_receptionist_means_cover_is_inactive(
    air_on, customer, catalogue, commits, reception_user
):
    now = timezone.now()
    WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    appt = send_form(customer[0], catalogue, commits)
    assert_not_accepted(appt)
    row = one_row(appt, L.SKIPPED, "cover_inactive")
    assert row.after["reason"] == "receptionist_logged_in"
    assert not AirRequestState.objects.filter(appointment=appt).exists()


@pytest.mark.django_db
def test_a_receptionist_on_shift_means_cover_is_inactive(
    air_on, customer, catalogue, commits, reception_user
):
    shift_around(reception_user, timezone.now())
    appt = send_form(customer[0], catalogue, commits)
    assert_not_accepted(appt)
    assert one_row(appt, L.SKIPPED, "cover_inactive").after["reason"] == "receptionist_on_shift"


@pytest.mark.django_db
def test_when_the_receptionist_leaves_the_next_sweep_accepts(
    air_on, customer, catalogue, commits, reception_user
):
    now = timezone.now()
    session = WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    appt = send_form(customer[0], catalogue, commits)
    assert_not_accepted(appt)
    session.ended_at, session.end_reason = timezone.now(), "logout"
    session.save()
    assert desk.sweep()["accepted"] == 1
    appt.refresh_from_db()
    assert appt.reception_status == A.ACCEPTED


@pytest.mark.django_db
def test_a_request_over_5000_rupees_goes_to_a_person(air_on, customer, catalogue, commits):
    from decimal import Decimal

    obj = Appointment.objects
    appt = send_form(customer[0], catalogue, commits)  # accepted by AIR first (cheap haircut)
    fresh = send_form(customer[0], catalogue, commits, start=day_at(4, 12).isoformat())
    # Same request, but priced above the limit: rupees, GST included.
    other = Appointment.objects.get(pk=fresh.pk)
    other.reception_status = A.PENDING
    other.amount_payable = Decimal("5000.01")
    other.save(update_fields=["reception_status", "amount_payable"])
    AIActionLog.objects.filter(booking_ref=other.pk).delete() if False else None
    AirRequestState.objects.filter(appointment=other).delete()
    out = desk.process(other.pk, trigger="sweep")
    assert out.reason == "check_failed:amount_limit" and out.result == "handed_off"
    one_row(other, L.HANDED_OFF, "check_failed:amount_limit")
    other.refresh_from_db()
    assert other.reception_status == A.PENDING
    assert AirRequestState.objects.get(appointment=other).handed_to_desk is True
    assert obj.get(pk=appt.pk).reception_status == A.ACCEPTED


@pytest.mark.django_db
def test_exactly_5000_rupees_is_still_allowed(air_on, customer, catalogue, commits):
    from decimal import Decimal

    fresh = send_form(customer[0], catalogue, commits)
    Appointment.objects.filter(pk=fresh.pk).update(
        reception_status=A.PENDING, amount_payable=Decimal("5000.00")
    )
    AirRequestState.objects.filter(appointment=fresh).delete()
    assert desk.process(fresh.pk, trigger="sweep").result == "accepted"


def _waiting(appt, **fields):
    """Puts an accepted request back to 'waiting for the desk' with some field changed."""
    Appointment.objects.filter(pk=appt.pk).update(reception_status=A.PENDING, **fields)
    AirRequestState.objects.filter(appointment=appt).delete()
    return Appointment.objects.get(pk=appt.pk)


@pytest.mark.django_db
def test_a_visit_more_than_60_days_ahead_goes_to_a_person(air_on, customer, catalogue, commits):
    appt = send_form(customer[0], catalogue, commits)
    far = _waiting(appt, preferred_start=day_at(61, 11))
    out = desk.process(far.pk, trigger="sweep")
    assert out.reason == "check_failed:lead_time"
    one_row(far, L.HANDED_OFF, "check_failed:lead_time")
    far.refresh_from_db()
    assert far.reception_status == A.PENDING


@pytest.mark.django_db
def test_a_clashing_slot_goes_to_a_person(air_on, customer, catalogue, commits, make_user):
    appt = send_form(customer[0], catalogue, commits)  # AIR accepted: the slot is held
    other_customer = make_user(role="customer", full_name="Other Person")
    profile = CustomerProfile(user=other_customer)
    profile.set_phone("9123456780")
    profile.save()
    clash = Appointment.objects.create(
        customer=other_customer,
        service=catalogue["haircut"],
        service_name="Haircut",
        duration_minutes=30,
        price_total=300,
        gst_amount=0,
        policy_accepted_at=timezone.now(),
        amount_payable=300,
        preferred_start=appt.preferred_start,
        preferred_stylist=catalogue["asha"],
        hold_stylist=catalogue["asha"],
        hold_start=appt.preferred_start,
        hold_end=appt.preferred_start + timedelta(minutes=30),
        reception_status=A.PENDING,
        stylist_status=A.PENDING,
        status=S.REQUESTED,
        contact_name="Other",
        contact_email="o@example.com",
    )
    out = desk.process(clash.pk, trigger="sweep")
    assert out.result == "handed_off" and out.reason == "check_failed:stylist_free"
    clash.refresh_from_db()
    assert clash.reception_status == A.PENDING
    assert AirRequestState.objects.get(appointment=clash).handed_to_desk is True


@pytest.mark.django_db
def test_a_blocked_customer_goes_to_a_person(air_on, customer, catalogue, commits):
    client, user = customer
    appt = send_form(client, catalogue, commits)
    waiting = _waiting(appt)
    User.objects.filter(pk=user.pk).update(is_active=False)
    out = desk.process(waiting.pk, trigger="sweep")
    assert out.reason == "check_failed:customer_active"
    one_row(waiting, L.HANDED_OFF, "check_failed:customer_active")
    waiting.refresh_from_db()
    assert waiting.reception_status == A.PENDING


@pytest.mark.django_db
def test_an_unrated_visit_goes_to_a_person(air_on, customer, catalogue, commits, monkeypatch):
    appt = send_form(customer[0], catalogue, commits)
    waiting = _waiting(appt)
    from people import ratings

    monkeypatch.setattr(ratings, "pending_count", lambda *_a, **_k: 1)
    out = desk.process(waiting.pk, trigger="sweep")
    assert out.reason == "check_failed:unrated_visit"
    one_row(waiting, L.HANDED_OFF, "check_failed:unrated_visit")
    assert Appointment.objects.get(pk=waiting.pk).reception_status == A.PENDING


@pytest.mark.django_db
def test_an_any_stylist_request_is_sent_to_a_free_stylist_by_air(
    air_on, customer, catalogue, commits
):
    # The full rules are in test_any_stylist.py: AIR picks the best-rated free stylist itself.
    appt = send_form(customer[0], catalogue, commits, stylist=None)
    appt.refresh_from_db()
    assert appt.reception_status == A.ACCEPTED and appt.hold_stylist_id is not None


@pytest.mark.django_db
def test_an_error_is_logged_and_never_stops_the_sweep(
    air_on, customer, catalogue, commits, monkeypatch
):
    first = send_form(customer[0], catalogue, commits)
    second = _waiting(send_form(customer[0], catalogue, commits, start=day_at(4, 12).isoformat()))
    first = _waiting(first)
    real = desk.run_checks
    calls = {"n": 0}

    def boom(appt, now):
        calls["n"] += 1
        if appt.pk == first.pk:
            raise RuntimeError("secret detail that must never be logged")
        return real(appt, now)

    monkeypatch.setattr(desk, "run_checks", boom)
    counts = desk.sweep()
    assert counts["failed"] == 1 and counts["accepted"] == 1
    failed = one_row(first, L.FAILED, "error:RuntimeError")
    assert "secret" not in str(failed.after) + failed.reason_code
    assert Appointment.objects.get(pk=second.pk).reception_status == A.ACCEPTED
    assert "RuntimeError" in cover.state().last_sweep_error
    assert first.pk is not None and calls["n"] >= 2


@pytest.mark.django_db
def test_a_failed_accept_leaves_no_stuck_claim(air_on, customer, catalogue, commits, monkeypatch):
    from scheduling import approvals

    appt = _waiting(send_form(customer[0], catalogue, commits))

    def refuse(*a, **k):
        raise booking.BookingError("The stylist just became busy.", code="conflict")

    monkeypatch.setattr(approvals, "reception_accept", refuse)
    out = desk.process(appt.pk, trigger="sweep")
    assert out.result == "handed_off" and out.reason == "check_failed:conflict"
    state = AirRequestState.objects.get(appointment=appt)
    assert state.handed_to_desk is True and state.handled_by == "human"  # a person has it now
    assert Appointment.objects.get(pk=appt.pk).reception_status == A.PENDING


# ------------------------------------------------ presence is never stale


@pytest.mark.django_db
def test_a_receptionist_who_signed_out_no_longer_counts_as_present(air_on, reception_user):
    from accounts import work

    now = timezone.now()
    work.start(reception_user, now)
    assert cover.is_active(now) is False and cover.receptionist_logged_in(now)
    work.end(reception_user, now=now + timedelta(minutes=1))
    assert cover.receptionist_logged_in(now + timedelta(minutes=1)) is False
    assert cover.is_active(now + timedelta(minutes=1)) is True


@pytest.mark.django_db
def test_an_expired_or_quiet_session_no_longer_counts_as_present(air_on, reception_user):
    now = timezone.now()
    WorkSession.objects.create(
        user=reception_user,
        started_at=now - timedelta(hours=3),
        last_seen_at=now - timedelta(minutes=11),
    )
    # Still "open" in the table, but quiet for longer than the presence window (10 minutes).
    assert cover.receptionist_logged_in(now) is False and cover.is_active(now) is True
    WorkSession.objects.filter(user=reception_user).update(last_seen_at=now - timedelta(minutes=9))
    assert cover.receptionist_logged_in(now) is True
    obj = config.get_settings()
    obj.presence_minutes = 5
    obj.save()
    assert cover.receptionist_logged_in(now) is False  # the window is a setting


@pytest.mark.django_db
def test_presence_is_judged_on_the_server_clock_in_india_for_shifts(air_on, reception_user):
    now = timezone.now()
    ShiftSchedule.objects.create(
        user=reception_user,
        weekday=(now.astimezone(cover.IST).weekday() + 1) % 7,  # tomorrow's shift only
        start_time=now.astimezone(cover.IST).time(),
        end_time=(now + timedelta(minutes=1)).astimezone(cover.IST).time(),
    )
    assert cover.receptionist_on_shift(now) is False


@pytest.mark.django_db
def test_the_admin_force_on_override_is_honoured(
    air_on, customer, catalogue, commits, reception_user, admin_user
):
    now = timezone.now()
    WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    cover.force("on", actor=admin_user, reason="testing the override")
    appt = send_form(customer[0], catalogue, commits)
    appt.refresh_from_db()
    assert appt.reception_status == A.ACCEPTED


# ------------------------------------------------ commands, status, lists


@pytest.mark.django_db
def test_the_sweep_command_and_the_diagnose_command_explain_everything(
    air_on, customer, catalogue, commits, reception_user, capsys
):
    now = timezone.now()
    WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    appt = send_form(customer[0], catalogue, commits)
    call_command("air_cover_sweep", "--verbose")
    out = capsys.readouterr().out
    assert str(appt.pk) in out and "cover_inactive" in out
    call_command("air_cover_diagnose")
    out = capsys.readouterr().out
    assert "cover active now: NO" in out and "receptionist is signed in" in out
    assert "LAST 10 AIR LOG ROWS" in out and str(appt.pk) in out
    call_command("air_cover_diagnose", str(appt.pk))
    out = capsys.readouterr().out
    assert "[PASS] amount_limit" in out and "[FAIL] cover_active" in out and "verdict" in out


@pytest.mark.django_db
def test_the_diagnose_command_says_loudly_when_cover_is_off(capsys):
    call_command("air_cover_diagnose")
    assert "AIR desk cover is OFF, AIR will not act" in capsys.readouterr().out


@pytest.mark.django_db
def test_the_admin_status_box(air_on, logged_in, customer, catalogue, commits, reception_user):
    now = timezone.now()
    WorkSession.objects.create(user=reception_user, started_at=now, last_seen_at=now)
    send_form(customer[0], catalogue, commits)
    admin, _ = logged_in("admin")
    body = admin.get("/api/admin/air/status/").json()
    assert body["cover_enabled"] is True and body["cover_active"] is False
    assert body["scheduler_stale"] is True and body["last_sweep_at"] is None
    assert body["waiting_count"] == 1 and "cover_inactive" in body["waiting"][0]["reason"]
    desk.sweep()
    body = admin.get("/api/admin/air/status/").json()
    assert body["scheduler_stale"] is False and body["last_sweep_at"]
    CoverState.objects.filter(pk=1).update(last_sweep_at=timezone.now() - timedelta(minutes=6))
    assert admin.get("/api/admin/air/status/").json()["scheduler_stale"] is True
    for role in ("customer", "stylist", "receptionist"):
        client, _ = logged_in(role)
        assert client.get("/api/admin/air/status/").status_code == 403


@pytest.mark.django_db
def test_loading_the_requests_list_runs_a_lazy_sweep(
    air_on, logged_in, customer, catalogue, commits, admin_user
):
    obj = config.get_settings()
    obj.air_enabled = False
    obj.save()
    appt = send_form(customer[0], catalogue, commits)
    obj.air_enabled = True
    obj.save()
    desk_client, _ = logged_in("receptionist")  # signing in ends cover ...
    cover.force("on", actor=admin_user, reason="cover for the lazy sweep test")  # ... until forced
    CoverState.objects.filter(pk=1).update(last_sweep_at=timezone.now() - timedelta(minutes=10))
    body = desk_client.get("/api/desk/appointments/?status=requested").json()
    row = next(r for r in body["results"] if r["id"] == str(appt.pk))
    assert row["reception_status"] == "accepted"
    assert row["reception_by_air"] is True and row["reception_accepted_at"]


@pytest.mark.django_db
def test_the_sweep_command_is_one_of_the_scheduled_jobs():
    from core import jobs

    assert "air_cover_sweep" in [name for name, _ in jobs.JOBS]


# ------------------------------------------------ policy


DOCUMENTED = {
    "air.services.read",
    "air.availability.read",
    "air.hold.create",
    "air.hold.release",
    "air.booking.request",
    "air.reception.accept",
    "air.payment_link.create",
    "air.payment_link.resend",
    "air.payment_link.expire",
    "air.notify.customer",
    "air.requests.read_own",
    "air.handoff",
    "air.undo",
    "air.products.read",
    "air.order.create",
    "air.order.update",
    "air.order.read_own",
    "air.visit_product.add",
    "air.cancel_own",
    "air.callback",
}


def test_air_is_allowed_exactly_the_documented_actions():
    assert set(actor.ALLOWED_ACTIONS) == DOCUMENTED
    assert {a for a in DOCUMENTED if policy.service_actor_can("air", a)} == DOCUMENTED


@pytest.mark.parametrize(
    "action",
    [*actor.NEVER, "air.stylist.accept", "air.refund", "air.reception.decline", "air.anything"],
)
def test_air_is_denied_everything_else(action):
    assert actor.allowed(action) is False
    with pytest.raises(actor.AirDenied):
        actor.require(action)


@pytest.mark.django_db
def test_the_desk_cover_path_uses_only_the_accept_action_and_never_the_stylists(
    air_on, customer, asha, catalogue, commits
):
    appt = send_form(customer[0], catalogue, commits)
    assert (
        appt.stylist_status == A.PENDING and appt.stylist_accepted_at is None
        if hasattr(appt, "stylist_accepted_at")
        else appt.stylist_status == A.PENDING
    )
