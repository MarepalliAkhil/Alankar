"""The simulated payment link, as AIR sends it.

A link has an unguessable token (only its hash is stored), an amount, a booking, `sent_at`,
`expires_at`, a status (active -> paid / expired / replaced / cancelled) and who sent it (a
person, or AIR). The 45-minute expiry is admin-configurable. The raw token goes into the
simulated email only: it is never logged, audited or returned by any AIR API.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from accounts.tokens import new_link_token
from air import actionlog, actor, config, handover, holds
from air.models import SlotHold
from billing.models import PaymentLink
from core.models import MailOutbox
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
MAX_RESENDS = 1


def deadline(appt: Appointment, now: datetime | None = None) -> datetime:
    """When an AIR payment link ends: `payment_link_minutes` from now, never within 5 minutes
    of now and never later than 10 minutes before the visit."""
    now = now or timezone.now()
    end = now + timedelta(minutes=config.get_settings().payment_link_minutes)
    start = appt.start or appt.preferred_start
    if start is not None:
        end = min(end, start - timedelta(minutes=10))
    return max(end, now + timedelta(minutes=5))


def _slot_still_free(appt: Appointment) -> bool:
    busy = booking.busy_ranges(
        stylist_ids=[appt.stylist_id],
        day_from=appt.start,
        day_to=appt.end,
        exclude=appt,
    )
    return not any(b.stylist_id == appt.stylist_id for b in busy)


def _issue(appt: Appointment, now: datetime) -> None:
    """Replaces any active link with a fresh one and emails it. The token never leaves here."""
    appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
        status=PaymentLink.Status.REPLACED
    )
    token, token_hash = new_link_token()
    PaymentLink.objects.create(
        appointment=appt,
        token_hash=token_hash,
        amount=appt.amount_payable,
        expires_at=appt.awaiting_payment_until,
        sent_at=now,
        send_count=1,
        sent_by_air=True,
    )
    booking.email_customer(
        appt,
        "your slot is held until you pay",
        f"Your slot is held for you until {booking.when_text(appt.awaiting_payment_until)}. "
        f"Please pay Rs. {appt.amount_payable} to confirm it. Your booking is confirmed only "
        "after payment; if it is not paid in time the slot is released.",
        kind=MailOutbox.Kind.PAYMENT_LINK,
        link=booking.payment_url(appt, token),
    )


def create(appt_id, *, now: datetime | None = None) -> None:
    """Sends a first link when the booking is waiting for payment and has no active link."""
    actor.require("air.payment_link.create", now=now)
    now = now or timezone.now()
    with handover.claim(appt_id, now=now):
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status != S.AWAITING_PAYMENT:
            raise booking.BookingError("There is no payment waiting for this booking.")
        if appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).exists():
            raise booking.BookingError("A payment link is already active.", code="link_exists")
        appt.awaiting_payment_until = deadline(appt, now)
        appt.save(update_fields=["awaiting_payment_until", "updated_at"])
        _issue(appt, now)
        SlotHold.objects.filter(request=appt, status__in=SlotHold.LIVE).update(
            expires_at=appt.awaiting_payment_until
        )
        actionlog.write(
            "create_payment_link",
            customer=appt.customer,
            booking=appt,
            after={"expires_at": appt.awaiting_payment_until, "amount": appt.amount_payable},
            now=now,
        )


def resend(appt_id, *, now: datetime | None = None) -> None:
    """Sends a fresh link, at most once per request, and only if the slot is still free."""
    actor.require("air.payment_link.resend", now=now)
    now = now or timezone.now()
    booking.expire_due(now)
    with handover.claim(appt_id, now=now) as state:
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if appt.status != S.AWAITING_PAYMENT:
            raise booking.BookingError("There is no payment waiting for this booking.")
        if state.link_resends >= MAX_RESENDS:
            raise actor.AirDenied("resend_limit", "AIR sends a link again only once.")
        if not _slot_still_free(appt):
            raise booking.BookingError("That slot is no longer free.", code="conflict")
        before = appt.awaiting_payment_until
        appt.awaiting_payment_until = deadline(appt, now)
        appt.save(update_fields=["awaiting_payment_until", "updated_at"])
        _issue(appt, now)
        state.link_resends += 1
        state.save(update_fields=["link_resends"])
        SlotHold.objects.filter(request=appt, status__in=SlotHold.LIVE).update(
            expires_at=appt.awaiting_payment_until
        )
        actionlog.write(
            "resend_payment_link",
            customer=appt.customer,
            booking=appt,
            before={"expires_at": before, "resend_count": state.link_resends - 1},
            after={"expires_at": appt.awaiting_payment_until, "resend_count": state.link_resends},
            now=now,
        )


def expire(appt_id, *, now: datetime | None = None) -> None:
    """Ends the link now: the unpaid booking expires and the held slot is released."""
    actor.require("air.payment_link.expire", now=now)
    now = now or timezone.now()
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().get(pk=appt_id)
        if not hasattr(appt, "air_state") or appt.status != S.AWAITING_PAYMENT:
            raise booking.BookingError("There is no AIR payment waiting for this booking.")
        appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).update(
            status=PaymentLink.Status.EXPIRED
        )
        appt.awaiting_payment_until = now
        appt.save(update_fields=["awaiting_payment_until", "updated_at"])
    holds.expire_due(now)
    actionlog.write(
        "expire_payment_link",
        customer=appt.customer,
        booking=appt,
        after={"link_status": "expired"},
        now=now,
    )
