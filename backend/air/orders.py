"""Product orders for AIR (customer chat). Everything goes through the shop's own code, so
prices, GST, stock and the payment rules are the shop's, never AIR's.

What AIR can do here: list products on sale and in stock, add a product to the customer's next
visit (paid at the salon), place an order the customer confirmed, change the quantity of (or remove
a product from) the customer's own order BEFORE it is paid, and read the customer's own orders.

What AIR can never do: change a price, apply a discount or coupon, refund, process a return or
touch an order that is paid, packed or shipped. Those requests become a callback note for people.
Stock is checked and moved under a row lock inside one transaction, so it never goes negative.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone
from shop.models import Address, Order, OrderLine, OrderStatus

from accounts.audit import audit
from air import actionlog, actor, config
from air.models import AIActionLog
from inventory import stock
from inventory.models import Product, StockMovement
from scheduling import products as visit_products
from shop import orders as shop
from website.content import shop_settings

S = OrderStatus
AUDIT_UPDATE = "air_order_updated"
# The words a customer sees. Never the internal status names.
STATUS_WORDS = {
    S.PENDING_PAYMENT: "Waiting for payment",
    S.PLACED: "Paid, being prepared",
    S.PACKED: "Packed",
    S.SHIPPED: "On its way",
    S.DELIVERED: "Delivered",
    S.CANCELLED: "Cancelled",
    S.PAYMENT_EXPIRED: "Payment time ran out",
}


def quantity_cap() -> int:
    """Per product, per order: the admin's AIR limit (default 5), never above the shop's own."""
    return min(
        config.get_settings().max_order_quantity, int(shop_settings()["max_quantity_per_order"])
    )


def sellable_products(*, now: datetime | None = None, assist: bool = False) -> list[dict]:
    """Products that are active, sold online and in stock. Public facts only."""
    out = []
    for p in shop.listed_products():
        data = shop.product_data(p)
        if data["in_stock"]:
            out.append(
                {
                    "id": data["id"],
                    "name": data["name"],
                    "price": data["price"],
                    "low_stock": data["low_stock"],
                }
            )
    return out


def list_products(*, now: datetime | None = None, assist: bool = False) -> list[dict]:
    actor.require("air.products.read", now=now, assist=assist)
    return sellable_products()


def _levels(product_ids) -> dict:
    return {str(p.pk): stock.level(p) for p in Product.objects.filter(pk__in=list(product_ids))}


def clean_items(items) -> list[dict]:
    """[{"product": id, "quantity": n}] checked against the AIR cap. Raises AirDenied."""
    if not isinstance(items, list) or not items:
        raise actor.AirDenied("empty_cart", "There is nothing in the order yet.")
    cap = quantity_cap()
    merged: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            raise actor.AirDenied("bad_items", "Something in the order is not valid.")
        pid = str(item.get("product") or "")
        try:
            qty = int(item.get("quantity"))
        except (TypeError, ValueError):
            raise actor.AirDenied("bad_items", "Enter a whole number for the quantity.") from None
        if qty < 1:
            raise actor.AirDenied("bad_items", "A quantity must be at least 1.")
        merged[pid] = merged.get(pid, 0) + qty
    for qty in merged.values():
        if qty > cap:
            raise actor.AirDenied(
                "quantity_cap",
                f"I can order at most {cap} of one product in chat. For more, please ask the "
                "front desk.",
            )
    return [{"product": pid, "quantity": qty} for pid, qty in merged.items()]


def _address_for(customer, address_id=None) -> Address:
    qs = Address.objects.filter(customer=customer)
    found = qs.filter(pk=address_id).first() if address_id else None
    found = found or qs.filter(is_default=True).first() or qs.order_by("-created_at").first()
    if found is None:
        raise actor.AirDenied(
            "no_address", "Please save a delivery address in the shop first, then ask me again."
        )
    return found


def create_order(
    *,
    customer,
    items,
    customer_confirmed: bool,
    session_id: str = "",
    address_id=None,
    now: datetime | None = None,
    assist: bool = False,
) -> Order:
    """Places an order the customer confirmed. The stock is held until the payment time ends
    (never longer than the payment-link time set for AIR)."""
    now = now or timezone.now()
    actor.require("air.order.create", now=now, assist=assist)
    if customer_confirmed is not True:
        raise actor.AirDenied("not_confirmed", "The customer has not confirmed this order.")
    wanted = clean_items(items)
    address = _address_for(customer, address_id)
    before = _levels(i["product"] for i in wanted if _looks_like_uuid(i["product"]))
    order = shop.place(customer, wanted, address_id=address.pk)
    minutes = config.get_settings().payment_link_minutes
    if order.status == S.PENDING_PAYMENT and order.pay_until:
        order.pay_until = min(order.pay_until, now + timedelta(minutes=minutes))
        order.save(update_fields=["pay_until", "updated_at"])
    after = _levels(before)
    for line in order.lines.all():
        pid = str(line.product_id)
        actionlog.write(
            "create_product_order",
            customer=customer,
            order_ref=order.pk,
            session_id=session_id,
            after={
                "order_id": order.pk,
                "product_id": pid,
                "quantity": line.quantity,
                "stock_before": before.get(pid),
                "stock_after": after.get(pid),
                "order_status": order.status,
            },
            reversible=True,
            now=now,
        )
    return order


def _looks_like_uuid(value) -> bool:
    return shop._is_uuid(str(value or ""))


def own_order(customer, order_id) -> Order:
    order = Order.objects.filter(pk=order_id, customer=customer).first()
    if order is None:  # somebody else's order looks exactly like no order
        raise actor.AirDenied("not_found", "I can't find that order.")
    return order


def update_order(
    *,
    customer,
    order_id,
    changes,
    session_id: str = "",
    now: datetime | None = None,
    assist: bool = False,
) -> Order:
    """Changes a quantity (or removes a product with quantity 0) on the customer's own order
    while it is still waiting for payment. Stock moves with it; totals are re-priced by the
    shop's own price engine. Anything else is refused and left to people."""
    now = now or timezone.now()
    actor.require("air.order.update", now=now, assist=assist)
    if not isinstance(changes, list) or not changes:
        raise actor.AirDenied("empty_cart", "Tell me which product and the new quantity.")
    cap = quantity_cap()
    new_qty: dict[str, int] = {}
    for change in changes:
        try:
            qty = int(change.get("quantity"))
        except (TypeError, ValueError, AttributeError):
            raise actor.AirDenied("bad_items", "Enter a whole number for the quantity.") from None
        if qty < 0:
            raise actor.AirDenied("bad_items", "A quantity can't be negative.")
        if qty > cap:
            raise actor.AirDenied(
                "quantity_cap", f"I can order at most {cap} of one product in chat."
            )
        new_qty[str(change.get("product") or "")] = qty
    # Hand-offs are logged before the locked block so a refusal cannot roll the log back.
    seen = Order.objects.filter(pk=order_id, customer=customer).first()
    if seen is None:
        raise actor.AirDenied("not_found", "I can't find that order.")
    if seen.status != S.PENDING_PAYMENT:
        _hand_off_order(customer, seen, "paid_order", session_id, now)
        raise actor.AirDenied(
            "paid_order",
            "That order is already paid or closed, so I can't change it. The front desk can help.",
        )
    if seen.coupon_code or seen.member_amount:
        _hand_off_order(customer, seen, "discounted_order", session_id, now)
        raise actor.AirDenied(
            "discounted_order",
            "That order has a discount on it, so the front desk needs to change it.",
        )
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id, customer=customer).first()
        if order is None or order.status != S.PENDING_PAYMENT:
            raise actor.AirDenied("paid_order", "That order changed just now. Please try again.")
        lines = list(order.lines.select_for_update())
        by_product = {str(ln.product_id): ln for ln in lines}
        if set(new_qty) - set(by_product):
            raise actor.AirDenied("not_on_order", "That product is not on this order.")
        wanted = {pid: ln.quantity for pid, ln in by_product.items()}
        wanted.update(new_qty)
        wanted = {pid: q for pid, q in wanted.items() if q > 0}
        if not wanted:
            shop.customer_cancel(order.pk, customer=customer, reason="Removed in chat")
            order.refresh_from_db()
            actionlog.write(
                "cancel_product_order",
                customer=customer,
                order_ref=order.pk,
                session_id=session_id,
                after={"order_id": order.pk, "order_status": order.status},
                now=now,
            )
            return order
        before = _levels(by_product)
        quote = shop.price(
            [{"product": pid, "quantity": q} for pid, q in wanted.items()],
            customer=customer,
            lock=True,
        )
        for line in quote.lines:
            pid = str(line.product.id)
            have = by_product[pid].quantity
            extra = line.quantity - have
            if extra > 0 and stock.level(line.product) < extra:
                raise actor.AirDenied(
                    "out_of_stock", f"Sorry, there is not enough {line.product.name} left."
                )
        for pid, row in by_product.items():
            product = Product.objects.select_for_update().get(pk=pid)
            target = wanted.get(pid, 0)
            delta = target - row.quantity
            if delta > 0:
                stock.move(
                    product,
                    -delta,
                    StockMovement.Reason.ORDER,
                    actor=customer,
                    order=order,
                    note=f"{order.number}: quantity changed",
                )
            elif delta < 0:
                stock.move(
                    product,
                    -delta,
                    StockMovement.Reason.ORDER_RETURN,
                    actor=customer,
                    order=order,
                    note=f"{order.number}: quantity changed",
                )
            if target == 0:
                row.delete()
        for line in quote.lines:
            OrderLine.objects.filter(order=order, product=line.product).update(
                quantity=line.quantity, amount=line.amount
            )
        b = quote.breakdown
        order.items_total, order.gst_included, order.discount = (
            b.items_total,
            b.gst_included,
            b.discount,
        )
        order.delivery_fee, order.total = b.delivery_fee, b.total
        order.save(
            update_fields=[
                "items_total",
                "gst_included",
                "discount",
                "delivery_fee",
                "total",
                "updated_at",
            ]
        )
        audit(AUDIT_UPDATE, actor=None, target=customer, order=order.number, total=str(order.total))
        after = _levels(by_product)
        for pid in by_product:
            if before.get(pid) != after.get(pid):
                actionlog.write(
                    "update_product_order",
                    customer=customer,
                    order_ref=order.pk,
                    session_id=session_id,
                    before={"quantity": by_product[pid].quantity},
                    after={
                        "order_id": order.pk,
                        "product_id": pid,
                        "quantity": wanted.get(pid, 0),
                        "stock_before": before.get(pid),
                        "stock_after": after.get(pid),
                        "order_status": order.status,
                    },
                    now=now,
                )
    return order


def _hand_off_order(customer, order, reason: str, session_id: str, now) -> None:
    actionlog.write(
        "order_handoff",
        status=AIActionLog.Status.HANDED_OFF,
        customer=customer,
        order_ref=order.pk,
        session_id=session_id,
        reason_code=reason,
        after={"order_id": order.pk, "order_status": order.status},
        now=now,
    )


def my_orders(customer, *, now: datetime | None = None, assist: bool = False) -> list[dict]:
    """The customer's own latest orders, in customer-visible words only."""
    actor.require("air.order.read_own", now=now, assist=assist)
    rows = Order.objects.filter(customer=customer).order_by("-created_at")[:5]
    return [
        {
            "id": str(o.id),
            "number": o.number,
            "status": STATUS_WORDS.get(o.status, "In progress"),
            "status_key": o.status,
            "total": str(o.total),
            "pay_by": o.pay_until if o.status == S.PENDING_PAYMENT else None,
            "can_edit": o.status == S.PENDING_PAYMENT and not (o.coupon_code or o.member_amount),
            "lines": [
                {"product": str(ln.product_id), "name": ln.name, "quantity": ln.quantity}
                for ln in o.lines.all()
            ],
        }
        for o in rows
    ]


def add_to_visit(
    *,
    customer,
    product_id,
    quantity: int = 1,
    session_id: str = "",
    now: datetime | None = None,
    assist: bool = False,
) -> dict:
    """Adds a product to the customer's next visit, to pay at the salon. Held from stock."""
    now = now or timezone.now()
    actor.require("air.visit_product.add", now=now, assist=assist)
    if int(quantity) < 1 or int(quantity) > min(quantity_cap(), visit_products.MAX_EACH):
        raise actor.AirDenied("quantity_cap", "That quantity is more than I can add in chat.")
    appt = visit_products.next_visit(customer)
    if appt is None:
        raise actor.AirDenied("no_visit", "You have no upcoming visit to add this to.")
    pid = str(product_id)
    before = _levels([pid]) if _looks_like_uuid(pid) else {}
    try:
        visit_products.add_to_visit(
            appt.pk, customer=customer, items=[{"product": pid, "quantity": int(quantity)}]
        )
    except visit_products.ProductError as exc:
        raise actor.AirDenied(exc.code or "invalid", exc.message) from exc
    after = _levels([pid])
    actionlog.write(
        "add_product_to_booking",
        customer=customer,
        booking=appt,
        session_id=session_id,
        after={
            "product_id": pid,
            "quantity": int(quantity),
            "stock_before": before.get(pid),
            "stock_after": after.get(pid),
            "booking_id": appt.pk,
        },
        now=now,
    )
    return {"booking_id": str(appt.pk), "when": appt.start or appt.preferred_start}
