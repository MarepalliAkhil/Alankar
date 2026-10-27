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
    invoice = models.ForeignKey(
        "billing.Invoice",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payments",
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
    """Money back to the customer. Never automatic for paid visits: the admin decides.

    A refund is created `processed` for a free cancellation, or `pending_approval` for a late
    cancellation, a no-show, a bill lower than the online payment, or a receptionist's request on
    an invoice. The admin then approves (processed) or rejects it. Money movement is simulated.
    """

    class Status(models.TextChoices):
        PROCESSED = "processed", "Processed"
        PENDING_APPROVAL = "pending_approval", "Waiting for admin approval"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    invoice = models.ForeignKey(
        "billing.Invoice", null=True, blank=True, on_delete=models.PROTECT, related_name="refunds"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices)
    reason = models.CharField(max_length=300)
    method = models.CharField(max_length=20, blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decision_note = models.CharField(max_length=300, blank=True)
    # What the admin chose to reverse when approving: products put back on the shelf as
    # [{"product": id, "name": ..., "quantity": n}], and loyalty points taken back (or given back).
    restocked = models.JSONField(default=list, blank=True)
    loyalty_adjusted = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Refund {self.amount} ({self.status})"

    def save(self, *args, **kwargs):
        # A decided refund is a financial record: it never changes again.
        if not self._state.adding:
            still_open = Refund.objects.filter(pk=self.pk, status=Refund.Status.PENDING_APPROVAL)
            if not still_open.exists():
                raise InvoiceError("A decided refund cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise InvoiceError("A refund cannot be deleted.")


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
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_reason = models.CharField(max_length=200, blank=True)
    # A coupon used on the bill; its rupees are already inside discount_amount.
    coupon_code = models.CharField(max_length=24, blank=True)
    coupon_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Membership benefits: the percent taken off (its rupees are inside discount_amount) and the
    # value of a package or included-membership session that paid for the service.
    member_plan = models.CharField(max_length=80, blank=True)
    member_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    credit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Loyalty points used as part payment (1 point = Rs. 1 by default) and points earned.
    loyalty_redeemed = models.PositiveIntegerField(default=0)
    loyalty_earned = models.PositiveIntegerField(default=0)
    # Goes 100% to the stylist. Not part of `total` and not taxed.
    tip_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Booked services the stylist did not do (shown on the invoice), e.g. "Beard trim (Rs. 150.00)".
    service_changes = models.CharField(max_length=300, blank=True)
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

    class Kind(models.TextChoices):
        SERVICE = "service", "Service"
        PRODUCT = "product", "Product"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.SERVICE)
    product = models.ForeignKey(
        "inventory.Product", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
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


class InvoiceCredit(models.Model):
    """A package session or an included membership session that paid for part of the bill."""

    class Kind(models.TextChoices):
        PACKAGE = "package", "Package session"
        MEMBERSHIP = "membership", "Membership session"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="credits")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # The package credit or membership that was used.
    source_id = models.UUIDField()

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"InvoiceCredit {self.pk}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise InvoiceError("A paid invoice cannot be changed. Use a refund to correct it.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise InvoiceError("A paid invoice cannot be changed. Use a refund to correct it.")


class CashClose(models.Model):
    """End-of-day cash count, signed off by the receptionist. One per business day, never edited."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business_date = models.DateField(unique=True)
    expected_cash = models.DecimalField(max_digits=10, decimal_places=2)
    expected_card = models.DecimalField(max_digits=10, decimal_places=2)
    expected_upi = models.DecimalField(max_digits=10, decimal_places=2)
    counted_cash = models.DecimalField(max_digits=10, decimal_places=2)
    difference = models.DecimalField(max_digits=10, decimal_places=2)
    invoice_count = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=300, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    closed_at = models.DateTimeField()
    # The admin's review (set once, with queryset.update; the counts above never change).
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-business_date"]

    def __str__(self) -> str:
        return f"Cash close {self.business_date}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise InvoiceError("A signed-off cash close cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise InvoiceError("A signed-off cash close cannot be deleted.")
