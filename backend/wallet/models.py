"""Packages, memberships, gift cards and the sales that pay for them (Task 5e-1).

Money rules: a Sale is what a customer paid for a package, a membership period or a gift card.
Sales, ledger entries and sale refunds are records, so they can never be edited or deleted. Balances
(package sessions, gift-card rupees) are always the sum of their ledger.
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.db.models.functions import Coalesce

ZERO = Decimal("0")


class RecordError(Exception):
    """A record of money or sessions cannot be changed or deleted."""


class Record(models.Model):
    """Base for rows that are written once."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RecordError(f"{type(self).__name__} rows cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RecordError(f"{type(self).__name__} rows cannot be deleted.")


# --------------------------------------------------------------------------- sales


class SaleSequence(models.Model):
    year = models.PositiveSmallIntegerField(primary_key=True)
    last = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"SaleSequence {self.pk}"


class Sale(Record):
    class Kind(models.TextChoices):
        PACKAGE = "package", "Package"
        MEMBERSHIP = "membership", "Membership"
        GIFT_CARD = "gift_card", "Gift card"

    class Channel(models.TextChoices):
        POS = "pos", "At the salon"
        ONLINE = "online", "Online"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    channel = models.CharField(max_length=8, choices=Channel.choices)
    # cash, card or UPI at the counter; "online" for the simulated gateway.
    method = models.CharField(max_length=10)
    reference = models.CharField(max_length=40, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="wallet_sales",
    )
    buyer_name = models.CharField(max_length=120, blank=True)
    buyer_email = models.EmailField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.number


class SaleRefund(Record):
    """Money given back for part of a sale (for example the unused sessions of a package)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=10)
    reason = models.CharField(max_length=300)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"SaleRefund {self.pk}"


# --------------------------------------------------------------------------- packages


class Package(models.Model):
    """A bundle the admin sells: some sessions of some services for one price."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    validity_days = models.PositiveSmallIntegerField(default=180)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class PackageItem(models.Model):
    package = models.ForeignKey(Package, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey("scheduling.Service", on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["package", "service"], name="one_row_per_service")
        ]

    def __str__(self) -> str:
        return f"PackageItem {self.pk}"


class PackagePurchase(models.Model):
    """What one customer bought. The terms are copied, so later edits to the package never change
    what they paid for."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="package_purchases"
    )
    package = models.ForeignKey(Package, null=True, on_delete=models.SET_NULL, related_name="+")
    name = models.CharField(max_length=80)
    sale = models.OneToOneField(Sale, on_delete=models.PROTECT, related_name="package_purchase")
    price_paid = models.DecimalField(max_digits=10, decimal_places=2)
    purchased_at = models.DateTimeField()
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-purchased_at"]

    def __str__(self) -> str:
        return f"PackagePurchase {self.pk}"


class PackageCredit(models.Model):
    """Sessions of one service inside a purchase. `unit_value` is what one session is worth."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    purchase = models.ForeignKey(PackagePurchase, on_delete=models.CASCADE, related_name="credits")
    service = models.ForeignKey("scheduling.Service", on_delete=models.PROTECT, related_name="+")
    service_name = models.CharField(max_length=120)
    quantity = models.PositiveSmallIntegerField()
    unit_value = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["service_name"]

    def __str__(self) -> str:
        return f"PackageCredit {self.pk}"

    @property
    def remaining(self) -> int:
        return self.entries.aggregate(t=Coalesce(Sum("delta"), 0))["t"]


class PackageEntry(Record):
    """The ledger of sessions. The balance of a credit is the sum of its entries."""

    class Reason(models.TextChoices):
        PURCHASED = "purchased", "Bought"
        USED = "used", "Used at checkout"
        RESTORED = "restored", "Put back by the admin"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    credit = models.ForeignKey(PackageCredit, on_delete=models.PROTECT, related_name="entries")
    delta = models.SmallIntegerField()
    reason = models.CharField(max_length=10, choices=Reason.choices)
    invoice = models.ForeignKey(
        "billing.Invoice", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"PackageEntry {self.pk}"


# --------------------------------------------------------------------------- memberships


class MembershipPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    period_months = models.PositiveSmallIntegerField(default=1)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)
    applies_to_products = models.BooleanField(default=False)
    included_sessions = models.PositiveSmallIntegerField(default=0)
    included_services = models.ManyToManyField("scheduling.Service", blank=True, related_name="+")
    rules = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    """A customer's membership. Terms are copied from the plan when the customer joins."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled (benefits until the period ends)"
        ENDED = "ended", "Ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memberships"
    )
    plan = models.ForeignKey(MembershipPlan, null=True, on_delete=models.SET_NULL, related_name="+")
    plan_name = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    period_months = models.PositiveSmallIntegerField()
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2)
    applies_to_products = models.BooleanField(default=False)
    included_sessions = models.PositiveSmallIntegerField(default=0)
    included_service_ids = models.JSONField(default=list, blank=True)
    included_service_names = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    started_at = models.DateTimeField()
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    sessions_left = models.PositiveSmallIntegerField(default=0)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer"],
                condition=models.Q(status__in=["active", "cancelled"]),
                name="one_open_membership_per_customer",
            )
        ]

    def __str__(self) -> str:
        return f"Membership {self.pk}"


class MembershipEntry(Record):
    """Every join, renewal and included session, for the record."""

    class Reason(models.TextChoices):
        JOINED = "joined", "Joined"
        RENEWED = "renewed", "Renewed"
        USED = "used", "Included session used"
        RESTORED = "restored", "Session put back by the admin"
        CANCELLED = "cancelled", "Cancelled"
        ENDED = "ended", "Ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(Membership, on_delete=models.PROTECT, related_name="entries")
    reason = models.CharField(max_length=10, choices=Reason.choices)
    sessions_change = models.SmallIntegerField(default=0)
    sessions_after = models.PositiveSmallIntegerField(default=0)
    sale = models.ForeignKey(
        Sale, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    invoice = models.ForeignKey(
        "billing.Invoice", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"MembershipEntry {self.pk}"


# --------------------------------------------------------------------------- gift cards


class GiftCard(models.Model):
    """A prepaid card. Only a keyed hash of the code is stored, never the code itself."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        VOID = "void", "Cancelled by the admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code_hash = models.CharField(max_length=64, unique=True)
    last4 = models.CharField(max_length=4)
    initial_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    expires_at = models.DateTimeField()
    sale = models.OneToOneField(Sale, on_delete=models.PROTECT, related_name="gift_card")
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    buyer_name = models.CharField(max_length=120, blank=True)
    recipient_name = models.CharField(max_length=120, blank=True)
    recipient_email = models.EmailField(blank=True)
    message = models.CharField(max_length=300, blank=True)
    issued_at = models.DateTimeField()

    class Meta:
        ordering = ["-issued_at"]

    def __str__(self) -> str:
        return f"GiftCard {self.pk}"

    @property
    def balance(self) -> Decimal:
        return self.entries.aggregate(t=Coalesce(Sum("delta"), ZERO))["t"]


class GiftCardEntry(Record):
    class Reason(models.TextChoices):
        PURCHASED = "purchased", "Bought"
        REDEEMED = "redeemed", "Used to pay"
        REFUNDED = "refunded", "Payment refunded to the card"
        VOIDED = "voided", "Cancelled by the admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(GiftCard, on_delete=models.PROTECT, related_name="entries")
    delta = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=10, choices=Reason.choices)
    payment = models.ForeignKey(
        "billing.Payment", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"GiftCardEntry {self.pk}"


class CodeAttempt(models.Model):
    """A wrong gift-card code, kept to slow down guessing (per user and per IP)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"wrong code at {self.created_at:%Y-%m-%d %H:%M}"
