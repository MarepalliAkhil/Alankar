"""Slot holds: a stylist's time is held for a customer from the moment a slot is offered.

Rules (see docs/AIR.md):
  * A hold lasts the stylist timeout (15 minutes by default, admin-configurable).
  * It is released on decline, expiry, abandonment or an undo.
  * While the booking waits for payment the hold stays (`confirmed`) until the payment link ends.
  * The database itself refuses overlapping live holds for one stylist, and overlapping live holds
    for one customer (exclusion constraints, migration 0001).
Every creation path takes the stylist's row lock inside a transaction and accepts an idempotency
key, so a repeated tap or a retry returns the same hold instead of making another.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta
from types import SimpleNamespace

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from air import actionlog, actor, config
from air.models import SlotHold
from people.models import StylistProfile
from scheduling import booking
from scheduling.models import BLOCKING_STATUSES, Appointment, AppointmentStatus

S = AppointmentStatus
LIVE = SlotHold.LIVE

_exempt_hold: ContextVar = ContextVar("air_exempt_hold", default=None)


@contextmanager
def exempt(hold_id):
    """While a customer's own request is being created, their own hold is not 'busy'."""
    token = _exempt_hold.set(hold_id)
    try:
        yield
    finally:
        _exempt_hold.reset(token)


def live_q(now: datetime) -> Q:
    return Q(status=SlotHold.Status.ACTIVE, expires_at__gt=now) | Q(
        status=SlotHold.Status.CONFIRMED
    )


def busy_ranges(*, stylist_ids, day_from: datetime, day_to: datetime, exclude=None) -> list:
    """Live holds as busy ranges for `scheduling.booking.busy_ranges`."""
    ids = list(stylist_ids)
    if not ids:
        return []
    qs = SlotHold.objects.filter(
        live_q(timezone.now()), stylist_id__in=ids, starts_at__lt=day_to, ends_at__gt=day_from
    )
    if exclude is not None:
        qs = qs.exclude(request_id=exclude.pk)
    skip = _exempt_hold.get()
    if skip is not None:
        qs = qs.exclude(pk=skip)
    return [
        SimpleNamespace(
            id=h.pk, stylist_id=h.stylist_id, room_id=None, start=h.starts_at, end=h.ends_at
        )
        for h in qs.only("id", "stylist_id", "starts_at", "ends_at")
    ]


def _customer_clash(customer, start: datetime, end: datetime) -> bool:
    """Does this customer already have a request or booking overlapping [start, end)?"""
    if SlotHold.objects.filter(
        live_q(timezone.now()), customer=customer, starts_at__lt=end, ends_at__gt=start
    ).exists():
        return True
    mine = Appointment.objects.filter(
        customer=customer, status__in=[S.REQUESTED, *BLOCKING_STATUSES]
    )
    for appt in mine.only("status", "start", "end", "preferred_start", "duration_minutes"):
        if appt.status == S.REQUESTED:
            a_start = appt.preferred_start
            a_end = a_start + timedelta(minutes=appt.duration_minutes)
        else:
            a_start, a_end = appt.start, appt.end
        if a_start and a_end and a_start < end and a_end > start:
            return True
    return False


def create_hold(
    *,
    customer: User,
    service,
    variant_id,
    addon_ids,
    stylist: StylistProfile,
    start: datetime,
    session_id: str,
    idempotency_key: str = "",
    now: datetime | None = None,
    assist: bool = False,
) -> SlotHold:
    """Holds `stylist` at `start` for `customer`. Raises BookingError if the time is not free."""
    now = now or timezone.now()
    actor.require("air.hold.create", now=now, assist=assist)
    if customer.role != User.Role.CUSTOMER or not customer.is_active:
        raise actor.AirDenied("not_a_customer", "Holds are only made for customer accounts.")
    expire_due(now)
    quote = booking.quote(service, variant_id, addon_ids)
    minutes = quote.duration_minutes
    booking.check_bookable_time(start, minutes)
    if stylist.id not in booking.qualified_stylists(service, public_only=True).values_list(
        "id", flat=True
    ):
        raise booking.BookingError("That stylist does not offer this service.")
    end = start + timedelta(minutes=minutes)
    timeout = config.get_settings().stylist_timeout_minutes
    with transaction.atomic():
        # Same lock the normal booking path takes: two customers asking for one stylist at one
        # moment queue up here, and the second sees the first one's hold.
        StylistProfile.objects.select_for_update().filter(pk=stylist.pk).first()
        if idempotency_key:
            again = SlotHold.objects.filter(
                customer=customer, idempotency_key=idempotency_key
            ).first()
            if again is not None:
                return again
        free = dict(booking.free_starts(booking.local(start).date(), minutes, [stylist.id]))
        if start not in free:
            raise booking.BookingError(
                "That time was just taken. Please pick another time.",
                code="conflict",
                slots=booking.nearest_slots(start, minutes, [stylist.id]),
            )
        if _customer_clash(customer, start, end):
            raise booking.BookingError(
                "You already have a booking or request at that time.", code="customer_clash"
            )
        try:
            with transaction.atomic():
                hold = SlotHold.objects.create(
                    stylist=stylist,
                    customer=customer,
                    service=service,
                    variant_id=variant_id or None,
                    addon_ids=[str(a) for a in (addon_ids or [])],
                    starts_at=start,
                    ends_at=end,
                    expires_at=now + timedelta(minutes=timeout),
                    session_id=session_id[:64],
                    idempotency_key=idempotency_key[:64],
                )
        except IntegrityError as exc:  # the database exclusion constraint said no
            raise booking.BookingError(
                "That time was just taken. Please pick another time.",
                code="conflict",
                slots=booking.nearest_slots(start, minutes, [stylist.id]),
            ) from exc
        actionlog.write(
            "hold_slot",
            customer=customer,
            session_id=session_id,
            after={
                "hold_id": hold.pk,
                "stylist_id": stylist.pk,
                "start": start,
                "end": end,
                "expires_at": hold.expires_at,
            },
            reversible=True,
            now=now,
        )
    return hold


def release(hold_id, *, reason: str = "released", customer=None, now: datetime | None = None):
    """Lets a hold go. Safe to repeat. `customer` limits it to that customer's own hold."""
    actor.require("air.hold.release", now=now)
    now = now or timezone.now()
    with transaction.atomic():
        qs = SlotHold.objects.select_for_update()
        if customer is not None:
            qs = qs.filter(customer=customer)
        hold = qs.filter(pk=hold_id).first()
        if hold is None:
            raise actor.AirDenied("not_found", "No such hold.")
        if hold.status in LIVE:
            _close(hold, SlotHold.Status.RELEASED, reason, now)
            actionlog.write(
                "release_slot",
                customer=hold.customer,
                session_id=hold.session_id,
                before={"hold_id": hold.pk, "hold_status": "live"},
                after={"hold_status": hold.status, "reason": reason},
                reason_code=reason,
                now=now,
            )
    return hold


def _close(hold: SlotHold, status: str, reason: str, now: datetime) -> None:
    hold.status = status
    hold.release_reason = reason[:40]
    hold.released_at = now
    hold.save(update_fields=["status", "release_reason", "released_at"])


def attach(hold: SlotHold, appointment: Appointment) -> None:
    hold.request = appointment
    hold.save(update_fields=["request"])


def expire_due(now: datetime | None = None) -> int:
    """Ends every overdue hold and request, then reconciles AIR's own bookkeeping. Idempotent;
    run lazily on reads and from `python manage.py expire_holds` / the scheduler."""
    from air import lifecycle

    now = now or timezone.now()
    count = booking.expire_due(now)  # unpaid links, stalled requests, waitlist offers
    lifecycle.sync_all(now)
    stale = SlotHold.objects.filter(status=SlotHold.Status.ACTIVE, expires_at__lte=now).values_list(
        "pk", flat=True
    )
    for pk in list(stale):
        with transaction.atomic():
            hold = (
                SlotHold.objects.select_for_update(skip_locked=True)
                .filter(pk=pk, status=SlotHold.Status.ACTIVE, expires_at__lte=now)
                .first()
            )
            if hold is None:
                continue
            _close(hold, SlotHold.Status.EXPIRED, "expired", now)
            actionlog.write(
                "expire_hold",
                customer=hold.customer,
                session_id=hold.session_id,
                before={"hold_id": hold.pk, "hold_status": "active"},
                after={"hold_status": "expired"},
                reason_code="expired",
                now=now,
            )
            count += 1
    return count
