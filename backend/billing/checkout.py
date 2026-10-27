"""Checkout at the POS (Task 3c): one atomic transaction that bills a visit.

In one database transaction `checkout` locks the visit and the products sold, checks stock,
applies the discount (within the cap), GST, loyalty points and the online prepayment, writes the
invoice and its items, records the payments, deducts stock through the ledger, credits the tip and
loyalty points, opens the customer's pending rating and queues the receipt. Any failure rolls the
whole thing back. The receipt email goes out after the transaction commits.

Until the stylist slice (Task 4) exists, a checked-in visit is walked through "started" and
"completed" here so its history stays complete; after Task 4 the stylist does those two steps.
"""

from __future__ import annotations

import secrets
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import User
from billing import pos
from billing.models import Invoice, InvoiceItem, InvoiceSequence, Payment, Refund
from billing.pos import METHODS, CheckoutError, Line, Totals, money
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from inventory import stock
from inventory.models import Product, StockMovement
from marketing import coupons
from marketing.models import CouponRedemption
from people.models import LoyaltyEntry, Rating
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus
from website.content import pos_settings

S = AppointmentStatus
# A stylist can complete the service first; the visit then waits for the desk to bill it.
BILLABLE = (S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)
ZERO = Decimal("0")
MAX_QUANTITY = 20

__all__ = ["CheckoutError", "checkout", "quote", "ready_visits"]


def next_invoice_number(now) -> str:
    seq, _ = InvoiceSequence.objects.select_for_update().get_or_create(year=now.year)
    seq.last += 1
    seq.save(update_fields=["last"])
    return f"INV-{now.year}-{seq.last:05d}"


def item_description(appt: Appointment) -> str:
    text = appt.service_name
    if appt.variant_label:
        text += f" ({appt.variant_label})"
    if appt.addon_labels:
        text += " + " + ", ".join(appt.addon_labels)
    return text[:300]


def ready_visits():
    """Visits waiting at the counter: guests who are checked in or being served, and visits the
    stylist has completed that have not been billed yet."""
    return (
        Appointment.objects.filter(status__in=BILLABLE)
        .filter(invoice__isnull=True)
        .select_related("stylist", "room", "customer")
        .order_by("start")
    )


def service_line(appt: Appointment) -> tuple[str, Decimal, Decimal, str]:
    """(description, amount, GST inside the amount, what was not done). When the stylist did
    only part of what was booked, only that part is billed."""
    completion = getattr(appt, "completion", None)
    if completion is None or not completion.removed_lines:
        return item_description(appt), appt.price_total, appt.gst_amount, ""
    share = completion.done_price / completion.booked_price if completion.booked_price else ZERO
    gst = (appt.gst_amount * share).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    done = ", ".join(line["label"] for line in completion.done_lines)
    changes = "; ".join(
        f"{line['label']} (Rs. {Decimal(line['price']):.2f})" for line in completion.removed_lines
    )
    return done[:300], completion.done_price, gst, f"Not done: {changes}"[:300]


def max_discount_percent(actor) -> Decimal:
    """Receptionists are held to the cap; the admin may go further (a reason is always needed)."""
    if getattr(actor, "role", None) == User.Role.ADMIN:
        return Decimal("100")
    return Decimal(str(pos_settings()["discount_cap_percent"]))


def points_balance(customer) -> int:
    return LoyaltyEntry.objects.filter(customer=customer).aggregate(
        total=Coalesce(Sum("points"), 0)
    )["total"]


def prepaid_amount(appt: Appointment) -> Decimal:
    return Payment.objects.filter(
        appointment=appt, kind=Payment.Kind.PREPAYMENT, status=Payment.Status.SUCCEEDED
    ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]


def _decimal(value, label: str) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else "0"))
    except InvalidOperation as exc:
        raise CheckoutError(f"{label} is not a valid number.") from exc


def _products(inputs, *, lock: bool) -> list[tuple[Product, int]]:
    """Resolves {product, quantity} rows. With `lock`, the product rows are locked in id order."""
    wanted: dict[str, int] = {}
    for row in inputs or []:
        key = str(row.get("product"))
        qty = int(row.get("quantity") or 0)
        if qty < 1 or qty > MAX_QUANTITY:
            raise CheckoutError(f"Quantity must be between 1 and {MAX_QUANTITY}.")
        wanted[key] = wanted.get(key, 0) + qty
    if not wanted:
        return []
    qs = Product.objects.filter(pk__in=list(wanted), is_active=True).order_by("pk")
    if lock:
        qs = qs.select_for_update()
    found = {str(p.pk): p for p in qs}
    if set(found) != set(wanted):
        raise CheckoutError("One of the products is not available.", code="not_found")
    rows = []
    for key, qty in wanted.items():
        product = found[key]
        have = stock.level(product)
        if have < qty:
            raise CheckoutError(f"Only {have} of {product.name} in stock.", code="stock")
        rows.append((product, qty))
    return rows


def _coupon(code, *, customer, discount_percent, lock: bool):
    """The coupon named on the bill, or None. Raises when it cannot be used."""
    if not str(code or "").strip():
        return None
    coupon = coupons.find(code, lock=lock)
    coupons.check_usable(coupon, customer, discount_percent)
    return coupon


def _build(
    appt: Appointment, rows, *, discount_percent, redeem_points, actor, coupon=None
) -> Totals:
    cap = max_discount_percent(actor)
    if discount_percent < 0 or discount_percent > cap:
        raise CheckoutError(f"Discount cannot be more than {cap:f}%.")
    description, amount, gst_included, _ = service_line(appt)
    lines = [
        Line(
            kind="service",
            description=description,
            quantity=1,
            unit_price=amount,
            amount=amount,
            gst_included=gst_included,
        )
    ]
    for product, qty in rows:
        lines.append(
            Line(
                kind="product",
                description=product.name,
                quantity=qty,
                unit_price=product.unit_price,
                amount=money(product.unit_price * qty),
                gst_percent=product.gst_percent,
                product=product,
            )
        )
    coupon_amount = ZERO
    if coupon is not None:
        coupon_amount = coupons.amount_for(coupon, lines, discount_percent)
        total_percent = (
            (coupon_amount + sum((ln.amount for ln in lines), ZERO) * discount_percent / 100)
            / sum((ln.amount for ln in lines), ZERO)
            * 100
        )
        # A coupon on its own is the admin's promotion; stacked on a manual discount, the two
        # together stay inside the discount cap.
        if discount_percent > 0 and total_percent > cap:
            raise CheckoutError(
                f"The discount and the coupon together cannot be more than {cap:f}% of the bill."
            )
    t = pos.compute(
        lines,
        discount_percent=discount_percent,
        prepaid=prepaid_amount(appt),
        redeem_points=redeem_points,
        points_available=points_balance(appt.customer),
        rules=pos_settings(),
        coupon_amount=coupon_amount,
        coupon_applies=(lambda ln: coupons.eligible(ln, coupon)) if coupon else (lambda ln: True),
    )
    t.coupon_code = coupon.code if coupon else ""
    return t


def _options(data: dict):
    discount = _decimal(data.get("discount_percent"), "Discount")
    reason = (data.get("discount_reason") or "").strip()
    if discount > 0 and len(reason) < 3:
        raise CheckoutError("Give a reason for the discount.")
    try:
        redeem = int(data.get("redeem_points") or 0)
    except (TypeError, ValueError) as exc:
        raise CheckoutError("Points to use must be a whole number.") from exc
    tip = money(_decimal(data.get("tip"), "Tip"))
    if tip < 0:
        raise CheckoutError("Tip cannot be negative.")
    return discount, reason, redeem, tip


def quote(appt_id, data: dict, *, actor) -> dict:
    """What the bill would be. Writes nothing."""
    appt = Appointment.objects.select_related("customer", "stylist").get(pk=appt_id)
    if appt.status not in BILLABLE:
        raise CheckoutError("Only a checked-in, in-progress or completed visit can be billed.")
    if Invoice.objects.filter(appointment=appt).exists():
        raise CheckoutError("This visit has already been billed.", code="conflict")
    discount, _, redeem, tip = _options(data)
    rows = _products(data.get("products"), lock=False)
    coupon = _coupon(
        data.get("coupon"), customer=appt.customer, discount_percent=discount, lock=False
    )
    totals = _build(
        appt, rows, discount_percent=discount, redeem_points=redeem, actor=actor, coupon=coupon
    )
    return {"totals": totals, "tip": tip, "points": points_balance(appt.customer)}


def _validate_payments(payments, due: Decimal) -> list[tuple[str, Decimal]]:
    rows = []
    for row in payments or []:
        method = str(row.get("method", "")).lower()
        amount = money(_decimal(row.get("amount"), "Payment amount"))
        if method not in METHODS:
            raise CheckoutError("Pay by cash, card or UPI.")
        if amount <= 0:
            raise CheckoutError("Each payment must be more than zero.")
        rows.append((method, amount))
    if sum((a for _, a in rows), ZERO) != due:
        raise CheckoutError(f"Payments must add up to Rs. {due} (the amount due plus any tip).")
    return rows


def checkout(appt_id, data: dict, *, actor) -> Invoice:
    now = timezone.now()
    discount, reason, redeem, tip = _options(data)
    with transaction.atomic():
        appt = (
            Appointment.objects.select_for_update(of=("self",))
            .select_related("stylist", "customer")
            .get(pk=appt_id)
        )
        if appt.status not in BILLABLE:
            raise CheckoutError("Only a checked-in, in-progress or completed visit can be billed.")
        if Invoice.objects.filter(appointment=appt).exists():
            raise CheckoutError("This visit has already been billed.", code="conflict")
        if appt.stylist_id is None:
            raise CheckoutError("The visit has no stylist assigned.")
        rows = _products(data.get("products"), lock=True)
        # The coupon row is locked so two counters cannot both use its last redemption.
        coupon = _coupon(
            data.get("coupon"), customer=appt.customer, discount_percent=discount, lock=True
        )
        t = _build(
            appt, rows, discount_percent=discount, redeem_points=redeem, actor=actor, coupon=coupon
        )
        payments = _validate_payments(data.get("payments"), t.payable_now + tip)

        previous = appt.status
        if previous == S.CHECKED_IN:
            appt.status = S.IN_PROGRESS
            booking.record(appt, "started", actor=actor, from_status=previous)
            previous = appt.status
        if previous != S.COMPLETED:  # the stylist may already have completed it
            appt.status = S.COMPLETED
            appt.save(update_fields=["status", "updated_at"])
            booking.record(appt, "completed", actor=actor, from_status=previous)

        invoice = Invoice.objects.create(
            number=next_invoice_number(now),
            appointment=appt,
            customer=appt.customer,
            customer_name=appt.contact_name,
            customer_email=appt.contact_email,
            subtotal=t.subtotal,
            gst_amount=t.gst_amount,
            total=t.total,
            prepaid_amount=t.prepaid_applied,
            balance_paid=t.payable_now,
            discount_percent=discount,
            discount_amount=t.discount_amount,
            discount_reason=reason if discount > 0 else "",
            coupon_code=t.coupon_code,
            coupon_amount=t.coupon_amount,
            loyalty_redeemed=t.loyalty_redeemed,
            loyalty_earned=t.loyalty_earned,
            tip_amount=tip,
            service_changes=service_line(appt)[3],
            issued_at=now,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        for line in t.lines:
            InvoiceItem.objects.create(
                invoice=invoice,
                kind=line.kind,
                product=line.product,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                amount=line.amount,
            )
            if line.product is not None:
                stock.move(
                    line.product,
                    -line.quantity,
                    StockMovement.Reason.SALE,
                    actor=actor,
                    invoice=invoice,
                )
        if coupon is not None:
            CouponRedemption.objects.create(
                coupon=coupon, invoice=invoice, customer=appt.customer, amount=t.coupon_amount
            )
        for method, amount in payments:
            Payment.objects.create(
                appointment=appt,
                invoice=invoice,
                kind=Payment.Kind.CHECKOUT,
                method=method,
                amount=amount,
                status=Payment.Status.SUCCEEDED,
                reference=f"{method[:4].upper()}-{secrets.token_hex(6).upper()}",
            )
        if t.loyalty_redeemed:
            LoyaltyEntry.objects.create(
                customer=appt.customer,
                points=-t.loyalty_redeemed,
                reason=LoyaltyEntry.Reason.REDEEMED,
                invoice=invoice,
            )
        if t.loyalty_earned:
            LoyaltyEntry.objects.create(
                customer=appt.customer,
                points=t.loyalty_earned,
                reason=LoyaltyEntry.Reason.EARNED,
                invoice=invoice,
            )
        if t.excess_prepaid > 0:
            online = (
                Payment.objects.filter(
                    appointment=appt, kind=Payment.Kind.PREPAYMENT, status=Payment.Status.SUCCEEDED
                )
                .order_by("-created_at")
                .first()
            )
            if online is not None:
                Refund.objects.create(
                    payment=online,
                    invoice=invoice,
                    amount=t.excess_prepaid,
                    status=Refund.Status.PENDING_APPROVAL,
                    reason="The bill is lower than the online payment",
                    requested_by=actor if getattr(actor, "is_authenticated", False) else None,
                )
        Rating.objects.create(appointment=appt, customer=appt.customer, stylist=appt.stylist)
        queue_mail(
            kind=MailOutbox.Kind.INVOICE,
            to=appt.contact_email,
            subject=f"{brand.SHOP_NAME}: invoice {invoice.number}",
            body=receipt_text(appt, invoice, t),
            link=frontend_link("/customer/appointments"),
        )
    return invoice


def receipt_text(appt: Appointment, invoice: Invoice, t: Totals) -> str:
    lines = [f"Hello {appt.contact_name},", "", "Thank you for visiting us."]
    lines.append(f"Invoice {invoice.number} (all prices include GST):")
    for line in t.lines:
        suffix = f" x {line.quantity}" if line.quantity > 1 else ""
        lines.append(f"  {line.description}{suffix}: Rs. {line.amount}")
    if invoice.service_changes:
        lines.append(f"  ({invoice.service_changes})")
    manual = t.discount_amount - t.coupon_amount
    if manual > 0:
        lines.append(f"  Discount ({invoice.discount_percent.normalize()}%): -Rs. {manual}")
    if t.coupon_amount > 0:
        lines.append(f"  Coupon {invoice.coupon_code}: -Rs. {t.coupon_amount}")
    lines.append(f"Total: Rs. {t.total} (GST included: Rs. {t.gst_amount})")
    if t.loyalty_redeemed:
        lines.append(f"Paid with loyalty points: Rs. {t.loyalty_value}")
    if invoice.prepaid_amount:
        lines.append(f"Paid online earlier: Rs. {invoice.prepaid_amount}")
    lines.append(f"Paid at the salon: Rs. {invoice.balance_paid}")
    if invoice.tip_amount:
        lines.append(f"Tip for your stylist: Rs. {invoice.tip_amount}. Thank you!")
    if t.loyalty_earned:
        lines.append(f"Loyalty points earned: {t.loyalty_earned}")
    lines += [
        "",
        "Please take a moment to rate your stylist. It helps us, and you need to rate "
        "before your next booking.",
    ]
    return "\n".join(lines)
