"""Payment links, mock payments and refunds (Task 2b). Invoices arrive with checkout (Task 3)."""

import uuid

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
