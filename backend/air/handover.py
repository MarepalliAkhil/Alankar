"""Who is handling a request: AIR or a person. One row-level claim, never both.

`claim()` locks the request's `AirRequestState` row (select_for_update), refuses if a person has
it or it was handed to the desk, re-checks that cover is still active INSIDE the lock, and only
then marks it as AIR's. `hand_to_desk()` (run when cover ends) takes the same lock, so the two can
never interleave: a request is either finished by AIR before the hand-over, or it is marked
"handed to desk" for the receptionist's needs-you list and AIR never touches it again.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from air import actionlog, actor, cover
from air.models import AIActionLog, AirRequestState
from scheduling.models import AppointmentStatus

S = AppointmentStatus
H = AirRequestState.Handler
IN_FLIGHT = (S.REQUESTED, S.AWAITING_PAYMENT)


@contextmanager
def claim(appointment_id, *, now: datetime | None = None):
    """Yields the locked state row if AIR may act on this request right now."""
    now = now or timezone.now()
    with transaction.atomic():
        state = (
            AirRequestState.objects.select_for_update()
            .select_related("appointment")
            .filter(appointment_id=appointment_id)
            .first()
        )
        if state is None:
            raise actor.AirDenied("not_air_request", "AIR did not submit this request.")
        if state.handled_by == H.HUMAN or state.handed_to_desk:
            raise actor.AirDenied("handled_by_desk", "The front desk has this request.")
        if not cover.is_active(now):
            raise actor.AirDenied("outside_cover", "AIR is not covering the front desk now.")
        state.handled_by = H.AIR
        state.claimed_at = now
        state.save(update_fields=["handled_by", "claimed_at"])
        yield state


def claim_for_person(appointment_id, *, now: datetime | None = None) -> bool:
    """A person takes over an AIR request. Returns False if there is nothing to take."""
    now = now or timezone.now()
    with transaction.atomic():
        state = (
            AirRequestState.objects.select_for_update()
            .filter(appointment_id=appointment_id)
            .first()
        )
        if state is None:
            return False
        state.handled_by = H.HUMAN
        state.claimed_at = now
        state.save(update_fields=["handled_by", "claimed_at"])
    return True


def hand_to_desk(period, now: datetime) -> int:
    """Cover just ended: mark every unfinished AIR request for the receptionist."""
    count = 0
    with transaction.atomic():
        rows = (
            AirRequestState.objects.select_for_update(of=("self",))
            .select_related("appointment")
            .filter(handed_to_desk=False, appointment__status__in=IN_FLIGHT)
        )
        for state in rows:
            state.handed_to_desk = True
            state.handed_at = now
            state.handled_by = H.HUMAN
            state.save(update_fields=["handed_to_desk", "handed_at", "handled_by"])
            actionlog.write(
                "handoff_to_desk",
                status=AIActionLog.Status.HANDED_OFF,
                customer=state.appointment.customer,
                booking=state.appointment,
                session_id=state.session_id,
                before={"status": state.appointment.status},
                after={"status": state.appointment.status, "reason": "cover_ended"},
                reason_code="cover_ended",
                period=period,
                now=now,
            )
            count += 1
    return count


def needs_desk():
    """Requests AIR handed to the desk that are still unfinished (for the receptionist's list)."""
    return AirRequestState.objects.filter(
        handed_to_desk=True, appointment__status__in=IN_FLIGHT
    ).select_related("appointment")


def handoff(appointment_id, *, reason: str = "customer_asked", now: datetime | None = None) -> None:
    """AIR asks the desk to take over one request (the 'handoff_to_desk' tool)."""
    actor.require("air.handoff", now=now)
    now = now or timezone.now()
    with transaction.atomic():
        state = (
            AirRequestState.objects.select_for_update()
            .select_related("appointment")
            .filter(appointment_id=appointment_id)
            .first()
        )
        if state is None or state.handed_to_desk:
            return
        state.handed_to_desk = True
        state.handed_at = now
        state.handled_by = H.HUMAN
        state.save(update_fields=["handed_to_desk", "handed_at", "handled_by"])
        actionlog.write(
            "handoff_to_desk",
            status=AIActionLog.Status.HANDED_OFF,
            customer=state.appointment.customer,
            booking=state.appointment,
            session_id=state.session_id,
            reason_code=reason,
            now=now,
        )
