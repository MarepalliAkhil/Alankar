"""Payment links, mock payments, refunds (Task 2b) and customer invoices (Task 2c)."""

import uuid

from django.conf import settings
from django.db import models


class PaymentLink(models.Model):
    """A link emailed after the desk confirms a request. Only the token's hash is stored."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAID = "paid", "Paid"
        EXPIRED = "expired", "Expired"
        REPLACED = "replaced", "Replaced by a newer link"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(
        "scheduling.Appointment", on_delete=models.CASCADE, related_name="payment_links"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    sent_at = models.DateTimeField(null=True, blank=True)
    send_count = models.PositiveSmallIntegerField(default=0)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Payment link {self.id} ({self.status})"


class Payment(models.Model):
    """One payment attempt. v1 uses a mock gateway (no card data is ever collected)."""

    class Kind(models.TextChoices):
        PREPAYMENT = "prepayment", "Online prepayment"
        CHECKOUT = "checkout", "Paid at the salon"

    class Status(models.TextChoices):
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(
        "scheduling.Appointment", on_delete=models.PROTECT, related_name="payments"
    )
    link = models.ForeignKey(
        PaymentLink, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments"
    )
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.PREPAYMENT)
    method = models.CharField(max_length=20, default="mock")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices)
    reference = models.CharField(max_length=40, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.reference} ({self.status})"


class Refund(models.Model):
    """Created automatically for a free cancellation; later cancellations need admin approval."""

    class Status(models.TextChoices):
        PROCESSED = "processed", "Processed"
        PENDING_APPROVAL = "pending_approval", "Waiting for admin approval"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices)
    reason = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Refund {self.amount} ({self.status})"


class InvoiceError(Exception):
    """A paid invoice cannot be changed or deleted; corrections are made with a Refund."""


class InvoiceSequence(models.Model):
    """Last invoice number used in a year, so numbers never repeat or skip."""

    year = models.PositiveSmallIntegerField(primary_key=True)
    last = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.year}: {self.last}"


class Invoice(models.Model):
    """What the customer paid for one visit. Amounts are in INR and include GST.

    Once an invoice exists it is paid and immutable. Task 3 (checkout) will create richer
    invoices through the same `billing.checkout` module.
    """

    class Status(models.TextChoices):
        PAID = "paid", "Paid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    appointment = models.OneToOneField(
        "scheduling.Appointment", on_delete=models.PROTECT, related_name="invoice"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="invoices"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PAID)
    customer_name = models.CharField(max_length=120)
    customer_email = models.EmailField()
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    prepaid_amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_paid = models.DecimalField(max_digits=10, decimal_places=2)
    issued_at = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ["-issued_at"]

    def __str__(self) -> str:
        return self.number

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise InvoiceError("A paid invoice cannot be changed. Use a refund to correct it.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise InvoiceError("A paid invoice cannot be deleted.")


class InvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=300)
    quantity = models.PositiveSmallIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.description

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise InvoiceError("A paid invoice cannot be changed. Use a refund to correct it.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise InvoiceError("A paid invoice cannot be changed. Use a refund to correct it.")
