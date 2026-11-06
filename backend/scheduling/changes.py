"""Sorry notes when STAFF change a customer's slot (Task 13C).

Whenever a receptionist or a stylist moves, reassigns or cancels a customer's confirmed slot, the
customer automatically gets a sincere apology: in-app, simulated email and simulated text. It
names the old and new time, the reason CATEGORY the staff member picked (never a stylist's private
reason), and what happens to any payment. The same record (`SlotChange`) also holds what the
customer then did: accept the new time, choose another time, or cancel with a refund.

Changes the customer makes themself never come through here. The note is created in the same
transaction as the change (so it can never describe a change that rolled back), once per change.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from notifications import service as notify_service
from notifications import templates
from notifications.models import Notification
from scheduling import booking
from scheduling.models import Appointment, SlotChange

TEMPLATE_FOR = {
    SlotChange.Kind.MOVED: "slot_moved",
    SlotChange.Kind.REASSIGNED: "slot_reassigned",
    SlotChange.Kind.CANCELLED: "slot_cancelled",
}
DUPLICATE_WINDOW = timedelta(seconds=90)


def check_reason(reason: str) -> str:
    """Staff must pick one of the preset categories before saving a change."""
    if reason not in templates.CHANGE_REASONS:
        raise booking.BookingError("Choose a reason from the list.", field="reason")
    return reason


def payment_note(appt: Appointment, kind: str, refund_amount: Decimal) -> str:
    paid = booking.paid_amount(appt)
    if kind == SlotChange.Kind.CANCELLED:
        if refund_amount > 0:
            return templates.PAYMENT_NOTES["refund"].format(amount=refund_amount)
        return templates.PAYMENT_NOTES["none"]
    return templates.PAYMENT_NOTES["valid"] if paid > 0 else templates.PAYMENT_NOTES["none"]


def record_change(
    appt: Appointment,
    *,
    kind: str,
    reason: str,
    actor,
    old_start: datetime | None,
    new_start: datetime | None,
    old_stylist=None,
    new_stylist=None,
    refund_amount: Decimal = Decimal("0"),
) -> SlotChange | None:
    """Saves the change and sends the sorry note. The caller holds the appointment row lock and
    is inside the transaction that made the change. Returns None if the very same change was
    already noted a moment ago (a retry), so the customer is never told twice."""
    check_reason(reason)
    last = appt.changes.order_by("-seq").first()
    old_name = old_stylist.display_name if old_stylist else ""
    new_name = new_stylist.display_name if new_stylist else ""
    if (
        last is not None
        and last.kind == kind
        and last.old_start == old_start
        and last.new_start == new_start
        and last.new_stylist_name == new_name
        and timezone.now() - last.created_at < DUPLICATE_WINDOW
    ):
        return None
    with transaction.atomic():
        change = SlotChange.objects.create(
            appointment=appt,
            seq=(last.seq + 1) if last else 1,
            kind=kind,
            reason=reason,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            actor_role=getattr(actor, "role", "") or "",
            old_start=old_start,
            new_start=new_start,
            old_stylist_name=old_name,
            new_stylist_name=new_name,
        )
        notify_service.tell_customer(
            appt,
            Notification.Kind.SLOT_CHANGE,
            TEMPLATE_FOR[kind],
            old_when=booking.when_text(old_start) if old_start else "",
            new_when=booking.when_text(new_start) if new_start else "",
            reason=templates.CHANGE_REASONS[reason],
            payment_note=payment_note(appt, kind, refund_amount),
            stylist=new_name,
        )
        audit(
            AuditLog.Action.SLOT_CHANGE_NOTIFIED,
            actor=actor,
            target=appt.customer,
            appointment=str(appt.id),
            change=str(change.id),
            kind=kind,
            reason=reason,
        )
    return change


# --------------------------------------------------------------------------- the customer answers


class ChangeError(Exception):
    pass


def open_change(appt: Appointment) -> SlotChange:
    """The staff change this customer has not answered yet."""
    change = appt.changes.filter(response=SlotChange.Response.PENDING).order_by("-seq").first()
    if change is None:
        raise ChangeError("There is nothing to answer on this booking.")
    return change


def _mark(change: SlotChange, response: str, customer) -> None:
    change.response = response
    change.responded_at = timezone.now()
    change.save(update_fields=["response", "responded_at"])
    audit(
        AuditLog.Action.SLOT_CHANGE_RESPONDED,
        actor=customer,
        target=customer,
        appointment=str(change.appointment_id),
        change=str(change.id),
        response=response,
    )


def respond(appt_id, *, customer, response: str, preferred=None, note: str = "") -> Appointment:
    """The customer's three buttons. Only the customer who owns the booking can use them."""
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id, customer=customer)
        try:
            change = open_change(appt)
        except ChangeError as exc:
            raise booking.BookingError(str(exc)) from exc
        if response == "accept":
            if change.kind == SlotChange.Kind.CANCELLED or appt.status not in booking.CANCELLABLE:
                raise booking.BookingError("There is no new time to accept.")
            _mark(change, SlotChange.Response.ACCEPTED, customer)
            booking.record(appt, "change_accepted", actor=customer, from_status=appt.status)
        elif response == "rebook":
            if change.kind != SlotChange.Kind.CANCELLED:
                if preferred is None or preferred <= timezone.now():
                    raise booking.BookingError("Choose a preferred new time in the future.")
                if appt.status not in booking.MOVABLE:
                    raise booking.BookingError("This booking cannot be moved now.")
                appt.reschedule_requested = True
                appt.reschedule_preferred = preferred
                appt.reschedule_note = note[:300]
                appt.save()
                booking.record(
                    appt, "reschedule", actor=customer, from_status=appt.status, note=note
                )
            _mark(change, SlotChange.Response.REBOOK, customer)
        elif response == "cancel":
            if change.kind == SlotChange.Kind.CANCELLED or appt.status not in booking.CANCELLABLE:
                raise booking.BookingError("This booking is already cancelled.")
            booking.customer_cancel(
                appt.id,
                customer=customer,
                reason="Cancelled after a change by the salon",
                change=True,
            )
            _mark(change, SlotChange.Response.CANCELLED, customer)
        else:
            raise booking.BookingError("Choose accept, rebook or cancel.")
    return Appointment.objects.get(pk=appt_id)
