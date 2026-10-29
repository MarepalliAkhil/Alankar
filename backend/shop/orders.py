"""Shop rules: the price of a cart, placing an order, paying, moving it along and cancelling.

Every money figure comes from the database here. The browser sends product ids and quantities
only, so a changed price in the page can never change what the customer is charged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from billing import online, tender
from billing.pos import CheckoutError
from core import brand, crypto
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from inventory import stock
from inventory.models import Product, StockMovement
from marketing.models import CouponRedemption
from shop.models import (
    Address,
    Order,
    OrderEvent,
    OrderLine,
    OrderPayment,
    OrderRefund,
    OrderSequence,
    OrderStatus,
)
from wallet import giftcards
from website.content import shop_settings

S = OrderStatus
PAISA = Decimal("0.01")
ZERO = Decimal("0")
MAX_LINES = 20

# Who may move an order to which next step. Cancelling is separate.
NEXT = {S.PLACED: S.PACKED, S.PACKED: S.SHIPPED, S.SHIPPED: S.DELIVERED}
CUSTOMER_CANCELLABLE = (S.PENDING_PAYMENT, S.PLACED)
STAFF_CANCELLABLE = (S.PENDING_PAYMENT, S.PLACED, S.PACKED, S.SHIPPED)
OPEN = (S.PENDING_PAYMENT, S.PLACED, S.PACKED, S.SHIPPED)


class ShopError(Exception):
    def __init__(self, message: str, *, code: str = "invalid", field: str = ""):
        super().__init__(message)
        self.message = message
        self.code = code
        self.field = field


def money(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


# --------------------------------------------------------------------------- catalogue


def listed_products():
    return stock.with_levels(Product.objects.filter(is_active=True, sold_online=True))


def product_data(p: Product) -> dict:
    level = max(int(getattr(p, "stock", 0) or 0), 0)
    limit = int(shop_settings()["max_quantity_per_order"])
    return {
        "id": str(p.id),
        "name": p.name,
        "category": p.category,
        "description": p.description,
        "price": str(p.unit_price),
        "gst_percent": str(p.gst_percent),
        "in_stock": level > 0,
        # The real count is only shown when it is low, so customers see "only 3 left".
        "low_stock": 0 < level <= p.low_stock_level,
        "available": min(level, limit),
    }


def shop_settings_public() -> dict:
    rules = shop_settings()
    return {
        "delivery_fee": str(money(rules.get("delivery_fee") or 0)),
        "free_delivery_over": (
            None
            if rules.get("free_delivery_over") in (None, "", 0)
            else str(money(rules["free_delivery_over"]))
        ),
        "max_quantity": int(rules["max_quantity_per_order"]),
        "payment_hold_minutes": int(rules["payment_hold_minutes"] or 30),
    }


# --------------------------------------------------------------------------- pricing


@dataclass
class PricedLine:
    product: Product
    quantity: int
    unit_price: Decimal
    gst_percent: Decimal
    amount: Decimal

    @property
    def gst(self) -> Decimal:
        return money(self.amount * self.gst_percent / (100 + self.gst_percent))


@dataclass
class Quote:
    lines: list[PricedLine] = field(default_factory=list)
    breakdown: online.Breakdown | None = None

    @property
    def items_total(self) -> Decimal:
        return self.breakdown.items_total

    @property
    def total(self) -> Decimal:
        return self.breakdown.total

    def data(self) -> dict:
        return {
            "lines": [
                {
                    "product": str(ln.product.id),
                    "name": ln.product.name,
                    "unit_price": str(ln.unit_price),
                    "quantity": ln.quantity,
                    "amount": str(ln.amount),
                }
                for ln in self.lines
            ],
            **self.breakdown.data(),
        }


def _wanted(items) -> dict:
    """[{"product": id, "quantity": n}, ...] -> {id: n}, merged and checked."""
    if not isinstance(items, list) or not items:
        raise ShopError("Your cart is empty.", field="items")
    limit = int(shop_settings()["max_quantity_per_order"])
    wanted: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            raise ShopError("Something in your cart is not valid.", field="items")
        pid = str(item.get("product") or "")
        try:
            qty = int(item.get("quantity"))
        except (TypeError, ValueError) as exc:
            raise ShopError("Enter a whole number for the quantity.", field="items") from exc
        if qty < 1:
            raise ShopError("A quantity must be at least 1.", field="items")
        wanted[pid] = wanted.get(pid, 0) + qty
    if len(wanted) > MAX_LINES:
        raise ShopError(f"An order can have at most {MAX_LINES} different products.", field="items")
    for qty in wanted.values():
        if qty > limit:
            raise ShopError(f"You can order at most {limit} of each product.", field="items")
    return wanted


def _products(wanted: dict, *, lock: bool) -> dict:
    qs = Product.objects.filter(pk__in=[pid for pid in wanted if _is_uuid(pid)])
    if lock:
        # A fixed lock order (by id) so two checkouts can never deadlock each other.
        qs = qs.select_for_update().order_by("id")
    found = {str(p.id): p for p in qs}
    for pid in wanted:
        p = found.get(pid)
        if p is None or not p.is_active or not p.sold_online:
            raise ShopError(
                "A product in your cart is no longer sold online. Remove it and try again.",
                field="items",
            )
    return found


def _is_uuid(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F-]{36}", value or ""))


def delivery_fee_for(items_total: Decimal) -> Decimal:
    rules = shop_settings()
    fee = money(rules.get("delivery_fee") or 0)
    free_over = rules.get("free_delivery_over")
    if free_over not in (None, "", 0) and items_total >= money(free_over):
        return money(0)
    return fee


def price(
    items, *, customer=None, coupon_code: str = "", lock: bool = False, coupon_lock: bool = False
) -> Quote:
    """Prices a cart with the online engine: items, coupon, membership, delivery (in that order).
    The gift card is not part of the price; it is used when paying."""
    wanted = _wanted(items)
    products = _products(wanted, lock=lock)
    quote = Quote()
    for pid, qty in wanted.items():
        p = products[pid]
        quote.lines.append(
            PricedLine(
                product=p,
                quantity=qty,
                unit_price=p.unit_price,
                gst_percent=p.gst_percent,
                amount=money(p.unit_price * qty),
            )
        )
    quote.lines.sort(key=lambda ln: ln.product.name)
    items_total = sum((ln.amount for ln in quote.lines), ZERO)
    try:
        coupon = online.find_coupon(coupon_code, customer, lock=coupon_lock)
        quote.breakdown = online.calculate(
            [
                online.Item(
                    kind="product",
                    description=ln.product.name,
                    amount=ln.amount,
                    gst_percent=ln.gst_percent,
                    key=str(ln.product.id),
                )
                for ln in quote.lines
            ],
            customer=customer,
            coupon=coupon,
            delivery_fee=delivery_fee_for(items_total),
        )
    except CheckoutError as exc:
        raise ShopError(exc.message, field="coupon") from exc
    return quote


# --------------------------------------------------------------------------- addresses

PINCODE = re.compile(r"[1-9]\d{5}")


def clean_address(data: dict) -> dict:
    """Checks a delivery address. Every problem names its field so the form can show it."""
    if not isinstance(data, dict):
        raise ShopError("Enter a delivery address.", field="address")

    def text(key: str, *, low: int, high: int, required: bool = True, label: str) -> str:
        value = " ".join(str(data.get(key) or "").split())
        if not value:
            if required:
                raise ShopError(f"Enter the {label}.", field=key)
            return ""
        if len(value) < low:
            raise ShopError(f"The {label} is too short.", field=key)
        if len(value) > high:
            raise ShopError(f"The {label} is too long (at most {high} characters).", field=key)
        return value

    out = {
        "label": text("label", low=1, high=30, required=False, label="label"),
        "full_name": text("full_name", low=2, high=80, label="name"),
        "line1": text("line1", low=5, high=200, label="house and street"),
        "line2": text("line2", low=1, high=200, required=False, label="area"),
        "landmark": text("landmark", low=1, high=120, required=False, label="landmark"),
        "city": text("city", low=2, high=60, label="city"),
        "state": text("state", low=2, high=60, label="state"),
    }
    mobile = str(data.get("mobile") or "")
    if not crypto.is_valid_indian_mobile(mobile):
        raise ShopError("Enter a 10-digit Indian mobile number.", field="mobile")
    out["mobile"] = crypto.normalize_phone(mobile)
    pincode = str(data.get("pincode") or "").strip()
    if not PINCODE.fullmatch(pincode):
        raise ShopError("Enter a 6-digit PIN code.", field="pincode")
    out["pincode"] = pincode
    return out


def address_data(a: Address) -> dict:
    return {
        "id": str(a.id),
        "label": a.label,
        "full_name": a.full_name,
        "mobile": a.mobile,
        "line1": a.line1,
        "line2": a.line2,
        "landmark": a.landmark,
        "city": a.city,
        "state": a.state,
        "pincode": a.pincode,
        "is_default": a.is_default,
    }


MAX_ADDRESSES = 10


def save_address(customer, data: dict, *, address: Address | None = None) -> Address:
    clean = clean_address(data)
    make_default = bool(data.get("is_default"))
    with transaction.atomic():
        mine = Address.objects.select_for_update().filter(customer=customer)
        if address is None:
            if mine.count() >= MAX_ADDRESSES:
                raise ShopError(f"You can save at most {MAX_ADDRESSES} addresses.")
            address = Address(customer=customer)
            make_default = make_default or not mine.exists()
        for key, value in clean.items():
            setattr(address, key, value)
        if make_default:
            mine.exclude(pk=address.pk).update(is_default=False)
            address.is_default = True
        address.save()
    return address


# --------------------------------------------------------------------------- order data


def _step(order: Order, status: str, *, actor=None, note: str = "", previous: str = ""):
    OrderEvent.objects.create(
        order=order,
        status=status,
        from_status=previous,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        note=note[:300],
    )


def paid_total(order: Order) -> Decimal:
    return sum(
        (p.amount for p in order.payments.all() if p.status == OrderPayment.Status.SUCCEEDED), ZERO
    )


def customer_actions(order: Order) -> list[str]:
    actions = []
    if order.status == S.PENDING_PAYMENT:
        actions.append("pay")
    if order.status in CUSTOMER_CANCELLABLE:
        actions.append("cancel")
    return actions


def staff_actions(order: Order, role: str) -> list[str]:
    actions = []
    if order.status in NEXT:
        actions.append(f"mark_{NEXT[order.status]}")
    if role == "admin" and order.status in STAFF_CANCELLABLE:
        actions.append("cancel")
    return actions


TIMELINE = (S.PLACED, S.PACKED, S.SHIPPED, S.DELIVERED)


def timeline(order: Order) -> list[dict]:
    """The four tracking steps, each with when it happened (or null if not yet)."""
    at = {}
    for e in order.events.all():
        at.setdefault(e.status, e.created_at)
    return [{"status": s, "label": S(s).label, "at": at.get(s), "done": s in at} for s in TIMELINE]


def order_data(order: Order, *, viewer=None, staff: bool = False) -> dict:
    out = {
        "id": str(order.id),
        "number": order.number,
        "status": order.status,
        "status_label": order.get_status_display(),
        "created_at": order.created_at,
        "pay_until": order.pay_until if order.status == S.PENDING_PAYMENT else None,
        "items_total": str(order.items_total),
        "gst_included": str(order.gst_included),
        "discount": str(order.discount),
        "coupon_code": order.coupon_code,
        "coupon_amount": str(order.coupon_amount),
        "member_plan": order.member_plan,
        "member_amount": str(order.member_amount),
        "delivery_fee": str(order.delivery_fee),
        "gift_card_paid": str(
            money(
                sum(
                    (
                        p.amount
                        for p in order.payments.all()
                        if p.method == "gift_card" and p.status == OrderPayment.Status.SUCCEEDED
                    ),
                    ZERO,
                )
            )
        ),
        "total": str(order.total),
        "paid": str(money(paid_total(order))),
        "refunded": str(money(sum((r.amount for r in order.refunds.all()), ZERO))),
        "tracking_note": order.tracking_note,
        "cancel_reason": order.cancel_reason,
        "lines": [
            {
                "product": str(ln.product_id),
                "name": ln.name,
                "unit_price": str(ln.unit_price),
                "quantity": ln.quantity,
                "amount": str(ln.amount),
            }
            for ln in order.lines.all()
        ],
        "address": {
            "full_name": order.ship_name,
            "mobile": order.ship_mobile,
            "line1": order.ship_line1,
            "line2": order.ship_line2,
            "landmark": order.ship_landmark,
            "city": order.ship_city,
            "state": order.ship_state,
            "pincode": order.ship_pincode,
        },
        "timeline": timeline(order),
        "events": [
            {
                "status": e.status,
                "label": S(e.status).label,
                "at": e.created_at,
                "note": e.note,
                **({"by": e.actor.full_name if e.actor else "System"} if staff else {}),
            }
            for e in order.events.all()
        ],
    }
    if staff:
        out["customer"] = {
            "id": str(order.customer_id),
            "name": order.customer.full_name,
            "email": order.customer.email,
        }
        out["actions"] = staff_actions(order, getattr(viewer, "role", ""))
    else:
        out["actions"] = customer_actions(order)
    return out


def with_details(qs):
    return qs.select_related("customer").prefetch_related(
        "lines", "events__actor", "payments", "refunds"
    )


# --------------------------------------------------------------------------- mail


def email_customer(order: Order, subject: str, intro: str) -> None:
    lines = "\n".join(f"- {ln.name} x{ln.quantity}: Rs. {ln.amount}" for ln in order.lines.all())
    queue_mail(
        kind=MailOutbox.Kind.ORDER,
        to=order.customer.email,
        subject=f"{brand.SHOP_NAME}: order {order.number} {subject}",
        body=(
            f"Hello {order.customer.full_name},\n\n{intro}\n\nOrder {order.number}\n{lines}\n"
            f"Total: Rs. {order.total}"
        ),
        link=frontend_link(f"/customer/orders/{order.id}"),
    )


# --------------------------------------------------------------------------- lifecycle


def next_number(now) -> str:
    seq, _ = OrderSequence.objects.select_for_update().get_or_create(year=now.year)
    seq.last += 1
    seq.save(update_fields=["last"])
    return f"ORD-{now.year}-{seq.last:05d}"


def _return_stock(order: Order, *, actor=None, note: str) -> None:
    for ln in order.lines.select_related("product"):
        product = Product.objects.select_for_update().get(pk=ln.product_id)
        stock.move(
            product,
            ln.quantity,
            StockMovement.Reason.ORDER_RETURN,
            actor=actor,
            order=order,
            note=f"{order.number}: {note}",
        )


def _refund_all(order: Order, *, actor=None, reason: str) -> Decimal:
    total = ZERO
    for payment in order.payments.filter(status=OrderPayment.Status.SUCCEEDED):
        if OrderRefund.objects.filter(payment=payment).exists():
            continue
        OrderRefund.objects.create(
            order=order,
            payment=payment,
            amount=payment.amount,
            reason=reason[:300],
            actor=actor if getattr(actor, "is_authenticated", False) else None,
        )
        if payment.method == "gift_card":
            giftcards.refund_order_payment(payment, actor=actor, note=f"{order.number}: {reason}")
        total += payment.amount
    return total


def _release_coupon(order: Order) -> None:
    """A cancelled or expired order gives its coupon use back."""
    CouponRedemption.objects.filter(order=order, released_at__isnull=True).update(
        released_at=timezone.now()
    )


def expire_due(now=None) -> int:
    """Unpaid orders past their payment time: stock goes back, the order is closed."""
    now = now or timezone.now()
    count = 0
    due = Order.objects.filter(status=S.PENDING_PAYMENT, pay_until__lt=now).values_list(
        "pk", flat=True
    )
    for pk in list(due):
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=pk)
            if order.status != S.PENDING_PAYMENT or order.pay_until >= now:
                continue
            order.status = S.PAYMENT_EXPIRED
            order.save(update_fields=["status", "updated_at"])
            _return_stock(order, note="payment time ran out")
            _release_coupon(order)
            _step(order, S.PAYMENT_EXPIRED, previous=S.PENDING_PAYMENT)
            audit(AuditLog.Action.ORDER_EXPIRED, target=order.customer, order=order.number)
            count += 1
    return count


def place(
    customer,
    items,
    *,
    address: dict | None = None,
    address_id=None,
    coupon_code: str = "",
    request=None,
) -> Order:
    """Creates an order waiting for payment and holds its stock. One transaction."""
    expire_due()
    if address_id:
        saved = Address.objects.filter(pk=address_id, customer=customer).first()
        if saved is None:
            raise ShopError("Pick one of your saved addresses.", field="address", code="not_found")
        ship = address_data(saved)
    else:
        ship = clean_address(address or {})
    rules = shop_settings()
    with transaction.atomic():
        # The coupon row is locked too, so two orders cannot both take its last use.
        quote = price(
            items, customer=customer, coupon_code=coupon_code, lock=True, coupon_lock=True
        )
        b = quote.breakdown
        for ln in quote.lines:
            have = stock.level(ln.product)
            if have < ln.quantity:
                left = "none" if have <= 0 else f"only {have}"
                raise ShopError(
                    f"Sorry, {ln.product.name} has {left} left. Change the quantity and try again.",
                    code="conflict",
                    field="items",
                )
        now = timezone.now()
        order = Order.objects.create(
            number=next_number(now),
            customer=customer,
            ship_name=ship["full_name"],
            ship_mobile=ship["mobile"],
            ship_line1=ship["line1"],
            ship_line2=ship.get("line2", ""),
            ship_landmark=ship.get("landmark", ""),
            ship_city=ship["city"],
            ship_state=ship["state"],
            ship_pincode=ship["pincode"],
            items_total=b.items_total,
            gst_included=b.gst_included,
            discount=b.discount,
            coupon=b.coupon,
            coupon_code=b.coupon.code if b.coupon else "",
            coupon_amount=b.coupon_amount,
            member_plan=b.member_plan,
            member_amount=b.member_amount,
            delivery_fee=b.delivery_fee,
            total=b.total,
            pay_until=now + timedelta(minutes=int(rules["payment_hold_minutes"] or 30)),
        )
        for ln in quote.lines:
            OrderLine.objects.create(
                order=order,
                product=ln.product,
                name=ln.product.name,
                sku=ln.product.sku,
                unit_price=ln.unit_price,
                gst_percent=ln.gst_percent,
                quantity=ln.quantity,
                amount=ln.amount,
            )
            stock.move(
                ln.product,
                -ln.quantity,
                StockMovement.Reason.ORDER,
                actor=customer,
                order=order,
                note=order.number,
            )
        if b.coupon is not None:
            CouponRedemption.objects.create(
                coupon=b.coupon, order=order, customer=customer, amount=b.coupon_amount
            )
        _step(order, S.PENDING_PAYMENT, actor=customer)
        audit(
            AuditLog.Action.ORDER_PLACED,
            request=request,
            actor=customer,
            order=order.number,
            total=str(order.total),
            coupon=order.coupon_code,
            discount=str(order.discount),
        )
        if order.total <= 0:
            _mark_paid(order, actor=customer, reference="", request=request)
    return order


def _mark_paid(order: Order, *, actor, reference: str, request=None) -> None:
    order.status = S.PLACED
    order.pay_until = None
    order.save(update_fields=["status", "pay_until", "updated_at"])
    _step(order, S.PLACED, actor=actor, previous=S.PENDING_PAYMENT, note=reference)
    audit(
        AuditLog.Action.ORDER_PAID,
        request=request,
        actor=actor,
        order=order.number,
        amount=str(order.total),
        reference=reference,
    )
    email_customer(order, "is confirmed", "Thank you! We received your payment and will pack it.")


def pay(
    order_id,
    *,
    customer,
    succeed: bool,
    gift_code: str = "",
    gift_amount=None,
    ip: str | None = None,
    request=None,
) -> tuple[Order, bool]:
    """Pays an order. A gift card pays first (all or part); the rest goes through the simulated
    gateway. If the gateway part fails, nothing is taken from the card either. Returns
    (order, paid)."""
    expire_due()
    card = None
    if gift_code:
        try:
            card = giftcards.find(gift_code, user=customer, ip=ip, request=request)
        except giftcards.GiftCardError as exc:
            raise ShopError(exc.message, field="gift_card_code") from exc
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id, customer=customer).first()
        if order is None:
            raise ShopError("Order not found.", code="not_found")
        if order.status == S.PAYMENT_EXPIRED:
            raise ShopError(
                "The time to pay for this order ran out and the items were put back. Place the "
                "order again.",
                code="conflict",
            )
        if order.status != S.PENDING_PAYMENT:
            raise ShopError("There is no payment waiting for this order.", code="conflict")
        due = order.total - paid_total(order)
        from_card = ZERO
        if card is not None:
            try:
                balance = giftcards.check_usable(card)
            except giftcards.GiftCardError as exc:
                raise ShopError(exc.message, field="gift_card_code") from exc
            wanted = due if gift_amount in (None, "") else money(gift_amount)
            from_card = min(wanted, balance, due)
            if from_card <= 0:
                raise ShopError(
                    "Enter an amount to take from the gift card.", field="gift_card_amount"
                )
        rest = due - from_card
        if rest > 0 and not succeed:
            OrderPayment.objects.create(
                order=order,
                amount=rest,
                status=OrderPayment.Status.FAILED,
                reference=tender.reference("MOCK"),
            )
            return order, False
        reference = tender.reference("MOCK")
        if from_card > 0:
            gift_payment = OrderPayment.objects.create(
                order=order,
                method="gift_card",
                amount=from_card,
                status=OrderPayment.Status.SUCCEEDED,
                reference=tender.reference("GIFT"),
            )
            try:
                giftcards.redeem(card.pk, from_card, order_payment=gift_payment, actor=customer)
            except giftcards.GiftCardError as exc:
                raise ShopError(exc.message, code="conflict", field="gift_card_code") from exc
            audit(
                AuditLog.Action.GIFT_CARD_REDEEMED,
                request=request,
                actor=customer,
                card=giftcards.mask(card.last4),
                amount=str(from_card),
                order=order.number,
            )
        if rest > 0:
            OrderPayment.objects.create(
                order=order, amount=rest, status=OrderPayment.Status.SUCCEEDED, reference=reference
            )
        _mark_paid(order, actor=customer, reference=reference, request=request)
    return order, True


def _cancel(order: Order, *, actor, reason: str, who: str, request=None) -> Decimal:
    previous = order.status
    order.status = S.CANCELLED
    order.cancel_reason = reason[:300]
    order.pay_until = None
    order.save(update_fields=["status", "cancel_reason", "pay_until", "updated_at"])
    _return_stock(order, actor=actor, note=f"cancelled by the {who}")
    _release_coupon(order)
    refunded = _refund_all(order, actor=actor, reason=f"Order cancelled by the {who}: {reason}")
    _step(order, S.CANCELLED, actor=actor, previous=previous, note=reason)
    audit(
        AuditLog.Action.ORDER_CANCELLED,
        request=request,
        actor=actor,
        order=order.number,
        by=who,
        from_status=previous,
        reason=reason[:300],
        refunded=str(refunded),
    )
    return refunded


def customer_cancel(order_id, *, customer, reason: str = "", request=None) -> Order:
    expire_due()
    reason = " ".join(str(reason or "").split())[:300] or "No reason given"
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id, customer=customer).first()
        if order is None:
            raise ShopError("Order not found.", code="not_found")
        if order.status not in CUSTOMER_CANCELLABLE:
            raise ShopError(
                "This order has already been packed, so it can no longer be cancelled here. "
                "Call the salon for help.",
                code="conflict",
            )
        refunded = _cancel(order, actor=customer, reason=reason, who="customer", request=request)
        intro = "Your order was cancelled."
        if refunded:
            intro += f" Rs. {refunded} is refunded to your original payment method."
        email_customer(order, "was cancelled", intro)
    return order


def staff_cancel(order_id, *, actor, reason: str, request=None) -> Order:
    expire_due()
    reason = " ".join(str(reason or "").split())
    if len(reason) < 3:
        raise ShopError("Please give a reason (at least 3 characters).", field="reason")
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:
            raise ShopError("Order not found.", code="not_found")
        if order.status not in STAFF_CANCELLABLE:
            raise ShopError("This order is already closed.", code="conflict")
        refunded = _cancel(order, actor=actor, reason=reason, who="salon", request=request)
        intro = f"We are sorry: the salon cancelled your order.\nReason: {reason}"
        if refunded:
            intro += f"\nRs. {refunded} is refunded to your original payment method."
        email_customer(order, "was cancelled", intro)
    return order


def advance(order_id, *, actor, to: str, note: str = "", request=None) -> Order:
    """Moves a paid order one step on: packed, then shipped, then delivered."""
    expire_due()
    note = " ".join(str(note or "").split())[:120]
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:
            raise ShopError("Order not found.", code="not_found")
        expected = NEXT.get(order.status)
        if expected is None or to != expected:
            raise ShopError(
                "That step does not follow the order's current status. Refresh and try again.",
                code="conflict",
            )
        previous = order.status
        order.status = to
        fields = ["status", "updated_at"]
        if to == S.SHIPPED and note:
            order.tracking_note = note
            fields.append("tracking_note")
        order.save(update_fields=fields)
        _step(order, to, actor=actor, previous=previous, note=note)
        audit(
            AuditLog.Action.ORDER_ADVANCED,
            request=request,
            actor=actor,
            order=order.number,
            from_status=previous,
            to_status=to,
        )
        words = {
            S.PACKED: ("is packed", "Your order is packed and will be sent soon."),
            S.SHIPPED: ("is on its way", "Your order is out for delivery."),
            S.DELIVERED: ("was delivered", "Your order was delivered. Enjoy!"),
        }[to]
        intro = words[1] + (f"\nNote from the salon: {note}" if note else "")
        email_customer(order, words[0], intro)
    return order
