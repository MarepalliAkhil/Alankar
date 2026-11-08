""" "Talk to a person": a callback note on the receptionist's normal request screen.

The receptionist and the admin NEVER get access to the chat. The note is fixed wording written by
the server (plus the related request's service and time when there is one); it holds no message
text and no contact details beyond what the desk already sees on the customer's profile.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from air import actionlog, actor, handover
from air.models import AIActionLog, CallbackNote
from chatbot import data
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

IN_FLIGHT = (
    AppointmentStatus.REQUESTED,
    AppointmentStatus.AWAITING_PAYMENT,
    AppointmentStatus.SCHEDULED,
)
REPEAT_WINDOW = timedelta(minutes=30)


def shop_contact() -> dict:
    """The shop phone and opening hours, exactly as the rest of the site shows them."""
    facts = data.shop_facts()
    return {"phone": facts["phone"], "hours": facts["hours"]}


def request_callback(
    *,
    customer,
    session_id: str = "",
    now: datetime | None = None,
    assist: bool = False,
) -> CallbackNote:
    """Stores one callback note (asking twice within half an hour reuses the first)."""
    now = now or timezone.now()
    actor.require("air.callback", now=now, assist=assist)
    with transaction.atomic():
        recent = CallbackNote.objects.filter(
            customer=customer, status=CallbackNote.Status.OPEN, created_at__gte=now - REPEAT_WINDOW
        ).first()
        if recent is not None:
            return recent
        appt = (
            Appointment.objects.filter(customer=customer, status__in=IN_FLIGHT)
            .order_by("-created_at")
            .first()
        )
        text = "Customer asked to talk to a person. Please call them back."
        if appt is not None:
            when = (
                booking.when_text(appt.start or appt.preferred_start)
                if (appt.start or appt.preferred_start)
                else ""
            )
            text = f"Customer asked to talk to a person about: {appt.service_name} {when}".strip()
        note = CallbackNote.objects.create(customer=customer, appointment=appt, note=text[:200])
        actionlog.write(
            "callback_note",
            status=AIActionLog.Status.HANDED_OFF,
            customer=customer,
            booking=appt,
            session_id=session_id,
            reason_code="customer_asked",
            now=now,
        )
    if appt is not None:
        handover.handoff(appt.pk, reason="customer_asked", now=now)
    return note


def open_notes():
    return CallbackNote.objects.filter(status=CallbackNote.Status.OPEN).select_related(
        "customer", "appointment"
    )


def mark_done(note_id, *, by) -> CallbackNote:
    with transaction.atomic():
        note = CallbackNote.objects.select_for_update().filter(pk=note_id).first()
        if note is None:
            raise actor.AirDenied("not_found", "No such callback request.")
        if note.status != CallbackNote.Status.DONE:
            note.status = CallbackNote.Status.DONE
            note.done_at = timezone.now()
            note.done_by = by
            note.save(update_fields=["status", "done_at", "done_by"])
    return note
