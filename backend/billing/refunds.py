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
from inventory import stock
from inventory.models import Product, StockMovement
from people.models import LoyaltyEntry
from wallet import giftcards

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


def request_refund(
    invoice_id,
    *,
    actor,
    amount,
    reason: str,
    method: str = "",
    restock=None,
    reverse_loyalty: bool = False,
) -> Refund:
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
            _decide(
                refund,
                actor=actor,
                approve=True,
                method=method,
                note="",
                restock=restock,
                reverse_loyalty=reverse_loyalty,
            )
    return refund


def decide(
    refund_id,
    *,
    actor,
    approve: bool,
    method: str = "",
    note: str = "",
    restock=None,
    reverse_loyalty: bool = False,
) -> Refund:
    with transaction.atomic():
        refund = (
            Refund.objects.select_for_update(of=("self",))
            .select_related("payment__appointment")
            .get(pk=refund_id)
        )
        if refund.status != Refund.Status.PENDING_APPROVAL:
            raise CheckoutError("This refund has already been decided.", code="conflict")
        _decide(
            refund,
            actor=actor,
            approve=approve,
            method=method,
            note=note,
            restock=restock,
            reverse_loyalty=reverse_loyalty,
        )
    return refund


def _decide(
    refund: Refund,
    *,
    actor,
    approve: bool,
    method: str,
    note: str,
    restock=None,
    reverse_loyalty: bool = False,
) -> None:
    note = (note or "").strip()
    if approve:
        method = (method or "").lower()
        to_card = refund.payment.method == "gift_card"
        if to_card:
            method = "gift_card"  # the money goes back onto the gift card that paid
        elif method not in METHODS:
            raise CheckoutError("Choose how the money goes back: cash, card or UPI.")
        _reverse(refund, actor, restock or [], reverse_loyalty)
        refund.status = Refund.Status.PROCESSED
        refund.method = method
        refund.processed_at = timezone.now()
        if to_card:
            giftcards.refund_payment(
                refund.payment, refund.amount, actor=actor, note=f"Refund: {refund.reason}"
            )
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


def returnable(invoice: Invoice) -> dict:
    """Products on the invoice that can still go back on the shelf: {product_id: (name, left)}
    (product ids as text)."""
    sold: dict = {}
    for item in invoice.items.filter(kind="product", product__isnull=False).select_related(
        "product"
    ):
        key = str(item.product_id)
        name, count = sold.get(key, (item.product.name, 0))
        sold[key] = (name, count + item.quantity)
    back = (
        StockMovement.objects.filter(invoice=invoice, reason=StockMovement.Reason.RETURN)
        .values("product_id")
        .annotate(n=Coalesce(Sum("delta"), 0))
    )
    for row in back:
        key = str(row["product_id"])
        if key in sold:
            name, count = sold[key]
            sold[key] = (name, count - row["n"])
    return sold


def _reverse(refund: Refund, actor, restock: list, reverse_loyalty: bool) -> None:
    """Optional side effects of a refund: put products back and take loyalty points back."""
    invoice = refund.invoice
    if (restock or reverse_loyalty) and invoice is None:
        raise CheckoutError("Only a refund on an invoice can put stock or points back.")
    if restock:
        left = returnable(invoice)
        done = []
        for row in restock:
            pid, count = row["product"], int(row["quantity"])
            if count <= 0:
                continue
            if pid not in left or count > left[pid][1]:
                name = left[pid][0] if pid in left else "that product"
                allowed = left[pid][1] if pid in left else 0
                raise CheckoutError(f"At most {allowed} of {name} can go back on the shelf.")
            product = Product.objects.select_for_update().get(pk=pid)
            stock.move(
                product,
                count,
                StockMovement.Reason.RETURN,
                actor=actor,
                invoice=invoice,
                note=f"Refund: {refund.reason}"[:200],
            )
            left[pid] = (left[pid][0], left[pid][1] - count)
            done.append({"product": str(pid), "name": product.name, "quantity": count})
        refund.restocked = done
    if reverse_loyalty:
        refund.loyalty_adjusted = _loyalty_adjustment(refund, invoice, actor)


def _loyalty_adjustment(refund: Refund, invoice: Invoice, actor) -> int:
    """Takes back the points earned on the refunded share of the bill (never below the balance).
    A refund that empties the invoice also gives back the points the customer paid with."""
    entries = LoyaltyEntry.objects.filter(customer=invoice.customer)
    taken = invoice.prepaid_amount + invoice.balance_paid
    change = 0
    if taken > 0 and invoice.loyalty_earned:
        already = -entries.filter(invoice=invoice, points__lt=0, reason="refund").aggregate(
            t=Coalesce(Sum("points"), 0)
        )["t"]
        share = int(invoice.loyalty_earned * refund.amount / taken)
        remove = min(share, invoice.loyalty_earned - already)
        balance = entries.aggregate(t=Coalesce(Sum("points"), 0))["t"]
        remove = max(0, min(remove, balance))
        if remove:
            LoyaltyEntry.objects.create(
                customer=invoice.customer,
                points=-remove,
                reason=LoyaltyEntry.Reason.REFUND,
                invoice=invoice,
            )
            change -= remove
    if invoice.loyalty_redeemed and refundable(invoice) == 0:
        # This refund takes the invoice to zero: the points used as part payment come back.
        given = entries.filter(invoice=invoice, points__gt=0, reason="refund").exists()
        if not given:
            LoyaltyEntry.objects.create(
                customer=invoice.customer,
                points=invoice.loyalty_redeemed,
                reason=LoyaltyEntry.Reason.REFUND,
                invoice=invoice,
            )
            change += invoice.loyalty_redeemed
    return change
