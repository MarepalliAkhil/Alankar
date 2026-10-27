"""Completing and billing a visit (Task 2c). Task 3's POS checkout builds on this module.

`complete_and_invoice` is the one place that turns a finished visit into a paid invoice. In one
database transaction it: marks the appointment completed, applies the online prepayment,
records any balance paid at the salon, writes the invoice and its items, and opens the
customer's pending rating. The receipt email is sent after the transaction commits.
"""

from __future__ import annotations

import secrets
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from billing.models import Invoice, InvoiceItem, InvoiceSequence, Payment
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from people.models import Rating
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
BILLABLE = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS)
ZERO = Decimal("0")


class CheckoutError(Exception):
    """The visit cannot be billed in its current state."""


def next_invoice_number(now) -> str:
    seq, _ = InvoiceSequence.objects.select_for_update().get_or_create(year=now.year)
    seq.last += 1
    seq.save(update_fields=["last"])
    return f"INV-{now.year}-{seq.last:05d}"


def item_description(appt: Appointment) -> str:
    text = appt.service_name
    if appt.variant_label:
        text += f" ({appt.variant_label})"
    if appt.addon_labels:
        text += " + " + ", ".join(appt.addon_labels)
    return text[:300]


def complete_and_invoice(appt_id, *, actor=None, method: str = "cash") -> Invoice:
    now = timezone.now()
    with transaction.atomic():
        appt = (
            Appointment.objects.select_for_update(of=("self",))
            .select_related("stylist", "customer")
            .get(pk=appt_id)
        )
        if appt.status not in BILLABLE:
            raise CheckoutError("Only a scheduled, checked-in or in-progress visit can be billed.")
        if appt.stylist_id is None:
            raise CheckoutError("The visit has no stylist assigned.")
        previous = appt.status
        # Walk the lifecycle so the history shows every step (the real screens arrive later).
        if previous == S.SCHEDULED:
            appt.status = S.CHECKED_IN
            booking.record(appt, "checked_in", actor=actor, from_status=previous)
            previous = appt.status
        if previous == S.CHECKED_IN:
            appt.status = S.IN_PROGRESS
            booking.record(appt, "started", actor=actor, from_status=previous)
            previous = appt.status
        appt.status = S.COMPLETED
        appt.save(update_fields=["status", "updated_at"])
        booking.record(appt, "completed", actor=actor, from_status=previous)

        total = appt.price_total
        gst = appt.gst_amount
        prepaid = min(booking.paid_amount(appt), total)
        balance = total - prepaid
        if balance > ZERO:
            Payment.objects.create(
                appointment=appt,
                kind=Payment.Kind.CHECKOUT,
                method=method,
                amount=balance,
                status=Payment.Status.SUCCEEDED,
                reference=f"{method[:4].upper()}-{secrets.token_hex(6).upper()}",
            )
        invoice = Invoice.objects.create(
            number=next_invoice_number(now),
            appointment=appt,
            customer=appt.customer,
            customer_name=appt.contact_name,
            customer_email=appt.contact_email,
            subtotal=total - gst,
            gst_amount=gst,
            total=total,
            prepaid_amount=prepaid,
            balance_paid=balance,
            issued_at=now,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        InvoiceItem.objects.create(
            invoice=invoice,
            description=item_description(appt),
            quantity=1,
            unit_price=total,
            amount=total,
        )
        Rating.objects.create(appointment=appt, customer=appt.customer, stylist=appt.stylist)
        queue_mail(
            kind=MailOutbox.Kind.INVOICE,
            to=appt.contact_email,
            subject=f"{brand.SHOP_NAME}: invoice {invoice.number}",
            body=(
                f"Hello {appt.contact_name},\n\nThank you for visiting us. "
                f"Your invoice {invoice.number} for Rs. {total} (incl. GST) is paid.\n\n"
                f"{booking.booking_lines(appt)}\n\n"
                "Please take a moment to rate your stylist. It helps us, and you need to rate "
                "before your next booking."
            ),
            link=frontend_link("/customer/appointments"),
        )
    return invoice
