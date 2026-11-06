"""Products inside a booking (Task 8.5 part 4).

Stock is a ledger here too: adding a product to a visit writes a `booking_hold` movement, a visit
that does not happen writes `booking_back`, and checkout bills the held items without taking them
from stock again (so nothing is ever deducted twice).
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from inventory import stock
from inventory.models import Product, StockMovement
from scheduling.models import Appointment, AppointmentProduct, AppointmentStatus, Service

S = AppointmentStatus
P = AppointmentProduct.Status
PAISA = Decimal("0.01")
ZERO = Decimal("0")
MAX_LINES = 10
MAX_EACH = 5
# A visit can take products added later ("Add to my next appointment") until it starts.
ADDABLE = (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED)


class ProductError(Exception):
    def __init__(self, message: str, *, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def money(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def _is_uuid(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F-]{36}", value or ""))


def clean(items) -> dict[str, int]:
    """[{"product": id, "quantity": n}] -> {id: n}. An empty or missing list is fine."""
    if not items:
        return {}
    if not isinstance(items, list):
        raise ProductError("The products list is not valid.")
    wanted: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            raise ProductError("The products list is not valid.")
        pid = str(item.get("product") or "")
        try:
            qty = int(item.get("quantity", 1))
        except (TypeError, ValueError) as exc:
            raise ProductError("Enter a whole number for the quantity.") from exc
        if qty < 1:
            raise ProductError("A quantity must be at least 1.")
        wanted[pid] = wanted.get(pid, 0) + qty
    if len(wanted) > MAX_LINES:
        raise ProductError(f"A visit can have at most {MAX_LINES} different products.")
    if any(q > MAX_EACH for q in wanted.values()):
        raise ProductError(f"You can add at most {MAX_EACH} of each product to a visit.")
    return wanted


def _locked(wanted: dict[str, int]) -> dict[str, Product]:
    ids = [pid for pid in wanted if _is_uuid(pid)]
    found = {
        str(p.id): p for p in Product.objects.select_for_update().filter(pk__in=ids).order_by("id")
    }
    for pid in wanted:
        p = found.get(pid)
        if p is None or not p.is_active or not p.sold_online:
            raise ProductError("A product you picked is no longer available.")
    return found


def price_of(wanted: dict[str, int]) -> tuple[Decimal, Decimal]:
    """(amount incl. GST, GST inside it) for a product selection, from the database."""
    total = gst = ZERO
    for p in Product.objects.filter(pk__in=[k for k in wanted if _is_uuid(k)]):
        amount = money(p.unit_price * wanted[str(p.id)])
        total += amount
        gst += money(amount * p.gst_percent / (100 + p.gst_percent))
    return total, gst


def _day(appt: Appointment) -> str:
    return f"{timezone.localtime(appt.start or appt.preferred_start):%d %b}"


def hold(appt: Appointment, wanted: dict[str, int], *, paid_online: bool, actor=None) -> list:
    """Adds products to the visit and holds their stock. Call inside a transaction."""
    rows = []
    if not wanted:
        return rows
    products = _locked(wanted)
    for pid, qty in wanted.items():
        p = products[pid]
        have = stock.level(p)
        if have < qty:
            left = "none" if have <= 0 else f"only {have}"
            raise ProductError(f"Sorry, {p.name} has {left} left.", code="conflict")
        rows.append(
            AppointmentProduct.objects.create(
                appointment=appt,
                product=p,
                name=p.name,
                unit_price=p.unit_price,
                gst_percent=p.gst_percent,
                quantity=qty,
                amount=money(p.unit_price * qty),
                paid_online=paid_online,
            )
        )
        stock.move(
            p,
            -qty,
            StockMovement.Reason.BOOKING_HOLD,
            actor=actor,
            appointment=appt,
            note=f"Held for the visit on {_day(appt)}",
        )
    return rows


def release(appt: Appointment, *, note: str, actor=None, only=None) -> int:
    """Puts held products back on the shelf (visit cancelled, rejected, expired, no-show)."""
    qs = AppointmentProduct.objects.select_for_update().filter(appointment=appt, status=P.HELD)
    if only is not None:
        qs = qs.filter(pk=only)
    count = 0
    for row in qs:
        product = Product.objects.select_for_update().get(pk=row.product_id)
        stock.move(
            product,
            row.quantity,
            StockMovement.Reason.BOOKING_RELEASE,
            actor=actor,
            appointment=appt,
            note=note[:200],
        )
        row.status = P.RELEASED
        row.save(update_fields=["status"])
        count += 1
    return count


def held(appt: Appointment):
    return AppointmentProduct.objects.filter(appointment=appt, status=P.HELD).select_related(
        "product"
    )


def online_total(appt: Appointment) -> Decimal:
    return sum((r.amount for r in held(appt) if r.paid_online), ZERO)


def mark_billed(appt: Appointment) -> None:
    AppointmentProduct.objects.filter(appointment=appt, status=P.HELD).update(status=P.BILLED)


def recommended_for(service: Service) -> list[dict]:
    products = stock.with_levels(
        service.category.recommended_products.filter(is_active=True, sold_online=True)
    ).order_by("sort_order", "name")
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "price": str(p.unit_price),
            "in_stock": (p.stock or 0) > 0,
            "available": max(min(int(p.stock or 0), MAX_EACH), 0),
        }
        for p in products
    ]


def rows_data(appt: Appointment) -> list[dict]:
    return [
        {
            "id": str(r.id),
            "product": str(r.product_id),
            "name": r.name,
            "quantity": r.quantity,
            "amount": str(r.amount),
            "paid_online": r.paid_online,
            "status": r.status,
        }
        for r in appt.products.all()
        if r.status != P.RELEASED
    ]


def next_visit(customer) -> Appointment | None:
    """The customer's next visit that can still take products."""
    now = timezone.now()
    return (
        Appointment.objects.filter(customer=customer, status__in=ADDABLE)
        .exclude(start__lt=now)
        .exclude(start__isnull=True, preferred_start__lt=now)
        .order_by("start", "preferred_start")
        .first()
    )


def add_to_visit(appt_id, *, customer, items) -> Appointment:
    """ "Add to my next appointment": paid at the salon, held until the visit."""
    wanted = clean(items)
    if not wanted:
        raise ProductError("Pick a product to add.")
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().filter(pk=appt_id, customer=customer).first()
        if appt is None:
            raise ProductError("Visit not found.", code="not_found")
        if appt.status not in ADDABLE:
            raise ProductError(
                "Products can only be added before the visit starts.", code="conflict"
            )
        hold(appt, wanted, paid_online=False, actor=customer)
    return appt


def remove_from_visit(appt_id, row_id, *, customer) -> Appointment:
    """The customer takes back a pay-at-the-salon product before the visit."""
    with transaction.atomic():
        appt = Appointment.objects.select_for_update().filter(pk=appt_id, customer=customer).first()
        if appt is None:
            raise ProductError("Visit not found.", code="not_found")
        row = AppointmentProduct.objects.filter(pk=row_id, appointment=appt, status=P.HELD).first()
        if row is None:
            raise ProductError("That product is not on this visit.", code="not_found")
        if row.paid_online:
            raise ProductError(
                "This product was paid online with the booking. Ask the salon to change it.",
                code="conflict",
            )
        if appt.status not in ADDABLE:
            raise ProductError("The visit has started; ask at the counter.", code="conflict")
        release(appt, note="Removed by the customer", actor=customer, only=row.pk)
    return appt
