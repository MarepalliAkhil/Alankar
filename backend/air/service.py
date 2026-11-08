"""The things AIR can actually do, one function each. Every function:

  * starts with `actor.require(<allow-listed action>)` (deny by default, cover mode checked),
  * only touches the CURRENT customer's own data,
  * reuses the existing booking code, so the mandatory-rating block, email check, prices and the
    dual approval all apply exactly as for a person,
  * writes one row to the append-only action log.
AIR never calls the stylist's side of the approval, refunds, discounts or price changes: there is
no code path for them here.
"""

from __future__ import annotations

from datetime import date, datetime

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import User
from air import actionlog, actor, cover, handover, holds, lifecycle
from air.models import AIActionLog, AirRequestState, SlotHold
from scheduling import approvals, booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus, Service

S = AppointmentStatus
A = ApprovalStatus
AUDIT_ACCEPT = "air_reception_accept"


# --------------------------------------------------------------------------- reading


def list_services(*, now: datetime | None = None, assist: bool = False) -> list[dict]:
    """Active services with their public prices. Nothing private."""
    actor.require("air.services.read", now=now, assist=assist)
    out = []
    for service in Service.objects.filter(is_active=True).prefetch_related("variants", "addons"):
        out.append(
            {
                "id": str(service.id),
                "name": service.name,
                "summary": service.summary,
                "duration_minutes": service.duration_minutes,
                "from_price": str(service.from_price),
                "variants": [
                    {
                        "id": str(v.id),
                        "label": v.label,
                        "price": str(v.price),
                        "duration_minutes": v.duration_minutes,
                    }
                    for v in service.active_variants()
                ],
            }
        )
    return out


def free_slots(
    *,
    service: Service,
    variant_id,
    addon_ids,
    day: date,
    now: datetime | None = None,
    assist: bool = False,
) -> list[dict]:
    """Free start times on `day` for a service, with the stylists free at each time."""
    actor.require("air.availability.read", now=now, assist=assist)
    holds.expire_due(now)
    minutes = booking.quote(service, variant_id, addon_ids).duration_minutes
    stylists = list(booking.qualified_stylists(service, public_only=True))
    ids = [s.id for s in stylists]
    names = {s.id: s.display_name for s in stylists}
    return [
        {
            "start": start,
            "stylists": [{"id": str(i), "name": names.get(i, "")} for i in free_ids],
        }
        for start, free_ids in booking.free_starts(day, minutes, ids)
    ]


def my_requests(customer: User, *, now: datetime | None = None, assist: bool = False) -> list[dict]:
    """The customer's OWN requests and bookings: status and time only. Never another customer's,
    never the stylist's private decline reason."""
    actor.require("air.requests.read_own", now=now, assist=assist)
    holds.expire_due(now)
    rows = Appointment.objects.filter(customer=customer).order_by("-created_at")[:20]
    return [
        {
            "id": str(a.id),
            "service": a.service_name,
            "when": a.start or a.preferred_start,
            "status": a.status,
            "reception": a.reception_status,
            "stylist": a.stylist_status,
            "pay_by": a.awaiting_payment_until if a.status == S.AWAITING_PAYMENT else None,
        }
        for a in rows
    ]


# --------------------------------------------------------------------------- booking


def submit_booking(
    *,
    customer: User,
    hold_id,
    contact: dict,
    notes: str = "",
    allergies: str = "",
    session_id: str,
    customer_confirmed: bool,
    now: datetime | None = None,
    assist: bool = False,
) -> Appointment:
    """Creates the booking request for a slot the customer HAS held and has explicitly confirmed
    in chat. Then AIR accepts the front-desk side if (and only if) it is still covering."""
    now = now or timezone.now()
    actor.require("air.booking.request", now=now, assist=assist)
    if customer_confirmed is not True or not session_id:
        raise actor.AirDenied("not_confirmed", "The customer has not confirmed this booking.")
    holds.expire_due(now)
    with transaction.atomic():
        hold = (
            SlotHold.objects.select_for_update()
            .select_related("stylist", "service")
            .filter(pk=hold_id, customer=customer)  # someone else's hold looks like no hold
            .first()
        )
        if hold is None:
            raise actor.AirDenied("not_found", "No such held slot.")
        if hold.request_id:
            return hold.request  # sending twice returns the same request
        if hold.status != SlotHold.Status.ACTIVE or hold.expires_at <= now:
            raise booking.BookingError(
                "The held time ran out. Please pick a time again.", code="hold_expired"
            )
        with holds.exempt(hold.pk):
            appt = booking.create_request(
                customer=customer,
                service=hold.service,
                variant_id=hold.variant_id,
                addon_ids=hold.addon_ids,
                start=hold.starts_at,
                stylist=hold.stylist,
                contact=contact,
                notes=notes,
                allergies=allergies,
            )
        holds.attach(hold, appt)
        # The stylist has the same window as the hold, so a stalled request ends with it.
        appt.approval_expires_at = min(appt.approval_expires_at or hold.expires_at, hold.expires_at)
        appt.save(update_fields=["approval_expires_at", "updated_at"])
        state = AirRequestState.objects.create(
            appointment=appt,
            session_id=session_id[:64],
            customer_confirmed_at=now,
            cover_period=cover.current_period(),
        )
        actionlog.write(
            "submit_booking_request",
            customer=customer,
            booking=appt,
            session_id=session_id,
            after={
                "request_id": appt.pk,
                "status": appt.status,
                "start": appt.preferred_start,
                "stylist_id": hold.stylist_id,
                "service_id": hold.service_id,
            },
            reversible=True,
            now=now,
        )
        lifecycle.tell(state, appt, "received")
    try:
        accept_reception(appt.pk, now=now)
    except actor.AirDenied:
        pass  # not covering any more: the request waits for a person
    except booking.BookingError as exc:
        actionlog.write(
            "accept_reception",
            status=AIActionLog.Status.FAILED,
            customer=customer,
            booking=appt,
            session_id=session_id,
            reason_code=(exc.code or "failed")[:40],
            now=now,
        )
    appt.refresh_from_db()
    return appt


def accept_reception(appt_id, *, now: datetime | None = None) -> Appointment:
    """AIR accepts the RECEPTIONIST side of the dual approval. Only while covering, and only for
    a request AIR itself created from a confirmed customer session. Never the stylist's side."""
    now = now or timezone.now()
    actor.require("air.reception.accept", now=now)
    with handover.claim(appt_id, now=now) as state:
        # A chat request needs its confirmed chat session. A form request (source "form") was
        # sent by the customer pressing the form's own Send, which is that confirmation.
        if not state.customer_confirmed_at or (state.source == "chat" and not state.session_id):
            raise actor.AirDenied("not_confirmed", "No confirmed customer session.")
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status != S.REQUESTED or appt.reception_status != A.PENDING:
            raise actor.AirDenied("already_handled", "This request is already answered.")
        approvals.reception_accept(appt_id, actor=None, by_air=True)
        appt.refresh_from_db()
        state.accepted_at = now
        state.save(update_fields=["accepted_at"])
        audit(AUDIT_ACCEPT, target=appt.customer, appointment=str(appt.pk), by="air")
        actionlog.write(
            "accept_reception",
            customer=appt.customer,
            booking=appt,
            session_id=state.session_id,
            reason_code="desk_cover",
            before={"status": S.REQUESTED},
            after={"status": appt.status},
            now=now,
        )
    lifecycle.sync_request(appt_id, now)
    return appt


# --------------------------------------------------------------------------- undo


def undo(log_id, *, now: datetime | None = None, by=None) -> AIActionLog:
    """Reverses one of AIR's own scheduling changes inside the short undo window. A paid booking
    is never touched: it goes to the people who handle refunds.

    `by`: a receptionist or the admin pressed Undo on the AIR activity page (Task 3). A person
    may undo AIR's own action at any time inside the window, cover or not; AIR itself may only
    undo while it covers the desk."""
    now = now or timezone.now()
    if by is None:
        actor.require("air.undo", now=now)
    refused = None
    with transaction.atomic():
        original = AIActionLog.objects.select_for_update().filter(pk=log_id).first()
        if original is None or original.actor != actor.ACTOR or original.undo_of_id:
            raise actor.AirDenied("not_found", "No such AIR action.")
        existing = original.undone_by.first()
        if existing is not None:
            return existing
        if (
            original.status != AIActionLog.Status.DONE
            or not original.reversible_until
            or now > original.reversible_until
        ):
            raise actor.AirDenied("not_undoable", "This action can no longer be undone.")
        if original.action_type == "hold_slot":
            hold = (
                SlotHold.objects.select_for_update()
                .filter(pk=original.after.get("hold_id"))
                .first()
            )
            if hold is not None and hold.status in SlotHold.LIVE and hold.request_id is None:
                holds._close(hold, SlotHold.Status.RELEASED, "undone", now)
        elif original.action_type == "submit_booking_request":
            appt = Appointment.objects.select_for_update().get(pk=original.booking_ref)
            if appt.status not in (S.REQUESTED, S.AWAITING_PAYMENT) or appt.payments.exists():
                refused = (appt, original)
            else:
                booking.customer_cancel(appt.pk, customer=appt.customer, reason="Undone by AIR")
                lifecycle.sync_request(appt.pk, now)
        else:
            raise actor.AirDenied("not_undoable", "This action cannot be undone.")
        if refused is None:
            return actionlog.write(
                f"undo_{original.action_type}"[:40],
                status=AIActionLog.Status.UNDONE,
                customer_ref=original.customer_ref,
                booking_ref=original.booking_ref,
                reason_code="undo_by_staff" if by is not None else "undo",
                undo_of=original,
                now=now,
            )
    appt, original = refused
    actionlog.write(
        "undo_refused",
        status=AIActionLog.Status.HANDED_OFF,
        customer_ref=original.customer_ref,
        booking_ref=original.booking_ref,
        reason_code="paid_booking",
        undo_of=original,
        now=now,
    )
    raise actor.AirDenied("paid_booking", "A paid booking goes to the front desk for a refund.")


# --------------------------------------------------------------------------- cancel (own bookings)


def cancel_own(
    *,
    customer: User,
    request_id,
    session_id: str = "",
    now: datetime | None = None,
    assist: bool = False,
) -> Appointment:
    """Cancels the customer's OWN unpaid request, or a paid booking strictly inside the existing
    free-cancellation time (the shop's own code decides, and refunds exactly as it always does).
    Anything else (fees, exceptions, late cancels) raises `needs_desk` and becomes a callback."""
    now = now or timezone.now()
    actor.require("air.cancel_own", now=now, assist=assist)
    appt = Appointment.objects.filter(pk=request_id, customer=customer).first()
    if appt is None:  # somebody else's booking looks exactly like no booking
        raise actor.AirDenied("not_found", "I can't find that booking.")
    if "cancel" not in booking.customer_actions(appt, now):
        actionlog.write(
            "cancel_booking",
            status=AIActionLog.Status.HANDED_OFF,
            customer=customer,
            booking=appt,
            session_id=session_id,
            reason_code="needs_desk",
            now=now,
        )
        raise actor.AirDenied("needs_desk", "The front desk needs to handle this one.")
    was_paid = appt.payments.exists()
    booking.customer_cancel(appt.pk, customer=customer, reason="Cancelled in chat")
    appt.refresh_from_db()
    actionlog.write(
        "cancel_booking",
        customer=customer,
        booking=appt,
        session_id=session_id,
        before={"status": "paid" if was_paid else "unpaid"},
        after={"status": appt.status},
        now=now,
    )
    lifecycle.sync_request(appt.pk, now)
    return appt
