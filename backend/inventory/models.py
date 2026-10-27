"""Products and the stock ledger.

Stock is never an editable number. Every change is a StockMovement row (positive = stock in,
negative = stock out) and the level is the sum of a product's movements. Movements cannot be
edited or deleted; a mistake is corrected with a new adjustment row.
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


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

    def __str__(self) -> str:
        return self.name


class StockMovement(models.Model):
    class Reason(models.TextChoices):
        OPENING = "opening", "Opening stock"
        PURCHASE = "purchase", "Stock received"
        SALE = "sale", "Sold at the counter"
        ADJUSTMENT = "adjustment", "Stock count adjustment"

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
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
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
