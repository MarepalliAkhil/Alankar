"""Coupon rules. A coupon is checked in one place so the quote at the counter and the bill written
at checkout agree. One coupon per bill. A coupon that is not "stackable" cannot be used on a bill
that also has a manual discount; a stackable one can, but the two together still respect the
receptionist's discount cap."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count
from django.utils import timezone

from billing.pos import ZERO, CheckoutError
from marketing.models import Coupon, CouponRedemption

PAISA = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def normalize(code: str) -> str:
    return "".join(str(code or "").split()).upper()


def find(code: str, *, lock: bool = False) -> Coupon:
    qs = Coupon.objects.filter(code=normalize(code))
    if lock:
        qs = qs.select_for_update()
    coupon = qs.first()
    if coupon is None:
        raise CheckoutError("That coupon code is not valid.", code="invalid")
    return coupon


def eligible(line, coupon: Coupon) -> bool:
    if coupon.applies_to == Coupon.AppliesTo.ALL:
        return True
    wanted = "service" if coupon.applies_to == Coupon.AppliesTo.SERVICES else "product"
    return line.kind == wanted


def amount_for(coupon: Coupon, lines, manual_percent: Decimal) -> Decimal:
    """The rupees this coupon takes off, after any manual discount, with every rule checked."""
    after_manual = [(ln, ln.amount - money(ln.amount * manual_percent / 100)) for ln in lines]
    whole = sum((a for _, a in after_manual), ZERO)
    base = sum((a for ln, a in after_manual if eligible(ln, coupon)), ZERO)
    if base <= 0:
        raise CheckoutError(f"{coupon.code} does not apply to anything on this bill.")
    if whole < coupon.min_bill:
        raise CheckoutError(f"{coupon.code} needs a bill of at least Rs. {coupon.min_bill}.")
    if coupon.kind == Coupon.Kind.PERCENT:
        amount = money(base * coupon.value / 100)
    else:
        amount = money(coupon.value)
    if coupon.max_discount is not None:
        amount = min(amount, coupon.max_discount)
    return min(amount, base)


def check_usable(coupon: Coupon, customer, manual_percent: Decimal) -> None:
    today = timezone.localdate()
    if not coupon.is_active:
        raise CheckoutError(f"{coupon.code} is switched off.")
    if coupon.starts_on and today < coupon.starts_on:
        raise CheckoutError(f"{coupon.code} is not valid yet.")
    if coupon.ends_on and today > coupon.ends_on:
        raise CheckoutError(f"{coupon.code} has expired.")
    if manual_percent > 0 and not coupon.stackable:
        raise CheckoutError(f"{coupon.code} cannot be used together with another discount.")
    used = CouponRedemption.objects.filter(coupon=coupon)
    if coupon.total_limit is not None and used.count() >= coupon.total_limit:
        raise CheckoutError(f"{coupon.code} has been fully used.")
    if customer is not None and used.filter(customer=customer).count() >= coupon.per_customer_limit:
        raise CheckoutError(f"{coupon.code} has already been used the allowed number of times.")


def usage(coupons) -> dict:
    rows = (
        CouponRedemption.objects.filter(coupon__in=coupons).values("coupon").annotate(n=Count("id"))
    )
    return {str(r["coupon"]): r["n"] for r in rows}
