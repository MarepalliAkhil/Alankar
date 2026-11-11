"""Keeps AIR's holds and customer messages in step with what happens to a request.

`sync_request()` looks at the booking's real status (set by the existing dual-approval and payment
code) and then: moves the hold (held -> booked -> finished, or released), and tells the customer
once per event. It is idempotent, so it is safe to call from a signal, from the scheduler job and
lazily on reads. Messages say honestly that a booking is confirmed only after payment.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from air import actionlog
from air.models import AirRequestState, SlotHold
from billing.models import PaymentLink
from notifications import service as notify_service
from notifications import sorry
from notifications.models import Notification
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus

S = AppointmentStatus
A = ApprovalStatus
K = Notification.Kind
LIVE = SlotHold.LIVE

# event name -> template key (see notifications/templates.py)
EVENTS = {
    "received": "air_received",
    "stylist_accepted": "air_stylist_accepted",
    "stylist_declined": "air_stylist_declined",
    "stylist_timeout": "air_stylist_timeout",
    "link_sent": "air_link_sent",
    "link_expired": "air_link_expired",
    "paid": "air_paid",
    "confirmed_free": "air_confirmed_free",
}


def alternatives_text(appt: Appointment, *, avoid_stylist_id=None) -> str:
    """The nearest free times, using the existing nearest-slot search (shared with the other
    sorry notes in `notifications.sorry`)."""
    return sorry.nearest_text(appt, avoid_stylist_id=avoid_stylist_id)


def tell(state: AirRequestState, appt: Appointment, event: str, **context) -> bool:
    """One message per event per request. Returns True if it was sent now."""
    if event in state.notified:
        return False
    state.notified = [*state.notified, event]
    state.save(update_fields=["notified"])
    if event == "link_sent" and appt.awaiting_payment_until:
        context.setdefault("pay_by", booking.when_text(appt.awaiting_payment_until))
    context.setdefault("amount", str(appt.amount_payable))
    context.setdefault("alternatives", "")
    notify_service.tell_customer(
        appt,
        K.BOOKING_OUTCOME,
        EVENTS[event],
        link=f"/customer/pay/{appt.id}" if event == "link_sent" else "/customer/appointments",
        **context,
    )
    return True


def _log_link(appt: Appointment, action_type: str, link_status: str, now: datetime) -> None:
    """A payment link AIR sent (or that expired) on an AIR request, once per request (Task 3:
    so the activity list and the hourly chart show it). Ids and the status only."""
    from air.models import AIActionLog

    if AIActionLog.objects.filter(action_type=action_type, booking_ref=appt.pk).exists():
        return  # AIR's own link code already logged it
    actionlog.write(
        action_type,
        customer=appt.customer,
        booking=appt,
        after={"booking_id": appt.pk, "link_status": link_status},
        reason_code="lifecycle",
        now=now,
    )


def _close_holds(holds, status: str, reason: str, now: datetime) -> None:
    for hold in holds:
        hold.status = status
        hold.release_reason = reason[:40]
        hold.released_at = now
        hold.save(update_fields=["status", "release_reason", "released_at"])


def sync_request(appt_id, now: datetime | None = None) -> bool:
    """Reconciles one AIR request. Returns False when it is not an AIR request."""
    now = now or timezone.now()
    with transaction.atomic():
        state = AirRequestState.objects.select_for_update().filter(appointment_id=appt_id).first()
        if state is None:
            return False
        appt = (
            Appointment.objects.select_for_update(of=("self",))
            .select_related("service", "customer", "hold_stylist", "stylist")
            .get(pk=appt_id)
        )
        holds = list(SlotHold.objects.select_for_update().filter(request=appt, status__in=LIVE))
        status = appt.status
        gone_stylist = appt.hold_stylist_id or appt.stylist_id
        if status == S.REQUESTED:
            if appt.stylist_status == A.ACCEPTED:
                tell(state, appt, "stylist_accepted")
        elif status == S.AWAITING_PAYMENT:
            for hold in holds:
                hold.status = SlotHold.Status.CONFIRMED
                hold.expires_at = appt.awaiting_payment_until or hold.expires_at
                hold.save(update_fields=["status", "expires_at"])
            PaymentLink.objects.filter(
                appointment=appt, status=PaymentLink.Status.ACTIVE, sent_by_air=False
            ).update(sent_by_air=True)
            tell(state, appt, "stylist_accepted")
            if tell(state, appt, "link_sent"):
                _log_link(appt, "create_payment_link", "active", now)
        elif status in (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS):
            for hold in holds:
                hold.status = SlotHold.Status.CONFIRMED
                hold.save(update_fields=["status"])
            if tell(state, appt, "paid" if appt.amount_payable > 0 else "confirmed_free"):
                if appt.amount_payable > 0:
                    _log_link(appt, "payment_link_paid", "paid", now)
        elif status in (S.COMPLETED, S.NO_SHOW):
            _close_holds(holds, SlotHold.Status.CONSUMED, "finished", now)
        elif status == S.DECLINED_BY_STYLIST:
            _close_holds(holds, SlotHold.Status.RELEASED, "stylist_declined", now)
            tell(
                state,
                appt,
                "stylist_declined",
                alternatives=alternatives_text(appt, avoid_stylist_id=gone_stylist),
            )
        elif status == S.EXPIRED:
            _close_holds(holds, SlotHold.Status.EXPIRED, "stylist_timeout", now)
            tell(
                state,
                appt,
                "stylist_timeout",
                alternatives=alternatives_text(appt, avoid_stylist_id=gone_stylist),
            )
        elif status == S.PAYMENT_EXPIRED:
            _close_holds(holds, SlotHold.Status.EXPIRED, "link_expired", now)
            if tell(
                state,
                appt,
                "link_expired",
                alternatives=alternatives_text(appt, avoid_stylist_id=None),
            ):
                _log_link(appt, "expire_payment_link", "expired", now)
        elif status in (S.DECLINED_BY_RECEPTION, S.REJECTED, S.CANCELLED):
            _close_holds(holds, SlotHold.Status.RELEASED, "closed", now)
    return True


def sync_all(now: datetime | None = None) -> int:
    """Reconciles every AIR request that still has a live hold or recent activity."""
    now = now or timezone.now()
    live = SlotHold.objects.filter(request_id=OuterRef("appointment_id"), status__in=LIVE)
    ids = list(
        AirRequestState.objects.annotate(has_live=Exists(live))
        .filter(Q(has_live=True) | Q(appointment__updated_at__gte=now - timedelta(days=2)))
        .values_list("appointment_id", flat=True)
    )
    return sum(1 for pk in ids if sync_request(pk, now))
