"""The waitlist and the gap filler.

When a booking is cancelled, moved or its hold runs out, the freed slot is offered to the first
matching waitlisted customer for a short time (15 minutes by default, editable in Settings). The
slot is held for that customer: nobody else can book it meanwhile. If the offer is declined or
runs out, the next customer in order gets it. The offer, the hold and the booking are one
database transaction on locked rows, so a slot can never go to two people.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from people import ratings
from people.models import CustomerProfile, StylistProfile
from scheduling import booking
from waitlist.models import WaitlistEntry, WaitlistOffer
from wallet.errors import WalletError
from website.content import booking_settings

MAX_ACTIVE = 5
E_ = WaitlistEntry.Status
O_ = WaitlistOffer.Status


def offer_minutes() -> int:
    return int(booking_settings()["waitlist_offer_minutes"])


# --------------------------------------------------------------------------- joining


def _duration(service, variant_id) -> int:
    return booking.quote(service, variant_id, []).duration_minutes


def join(
    customer, *, service, variant_id, stylist, window_start, window_end, note="", request=None
):
    now = timezone.now()
    try:
        minutes = _duration(service, variant_id)
    except booking.BookingError as exc:
        raise WalletError(exc.message) from exc
    if window_end <= window_start:
        raise WalletError("The end of the window must be after the start.")
    if window_end <= now:
        raise WalletError("Choose a time window in the future.")
    if (window_end - window_start) < timedelta(minutes=minutes):
        raise WalletError(f"The window must be at least {minutes} minutes long for this service.")
    latest = now + timedelta(days=booking_settings()["max_days_ahead"])
    if window_start > latest:
        raise WalletError("That is too far ahead.")
    if stylist is not None and stylist.id not in set(
        booking.qualified_stylists(service, public_only=True).values_list("id", flat=True)
    ):
        raise WalletError("That stylist does not offer this service.")
    with transaction.atomic():
        active = WaitlistEntry.objects.select_for_update().filter(
            customer=customer, status__in=[E_.WAITING, E_.OFFERED]
        )
        rows = list(active)
        if len(rows) >= MAX_ACTIVE:
            raise WalletError(f"You can wait for at most {MAX_ACTIVE} slots at a time.")
        for row in rows:
            if (
                row.service_id == service.pk
                and row.window_start < window_end
                and row.window_end > window_start
            ):
                raise WalletError("You are already waiting for this service in that window.")
        entry = WaitlistEntry.objects.create(
            customer=customer,
            service=service,
            variant_id=variant_id,
            stylist=stylist,
            window_start=window_start,
            window_end=window_end,
            note=note[:200],
        )
        audit(
            AuditLog.Action.WAITLIST_JOINED,
            request=request,
            actor=customer,
            service=service.name,
            entry=str(entry.pk),
        )
    return entry


def cancel(entry_id, *, customer, request=None) -> WaitlistEntry:
    with transaction.atomic():
        entry = (
            WaitlistEntry.objects.select_for_update().filter(pk=entry_id, customer=customer).first()
        )
        if entry is None:
            raise WalletError("Waitlist entry not found.", code="not_found")
        if entry.status not in (E_.WAITING, E_.OFFERED):
            raise WalletError("This entry is already closed.", code="conflict")
        freed = None
        if entry.status == E_.OFFERED:
            offer = entry.offers.select_for_update().filter(status=O_.PENDING).first()
            if offer is not None:
                offer.status = O_.DECLINED
                offer.decided_at = timezone.now()
                offer.save(update_fields=["status", "decided_at"])
                freed = offer
        entry.status = E_.CANCELLED
        entry.save(update_fields=["status"])
        audit(
            AuditLog.Action.WAITLIST_CANCELLED,
            request=request,
            actor=customer,
            entry=str(entry.pk),
        )
        if freed is not None:
            _pass_on(freed)
    return entry


# --------------------------------------------------------------------------- offering


def _expire_windows(now) -> None:
    WaitlistEntry.objects.filter(status=E_.WAITING, window_end__lte=now).update(status=E_.EXPIRED)


def expire_waiting(now=None) -> int:
    """Marks waiting entries whose date window has passed as expired. Safe to repeat."""
    now = now or timezone.now()
    return WaitlistEntry.objects.filter(status=E_.WAITING, window_end__lte=now).update(
        status=E_.EXPIRED
    )


def _contact(entry: WaitlistEntry) -> tuple[str, str]:
    return entry.customer.full_name, entry.customer.email


def _fits(entry: WaitlistEntry, stylist: StylistProfile, start, end) -> bool:
    minutes = _duration(entry.service, entry.variant_id)
    finish = start + timedelta(minutes=minutes)
    if finish > end:
        return False
    if entry.window_start > start or finish > entry.window_end:
        return False
    if entry.stylist_id is not None and entry.stylist_id != stylist.id:
        return False
    qualified = set(
        booking.qualified_stylists(entry.service, public_only=True).values_list("id", flat=True)
    )
    if stylist.id not in qualified:
        return False
    free = dict(booking.free_starts(booking.local(start).date(), minutes, [stylist.id]))
    return start in free


def offer_slot(stylist: StylistProfile, start: datetime, end: datetime, room=None):
    """Offers a free slot to the first matching customer. Returns the offer or None."""
    now = timezone.now()
    if start <= now:
        return None
    _expire_windows(now)
    already = set(
        WaitlistOffer.objects.filter(stylist=stylist, start=start).values_list(
            "entry_id", flat=True
        )
    )
    candidates = (
        WaitlistEntry.objects.select_for_update(skip_locked=True, of=("self",))
        .select_related("customer", "service")
        .filter(status=E_.WAITING, window_end__gt=now, window_start__lte=start)
        .exclude(pk__in=already)
        .order_by("created_at", "id")
    )
    for entry in candidates:
        customer = entry.customer
        if not customer.is_active or ratings.pending_count(customer):
            continue
        try:
            if not _fits(entry, stylist, start, end):
                continue
        except booking.BookingError:
            continue
        expires = now + timedelta(minutes=offer_minutes())
        try:
            with transaction.atomic():
                offer = WaitlistOffer.objects.create(
                    entry=entry,
                    stylist=stylist,
                    room=room,
                    start=start,
                    end=end,
                    expires_at=expires,
                )
        except IntegrityError:
            return None  # the slot is already held for someone else
        entry.status = E_.OFFERED
        entry.save(update_fields=["status"])
        name, email = _contact(entry)
        queue_mail(
            kind=MailOutbox.Kind.NOTICE,
            to=email,
            subject=f"{brand.SHOP_NAME}: a time opened up for {entry.service.name}",
            body=(
                f"Hello {name},\n\nA time you were waiting for is free: {entry.service.name} with "
                f"{stylist.display_name} on {booking.when_text(start)}.\n"
                f"We are holding it for you until {booking.when_text(expires)}. "
                "Open the link to take it; after that we offer it to the next person."
            ),
            link=frontend_link("/customer/waitlist"),
        )
        audit(
            AuditLog.Action.WAITLIST_OFFERED,
            actor=None,
            target=customer,
            entry=str(entry.pk),
            start=start.isoformat(),
            stylist=stylist.display_name,
        )
        return offer
    return None


def offer_freed(stylist, start, end, room=None):
    """Called when a booking leaves a slot free."""
    if stylist is None or start is None or end is None:
        return None
    return offer_slot(stylist, start, end, room)


def _pass_on(offer: WaitlistOffer):
    """The offer ended without a booking: the entry goes back to waiting and the slot to the
    next person."""
    entry = offer.entry
    if entry.status == E_.OFFERED:
        entry.status = E_.WAITING if entry.window_end > timezone.now() else E_.EXPIRED
        entry.save(update_fields=["status"])
    return offer_slot(offer.stylist, offer.start, offer.end, offer.room)


def expire_offers(now=None) -> int:
    """Closes offers whose hold ran out and offers each slot to the next customer."""
    now = now or timezone.now()
    count = 0
    ids = list(
        WaitlistOffer.objects.filter(status=O_.PENDING, expires_at__lte=now).values_list(
            "pk", flat=True
        )
    )
    for pk in ids:
        with transaction.atomic():
            offer = (
                WaitlistOffer.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("entry")
                .filter(pk=pk, status=O_.PENDING, expires_at__lte=now)
                .first()
            )
            if offer is None:
                continue
            offer.status = O_.EXPIRED
            offer.decided_at = now
            offer.save(update_fields=["status", "decided_at"])
            audit(
                AuditLog.Action.WAITLIST_OFFER_EXPIRED,
                target=offer.entry.customer,
                entry=str(offer.entry_id),
            )
            _pass_on(offer)
            count += 1
    return count


# --------------------------------------------------------------------------- answering


def decline(offer_id, *, customer, request=None) -> WaitlistOffer:
    expire_offers()
    with transaction.atomic():
        offer = (
            WaitlistOffer.objects.select_for_update(of=("self",))
            .select_related("entry")
            .filter(pk=offer_id, entry__customer=customer)
            .first()
        )
        if offer is None:
            raise WalletError("Offer not found.", code="not_found")
        if offer.status != O_.PENDING:
            raise WalletError("This offer is no longer open.", code="conflict")
        offer.status = O_.DECLINED
        offer.decided_at = timezone.now()
        offer.save(update_fields=["status", "decided_at"])
        audit(
            AuditLog.Action.WAITLIST_DECLINED,
            request=request,
            actor=customer,
            entry=str(offer.entry_id),
        )
        _pass_on(offer)
    return offer


def accept(offer_id, *, customer, request=None):
    """Books the offered slot for the customer. Returns the new appointment (awaiting payment).

    The offer row is locked, the booking is placed with the usual stylist and room locks, and the
    offer, entry and appointment change together or not at all."""
    expire_offers()
    try:
        with transaction.atomic():
            offer = (
                WaitlistOffer.objects.select_for_update(of=("self",))
                .select_related("entry__service", "entry__customer", "stylist", "room")
                .filter(pk=offer_id, entry__customer=customer)
                .first()
            )
            if offer is None:
                raise WalletError("Offer not found.", code="not_found")
            if offer.status != O_.PENDING:
                raise WalletError("This offer is no longer open.", code="conflict")
            if offer.expires_at <= timezone.now():
                raise WalletError("This offer has run out.", code="conflict")
            entry = offer.entry
            profile = CustomerProfile.objects.filter(user=customer).first()
            with booking.exempt_offer(offer.pk):
                appt = booking.create_request(
                    customer=customer,
                    service=entry.service,
                    variant_id=entry.variant_id,
                    addon_ids=[],
                    start=offer.start,
                    stylist=offer.stylist,
                    contact={
                        "name": customer.full_name,
                        "email": customer.email,
                        "phone": profile.phone if profile else "",
                    },
                    notes=entry.note,
                    allergies=profile.allergies if profile else "",
                )
                appt = booking.confirm(
                    appt.pk, actor=None, stylist=offer.stylist, start=offer.start, room=offer.room
                )
            now = timezone.now()
            offer.status = O_.ACCEPTED
            offer.decided_at = now
            offer.appointment = appt
            offer.save(update_fields=["status", "decided_at", "appointment"])
            entry.status = E_.BOOKED
            entry.appointment = appt
            entry.save(update_fields=["status", "appointment"])
            audit(
                AuditLog.Action.WAITLIST_ACCEPTED,
                request=request,
                actor=customer,
                entry=str(entry.pk),
                appointment=str(appt.pk),
            )
            return appt
    except booking.BookingError as exc:
        # The slot was taken some other way, or the customer cannot book right now.
        if exc.code == "conflict":
            _mark_lost(offer_id, customer)
            raise WalletError(
                "Sorry, that time was just taken. You stay on the waitlist.", code="conflict"
            ) from exc
        raise WalletError(exc.message, code="invalid") from exc


def _mark_lost(offer_id, customer) -> None:
    with transaction.atomic():
        offer = (
            WaitlistOffer.objects.select_for_update(of=("self",))
            .select_related("entry")
            .filter(pk=offer_id, entry__customer=customer, status=O_.PENDING)
            .first()
        )
        if offer is None:
            return
        offer.status = O_.LOST
        offer.decided_at = timezone.now()
        offer.save(update_fields=["status", "decided_at"])
        entry = offer.entry
        entry.status = E_.WAITING if entry.window_end > timezone.now() else E_.EXPIRED
        entry.save(update_fields=["status"])
