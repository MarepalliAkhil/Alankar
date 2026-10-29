"""Products and the stock ledger.

Stock is never an editable number. Every change is a StockMovement row (positive = stock in,
negative = stock out) and the level is the sum of a product's movements. Movements cannot be
edited or deleted; a mistake is corrected with a new adjustment row.
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class Supplier(models.Model):
    """Who stock is bought from. Hidden (is_active = false) instead of deleted once used."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120, unique=True)
    contact_person = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    notes = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    """Retail product sold at the counter. `unit_price` includes GST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sku = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=60)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18"))
    low_stock_level = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(unit_price__gte=0), name="product_price_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class StockMovement(models.Model):
    class Reason(models.TextChoices):
        OPENING = "opening", "Opening stock"
        PURCHASE = "purchase", "Stock received"
        SALE = "sale", "Sold at the counter"
        ADJUSTMENT = "adjustment", "Stock count adjustment"
        WASTAGE = "wastage", "Wastage (damaged, expired or used up)"
        RETURN = "return", "Returned by a customer (refund)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    delta = models.IntegerField()
    reason = models.CharField(max_length=12, choices=Reason.choices)
    invoice = models.ForeignKey(
        "billing.Invoice",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    supplier = models.ForeignKey(
        Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="movements"
    )
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["product", "created_at"], name="stock_product_time_idx")]
        constraints = [
            models.CheckConstraint(condition=~models.Q(delta=0), name="stock_movement_not_zero")
        ]

    def __str__(self) -> str:
        return f"{self.product_id} {self.delta:+d} ({self.reason})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A stock movement cannot be changed. Add an adjustment instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("A stock movement cannot be deleted. Add an adjustment instead.")


# --------------------------------------------------------------------------- purchase orders


class PurchaseSequence(models.Model):
    """The last order number used in a year (row-locked while a number is taken)."""

    year = models.PositiveSmallIntegerField(primary_key=True)
    last = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.year}: {self.last}"


class PurchaseOrder(models.Model):
    """Stock ordered from one supplier. Stock changes only when goods are received."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent to the supplier"
        PARTLY = "partly_received", "Partly received"
        RECEIVED = "received", "Received"
        CLOSED = "closed", "Closed short"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    expected_on = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.number


class PurchaseOrderLine(models.Model):
    """One product on an order. `unit_cost` is what the supplier charges, before GST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_lines")
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["product__name"]
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="one_line_per_product"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="po_line_quantity"),
        ]

    def __str__(self) -> str:
        return f"{self.order_id} {self.product_id} x{self.quantity}"


class PurchaseReceipt(models.Model):
    """One delivery against an order. Written once."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name="receipts")
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Receipt {self.pk}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A receipt cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("A receipt cannot be deleted.")


class PurchaseReceiptLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(PurchaseReceipt, on_delete=models.PROTECT, related_name="lines")
    line = models.ForeignKey(PurchaseOrderLine, on_delete=models.PROTECT, related_name="receipts")
    quantity = models.PositiveIntegerField()
    movement = models.OneToOneField(
        StockMovement, on_delete=models.PROTECT, related_name="receipt_line"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="po_receipt_quantity")
        ]

    def __str__(self) -> str:
        return f"{self.line_id} x{self.quantity}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A receipt cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("A receipt cannot be deleted.")
