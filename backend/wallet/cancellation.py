"""Task 8.5 part 5b: a customer-initiated request to cancel a package for a pro-rata refund of
its unused sessions, decided by the admin (approve, optionally at a different amount, or reject).

This is deliberately separate from `selling.refund_package` (the admin's own immediate "refund
unused sessions" button): that one stays exactly as it was for the admin's quick-refund case; this
module is the new, slower, two-step flow a customer can start themselves. See docs/PROGRESS.md
"Task 8.5: decisions".

Money and session math reuses the same pattern as `selling.refund_package`: the refund is the
value of the unused sessions (`unit_value * remaining`, summed across the package's credits),
capped at what is left of the amount actually paid, with an optional admin-configurable
cancellation fee taken off the top. `website.content.package_settings()` holds the four knobs:
`refund_window_days` (None = no deadline), `cancellation_fee_percent`, `refund_expired_packages`,
and `no_show_consumes_session` (used by the booking lifecycle, not here).

Package purchases cannot yet be made with a coupon (Part 3's checkout-recalculation engine is not
built), so there is no coupon share to reverse here yet; revisit once a package purchase can carry
a coupon discount.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from billing.pos import METHODS, money
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from wallet.errors import WalletError
from wallet.models import PackageCancelRequest, PackageEntry, PackagePurchase, SaleRefund
from website.content import package_settings

PAISA = Decimal("0.01")


def estimate_refund(purchase: PackagePurchase) -> Decimal:
    """What a cancellation would refund right now, at today's settings and usage. Shown to the
    customer before they confirm, and used as the admin's starting figure when deciding."""
    settings_ = package_settings()
    now = timezone.now()
    if purchase.expires_at <= now and not settings_["refund_expired_packages"]:
        return Decimal("0")
    credits = list(purchase.credits.all())
    gross = sum((c.unit_value * c.remaining for c in credits), Decimal("0"))
    already_refunded = sum((r.amount for r in purchase.sale.refunds.all()), Decimal("0"))
    gross = min(money(gross), purchase.price_paid - already_refunded)
    if gross <= 0:
        return Decimal("0")
    fee_percent = Decimal(str(settings_["cancellation_fee_percent"]))
    fee = (gross * fee_percent / 100).quantize(PAISA, rounding=ROUND_DOWN)
    return money(max(gross - fee, Decimal("0")))


def request_cancellation(
    purchase_id, *, customer, reason: str, request=None
) -> PackageCancelRequest:
    """Starts a pending cancellation request. The package's code stops working (`cancel_status`)
    until the admin decides, so it cannot be redeemed for a booking while a refund is pending."""
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("Give a reason for the cancellation request.")
    now = timezone.now()
    with transaction.atomic():
        purchase = (
            PackagePurchase.objects.select_for_update()
            .filter(pk=purchase_id, customer=customer)
            .first()
        )
        if purchase is None:
            raise WalletError("Package not found.", code="not_found")
        if purchase.cancel_status != PackagePurchase.CancelStatus.NONE:
            raise WalletError(
                "A cancellation request is already pending for this package.", code="conflict"
            )
        settings_ = package_settings()
        window = settings_["refund_window_days"]
        if window is not None and (now - purchase.purchased_at).days > window:
            raise WalletError(
                "The cancellation window for this package has passed.", code="conflict"
            )
        if purchase.expires_at <= now and not settings_["refund_expired_packages"]:
            raise WalletError("This package has expired and cannot be cancelled.", code="conflict")
        credits = list(purchase.credits.all())
        remaining = sum(c.remaining for c in credits)
        total = sum(c.quantity for c in credits)
        if remaining <= 0:
            raise WalletError("There are no unused sessions left to cancel.", code="conflict")
        estimated = estimate_refund(purchase)
        req = PackageCancelRequest.objects.create(
            purchase=purchase,
            customer=customer,
            reason=reason[:300],
            remaining_sessions=remaining,
            total_sessions=total,
            amount_paid=purchase.price_paid,
            estimated_refund=estimated,
        )
        purchase.cancel_status = PackagePurchase.CancelStatus.PENDING
        purchase.save(update_fields=["cancel_status"])
    audit(
        AuditLog.Action.PACKAGE_CANCEL_REQUESTED,
        request=request,
        actor=customer,
        target=customer,
        package=purchase.name,
        estimated_refund=str(estimated),
    )
    return req


def _settle_credits(purchase: PackagePurchase, *, actor, note: str) -> None:
    for credit in purchase.credits.select_for_update().all():
        if credit.remaining > 0:
            PackageEntry.objects.create(
                credit=credit,
                delta=-credit.remaining,
                reason=PackageEntry.Reason.REFUNDED,
                actor=actor if getattr(actor, "pk", None) else None,
                note=note[:300],
            )


def approve_cancellation(
    request_id, *, actor, method: str, amount=None, reason: str = "", request=None
) -> PackageCancelRequest:
    """Zeroes the remaining sessions and refunds money (capped at what is left of what was paid).
    `amount` lets the admin approve a different figure than the estimate; `None` uses it as-is."""
    method = (method or "").lower()
    if method not in METHODS:
        raise WalletError("Choose how the money goes back: cash, card or UPI.")
    now = timezone.now()
    with transaction.atomic():
        req = (
            PackageCancelRequest.objects.select_for_update()
            .filter(pk=request_id, status=PackageCancelRequest.Status.PENDING)
            .first()
        )
        if req is None:
            raise WalletError(
                "Cancellation request not found or already decided.", code="not_found"
            )
        purchase = PackagePurchase.objects.select_for_update().get(pk=req.purchase_id)
        already_refunded = sum((r.amount for r in purchase.sale.refunds.all()), Decimal("0"))
        max_amount = money(max(purchase.price_paid - already_refunded, Decimal("0")))
        if amount is None:
            final_amount = min(req.estimated_refund, max_amount)
        else:
            final_amount = money(Decimal(str(amount)))
            if final_amount < 0 or final_amount > max_amount:
                raise WalletError(f"Amount must be between 0 and {max_amount}.")
        note = reason.strip()[:300] or "Package cancellation approved"
        _settle_credits(purchase, actor=actor, note=note)
        if final_amount > 0:
            SaleRefund.objects.create(
                sale=purchase.sale,
                amount=final_amount,
                method=method,
                reason=note,
                decided_by=actor,
            )
        purchase.cancel_status = PackagePurchase.CancelStatus.CANCELLED
        purchase.save(update_fields=["cancel_status"])
        req.status = PackageCancelRequest.Status.APPROVED
        req.decided_amount = final_amount
        req.decision_reason = note
        req.decided_by = actor
        req.decided_at = now
        req.save(
            update_fields=[
                "status",
                "decided_amount",
                "decision_reason",
                "decided_by",
                "decided_at",
            ]
        )
        queue_mail(
            kind=MailOutbox.Kind.NOTICE,
            to=purchase.customer.email,
            subject=f"{brand.SHOP_NAME}: package cancellation approved",
            body=f"Hello {purchase.customer.full_name},\n\nYour request to cancel {purchase.name} "
            f"was approved. Rs. {final_amount} will be refunded.",
            link=frontend_link("/customer/packages"),
        )
    audit(
        AuditLog.Action.PACKAGE_CANCEL_APPROVED,
        request=request,
        actor=actor,
        target=purchase.customer,
        package=purchase.name,
        amount=str(final_amount),
        method=method,
    )
    return req


def reject_cancellation(request_id, *, actor, reason: str, request=None) -> PackageCancelRequest:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("Give a reason for rejecting the request.")
    now = timezone.now()
    with transaction.atomic():
        req = (
            PackageCancelRequest.objects.select_for_update()
            .filter(pk=request_id, status=PackageCancelRequest.Status.PENDING)
            .first()
        )
        if req is None:
            raise WalletError(
                "Cancellation request not found or already decided.", code="not_found"
            )
        purchase = PackagePurchase.objects.select_for_update().get(pk=req.purchase_id)
        purchase.cancel_status = PackagePurchase.CancelStatus.NONE
        purchase.save(update_fields=["cancel_status"])
        req.status = PackageCancelRequest.Status.REJECTED
        req.decision_reason = reason[:300]
        req.decided_by = actor
        req.decided_at = now
        req.save(update_fields=["status", "decision_reason", "decided_by", "decided_at"])
        queue_mail(
            kind=MailOutbox.Kind.NOTICE,
            to=purchase.customer.email,
            subject=f"{brand.SHOP_NAME}: package cancellation declined",
            body=f"Hello {purchase.customer.full_name},\n\nYour request to cancel {purchase.name} "
            f"was not approved.\nReason: {reason}",
            link=frontend_link("/customer/packages"),
        )
    audit(
        AuditLog.Action.PACKAGE_CANCEL_REJECTED,
        request=request,
        actor=actor,
        target=purchase.customer,
        package=purchase.name,
        reason=reason,
    )
    return req
