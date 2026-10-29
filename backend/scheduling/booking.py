"""Booking rules: prices, free slots, overlap checks, status changes and booking emails.

Everything that changes an appointment's status goes through this module so the lifecycle in
docs/MASTER_NOTES.md section 31 is enforced in one place. Views only check *who* may call;
this module checks *whether* the change is allowed for the appointment's current state.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from accounts import otp
from accounts.tokens import hash_token, new_link_token
from billing import tender
from billing.models import Payment, PaymentLink, Refund
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from people import ratings
from people.models import DayOffRequest, StylistProfile
from scheduling.models import (
    BLOCKING_STATUSES,
    Appointment,
    AppointmentEvent,
    AppointmentStatus,
    Room,
    Service,
    ServiceAddon,
    ServiceVariant,
)
from wallet import giftcards, packagecodes
from website.content import booking_settings

S = AppointmentStatus
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
PAISA = Decimal("0.01")


class BookingError(Exception):
    """A rule was broken. `code` lets the API pick the HTTP status (400 or 409).

    `field` optionally names the form field this error is really about (for example
    "package_code"), so the API can tell the frontend not to treat it as a slot-time conflict
    even when the HTTP status happens to be 409 for other reasons (an already-used/expired
    package code uses the same "conflict" status as a just-taken slot).
    """

    def __init__(
        self,
        message: str,
        code: str = "invalid",
        slots: list[datetime] | None = None,
        field: str = "",
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.slots = slots or []
        self.field = field


# --------------------------------------------------------------------------- prices


@dataclass
class Quote:
    variant: ServiceVariant | None
    addons: list[ServiceAddon]
    duration_minutes: int
    price_total: Decimal
    gst_amount: Decimal
    amount_payable: Decimal


def quote(service: Service, variant_id=None, addon_ids=None) -> Quote:
    """Price and duration for a service choice. Prices already include GST."""
    rules = booking_settings()
    variants = [v for v in service.variants.all() if v.is_active]
    variant = None
    if variants:
        if not variant_id:
            raise BookingError("Choose an option for this service.")
        variant = next((v for v in variants if str(v.id) == str(variant_id)), None)
        if variant is None:
            raise BookingError("That option is not available.")
    elif variant_id:
        raise BookingError("That option is not available.")
    wanted = {str(a) for a in (addon_ids or [])}
    addons = [a for a in service.addons.all() if a.is_active and str(a.id) in wanted]
    if len(addons) != len(wanted):
        raise BookingError("One of the add-ons is not available.")
    price = (variant.price if variant else service.price) + sum(
        (a.price for a in addons), Decimal("0")
    )
    minutes = (variant.duration_minutes if variant else service.duration_minutes) + sum(
        a.duration_minutes for a in addons
    )
    own_rate = service.gst_percent if service.gst_percent is not None else rules["gst_percent"]
    gst_rate = Decimal(str(own_rate))
    gst = (price * gst_rate / (Decimal("100") + gst_rate)).quantize(PAISA, ROUND_HALF_UP)
    payable = (price * Decimal(str(rules["deposit_percent"])) / Decimal("100")).quantize(
        PAISA, ROUND_HALF_UP
    )
    return Quote(variant, addons, int(minutes), price, gst, payable)


# --------------------------------------------------------------------------- stylists


def qualified_stylists(service: Service, public_only: bool = False) -> QuerySet[StylistProfile]:
    qs = StylistProfile.objects.filter(services=service).filter(
        Q(user__isnull=True) | Q(user__is_active=True)
    )
    if public_only:
        qs = qs.filter(is_public=True)
    return qs.order_by("sort_order", "display_name").distinct()


# --------------------------------------------------------------------------- hours and slots


def local(dt: datetime) -> datetime:
    return timezone.localtime(dt)


def opening_hours(day: date) -> tuple[datetime, datetime] | None:
    hours = booking_settings()["weekly_hours"].get(WEEKDAYS[day.weekday()])
    if not hours:
        return None
    open_at, close_at = (time.fromisoformat(value) for value in hours)
    tz = timezone.get_current_timezone()
    return (
        datetime.combine(day, open_at, tzinfo=tz),
        datetime.combine(day, close_at, tzinfo=tz),
    )


def stylist_windows(day: date, stylist_ids) -> dict:
    """Each stylist's working window on `day`: (open, close), or None when they are off.

    The window is the stylist's own weekly hours (empty means the salon's hours) cut down to the
    salon's opening hours, and None on a day covered by an approved days-off request.
    """
    shop = opening_hours(day)
    ids = list(stylist_ids)
    if not ids:
        return {}
    key = WEEKDAYS[day.weekday()]
    tz = timezone.get_current_timezone()
    off = set(
        DayOffRequest.objects.filter(
            stylist_id__in=ids,
            status=DayOffRequest.Status.APPROVED,
            start_date__lte=day,
            end_date__gte=day,
        ).values_list("stylist_id", flat=True)
    )
    rows = dict(StylistProfile.objects.filter(pk__in=ids).values_list("id", "weekly_hours"))
    windows: dict = {}
    for sid in ids:
        own = rows.get(sid) or {}
        if shop is None or sid in off:
            windows[sid] = None
        elif key in own:
            hours = own[key]
            if not hours:
                windows[sid] = None
                continue
            start = datetime.combine(day, time.fromisoformat(hours[0]), tzinfo=tz)
            end = datetime.combine(day, time.fromisoformat(hours[1]), tzinfo=tz)
            start, end = max(start, shop[0]), min(end, shop[1])
            windows[sid] = (start, end) if start < end else None
        else:
            windows[sid] = shop
    return windows


def earliest_start() -> datetime:
    return timezone.now() + timedelta(minutes=booking_settings()["min_lead_minutes"])


def latest_day() -> date:
    return local(timezone.now()).date() + timedelta(days=booking_settings()["max_days_ahead"])


def grid_starts(day: date, minutes: int, *, staff: bool = False) -> list[datetime]:
    """Every start on the slot grid that fits inside opening hours and is far enough ahead.

    Staff (receptionist, admin) may book right now and beyond the customer booking window:
    only times in the past are excluded for them.
    """
    hours = opening_hours(day)
    if hours is None or (not staff and day > latest_day()):
        return []
    step = timedelta(minutes=booking_settings()["slot_step_minutes"])
    open_at, close_at = hours
    first = timezone.now() if staff else earliest_start()
    starts, cursor = [], open_at
    while cursor + timedelta(minutes=minutes) <= close_at:
        if cursor >= first:
            starts.append(cursor)
        cursor += step
    return starts


def check_bookable_time(start: datetime, minutes: int) -> None:
    """Raises unless `start` is on the grid, inside opening hours and far enough ahead."""
    if start not in grid_starts(local(start).date(), minutes):
        raise BookingError("Choose one of the available times.")


_exempt_offer: ContextVar = ContextVar("exempt_offer", default=None)


@contextmanager
def exempt_offer(offer_id):
    """While a waitlisted customer accepts their offer, their own held slot is not 'busy'."""
    token = _exempt_offer.set(offer_id)
    try:
        yield
    finally:
        _exempt_offer.reset(token)


def busy_ranges(
    *, stylist_ids=(), room_ids=(), day_from: datetime, day_to: datetime, exclude=None
) -> list[Appointment]:
    from waitlist.models import WaitlistOffer

    who = Q(stylist_id__in=list(stylist_ids)) | Q(room_id__in=list(room_ids))
    qs = Appointment.objects.filter(
        status__in=BLOCKING_STATUSES, start__lt=day_to, end__gt=day_from
    ).filter(who)
    if exclude is not None:
        qs = qs.exclude(pk=exclude.pk)
    busy = list(qs.only("id", "stylist_id", "room_id", "start", "end"))
    # A slot offered to a waitlisted customer is held for them until the offer ends.
    held = WaitlistOffer.objects.filter(
        status=WaitlistOffer.Status.PENDING,
        expires_at__gt=timezone.now(),
        start__lt=day_to,
        end__gt=day_from,
    ).filter(who)
    if _exempt_offer.get() is not None:
        held = held.exclude(pk=_exempt_offer.get())
    busy += [
        SimpleNamespace(
            id=o.pk, stylist_id=o.stylist_id, room_id=o.room_id, start=o.start, end=o.end
        )
        for o in held
    ]
    return busy


def _free(busy: list[Appointment], start: datetime, end: datetime, *, stylist=None, room=None):
    for appt in busy:
        if appt.start < end and appt.end > start:
            if stylist is not None and appt.stylist_id == stylist:
                return False
            if room is not None and appt.room_id == room:
                return False
    return True


def free_starts(
    day: date, minutes: int, stylist_ids: list, *, room_id=None, exclude=None, staff: bool = False
) -> list[tuple[datetime, list]]:
    """Grid starts on `day` with the stylists free at each. With no stylists, hours only."""
    starts = grid_starts(day, minutes, staff=staff)
    if not starts:
        return []
    open_at, close_at = opening_hours(day)
    busy = busy_ranges(
        stylist_ids=stylist_ids,
        room_ids=[room_id] if room_id else [],
        day_from=open_at,
        day_to=close_at,
        exclude=exclude,
    )
    windows = stylist_windows(day, stylist_ids)
    result = []
    for start in starts:
        end = start + timedelta(minutes=minutes)
        if room_id and not _free(busy, start, end, room=room_id):
            continue
        if not stylist_ids:
            result.append((start, []))
            continue
        free = [
            sid
            for sid in stylist_ids
            if windows.get(sid) is not None
            and windows[sid][0] <= start
            and end <= windows[sid][1]
            and _free(busy, start, end, stylist=sid)
        ]
        if free:
            result.append((start, free))
    return result


def nearest_slots(
    around: datetime,
    minutes: int,
    stylist_ids: list,
    *,
    room_id=None,
    exclude=None,
    count=3,
    staff: bool = False,
) -> list[datetime]:
    """The `count` free starts closest to `around`, looking up to 7 days ahead."""
    found: list[datetime] = []
    first_day = max(local(around).date(), local(timezone.now()).date())
    for offset in range(8):
        day = first_day + timedelta(days=offset)
        for start, _ in free_starts(
            day, minutes, stylist_ids, room_id=room_id, exclude=exclude, staff=staff
        ):
            found.append(start)
        if len(found) >= count * 3:
            break
    found.sort(key=lambda s: abs((s - around).total_seconds()))
    return sorted(found[:count])


# --------------------------------------------------------------------------- history + email


def record(appt: Appointment, action: str, actor=None, from_status: str = "", note: str = ""):
    AppointmentEvent.objects.create(
        appointment=appt,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        from_status=from_status,
        to_status=appt.status,
        note=note[:300],
    )


def _slot_of(appt: Appointment):
    return appt.stylist, appt.start, appt.end, appt.room


def _offer_freed(slot) -> None:
    """A booking left this slot free: offer it to the waitlist (see waitlist/engine.py)."""
    from waitlist import engine

    engine.offer_freed(*slot)


def when_text(dt: datetime) -> str:
    return local(dt).strftime("%a %d %b %Y, %I:%M %p")


def booking_lines(appt: Appointment) -> str:
    service = appt.service_name + (f" ({appt.variant_label})" if appt.variant_label else "")
    lines = [f"Service: {service}"]
    if appt.addon_labels:
        lines.append(f"Add-ons: {', '.join(appt.addon_labels)}")
    lines.append(f"When: {when_text(appt.when)}")
    if appt.stylist_id:
        lines.append(f"Stylist: {appt.stylist.display_name}")
    lines.append(f"Total: Rs. {appt.price_total} (incl. GST)")
    return "\n".join(lines)


def email_customer(
    appt: Appointment,
    subject: str,
    intro: str,
    kind=MailOutbox.Kind.BOOKING,
    link: str | None = None,
) -> None:
    queue_mail(
        kind=kind,
        to=appt.contact_email,
        subject=f"{brand.SHOP_NAME}: {subject}",
        body=f"Hello {appt.contact_name},\n\n{intro}\n\n{booking_lines(appt)}",
        link=link if link is not None else frontend_link("/customer/appointments"),
    )


# --------------------------------------------------------------------------- expiry


def expire_due(now: datetime | None = None) -> int:
    """Moves unpaid holds past their deadline to payment_expired. Safe to call often."""
    now = now or timezone.now()
    count = 0
    due = Appointment.objects.filter(
        status=S.AWAITING_PAYMENT, awaiting_payment_until__lte=now
    ).values_list("pk", flat=True)
    for pk in list(due):
        with transaction.atomic():
            appt = (
                Appointment.objects.select_for_update(skip_locked=True)
                .filter(pk=pk, status=S.AWAITING_PAYMENT, awaiting_payment_until__lte=now)
                .first()
            )
            if appt is None:
                continue
            appt.status = S.PAYMENT_EXPIRED
            appt.save(update_fields=["status", "updated_at"])
            appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
                status=PaymentLink.Status.EXPIRED
            )
            packagecodes.release(appt, note="Payment link expired")
            record(appt, "payment_expired", from_status=S.AWAITING_PAYMENT)
            email_customer(
                appt,
                "payment link expired",
                "The payment link for your booking expired, so the held time was released. "
                "Please contact us or send a new request if you still want this visit.",
            )
            _offer_freed(_slot_of(appt))
            count += 1
    from waitlist import engine

    engine.expire_offers(now)
    return count


# --------------------------------------------------------------------------- customer request


def create_request(
    *,
    customer,
    service: Service,
    variant_id,
    addon_ids,
    start: datetime,
    stylist: StylistProfile | None,
    contact: dict,
    notes: str,
    allergies: str,
    package_code: str = "",
    ip: str | None = None,
    request=None,
) -> Appointment:
    expire_due()
    if not otp.email_verified_or_not_required(customer):
        raise BookingError(
            "Please verify your email with the code we sent you before booking.",
            code="email_unverified",
        )
    if ratings.pending_count(customer):
        raise BookingError(
            "Please rate your recent visit before booking again.", code="ratings_pending"
        )
    q = quote(service, variant_id, addon_ids)
    check_bookable_time(start, q.duration_minutes)
    candidates = list(qualified_stylists(service, public_only=True).values_list("id", flat=True))
    if stylist is not None:
        if stylist.id not in candidates:
            raise BookingError("That stylist does not offer this service.")
        candidates = [stylist.id]
    if candidates:
        free = dict(free_starts(local(start).date(), q.duration_minutes, candidates))
        if start not in free:
            raise BookingError(
                "That time was just taken. Please pick another time.",
                code="conflict",
                slots=nearest_slots(start, q.duration_minutes, candidates),
            )
    package_purchase = None
    credit = None
    if package_code:
        try:
            package_purchase, credit = packagecodes.find_for_service(
                package_code, customer=customer, service=service, ip=ip, request=request
            )
        except packagecodes.PackageCodeError as exc:
            raise BookingError(exc.message, code=exc.code, field="package_code") from exc
    price_total, gst_amount, amount_payable = q.price_total, q.gst_amount, q.amount_payable
    if package_purchase is not None:
        price_total = gst_amount = amount_payable = Decimal("0")
    with transaction.atomic():
        appt = Appointment.objects.create(
            customer=customer,
            service=service,
            variant=q.variant,
            service_name=service.name,
            variant_label=q.variant.label if q.variant else "",
            addon_labels=[a.label for a in q.addons],
            duration_minutes=q.duration_minutes,
            price_total=price_total,
            gst_amount=gst_amount,
            amount_payable=amount_payable,
            preferred_start=start,
            preferred_stylist=stylist,
            contact_name=contact["name"],
            contact_email=contact["email"],
            contact_phone=contact.get("phone", ""),
            notes=notes,
            allergies=allergies,
            policy_accepted_at=timezone.now(),
            package_purchase=package_purchase,
        )
        appt.addons.set(q.addons)
        if credit is not None:
            packagecodes.reserve(credit, appointment=appt, actor=customer)
        record(appt, "requested", actor=customer)
        email_customer(
            appt,
            "booking request received",
            "We received your booking request. We will confirm the time and stylist soon and "
            "email you a payment link to lock in your slot.",
        )
    return appt


# --------------------------------------------------------------------------- desk: confirm


def hold_deadline(start: datetime) -> datetime:
    """6 hours by default, never later than 30 minutes before the visit (min 15 minutes)."""
    now = timezone.now()
    deadline = min(
        now + timedelta(hours=booking_settings()["hold_hours"]), start - timedelta(minutes=30)
    )
    return max(deadline, now + timedelta(minutes=15))


def issue_payment_link(appt: Appointment) -> str:
    """Replaces any active link with a new one and emails it. Returns the raw token."""
    appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
        status=PaymentLink.Status.REPLACED
    )
    token, token_hash = new_link_token()
    PaymentLink.objects.create(
        appointment=appt,
        token_hash=token_hash,
        amount=appt.amount_payable,
        expires_at=appt.awaiting_payment_until,
        sent_at=timezone.now(),
        send_count=1,
    )
    send_payment_email(appt, token)
    return token


def payment_url(appt: Appointment, token: str) -> str:
    return frontend_link(f"/customer/pay/{appt.id}?link={token}")


def send_payment_email(appt: Appointment, token: str) -> None:
    email_customer(
        appt,
        "confirm your booking with payment",
        f"Your booking is confirmed. Please pay Rs. {appt.amount_payable} by "
        f"{when_text(appt.awaiting_payment_until)} to keep this slot. If it is not paid by "
        "then, the slot is released.",
        kind=MailOutbox.Kind.PAYMENT_LINK,
        link=payment_url(appt, token),
    )


def _place(
    appt: Appointment, *, stylist: StylistProfile, start: datetime, room: Room | None
) -> datetime:
    """Checks that `appt` can sit with this stylist, room and start; returns the end time.

    The caller holds the appointment row lock. The stylist (and room) rows are locked here so
    two staff members can never place overlapping visits at the same moment. A clash raises a
    `conflict` error carrying the three nearest free times.
    """
    if stylist.id not in set(qualified_stylists(appt.service).values_list("id", flat=True)):
        raise BookingError("That stylist does not offer this service.")
    if room is not None and not room.is_active:
        raise BookingError("That room is not available.")
    StylistProfile.objects.select_for_update().filter(pk=stylist.pk).first()
    if room is not None:
        Room.objects.select_for_update().filter(pk=room.pk).first()
    if start <= timezone.now():
        raise BookingError("Choose a time in the future.")
    if start not in grid_starts(local(start).date(), appt.duration_minutes, staff=True):
        raise BookingError("Choose one of the available times.")
    end = start + timedelta(minutes=appt.duration_minutes)
    window = stylist_windows(local(start).date(), [stylist.id]).get(stylist.id)
    if window is None or not (window[0] <= start and end <= window[1]):
        raise BookingError(f"{stylist.display_name} is not working at that time.")
    busy = busy_ranges(
        stylist_ids=[stylist.id],
        room_ids=[room.id] if room else [],
        day_from=start,
        day_to=end,
        exclude=appt,
    )
    if busy:
        clash_room = room is not None and any(b.room_id == room.id for b in busy)
        raise BookingError(
            "That room is already booked at this time."
            if clash_room and not any(b.stylist_id == stylist.id for b in busy)
            else "This stylist is already booked at this time.",
            code="conflict",
            slots=nearest_slots(
                start,
                appt.duration_minutes,
                [stylist.id],
                room_id=room.id if room else None,
                exclude=appt,
                staff=True,
            ),
        )
    return end


def confirm(
    appt_id, *, actor, stylist: StylistProfile, start: datetime, room: Room | None
) -> Appointment:
    expire_due()
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().select_related("service").get(pk=appt_id)
        if appt.status not in (S.REQUESTED, S.PAYMENT_EXPIRED):
            raise BookingError("Only new requests or expired holds can be confirmed.")
        end = _place(appt, stylist=stylist, start=start, room=room)
        previous = appt.status
        appt.stylist, appt.room, appt.start, appt.end = stylist, room, start, end
        appt.confirmed_by = actor
        appt.reject_reason = ""
        packagecodes.consume(appt, actor=actor)
        if appt.amount_payable <= 0:
            appt.status = S.SCHEDULED
            appt.awaiting_payment_until = None
            appt.save()
            record(appt, "confirmed", actor=actor, from_status=previous)
            email_customer(appt, "booking confirmed", "Your booking is confirmed. See you soon!")
            return appt
        appt.status = S.AWAITING_PAYMENT
        appt.awaiting_payment_until = hold_deadline(start)
        appt.save()
        record(appt, "confirmed", actor=actor, from_status=previous)
        issue_payment_link(appt)
    return appt


# --------------------------------------------------------------------------- desk changes

MOVABLE = (S.AWAITING_PAYMENT, S.SCHEDULED)
CANCELLABLE = (S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN)


def reschedule(
    appt_id, *, actor, stylist: StylistProfile, start: datetime, room: Room | None
) -> Appointment:
    """Moves a held or scheduled visit to another stylist, room and/or time (same checks as
    confirming). A held visit gets a fresh payment link for the new time."""
    expire_due()
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().select_related("service").get(pk=appt_id)
        if appt.status not in MOVABLE:
            raise BookingError("Only held or scheduled bookings can be moved.")
        old_start = appt.start
        old_slot = _slot_of(appt)
        if (
            old_start == start
            and appt.stylist_id == stylist.id
            and appt.room_id == (room.id if room else None)
        ):
            raise BookingError("That is already the booking time, stylist and room.")
        end = _place(appt, stylist=stylist, start=start, room=room)
        appt.stylist, appt.room, appt.start, appt.end = stylist, room, start, end
        appt.reschedule_requested = False
        appt.reschedule_preferred = None
        appt.reschedule_note = ""
        note = f"{when_text(old_start)} to {when_text(start)}" if old_start else ""
        if appt.status == S.AWAITING_PAYMENT:
            appt.awaiting_payment_until = hold_deadline(start)
            appt.save()
            record(appt, "rescheduled", actor=actor, from_status=appt.status, note=note)
            issue_payment_link(appt)
        else:
            appt.save()
            record(appt, "rescheduled", actor=actor, from_status=appt.status, note=note)
            email_customer(
                appt, "your booking was moved", "Your booking has been moved to a new time."
            )
        _offer_freed(old_slot)
    return appt


def _request_refunds(appt: Appointment, reason: str) -> Decimal:
    """Asks the admin to approve refunds for online payments not yet refunded."""
    total = Decimal("0")
    for payment in appt.payments.filter(status=Payment.Status.SUCCEEDED):
        if payment.refunds.exists():
            continue
        Refund.objects.create(
            payment=payment,
            amount=payment.amount,
            status=Refund.Status.PENDING_APPROVAL,
            reason=reason[:300],
        )
        total += payment.amount
    return total


def desk_cancel(appt_id, *, actor, reason: str) -> Appointment:
    """The salon cancels a held or scheduled visit. Money already paid online is not returned
    automatically: a refund request waits for the admin."""
    expire_due()
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status not in CANCELLABLE:
            raise BookingError("Only held, scheduled or checked-in bookings can be cancelled.")
        previous = appt.status
        slot = _slot_of(appt)
        appt.status = S.CANCELLED
        appt.cancel_reason = reason
        appt.cancel_requested = False
        appt.reschedule_requested = False
        appt.reschedule_preferred = None
        appt.reschedule_note = ""
        appt.awaiting_payment_until = None
        appt.save()
        appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
            status=PaymentLink.Status.CANCELLED
        )
        from website.content import package_settings

        if not package_settings()["no_show_consumes_session"]:
            packagecodes.release(appt, note=f"Cancelled by the salon: {reason}", actor=actor)
        pending = _request_refunds(appt, f"Cancelled by the salon: {reason}")
        record(appt, "cancelled_by_salon", actor=actor, from_status=previous, note=reason)
        intro = f"We are sorry: your booking was cancelled by the salon.\nReason: {reason}"
        if pending:
            intro += f"\nYour online payment of Rs. {pending} will be refunded once approved."
        email_customer(appt, "booking cancelled", intro)
        _offer_freed(slot)
    return appt


def mark_no_show(appt_id, *, actor) -> Appointment:
    """A scheduled customer who never arrived. Only after the start time has passed."""
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status != S.SCHEDULED:
            raise BookingError("Only scheduled bookings can be marked as a no-show.")
        if appt.start is None or appt.start > timezone.now():
            raise BookingError("A booking can be marked as a no-show only after its start time.")
        appt.status = S.NO_SHOW
        appt.cancel_requested = False
        appt.reschedule_requested = False
        appt.save()
        from website.content import package_settings

        if not package_settings()["no_show_consumes_session"]:
            packagecodes.release(appt, note="No-show (admin setting)", actor=actor)
        pending = _request_refunds(appt, "No-show: admin to decide on the online payment")
        record(appt, "no_show", actor=actor, from_status=S.SCHEDULED)
        intro = "We missed you at your appointment, so it was marked as a no-show."
        if pending:
            intro += " Please contact the salon about your online payment."
        email_customer(appt, "we missed you", intro)
    return appt


def desk_actions(appt: Appointment, now: datetime | None = None) -> list[str]:
    """Buttons the receptionist or admin may use on this appointment right now."""
    now = now or timezone.now()
    actions: list[str] = []
    status = appt.status
    if status in (S.REQUESTED, S.PAYMENT_EXPIRED):
        actions += ["confirm", "reject"]
    if status == S.AWAITING_PAYMENT:
        actions.append("resend_link")
    if status in MOVABLE:
        actions.append("move")
    if status in CANCELLABLE:
        actions.append("cancel")
    if status == S.SCHEDULED and appt.start and local(appt.start).date() == local(now).date():
        actions.append("check_in")
    if status == S.SCHEDULED and appt.start and appt.start <= now:
        actions.append("no_show")
    if appt.reschedule_requested and status in MOVABLE:
        actions.append("decline_reschedule")
    if appt.cancel_requested and status in CANCELLABLE:
        actions.append("decline_cancel")
    return actions


def check_in(appt_id, *, actor) -> Appointment:
    """The guest has arrived: scheduled -> checked in, on the day of the visit only."""
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status != S.SCHEDULED:
            raise BookingError("Only scheduled bookings can be checked in.")
        if appt.start is None or local(appt.start).date() != local(timezone.now()).date():
            raise BookingError("A guest can be checked in only on the day of the visit.")
        appt.status = S.CHECKED_IN
        appt.arrived_at = appt.arrived_at or timezone.now()
        appt.save()
        record(appt, "checked_in", actor=actor, from_status=S.SCHEDULED)
    return appt


def create_desk_booking(
    *,
    actor,
    customer,
    service: Service,
    variant_id,
    addon_ids,
    start: datetime,
    stylist: StylistProfile,
    room: Room | None,
    source: str,
    contact: dict,
    notes: str = "",
    allergies: str = "",
    check_in_now: bool = False,
) -> Appointment:
    """A walk-in or phone booking made by staff. It goes straight to scheduled (or checked in).

    There is no online prepayment: the whole amount is settled at checkout. The same overlap
    checks as a confirmed request apply, so a clash returns the three nearest free times.
    """
    if source not in (Appointment.Source.WALK_IN, Appointment.Source.PHONE):
        raise BookingError("Choose walk-in or phone.")
    q = quote(service, variant_id, addon_ids)
    with transaction.atomic():
        appt = Appointment.objects.create(
            customer=customer,
            service=service,
            variant=q.variant,
            service_name=service.name,
            variant_label=q.variant.label if q.variant else "",
            addon_labels=[a.label for a in q.addons],
            duration_minutes=q.duration_minutes,
            price_total=q.price_total,
            gst_amount=q.gst_amount,
            amount_payable=q.amount_payable,
            preferred_start=start,
            preferred_stylist=stylist,
            source=source,
            contact_name=contact["name"],
            contact_email=contact["email"],
            contact_phone=contact.get("phone", ""),
            notes=notes,
            allergies=allergies,
            policy_accepted_at=timezone.now(),
            status=S.REQUESTED,
        )
        appt.addons.set(q.addons)
        end = _place(appt, stylist=stylist, start=start, room=room)
        appt.stylist, appt.room, appt.start, appt.end = stylist, room, start, end
        appt.confirmed_by = actor
        appt.status = S.CHECKED_IN if check_in_now else S.SCHEDULED
        if check_in_now:
            appt.arrived_at = timezone.now()
        appt.save()
        record(appt, "created_by_staff", actor=actor, note=f"{source}")
        if check_in_now:
            record(appt, "checked_in", actor=actor, from_status=S.SCHEDULED)
        email_customer(
            appt,
            "your visit is booked",
            "Your visit has been booked at the front desk. Payment is taken at checkout.",
        )
    return appt


DISMISSABLE = {"reschedule": "reschedule_requested", "cancel": "cancel_requested"}


def dismiss_flag(appt_id, *, actor, flag: str, note: str = "") -> Appointment:
    """Declines a customer's reschedule or cancel request; the booking stays as it is."""
    field = DISMISSABLE.get(flag)
    if field is None:
        raise BookingError("Unknown request.")
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if not getattr(appt, field):
            raise BookingError("The customer has no such request on this booking.")
        setattr(appt, field, False)
        if flag == "reschedule":
            appt.reschedule_preferred = None
            appt.reschedule_note = ""
        appt.save()
        record(appt, f"{flag}_declined", actor=actor, from_status=appt.status, note=note)
        what = "reschedule" if flag == "reschedule" else "cancellation"
        reason = f"\nNote: {note}" if note else ""
        email_customer(
            appt,
            f"about your {what} request",
            f"We could not accept your {what} request, so your booking stays as it is.{reason}",
        )
    return appt


def reject(appt_id, *, actor, reason: str) -> Appointment:
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status not in (S.REQUESTED, S.PAYMENT_EXPIRED):
            raise BookingError("Only new requests or expired holds can be rejected.")
        previous = appt.status
        appt.status = S.REJECTED
        appt.reject_reason = reason
        appt.save(update_fields=["status", "reject_reason", "updated_at"])
        packagecodes.release(appt, note="Booking request rejected", actor=actor)
        record(appt, "rejected", actor=actor, from_status=previous, note=reason)
        email_customer(
            appt,
            "we could not confirm your booking",
            f"Sorry, we could not confirm your booking request.\nReason: {reason}",
        )
    return appt


def resend_link(appt_id, *, actor=None, customer=None) -> Appointment:
    """Sends a fresh payment link for an appointment that is awaiting payment."""
    expire_due()
    with transaction.atomic():
        qs = Appointment.objects.select_for_update()
        if customer is not None:
            qs = qs.filter(customer=customer)
        appt = qs.get(pk=appt_id)
        if appt.status != S.AWAITING_PAYMENT:
            raise BookingError("There is no payment waiting for this booking.")
        last = appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).first()
        if last and last.sent_at and timezone.now() - last.sent_at < timedelta(seconds=60):
            raise BookingError(
                "A link was sent less than a minute ago. Please check your email.", code="too_soon"
            )
        issue_payment_link(appt)
        record(appt, "payment_link_resent", actor=actor or customer, from_status=appt.status)
    return appt


# --------------------------------------------------------------------------- payment (mock)


def active_link(appt: Appointment, token: str | None) -> PaymentLink | None:
    links = appt.payment_links.filter(status=PaymentLink.Status.ACTIVE)
    if token:
        return links.filter(token_hash=hash_token(token)).first()
    return links.first()


def pay(
    appt_id,
    *,
    customer,
    token: str | None,
    succeed: bool,
    gift_code: str = "",
    gift_amount=None,
    ip: str | None = None,
    request=None,
) -> tuple[Appointment, bool]:
    """Pays the held booking. Returns (appointment, paid).

    A gift card can pay all or part of it; any rest goes through the simulated gateway
    (`succeed` is that gateway's result). If the gateway part fails, nothing is taken from the
    card either.
    """
    expire_due()
    card = None
    if gift_code:
        try:
            card = giftcards.find(gift_code, user=customer, ip=ip, request=request)
        except giftcards.GiftCardError as exc:
            raise BookingError(exc.message, code=exc.code) from exc
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id, customer=customer)
        if appt.status == S.PAYMENT_EXPIRED:
            raise BookingError(
                "This payment link has expired and the slot was released.", code="conflict"
            )
        if appt.status != S.AWAITING_PAYMENT:
            raise BookingError("There is no payment waiting for this booking.")
        link = active_link(appt, token)
        if link is None:
            raise BookingError(
                "This payment link was replaced by a newer one. Use the latest email or pay "
                "from My Appointments.",
                code="conflict",
            )
        due = link.amount
        from_card = Decimal("0")
        if card is not None:
            try:
                balance = giftcards.check_usable(card)
            except giftcards.GiftCardError as exc:
                raise BookingError(exc.message, code=exc.code) from exc
            wanted = due if gift_amount in (None, "") else Decimal(str(gift_amount))
            from_card = min(wanted, balance, due)
            if from_card <= 0:
                raise BookingError("Enter an amount to take from the gift card.")
        rest = due - from_card
        if rest > 0 and not succeed:
            Payment.objects.create(
                appointment=appt,
                link=link,
                amount=rest,
                status=Payment.Status.FAILED,
                reference=tender.reference("MOCK"),
            )
            record(appt, "payment_failed", actor=customer, from_status=appt.status)
            return appt, False
        reference = tender.reference("MOCK")
        if from_card > 0:
            gift_payment = Payment.objects.create(
                appointment=appt,
                link=link,
                method="gift_card",
                amount=from_card,
                status=Payment.Status.SUCCEEDED,
                reference=tender.reference("GIFT"),
            )
            try:
                giftcards.redeem(card.pk, from_card, payment=gift_payment, actor=customer)
            except giftcards.GiftCardError as exc:
                raise BookingError(exc.message, code="conflict") from exc
            appt._gift_used = (card, from_card)
        if rest > 0:
            Payment.objects.create(
                appointment=appt,
                link=link,
                amount=rest,
                status=Payment.Status.SUCCEEDED,
                reference=reference,
            )
        link.status = PaymentLink.Status.PAID
        link.paid_at = timezone.now()
        link.save(update_fields=["status", "paid_at"])
        appt.status = S.SCHEDULED
        appt.awaiting_payment_until = None
        appt.save(update_fields=["status", "awaiting_payment_until", "updated_at"])
        record(appt, "paid", actor=customer, from_status=S.AWAITING_PAYMENT, note=reference)
        how = f" Rs. {from_card} came from your gift card." if from_card > 0 else ""
        email_customer(
            appt,
            "payment received",
            f"Thank you! We received Rs. {due} (reference {reference}).{how} "
            "Your appointment is booked.",
        )
    return appt, True


# --------------------------------------------------------------------------- customer actions


def paid_amount(appt: Appointment) -> Decimal:
    return sum(
        (p.amount for p in appt.payments.all() if p.status == Payment.Status.SUCCEEDED),
        Decimal("0"),
    )


def free_cancel_until(appt: Appointment, free_hours=None) -> datetime | None:
    """`free_hours` lets a list read the setting once instead of once per appointment."""
    if appt.start is None:
        return None
    if free_hours is None:
        free_hours = booking_settings()["free_cancel_hours"]
    return appt.start - timedelta(hours=free_hours)


def customer_actions(appt: Appointment, now: datetime | None = None, free_hours=None) -> list[str]:
    """Buttons the customer may use on this appointment card right now."""
    now = now or timezone.now()
    actions: list[str] = []
    status = appt.status
    if status in (S.REQUESTED, S.AWAITING_PAYMENT, S.PAYMENT_EXPIRED):
        actions.append("cancel")
    if status == S.AWAITING_PAYMENT:
        actions += ["pay", "resend_link"]
    if status == S.SCHEDULED:
        deadline = free_cancel_until(appt, free_hours)
        if deadline and now <= deadline:
            actions.append("cancel")
        elif not appt.cancel_requested:
            actions.append("request_cancel")
        if appt.arrived_at is None and appt.start and local(appt.start).date() == local(now).date():
            actions.append("arrived")
    if status in (S.AWAITING_PAYMENT, S.SCHEDULED) and not appt.reschedule_requested:
        actions.append("reschedule")
    return actions


def _require(appt: Appointment, action: str) -> None:
    if action not in customer_actions(appt):
        raise BookingError("This action is not available for this booking right now.")


def customer_cancel(appt_id, *, customer, reason: str = "") -> Appointment:
    expire_due()
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id, customer=customer)
        _require(appt, "cancel")
        previous = appt.status
        slot = _slot_of(appt)
        appt.status = S.CANCELLED
        appt.cancel_reason = reason
        appt.awaiting_payment_until = None
        appt.save(update_fields=["status", "cancel_reason", "awaiting_payment_until", "updated_at"])
        appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
            status=PaymentLink.Status.CANCELLED
        )
        refunded = Decimal("0")
        for payment in appt.payments.filter(status=Payment.Status.SUCCEEDED):
            Refund.objects.create(
                payment=payment,
                amount=payment.amount,
                status=Refund.Status.PROCESSED,
                reason="Free cancellation by the customer",
                method="gift_card" if payment.method == "gift_card" else "",
                processed_at=timezone.now(),
            )
            giftcards.refund_payment(
                payment, payment.amount, actor=customer, note="Free cancellation"
            )
            refunded += payment.amount
        packagecodes.release(appt, note="Free cancellation by the customer", actor=customer)
        record(appt, "cancelled", actor=customer, from_status=previous, note=reason)
        intro = "Your booking has been cancelled."
        if refunded:
            intro += f" A refund of Rs. {refunded} has been processed."
        email_customer(appt, "booking cancelled", intro)
        _offer_freed(slot)
    return appt


def customer_flag(appt_id, *, customer, action: str, preferred=None, note: str = ""):
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id, customer=customer)
        _require(appt, action)
        if action == "arrived":
            appt.arrived_at = timezone.now()
        elif action == "request_cancel":
            appt.cancel_requested = True
            appt.cancel_reason = note
        elif action == "reschedule":
            if preferred is None or preferred <= timezone.now():
                raise BookingError("Choose a preferred new time in the future.")
            appt.reschedule_requested = True
            appt.reschedule_preferred = preferred
            appt.reschedule_note = note
        appt.save()
        record(appt, action, actor=customer, from_status=appt.status, note=note)
    return appt
