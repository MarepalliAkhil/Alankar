"""Refunds on paid invoices. The receptionist asks; only the admin decides. Money movement is
simulated in v1: approving records who decided, when, and how the money went back."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import User
from billing.models import Invoice, Payment, Refund
from billing.pos import METHODS, CheckoutError, money
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox

ZERO = Decimal("0")


def refundable(invoice: Invoice) -> Decimal:
    """What can still be given back: online plus counter payments (not tips) less other refunds."""
    taken = invoice.prepaid_amount + invoice.balance_paid
    used = Refund.objects.filter(invoice=invoice).exclude(status=Refund.Status.REJECTED)
    return taken - used.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]


def _source_payment(invoice: Invoice) -> Payment:
    payment = (
        Payment.objects.filter(appointment=invoice.appointment, status=Payment.Status.SUCCEEDED)
        .order_by("-amount", "-created_at")
        .first()
    )
    if payment is None:
        raise CheckoutError("This invoice has no payment to refund.")
    return payment


def _notify(refund: Refund, subject: str, text: str) -> None:
    appt = refund.payment.appointment
    queue_mail(
        kind=MailOutbox.Kind.NOTICE,
        to=appt.contact_email,
        subject=f"{brand.SHOP_NAME}: {subject}",
        body=f"Hello {appt.contact_name},\n\n{text}",
        link=frontend_link("/customer/invoices"),
    )


def request_refund(invoice_id, *, actor, amount, reason: str, method: str = "") -> Refund:
    """Receptionist: creates a request. Admin: refunds straight away (method required)."""
    amount = money(amount)
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise CheckoutError("Give a reason for the refund.")
    with transaction.atomic():
        invoice = (
            Invoice.objects.select_for_update().select_related("appointment").get(pk=invoice_id)
        )
        if amount <= 0:
            raise CheckoutError("Enter an amount above zero.")
        left = refundable(invoice)
        if amount > left:
            raise CheckoutError(f"At most Rs. {left} can still be refunded on this invoice.")
        refund = Refund.objects.create(
            payment=_source_payment(invoice),
            invoice=invoice,
            amount=amount,
            status=Refund.Status.PENDING_APPROVAL,
            reason=reason[:300],
            requested_by=actor,
        )
        if actor.role == User.Role.ADMIN:
            _decide(refund, actor=actor, approve=True, method=method, note="")
    return refund


def decide(refund_id, *, actor, approve: bool, method: str = "", note: str = "") -> Refund:
    with transaction.atomic():
        refund = (
            Refund.objects.select_for_update(of=("self",))
            .select_related("payment__appointment")
            .get(pk=refund_id)
        )
        if refund.status != Refund.Status.PENDING_APPROVAL:
            raise CheckoutError("This refund has already been decided.", code="conflict")
        _decide(refund, actor=actor, approve=approve, method=method, note=note)
    return refund


def _decide(refund: Refund, *, actor, approve: bool, method: str, note: str) -> None:
    note = (note or "").strip()
    if approve:
        method = (method or "").lower()
        if method not in METHODS:
            raise CheckoutError("Choose how the money goes back: cash, card or UPI.")
        refund.status = Refund.Status.PROCESSED
        refund.method = method
        refund.processed_at = timezone.now()
        text = f"Your refund of Rs. {refund.amount} has been approved and is on its way."
        subject = "your refund"
    else:
        if len(note) < 3:
            raise CheckoutError("Give a reason for rejecting the refund.")
        refund.status = Refund.Status.REJECTED
        text = f"We could not approve the refund of Rs. {refund.amount}. Reason: {note}"
        subject = "about your refund request"
    refund.decided_by = actor
    refund.decision_note = note[:300]
    refund.save()
    _notify(refund, subject, text)
