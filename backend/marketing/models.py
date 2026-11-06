"""Coupons, their redemptions and campaigns. Offers live in website.Offer (shown on the site)."""

import uuid

from django.conf import settings
from django.db import models


class Coupon(models.Model):
    class Kind(models.TextChoices):
        PERCENT = "percent", "Percent off"
        FLAT = "flat", "Rupees off"

    class AppliesTo(models.TextChoices):
        ALL = "all", "Whole bill"
        SERVICES = "services", "Services only"
        PRODUCTS = "products", "Products only"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=24, unique=True)
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    value = models.DecimalField(max_digits=8, decimal_places=2)
    min_bill = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Upper limit in rupees; mainly for percent coupons.
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    total_limit = models.PositiveIntegerField(null=True, blank=True)
    per_customer_limit = models.PositiveIntegerField(default=1)
    applies_to = models.CharField(max_length=10, choices=AppliesTo.choices, default=AppliesTo.ALL)
    # False: cannot be used on a bill that also has a manual discount.
    stackable = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # A private coupon belongs to one customer: nobody else can use it, and it is never listed with
    # the shared coupons. PROTECT so a private coupon can never silently become a public one.
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="private_coupons",
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.code


class CouponRedemption(models.Model):
    """One row per bill that used a coupon. Never edited or deleted."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name="redemptions")
    # Where the coupon was used: a bill at the counter, an online booking payment (linked to the
    # visit's invoice later, at checkout) or a shop order (Task 8.5).
    invoice = models.OneToOneField(
        "billing.Invoice",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="coupon_redemption",
    )
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="coupon_redemptions",
    )
    order = models.ForeignKey(
        "shop.Order",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="coupon_redemptions",
    )
    # Set when the booking or order it paid for was cancelled: the use is given back and no
    # longer counts against the coupon's limits. The row itself stays.
    released_at = models.DateTimeField(null=True, blank=True)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.coupon_id} on {self.invoice_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A coupon redemption cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("A coupon redemption cannot be deleted.")


class Campaign(models.Model):
    """A simulated message to opted-in customers. Sending queues one outbox mail each."""

    class Audience(models.TextChoices):
        ALL = "all", "All opted-in customers"
        RECENT = "recent", "Opted-in customers who visited in the last 90 days"
        LAPSED = "lapsed", "Opted-in customers with no visit in 90 days"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        SENT = "sent", "Sent"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    subject = models.CharField(max_length=120)
    body = models.TextField(max_length=2000)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.ALL)
    coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name
