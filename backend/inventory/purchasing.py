"""Purchase orders: draft, send (simulated email), receive in full or in parts, close.

Stock changes only when goods are received, and then only through the stock ledger. A receipt
cannot exceed what is still outstanding, and receiving is done under row locks, so two people
pressing "receive" together can never put more into stock than was ordered.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from core import brand
from core.mail import queue_mail
from core.models import MailOutbox
from inventory import stock
from inventory.models import (
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseReceipt,
    PurchaseReceiptLine,
    PurchaseSequence,
    StockMovement,
    Supplier,
)

PAISA = Decimal("0.01")
Status = PurchaseOrder.Status


class PurchaseError(Exception):
    pass


def money(value) -> str:
    return str(Decimal(value).quantize(PAISA))


def next_number() -> str:
    year = timezone.localdate().year
    PurchaseSequence.objects.get_or_create(year=year)
    row = PurchaseSequence.objects.select_for_update().get(year=year)
    row.last += 1
    row.save(update_fields=["last"])
    return f"PO-{year}-{row.last:04d}"


# --------------------------------------------------------------------------- reading


def received_map(order: PurchaseOrder) -> dict:
    rows = (
        PurchaseReceiptLine.objects.filter(line__order=order)
        .values("line")
        .annotate(n=Coalesce(Sum("quantity"), 0))
    )
    return {r["line"]: r["n"] for r in rows}


def totals(order: PurchaseOrder) -> dict:
    got = received_map(order)
    ordered = Decimal("0")
    taken = Decimal("0")
    units_ordered = units_received = 0
    for line in order.lines.all():
        ordered += line.quantity * line.unit_cost
        taken += got.get(line.id, 0) * line.unit_cost
        units_ordered += line.quantity
        units_received += got.get(line.id, 0)
    return {
        "ordered_value": ordered,
        "received_value": taken,
        "units_ordered": units_ordered,
        "units_received": units_received,
    }


# --------------------------------------------------------------------------- writing


def _clean_lines(lines: list[dict]) -> list[dict]:
    if not lines:
        raise PurchaseError("Add at least one product.")
    seen: set = set()
    out = []
    for item in lines:
        product = Product.objects.filter(pk=item["product"]).first()
        if product is None:
            raise PurchaseError("One of the products does not exist.")
        if product.pk in seen:
            raise PurchaseError(f"{product.name} is on the order twice.")
        seen.add(product.pk)
        if int(item["quantity"]) <= 0:
            raise PurchaseError(f"Enter how many {product.name} to order.")
        out.append(
            {"product": product, "quantity": int(item["quantity"]), "unit_cost": item["unit_cost"]}
        )
    return out


def _write_lines(order: PurchaseOrder, lines: list[dict]) -> None:
    order.lines.all().delete()
    PurchaseOrderLine.objects.bulk_create(
        [PurchaseOrderLine(order=order, **line) for line in lines]
    )


def create(
    *,
    supplier: Supplier,
    lines: list[dict],
    expected_on: date | None,
    notes: str,
    actor,
    request=None,
) -> PurchaseOrder:
    if not supplier.is_active:
        raise PurchaseError("That supplier is hidden. Show them again to order.")
    cleaned = _clean_lines(lines)
    with transaction.atomic():
        order = PurchaseOrder.objects.create(
            number=next_number(),
            supplier=supplier,
            expected_on=expected_on,
            notes=notes,
            created_by=actor,
        )
        _write_lines(order, cleaned)
        audit(
            AuditLog.Action.PO_CREATED,
            request=request,
            actor=actor,
            number=order.number,
            supplier=supplier.name,
            lines=len(cleaned),
        )
    return order


def edit(
    order_id, *, lines, expected_on, notes, supplier: Supplier | None, actor, request=None
) -> PurchaseOrder:
    cleaned = _clean_lines(lines) if lines is not None else None
    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().get(pk=order_id)
        if order.status != Status.DRAFT:
            raise PurchaseError("Only a draft can be changed.")
        if supplier is not None:
            if not supplier.is_active:
                raise PurchaseError("That supplier is hidden. Show them again to order.")
            order.supplier = supplier
        if expected_on is not False:
            order.expected_on = expected_on
        if notes is not None:
            order.notes = notes
        order.save()
        if cleaned is not None:
            _write_lines(order, cleaned)
        audit(
            AuditLog.Action.PO_CREATED,
            request=request,
            actor=actor,
            number=order.number,
            changed=True,
        )
    return order


def order_text(order: PurchaseOrder) -> str:
    rows = [
        f"- {ln.product.name} (SKU {ln.product.sku}): {ln.quantity} x Rs. {money(ln.unit_cost)}"
        for ln in order.lines.select_related("product")
    ]
    due = f"Please deliver by {order.expected_on:%d %b %Y}." if order.expected_on else ""
    total = totals(order)["ordered_value"]
    return "\n".join(
        [
            f"Hello {order.supplier.contact_person or order.supplier.name},",
            "",
            f"Purchase order {order.number} from {brand.SHOP_NAME}:",
            *rows,
            "",
            f"Total before GST: Rs. {money(total)}",
            due,
            order.notes,
        ]
    ).strip()


def send(order_id, *, actor, request=None) -> tuple[PurchaseOrder, bool]:
    """Marks the order sent and emails the supplier when they have an address (simulated)."""
    with transaction.atomic():
        order = (
            PurchaseOrder.objects.select_for_update(of=("self",))
            .select_related("supplier")
            .get(pk=order_id)
        )
        if order.status != Status.DRAFT:
            raise PurchaseError("Only a draft can be sent.")
        if not order.lines.exists():
            raise PurchaseError("Add at least one product first.")
        if not order.supplier.is_active:
            raise PurchaseError("That supplier is hidden. Show them again to order.")
        order.status = Status.SENT
        order.sent_at = timezone.now()
        order.save(update_fields=["status", "sent_at"])
        mailed = bool(order.supplier.email)
        if mailed:
            queue_mail(
                kind=MailOutbox.Kind.NOTICE,
                to=order.supplier.email,
                subject=f"{brand.SHOP_NAME}: purchase order {order.number}",
                body=order_text(order),
            )
        audit(
            AuditLog.Action.PO_SENT,
            request=request,
            actor=actor,
            number=order.number,
            supplier=order.supplier.name,
            emailed=mailed,
        )
    return order, mailed


def receive(order_id, items: list[dict], *, note: str, actor, request=None) -> PurchaseOrder:
    """items: [{"line": uuid, "quantity": n}]. Writes one ledger row per line received."""
    if not items:
        raise PurchaseError("Enter how many units arrived.")
    with transaction.atomic():
        order = (
            PurchaseOrder.objects.select_for_update(of=("self",))
            .select_related("supplier")
            .get(pk=order_id)
        )
        if order.status not in (Status.SENT, Status.PARTLY):
            raise PurchaseError("Goods can be received only on an order that was sent.")
        lines = {
            ln.id: ln
            for ln in order.lines.select_for_update(of=("self",)).select_related("product")
        }
        asked: dict = {}
        for item in items:
            line_id = item["line"]
            if line_id not in lines:
                raise PurchaseError("One of the lines is not on this order.")
            if line_id in asked:
                raise PurchaseError("A line appears twice.")
            asked[line_id] = int(item["quantity"])
        got = received_map(order)
        todo = {i: q for i, q in asked.items() if q > 0}
        if not todo:
            raise PurchaseError("Enter how many units arrived.")
        # Lock the products in a fixed order so two receipts cannot wait on each other.
        locked = {
            p.id: p
            for p in Product.objects.select_for_update()
            .filter(pk__in=[lines[i].product_id for i in todo])
            .order_by("id")
        }
        receipt = PurchaseReceipt.objects.create(order=order, received_by=actor, note=note[:200])
        for line_id, qty in todo.items():
            line = lines[line_id]
            outstanding = line.quantity - got.get(line_id, 0)
            if qty > outstanding:
                raise PurchaseError(
                    f"Only {outstanding} of {line.product.name} are still due, not {qty}."
                )
            movement = stock.move(
                locked[line.product_id],
                qty,
                StockMovement.Reason.PURCHASE,
                actor=actor,
                note=f"{order.number}" + (f": {note}" if note else ""),
                supplier=order.supplier,
            )
            PurchaseReceiptLine.objects.create(
                receipt=receipt, line=line, quantity=qty, movement=movement
            )
        done = received_map(order)
        complete = all(done.get(i, 0) >= ln.quantity for i, ln in lines.items())
        order.status = Status.RECEIVED if complete else Status.PARTLY
        if complete:
            order.closed_at = timezone.now()
        order.save(update_fields=["status", "closed_at"])
        audit(
            AuditLog.Action.PO_RECEIVED,
            request=request,
            actor=actor,
            number=order.number,
            units=sum(todo.values()),
            complete=complete,
        )
    return order


def close(order_id, reason: str, *, actor, request=None) -> PurchaseOrder:
    """Cancels an order nothing arrived for, or closes a part-delivered one as it stands."""
    reason = reason.strip()
    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().get(pk=order_id)
        if order.status in (Status.RECEIVED, Status.CLOSED, Status.CANCELLED):
            raise PurchaseError("This order is already finished.")
        if order.status != Status.DRAFT and len(reason) < 3:
            raise PurchaseError("Say why the order is being closed.")
        partly = order.status == Status.PARTLY
        order.status = Status.CLOSED if partly else Status.CANCELLED
        order.close_reason = reason
        order.closed_at = timezone.now()
        order.save(update_fields=["status", "close_reason", "closed_at"])
        audit(
            AuditLog.Action.PO_CLOSED,
            request=request,
            actor=actor,
            number=order.number,
            outcome=order.status,
            reason=reason,
        )
    return order
