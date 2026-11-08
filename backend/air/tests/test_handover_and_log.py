"""Hand-over to a person (one claim, never both), the append-only action log, and undo."""

from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone

from accounts import work
from air import actor, handover, service
from air.models import AIActionLog, AirRequestState, SlotHold
from air.tests.conftest import make_hold, stylist_says_yes, submit
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
POSTGRES = connection.vendor == "postgresql"


# ---------------------------------------------------------------- the claim


@pytest.mark.django_db
def test_a_person_who_has_the_request_blocks_air_completely(air_on, shopper, catalogue):
    from scheduling import approvals

    appt = submit(shopper, make_hold(shopper, catalogue))
    # A person takes the request (their claim), so AIR must not process it again.
    assert handover.claim_for_person(appt.pk) is True
    with pytest.raises(actor.AirDenied) as denied:
        service.accept_reception(appt.pk)
    assert denied.value.code == "handled_by_desk"
    from air import links

    stylist_says_yes(appt, catalogue)
    with pytest.raises(actor.AirDenied):
        links.resend(appt.pk)
    appt.refresh_from_db()
    assert appt.status == S.AWAITING_PAYMENT  # people carry on normally
    assert approvals  # the normal path is untouched


@pytest.mark.django_db
def test_air_and_a_person_cannot_both_accept_the_receptionist_side(
    air_on, shopper, catalogue, reception_user, monkeypatch
):
    from scheduling import approvals

    # AIR cannot auto-accept here, so the request waits at the desk.
    def refuse(*args, **kwargs):
        raise actor.AirDenied("outside_cover")

    with monkeypatch.context() as local:
        local.setattr(service, "accept_reception", refuse)
        appt = submit(shopper, make_hold(shopper, catalogue))
    approvals.reception_accept(appt.pk, actor=reception_user)  # the person answers first
    appt.refresh_from_db()
    assert appt.reception_status == "accepted" and appt.confirmed_by_id == reception_user.pk
    with pytest.raises(actor.AirDenied) as denied:
        service.accept_reception(appt.pk)
    assert denied.value.code == "already_handled"
    assert AIActionLog.objects.filter(action_type="accept_reception").count() == 0


@pytest.mark.django_db
def test_a_receptionist_arriving_hands_unfinished_work_to_the_desk(
    air_on, shopper, catalogue, reception_user
):
    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    work.start(reception_user)
    state = AirRequestState.objects.get(appointment=appt)
    assert state.handed_to_desk is True and state.handed_at is not None
    assert state.handled_by == AirRequestState.Handler.HUMAN
    assert appt.pk in [s.appointment_id for s in handover.needs_desk()]
    row = AIActionLog.objects.get(action_type="handoff_to_desk", booking_ref=appt.pk)
    assert row.status == AIActionLog.Status.HANDED_OFF and row.reason_code == "cover_ended"
    assert row.cover_period is not None  # the period that just ended


@pytest.mark.django_db
def test_finished_requests_are_not_handed_over(air_on, shopper, catalogue, reception_user):
    from air.tests.conftest import payment_token_for

    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    booking.pay(appt.pk, customer=shopper, token=payment_token_for(appt), succeed=True)
    work.start(reception_user)
    assert AirRequestState.objects.get(appointment=appt).handed_to_desk is False


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(not POSTGRES, reason="needs real row locks (PostgreSQL)")
def test_a_person_and_air_racing_for_one_request_never_both_win(
    air_on, shopper, catalogue, reception_user
):
    import threading

    from scheduling import approvals

    appt = submit(shopper, make_hold(shopper, catalogue))
    AirRequestState.objects.filter(appointment=appt).update(handled_by="")
    Appointment.objects.filter(pk=appt.pk).update(reception_status="pending")
    outcomes = []

    def by_air():
        try:
            service.accept_reception(appt.pk)
            outcomes.append("air")
        except Exception:  # noqa: BLE001
            outcomes.append("air_refused")
        finally:
            connection.close()

    def by_person():
        try:
            handover.claim_for_person(appt.pk)
            approvals.reception_accept(appt.pk, actor=reception_user)
            outcomes.append("person")
        except Exception:  # noqa: BLE001
            outcomes.append("person_refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=by_air), threading.Thread(target=by_person)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)
    appt.refresh_from_db()
    assert appt.reception_status == "accepted"
    assert AIActionLog.objects.filter(action_type="accept_reception").count() <= 1


# ---------------------------------------------------------------- the action log


@pytest.mark.django_db
def test_every_air_action_is_logged_with_only_allow_listed_fields(air_on, shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    kinds = set(AIActionLog.objects.values_list("action_type", flat=True))
    assert {"hold_slot", "submit_booking_request", "accept_reception"} <= kinds
    for row in AIActionLog.objects.all():
        assert row.actor == "air" and row.channel == "chat"
        assert row.cover_period is not None
        assert row.customer_ref == shopper.pk
        assert set(row.before) | set(row.after) <= {
            "status",
            "start",
            "end",
            "service_id",
            "stylist_id",
            "hold_id",
            "request_id",
            "booking_id",
            "expires_at",
            "link_status",
            "resend_count",
            "count",
            "reason",
            "tool",
            "event",
            "hold_status",
            "amount",
        }
        blob = f"{row.before}{row.after}{row.session_id}{row.reason_code}"
        for private in (shopper.email, shopper.full_name, "9876543210"):
            assert private not in blob
    hold_row = AIActionLog.objects.get(action_type="hold_slot")
    assert hold_row.reversible_until and hold_row.reversible_until > timezone.now()
    assert hold_row.session_id == "sess-1" and hold_row.order_ref is None


@pytest.mark.django_db
def test_the_log_is_append_only(air_on, shopper, catalogue):
    make_hold(shopper, catalogue)
    row = AIActionLog.objects.get()
    row.reason_code = "edited"
    with pytest.raises(PermissionError):
        row.save()
    with pytest.raises(PermissionError):
        row.delete()
    with pytest.raises(PermissionError):
        AIActionLog.objects.all().delete()
    with pytest.raises(PermissionError):
        AIActionLog.objects.all().update(reason_code="x")
    assert AIActionLog.objects.get().reason_code == ""


@pytest.mark.django_db
def test_the_log_helper_drops_unlisted_and_personal_fields(air_on):
    from air import actionlog

    row = actionlog.write(
        "demo",
        before={"status": "a", "email": "x@y.z", "name": "Priya", "phone": "98765"},
        after={"start": timezone.now(), "note": "private"},
    )
    assert row.before == {"status": "a"}
    assert list(row.after) == ["start"]


# ---------------------------------------------------------------- undo


@pytest.mark.django_db
def test_air_can_undo_a_hold_inside_the_window(air_on, shopper, catalogue):
    hold = make_hold(shopper, catalogue)
    original = AIActionLog.objects.get(action_type="hold_slot")
    undone = service.undo(original.pk)
    hold.refresh_from_db()
    assert hold.status == SlotHold.Status.RELEASED and hold.release_reason == "undone"
    assert undone.undo_of_id == original.pk and undone.status == AIActionLog.Status.UNDONE
    assert AIActionLog.objects.count() == 2  # a NEW row; the original is untouched
    assert service.undo(original.pk).pk == undone.pk  # undoing twice changes nothing


@pytest.mark.django_db
def test_undo_is_refused_after_the_window(air_on, shopper, catalogue):
    make_hold(shopper, catalogue)
    original = AIActionLog.objects.get(action_type="hold_slot")
    late = timezone.now() + timedelta(minutes=11)
    with pytest.raises(actor.AirDenied) as denied:
        service.undo(original.pk, now=late)
    assert denied.value.code == "not_undoable"


@pytest.mark.django_db
def test_air_can_undo_an_unpaid_request(air_on, shopper, catalogue):
    appt = submit(shopper, make_hold(shopper, catalogue))
    original = AIActionLog.objects.get(action_type="submit_booking_request")
    service.undo(original.pk)
    appt.refresh_from_db()
    assert appt.status == S.CANCELLED
    assert SlotHold.objects.get(request=appt).status == SlotHold.Status.RELEASED


@pytest.mark.django_db
def test_air_never_undoes_a_paid_booking(air_on, shopper, catalogue):
    from air.tests.conftest import payment_token_for

    appt = submit(shopper, make_hold(shopper, catalogue))
    stylist_says_yes(appt, catalogue)
    booking.pay(appt.pk, customer=shopper, token=payment_token_for(appt), succeed=True)
    original = AIActionLog.objects.get(action_type="submit_booking_request")
    with pytest.raises(actor.AirDenied) as denied:
        service.undo(original.pk)
    assert denied.value.code == "paid_booking"
    appt.refresh_from_db()
    assert appt.status == S.SCHEDULED  # untouched: the human refund flow handles it
    refused = AIActionLog.objects.get(action_type="undo_refused")
    assert refused.status == AIActionLog.Status.HANDED_OFF and refused.undo_of_id == original.pk
