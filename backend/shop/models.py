"""The online product shop (Task 8.5 part 2).

A customer fills a cart in the browser, picks or types a delivery address and places an order.
Prices, GST, the delivery charge and the total are always worked out on the server from the
product table; the browser only says which products and how many.

Placing an order takes the stock out of the ledger straight away (so two customers can never buy
the last bottle twice) and holds it while the order waits for payment. If the payment window runs
out, or the order is cancelled before it is packed, the stock goes back through the ledger.

Lifecycle:
    pending_payment -> placed (paid) -> packed -> shipped -> delivered
    pending_payment -> payment_expired            (hold ran out, stock returned)
    pending_payment / placed -> cancelled         (customer, before packing; refund processed)
    placed / packed / shipped -> cancelled        (admin, with a reason; refund processed)

Delivery details (mobile, address lines) are encrypted at rest like other personal fields.
Order events, payments and refunds are records: written once, never edited or deleted.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.fields import EncryptedTextField
from wallet.models import Record

ZERO = Decimal("0")


class Address(models.Model):
    """A saved delivery address. The customer can keep several and pick one at checkout."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shop_addresses"
    )
    label = models.CharField(max_length=30, blank=True)
    full_name = models.CharField(max_length=80)
    mobile = EncryptedTextField(context="shop.address.mobile")
    line1 = EncryptedTextField(context="shop.address.line1")
    line2 = EncryptedTextField(context="shop.address.line2", blank=True)
    landmark = EncryptedTextField(context="shop.address.landmark", blank=True)
    city = models.CharField(max_length=60)
    state = models.CharField(max_length=60)
    pincode = models.CharField(max_length=6)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self) -> str:
        return f"Address {self.pk}"


class OrderSequence(models.Model):
    """The last order number used in a year (row-locked while a number is taken)."""

    year = models.PositiveSmallIntegerField(primary_key=True)
    last = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"OrderSequence {self.pk}"


class OrderStatus(models.TextChoices):
    PENDING_PAYMENT = "pending_payment", "Waiting for payment"
    PLACED = "placed", "Placed (paid)"
    PACKED = "packed", "Packed"
    SHIPPED = "shipped", "Out for delivery"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"
    PAYMENT_EXPIRED = "payment_expired", "Payment time ran out"


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shop_orders"
    )
    status = models.CharField(
        max_length=16,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING_PAYMENT,
        db_index=True,
    )
    # A copy of the delivery address as it was when the order was placed.
    ship_name = models.CharField(max_length=80)
    ship_mobile = EncryptedTextField(context="shop.order.mobile")
    ship_line1 = EncryptedTextField(context="shop.order.line1")
    ship_line2 = EncryptedTextField(context="shop.order.line2", blank=True)
    ship_landmark = EncryptedTextField(context="shop.order.landmark", blank=True)
    ship_city = models.CharField(max_length=60)
    ship_state = models.CharField(max_length=60)
    ship_pincode = models.CharField(max_length=6)
    # Money, all including GST. total = items_total - discount + delivery_fee.
    items_total = models.DecimalField(max_digits=10, decimal_places=2)
    gst_included = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    delivery_fee = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    pay_until = models.DateTimeField(null=True, blank=True)
    tracking_note = models.CharField(max_length=120, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total__gte=0), name="order_total_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(discount__gte=0), name="order_discount_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return self.number


class OrderLine(models.Model):
    """One product on an order, with its price as it was when the order was placed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.PROTECT, related_name="order_lines_online"
    )
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=30)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2)
    quantity = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="one_order_line_per_product"),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="order_line_quantity"),
        ]

    def __str__(self) -> str:
        return f"{self.order_id} {self.name} x{self.quantity}"


class OrderEvent(Record):
    """One step in the order's tracking timeline."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=16, choices=OrderStatus.choices)
    from_status = models.CharField(max_length=16, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.order_id} -> {self.status}"


class OrderPayment(Record):
    """One payment attempt for an order (simulated gateway, or a gift card)."""

    class Status(models.TextChoices):
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=20, default="mock")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices)
    reference = models.CharField(max_length=40, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.reference} {self.amount} ({self.status})"


class OrderRefund(Record):
    """Money given back for a cancelled order (simulated), one row per payment refunded."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="refunds")
    payment = models.OneToOneField(OrderPayment, on_delete=models.PROTECT, related_name="refund")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=300)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="order_refund_amount_positive"
            ),
        ]

    def __str__(self) -> str:
        return f"Refund {self.amount} for {self.order_id}"
