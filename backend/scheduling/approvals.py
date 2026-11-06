"""Dual approval of booking requests (Task 13A).

A request becomes a booking only when BOTH the front desk and the stylist have accepted:

* customer chose a stylist  -> the request reaches the front desk and that stylist at once;
* customer chose "any"      -> the front desk assigns a stylist first, then the stylist is asked.

While it waits, the request holds the stylist's time (`hold_*`, see `booking.busy_ranges`). The
hold is released the moment the request is declined, expires, or is finalised (it then becomes an
ordinary awaiting-payment booking that blocks the slot by itself). Every function takes the
appointment row lock, so two simultaneous accepts, or an accept racing a decline or an expiry,
can never both win; answering twice with the same answer changes nothing and sends nothing twice.

Who may call what is decided in the views; this module decides whether it is allowed *now*.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from notifications import service as notify_service
from notifications import templates
from notifications.models import Notification
from people.models import DayOffRequest, StylistProfile
from scheduling import booking, products
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus, Room
from wallet import packagecodes
from website.content import booking_settings

S = AppointmentStatus
A = ApprovalStatus
K = Notification.Kind

MIN_ROOM_NOTE = "No room was free at that time, so the front desk will pick one."


class ApprovalNotFound(Exception):
    """The request does not exist, or is not this person's to see."""


def _lock(appt_id) -> Appointment:
    appt = (
        Appointment.objects.select_for_update(of=("self",))
        .select_related("service", "customer", "hold_stylist", "stylist")
        .filter(pk=appt_id)
        .first()
    )
    if appt is None:
        raise ApprovalNotFound
    return appt


def _vars(appt: Appointment, **extra) -> dict:
    stylist = appt.hold_stylist or appt.stylist
    return {
        "first_name": notify_service.first_name(appt),
        "service": appt.service_name,
        "when": booking.when_text(appt.start or appt.preferred_start),
        "stylist": stylist.display_name if stylist else "",
        **extra,
    }


# --------------------------------------------------------------------------- opening a request


def approval_deadline(start: datetime, now: datetime | None = None) -> datetime:
    """`approval_hours` from now, but always before the visit starts (10 minutes before)."""
    now = now or timezone.now()
    deadline = min(
        now + timedelta(hours=booking_settings()["approval_hours"]), start - timedelta(minutes=10)
    )
    if deadline <= now:
        deadline = min(now + timedelta(minutes=1), start - timedelta(seconds=1))
    return deadline


def _hold(appt: Appointment, stylist: StylistProfile) -> None:
    appt.hold_stylist = stylist
    appt.hold_start = appt.preferred_start
    appt.hold_end = appt.preferred_start + timedelta(minutes=appt.duration_minutes)
    appt.stylist_status = A.PENDING


def open_request(appt: Appointment, *, stylist: StylistProfile | None) -> None:
    """Sets a new request's approval state. Called inside the creating transaction."""
    appt.reception_status = A.PENDING
    appt.approval_expires_at = approval_deadline(appt.preferred_start)
    if stylist is not None:
        _hold(appt, stylist)
    else:
        appt.stylist_status = A.NOT_ASKED
    appt.save()


def announce_new_request(appt: Appointment) -> None:
    ctx = _vars(appt)
    notify_service.tell_customer(appt, K.REQUEST_UPDATE, "customer_received")
    if appt.hold_stylist_id:
        notify_service.notify(
            appt.hold_stylist.user,
            K.REQUEST_NEW,
            "stylist_new_request",
            link="/requests",
            appointment_id=appt.id,
            **ctx,
        )
    notify_service.notify_many(
        notify_service.staff_users("receptionist"),
        K.REQUEST_NEW,
        "reception_new_request",
        link="/appointments",
        appointment_id=appt.id,
        **ctx,
    )


# --------------------------------------------------------------------------- checks


def check_stylist_free(appt: Appointment, stylist: StylistProfile, *, own: bool = True) -> None:
    """Raises a clear BookingError unless `stylist` can take this request's time right now.

    Checks the stylist's own working hours, approved time off and every other booking, pending
    hold or waitlist offer. The stylist row is locked so two answers cannot both pass. `own` is
    True when the stylist is answering (second person), False when the front desk assigns them.
    """
    you, are = ("You", "are") if own else ("That stylist", "is")
    have = "have" if own else "has"
    StylistProfile.objects.select_for_update().filter(pk=stylist.pk).first()
    start = appt.preferred_start
    end = start + timedelta(minutes=appt.duration_minutes)
    if start <= timezone.now():
        raise BookingError_("That time has already passed.", "invalid")
    if stylist.id not in set(booking.qualified_stylists(appt.service).values_list("id", flat=True)):
        raise BookingError_("That stylist does not offer this service.", "invalid")
    day = booking.local(start).date()
    window = booking.stylist_windows(day, [stylist.id]).get(stylist.id)
    if window is None:
        on_leave = DayOffRequest.objects.filter(
            stylist=stylist,
            status=DayOffRequest.Status.APPROVED,
            start_date__lte=day,
            end_date__gte=day,
        ).exists()
        raise BookingError_(
            f"{you} {are} on approved time off on that day."
            if on_leave
            else f"{you} {are} not working on that day.",
            "invalid",
        )
    if not (window[0] <= start and end <= window[1]):
        raise BookingError_(
            f"That time is outside {'your' if own else 'their'} working hours.", "invalid"
        )
    busy = booking.busy_ranges(stylist_ids=[stylist.id], day_from=start, day_to=end, exclude=appt)
    if any(b.stylist_id == stylist.id for b in busy):
        raise booking.BookingError(
            f"{you} already {have} a booking or another request at that time.",
            code="conflict",
            slots=booking.nearest_slots(start, appt.duration_minutes, [stylist.id], exclude=appt),
        )


def BookingError_(message: str, code: str = "conflict") -> booking.BookingError:
    return booking.BookingError(message, code=code)


def _release_resources(appt: Appointment, note: str, actor=None) -> None:
    packagecodes.release(appt, note=note, actor=actor)
    products.release(appt, note=note, actor=actor)
    appt.resources_released_at = timezone.now()
    appt.save(update_fields=["resources_released_at", "updated_at"])


def release_closed_requests(customer) -> int:
    """A customer sending a new request lets go of a stylist-declined one (its package session
    and products were kept in case the front desk found another stylist)."""
    count = 0
    with transaction.atomic():
        for appt in Appointment.objects.select_for_update().filter(
            customer=customer, status=S.DECLINED_BY_STYLIST, resources_released_at__isnull=True
        ):
            _release_resources(appt, "The customer sent a new request")
            count += 1
    return count


# --------------------------------------------------------------------------- finishing


def _room_is_free(appt: Appointment, room: Room) -> bool:
    start = appt.preferred_start
    end = start + timedelta(minutes=appt.duration_minutes)
    busy = booking.busy_ranges(room_ids=[room.id], day_from=start, day_to=end, exclude=appt)
    return room.is_active and not any(b.room_id == room.id for b in busy)


def _finalize(appt: Appointment, actor) -> None:
    """Both sides said yes: the request becomes an awaiting-payment (or scheduled) booking."""
    stylist = appt.hold_stylist
    room = appt.room
    note = ""
    if room is not None and not _room_is_free(appt, room):
        room, note = None, MIN_ROOM_NOTE
    start = appt.preferred_start
    end = booking._place(appt, stylist=stylist, start=start, room=room)
    appt.stylist, appt.room, appt.start, appt.end = stylist, room, start, end
    appt.hold_stylist = appt.hold_start = appt.hold_end = None
    appt.approval_expires_at = None
    appt.reject_reason = ""
    packagecodes.consume(appt, actor=actor)
    ctx = _vars(appt)
    if appt.amount_payable <= 0:
        appt.status = S.SCHEDULED
        appt.awaiting_payment_until = None
        appt.save()
        booking.record(appt, "confirmed", actor=actor, from_status=S.REQUESTED, note=note)
        notify_service.tell_customer(appt, K.BOOKING_OUTCOME, "customer_confirmed_free", **ctx)
    else:
        appt.status = S.AWAITING_PAYMENT
        appt.awaiting_payment_until = booking.hold_deadline(start)
        appt.save()
        booking.record(appt, "confirmed", actor=actor, from_status=S.REQUESTED, note=note)
        booking.issue_payment_link(appt)  # the email carries the payment link
        notify_service.notify(
            appt.customer,
            K.BOOKING_OUTCOME,
            "customer_confirmed",
            link=f"/customer/pay/{appt.id}",
            appointment_id=appt.id,
            **ctx,
        )
        notify_service.sms(
            appt.customer, appt.contact_phone, "customer_confirmed", appointment_id=appt.id, **ctx
        )
    audit(
        AuditLog.Action.APPOINTMENT_CONFIRMED,
        actor=actor,
        target=appt.customer,
        appointment=str(appt.id),
        status=appt.status,
        both_accepted=True,
    )


# --------------------------------------------------------------------------- front desk


def _assign(appt: Appointment, stylist: StylistProfile) -> None:
    """Hands the request to `stylist` (asks them, holds their time). Row lock held by caller."""
    check_stylist_free(appt, stylist, own=False)
    _hold(appt, stylist)
    appt.save()


def reception_accept(appt_id, *, actor, stylist=None, room=None) -> Appointment:
    """The front desk's Accept. For an "any" request a stylist must be chosen with it."""
    booking.expire_due()
    with transaction.atomic():
        appt = _lock(appt_id)
        if appt.reception_status == A.ACCEPTED:
            return appt  # answering twice changes nothing
        if appt.status != S.REQUESTED or appt.reception_status != A.PENDING:
            raise booking.BookingError("This request can no longer be accepted.", code="conflict")
        if room is not None and not room.is_active:
            raise booking.BookingError("That room is not available.")
        if room is not None and not _room_is_free(appt, room):
            raise booking.BookingError(
                "That room is already taken at this time. Choose another room.", code="conflict"
            )
        asked_now = False
        if appt.hold_stylist_id is None:
            if stylist is None:
                raise booking.BookingError("Choose a stylist for this request first.")
            _assign(appt, stylist)
            asked_now = True
        elif stylist is not None and stylist.id != appt.hold_stylist_id:
            raise booking.BookingError(
                "This request is already with another stylist. Use Reassign after they answer."
            )
        appt.room = room
        appt.reception_status = A.ACCEPTED
        appt.confirmed_by = actor
        appt.save()
        booking.record(appt, "reception_accepted", actor=actor, from_status=S.REQUESTED)
        ctx = _vars(appt)
        if appt.stylist_status == A.PENDING:
            notify_service.notify(
                appt.hold_stylist.user,
                K.REQUEST_NEW if asked_now else K.REQUEST_UPDATE,
                "stylist_new_request" if asked_now else "stylist_reception_accepted",
                link="/requests",
                appointment_id=appt.id,
                **ctx,
            )
        if appt.stylist_status == A.ACCEPTED:
            _finalize(appt, actor)
    return appt


def reception_decline(appt_id, *, actor, reason: str = "") -> Appointment:
    """The front desk's Decline. The customer gets a polite note; the reason stays internal."""
    booking.expire_due()
    with transaction.atomic():
        appt = _lock(appt_id)
        if appt.status == S.DECLINED_BY_RECEPTION:
            return appt
        if appt.status != S.REQUESTED or appt.reception_status != A.PENDING:
            raise booking.BookingError("This request can no longer be declined.", code="conflict")
        appt.status = S.DECLINED_BY_RECEPTION
        appt.reception_status = A.DECLINED
        appt.reject_reason = reason[:300]
        appt.save()
        _release_resources(appt, "Booking request declined by the front desk", actor)
        booking.record(appt, "reception_declined", actor=actor, from_status=S.REQUESTED)
        notify_service.tell_customer(
            appt, K.BOOKING_OUTCOME, "customer_declined_by_reception", **_vars(appt)
        )
        if appt.hold_stylist_id and appt.stylist_status == A.PENDING:
            notify_service.notify(
                appt.hold_stylist.user,
                K.REQUEST_UPDATE,
                "stylist_reception_declined",
                link="/requests",
                appointment_id=appt.id,
                **_vars(appt),
            )
    return appt


def reassign(appt_id, *, actor, stylist: StylistProfile) -> Appointment:
    """Gives a request with no stylist yet, or one the stylist declined, to another stylist.

    This restarts the stylist's approval. It never accepts for the stylist and never undoes a
    decline: the new stylist answers for themself. The same stylist cannot be asked again.
    """
    booking.expire_due()
    with transaction.atomic():
        appt = _lock(appt_id)
        if appt.approval_expires_at is not None and appt.approval_expires_at <= timezone.now():
            raise booking.BookingError("This request has run out of time.", code="conflict")
        unassigned = appt.status == S.REQUESTED and appt.stylist_status == A.NOT_ASKED
        if not (unassigned or appt.status == S.DECLINED_BY_STYLIST):
            raise booking.BookingError("This request cannot be given to another stylist now.")
        if appt.hold_stylist_id == stylist.id:
            raise booking.BookingError("Choose a different stylist: this one already answered.")
        was_declined = appt.status == S.DECLINED_BY_STYLIST
        _assign(appt, stylist)
        appt.status = S.REQUESTED
        appt.stylist_decline_reason = ""
        appt.save()
        booking.record(
            appt,
            "reassigned",
            actor=actor,
            from_status=S.DECLINED_BY_STYLIST if was_declined else S.REQUESTED,
            note=stylist.display_name,
        )
        ctx = _vars(appt)
        notify_service.notify(
            stylist.user,
            K.REQUEST_NEW,
            "stylist_new_request",
            link="/requests",
            appointment_id=appt.id,
            **ctx,
        )
        if was_declined:
            notify_service.tell_customer(appt, K.REQUEST_UPDATE, "customer_reassigned", **ctx)
    return appt


# --------------------------------------------------------------------------- stylist


def _own_request(appt_id, profile: StylistProfile) -> Appointment:
    appt = _lock(appt_id)
    mine = (appt.hold_stylist_id == profile.id) or (
        appt.stylist_id == profile.id and appt.stylist_status == A.ACCEPTED
    )
    if not mine:
        raise ApprovalNotFound  # someone else's request looks like it does not exist
    return appt


def stylist_accept(appt_id, *, profile: StylistProfile, actor) -> Appointment:
    booking.expire_due()
    with transaction.atomic():
        appt = _own_request(appt_id, profile)
        if appt.stylist_status == A.ACCEPTED:
            return appt
        if appt.status != S.REQUESTED or appt.stylist_status != A.PENDING:
            raise booking.BookingError(
                "This request is no longer waiting for your answer.", code="conflict"
            )
        if appt.approval_expires_at and appt.approval_expires_at <= timezone.now():
            raise booking.BookingError("This request has run out of time.", code="conflict")
        check_stylist_free(appt, profile)  # may block the accept with a clear message
        appt.stylist_status = A.ACCEPTED
        appt.save()
        booking.record(appt, "stylist_accepted", actor=actor, from_status=S.REQUESTED)
        notify_service.notify_many(
            notify_service.staff_users("receptionist"),
            K.REQUEST_UPDATE,
            "reception_stylist_accepted",
            link="/appointments",
            appointment_id=appt.id,
            **_vars(appt),
        )
        if appt.reception_status == A.ACCEPTED:
            _finalize(appt, actor)
    return appt


def stylist_decline(appt_id, *, profile: StylistProfile, actor, reason: str) -> Appointment:
    """The stylist's Decline. `reason` is a private category for the front desk only."""
    if reason not in templates.DECLINE_REASONS:
        raise booking.BookingError("Choose a reason from the list.")
    booking.expire_due()
    with transaction.atomic():
        appt = _own_request(appt_id, profile)
        if appt.status == S.DECLINED_BY_STYLIST:
            return appt
        if appt.status != S.REQUESTED or appt.stylist_status != A.PENDING:
            raise booking.BookingError(
                "This request is no longer waiting for your answer.", code="conflict"
            )
        appt.status = S.DECLINED_BY_STYLIST
        appt.stylist_status = A.DECLINED
        appt.stylist_decline_reason = reason
        appt.save()
        # Package session and products stay reserved until the front desk has had the chance to
        # hand this to someone else; `expire_requests` or the customer's next request frees them.
        booking.record(appt, "stylist_declined", actor=actor, from_status=S.REQUESTED)
        ctx = _vars(appt)
        notify_service.tell_customer(appt, K.BOOKING_OUTCOME, "customer_declined_by_stylist", **ctx)
        notify_service.notify_many(
            notify_service.staff_users("receptionist"),
            K.REQUEST_UPDATE,
            "reception_stylist_declined",
            link="/appointments",
            appointment_id=appt.id,
            **_vars(appt, reason=templates.DECLINE_REASONS[reason]),
        )
    return appt


def requests_for(profile: StylistProfile, *, answered: bool = False):
    now = timezone.now()
    base = Appointment.objects.select_related("service", "customer").filter(
        Q(hold_stylist=profile) | Q(stylist=profile)
    )
    if not answered:
        return base.filter(
            status=S.REQUESTED, stylist_status=A.PENDING, approval_expires_at__gt=now
        ).order_by("approval_expires_at")
    return base.filter(
        source=Appointment.Source.ONLINE,
        stylist_status__in=[A.ACCEPTED, A.DECLINED],
        updated_at__gte=now - timedelta(days=30),
    ).order_by("-updated_at")[:50]


# --------------------------------------------------------------------------- jobs


def expire_requests(now: datetime | None = None) -> int:
    """Ends requests nobody finished answering, and frees what a declined request kept.
    Safe to run as often as you like."""
    now = now or timezone.now()
    count = 0
    due = Appointment.objects.filter(status=S.REQUESTED, approval_expires_at__lte=now).values_list(
        "pk", flat=True
    )
    for pk in list(due):
        with transaction.atomic():
            appt = (
                Appointment.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("service", "customer", "hold_stylist")
                .filter(pk=pk, status=S.REQUESTED, approval_expires_at__lte=now)
                .first()
            )
            if appt is None:
                continue
            appt.status = S.EXPIRED
            appt.save()
            _release_resources(appt, "Booking request expired")
            booking.record(appt, "expired", from_status=S.REQUESTED)
            ctx = _vars(appt)
            notify_service.tell_customer(appt, K.BOOKING_OUTCOME, "customer_expired", **ctx)
            if appt.hold_stylist_id and appt.stylist_status == A.PENDING:
                notify_service.notify(
                    appt.hold_stylist.user,
                    K.REQUEST_UPDATE,
                    "stylist_expired",
                    link="/requests",
                    appointment_id=appt.id,
                    **ctx,
                )
            notify_service.notify_many(
                notify_service.staff_users("receptionist"),
                K.REQUEST_UPDATE,
                "reception_expired",
                link="/appointments",
                appointment_id=appt.id,
                **ctx,
            )
            audit(
                AuditLog.Action.APPOINTMENT_EXPIRED,
                target=appt.customer,
                appointment=str(appt.id),
            )
            count += 1
    stale = Appointment.objects.filter(
        status=S.DECLINED_BY_STYLIST,
        approval_expires_at__lte=now,
        resources_released_at__isnull=True,
    ).values_list("pk", flat=True)
    for pk in list(stale):
        with transaction.atomic():
            appt = (
                Appointment.objects.select_for_update(skip_locked=True, of=("self",))
                .filter(pk=pk, status=S.DECLINED_BY_STYLIST, resources_released_at__isnull=True)
                .first()
            )
            if appt is not None:
                _release_resources(appt, "No other stylist took the declined request")
                count += 1
    return count


def send_reminders(now: datetime | None = None) -> int:
    """Reminds the side that has not answered yet, once after the first and once after the second
    reminder time. Running the job twice sends nothing twice."""
    now = now or timezone.now()
    cfg = booking_settings()
    first = timedelta(hours=cfg["approval_reminder_first_hours"])
    second = timedelta(hours=cfg["approval_reminder_second_hours"])
    sent = 0
    ids = Appointment.objects.filter(
        status=S.REQUESTED, approval_expires_at__gt=now, approval_reminders__lt=2
    ).values_list("pk", flat=True)
    for pk in list(ids):
        with transaction.atomic():
            appt = (
                Appointment.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("hold_stylist", "customer")
                .filter(pk=pk, status=S.REQUESTED, approval_expires_at__gt=now)
                .first()
            )
            if appt is None:
                continue
            age = now - appt.created_at
            if appt.approval_reminders == 0 and age >= first:
                due = 2 if age >= second else 1
            elif appt.approval_reminders == 1 and age >= second:
                due = 2
            else:
                continue
            appt.approval_reminders = due
            appt.save(update_fields=["approval_reminders", "updated_at"])
            left = max(1, round((appt.approval_expires_at - now).total_seconds() / 3600))
            ctx = _vars(appt, hours_left=f"about {left} hour{'s' if left != 1 else ''}")
            sides = []
            if appt.reception_status == A.PENDING:
                notify_service.notify_many(
                    notify_service.staff_users("receptionist"),
                    K.REQUEST_REMINDER,
                    "reception_reminder",
                    link="/appointments",
                    appointment_id=appt.id,
                    **ctx,
                )
                sides.append("reception")
            if appt.stylist_status == A.PENDING and appt.hold_stylist_id:
                notify_service.notify(
                    appt.hold_stylist.user,
                    K.REQUEST_REMINDER,
                    "stylist_reminder",
                    link="/requests",
                    appointment_id=appt.id,
                    **ctx,
                )
                sides.append("stylist")
            audit(
                AuditLog.Action.APPOINTMENT_REMINDER_SENT,
                target=appt.customer,
                appointment=str(appt.id),
                sides=sides,
                number=due,
            )
            sent += 1
    return sent
