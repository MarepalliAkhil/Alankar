"""Package codes (Task 8.5 part 5): a long random code per purchase, like gift cards, so a
customer can spend a package session at online booking by entering its code.

Session lifecycle: a session is RESERVED (held) the moment a booking request is created with a
valid code. It becomes CONSUMED (kept for good, a zero-delta marker entry) when the booking is
confirmed. It is RELEASED (given back, +1) if the request is rejected, the payment link expires,
or the customer cancels for free. A late cancellation (desk) or no-show leaves it consumed,
unless `website.content.package_settings()["no_show_consumes_session"]` is turned off.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from wallet import codes
from wallet.errors import WalletError
from wallet.models import CodeAttempt, PackageCredit, PackageEntry, PackagePurchase

PURPOSE = "package_purchase"
USER_LIMIT = 5
IP_LIMIT = 10
WINDOW = timedelta(minutes=15)


class PackageCodeError(WalletError):
    """A package code cannot be used as asked."""


def issue_code(purchase: PackagePurchase) -> str:
    """Called once, right after a PackagePurchase is created. Returns the code (shown once, to
    the buyer, same as a gift card) and stores the hash + an encrypted copy for later Show/Hide."""
    code = codes.new_code()
    normalized = codes.normalize(code)
    purchase.code_hash = codes.code_hash(normalized, purpose=PURPOSE)
    purchase.code_encrypted = code
    purchase.last4 = normalized[-4:]
    purchase.save(update_fields=["code_hash", "code_encrypted", "last4"])
    return code


def reveal(purchase: PackagePurchase) -> str | None:
    """The full code, if it was kept (same Show/Hide story as a gift card: a purchase sold before
    this field existed only ever had a hash stored, so there is nothing to decrypt for it)."""
    if not purchase.code_encrypted:
        return None
    return purchase.code_encrypted


def _failures(user, ip):
    since = timezone.now() - WINDOW
    recent = CodeAttempt.objects.filter(created_at__gte=since, kind=CodeAttempt.Kind.PACKAGE)
    by_user = recent.filter(user=user).count() if getattr(user, "pk", None) else 0
    by_ip = recent.filter(ip_address=ip).count() if ip else 0
    return by_user, by_ip


def check_not_locked(user, ip) -> None:
    by_user, by_ip = _failures(user, ip)
    if by_user >= USER_LIMIT or by_ip >= IP_LIMIT:
        raise PackageCodeError(
            "Too many wrong package codes. Please wait 15 minutes and try again.",
            code="throttled",
        )


def record_failure(user, ip, request=None) -> None:
    CodeAttempt.objects.create(
        user=user if getattr(user, "pk", None) else None,
        ip_address=ip,
        kind=CodeAttempt.Kind.PACKAGE,
    )
    by_user, by_ip = _failures(user, ip)
    if by_user == USER_LIMIT or by_ip == IP_LIMIT:
        audit(
            AuditLog.Action.GIFT_CODE_LOCKED,
            request=request,
            actor=user if getattr(user, "pk", None) else None,
            kind="package",
            attempts_user=by_user,
            attempts_ip=by_ip,
        )


def find_for_service(
    code: str, *, customer, service, ip, request=None
) -> tuple[PackagePurchase, PackageCredit]:
    """The purchase and credit a code unlocks for this customer and this service. Wrong codes
    never reveal whether a code exists at all, and are counted and rate-limited like gift cards."""
    check_not_locked(customer, ip)
    normalized = codes.normalize(code)
    purchase = None
    if len(normalized) == codes.CODE_LENGTH:
        purchase = PackagePurchase.objects.filter(
            code_hash=codes.code_hash(normalized, purpose=PURPOSE), customer=customer
        ).first()
    if purchase is None:
        record_failure(customer, ip, request)
        raise PackageCodeError("That package code is not valid for your account.")
    now = timezone.now()
    if purchase.cancel_status != PackagePurchase.CancelStatus.NONE:
        raise PackageCodeError(
            "This package is being cancelled and cannot be used.", code="conflict"
        )
    if purchase.expires_at <= now:
        raise PackageCodeError("This package has expired.", code="conflict")
    credit = purchase.credits.filter(service=service).first()
    if credit is None:
        raise PackageCodeError("This package does not cover that service.", code="conflict")
    if credit.remaining <= 0:
        raise PackageCodeError(
            "No sessions are left on this package for that service.", code="conflict"
        )
    return purchase, credit


def reserve(credit: PackageCredit, *, appointment, actor=None) -> PackageEntry:
    """Locks the credit row and holds one session for this appointment."""
    with transaction.atomic():
        credit = PackageCredit.objects.select_for_update().get(pk=credit.pk)
        if credit.remaining <= 0:
            raise PackageCodeError(
                "No sessions are left on this package for that service.", code="conflict"
            )
        return PackageEntry.objects.create(
            credit=credit,
            delta=-1,
            reason=PackageEntry.Reason.RESERVED,
            appointment=appointment,
            actor=actor if getattr(actor, "pk", None) else None,
        )


def _reservation(appointment) -> PackageEntry | None:
    return (
        PackageEntry.objects.filter(appointment=appointment, reason=PackageEntry.Reason.RESERVED)
        .select_related("credit")
        .first()
    )


def _settled_reason(entry: PackageEntry) -> str | None:
    """CONSUMED or RELEASED, whichever happened most recently to this reservation, or None if
    neither has happened yet. A reservation can move from CONSUMED back to RELEASED (a customer
    free-cancelling an already-confirmed package visit, exactly like a paid visit's refund), but
    never the other way, and never past RELEASED."""
    settled = (
        PackageEntry.objects.filter(
            credit_id=entry.credit_id,
            appointment_id=entry.appointment_id,
            reason__in=[PackageEntry.Reason.CONSUMED, PackageEntry.Reason.RELEASED],
        )
        .order_by("-created_at")
        .first()
    )
    return settled.reason if settled else None


def consume(appointment, *, actor=None) -> None:
    """The reservation for this appointment, if any, is kept for good (booking confirmed).
    A no-op if there is no reservation, or it was already consumed or released."""
    with transaction.atomic():
        entry = _reservation(appointment)
        if entry is None or _settled_reason(entry) is not None:
            return
        PackageEntry.objects.create(
            credit_id=entry.credit_id,
            delta=0,
            reason=PackageEntry.Reason.CONSUMED,
            appointment=appointment,
            actor=actor if getattr(actor, "pk", None) else None,
        )


def release(appointment, *, note: str = "", actor=None) -> None:
    """The reservation for this appointment, if any, is given back (+1) -- whether it was only
    held (reject/expire before confirm) or already consumed (a free cancellation after confirm,
    same as refunding a captured payment). A no-op if there is no reservation, or it was already
    released (so this is always safe to call more than once)."""
    with transaction.atomic():
        entry = _reservation(appointment)
        if entry is None or _settled_reason(entry) == PackageEntry.Reason.RELEASED:
            return
        PackageEntry.objects.create(
            credit_id=entry.credit_id,
            delta=1,
            reason=PackageEntry.Reason.RELEASED,
            appointment=appointment,
            actor=actor if getattr(actor, "pk", None) else None,
            note=note[:300],
        )


def summary_for_appointment(appointment) -> dict | None:
    """What the request/appointment card and POS show: package name, last 4 characters, which
    numbered session, and its current reserved/consumed/released state. Never the full code."""
    entry = _reservation(appointment)
    if entry is None:
        return None
    credit = entry.credit
    purchase = credit.purchase
    position = credit.entries.filter(
        reason__in=[PackageEntry.Reason.RESERVED, PackageEntry.Reason.USED],
        created_at__lte=entry.created_at,
    ).count()
    settled = (
        PackageEntry.objects.filter(
            credit_id=credit.pk,
            appointment_id=appointment.pk,
            reason__in=[PackageEntry.Reason.CONSUMED, PackageEntry.Reason.RELEASED],
        )
        .order_by("-created_at")
        .first()
    )
    state = settled.reason if settled else PackageEntry.Reason.RESERVED
    return {
        "purchase_id": str(purchase.id),
        "purchase_name": purchase.name,
        "last4": purchase.last4,
        "masked": codes.mask(purchase.last4),
        "service_name": credit.service_name,
        "session_label": f"session {position} of {credit.quantity}",
        "status": state,
    }
