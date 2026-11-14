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
        raise CheckoutError(UNKNOWN, code="invalid")
    return coupon


UNKNOWN = "That coupon code is not valid."


def _ref(line) -> str:
    ref = getattr(line, "ref_id", "") or ""
    product = getattr(line, "product", None)
    if not ref and product is not None:
        ref = str(getattr(product, "pk", product))
    return str(ref)


def eligible(line, coupon: Coupon) -> bool:
    if coupon.applies_to == Coupon.AppliesTo.ALL:
        return True
    if coupon.applies_to == Coupon.AppliesTo.CHOSEN:
        ref = _ref(line)
        if line.kind == "service":
            if getattr(line, "division", "") in (coupon.divisions or []):
                return True
            return bool(ref) and ref in {
                str(pk) for pk in coupon.services.values_list("pk", flat=True)
            }
        return bool(ref) and ref in {str(pk) for pk in coupon.products.values_list("pk", flat=True)}
    wanted = "service" if coupon.applies_to == Coupon.AppliesTo.SERVICES else "product"
    return line.kind == wanted


def is_first_visit(customer, *, exclude_appointment=None) -> bool:
    """True when the customer has never paid for a booking or finished a visit."""
    from scheduling.models import Appointment, AppointmentStatus

    done = Appointment.objects.filter(customer=customer).filter(
        status__in=[
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.COMPLETED,
        ]
    )
    if exclude_appointment is not None:
        done = done.exclude(pk=exclude_appointment.pk)
    return not done.exists()


def rupees(value) -> str:
    value = money(value)
    return f"Rs {value:,.0f}" if value == value.to_integral_value() else f"Rs {value:,.2f}"


DIVISION_NAMES = {"salon": "Salon", "spa": "Spa", "beauty-parlor": "Beauty Parlor"}


def scope(coupon: Coupon) -> str:
    """What the coupon covers, in plain words: "" (everything), "services", "Spa services"..."""
    if coupon.applies_to == Coupon.AppliesTo.SERVICES:
        return "services"
    if coupon.applies_to == Coupon.AppliesTo.PRODUCTS:
        return "products"
    if coupon.applies_to != Coupon.AppliesTo.CHOSEN:
        return ""
    names = [f"{DIVISION_NAMES.get(d, d)} services" for d in coupon.divisions or []]
    names += list(coupon.services.order_by("name").values_list("name", flat=True))
    names += list(coupon.products.order_by("name").values_list("name", flat=True))
    if len(names) > 3:
        names = names[:3] + ["more"]
    return ", ".join(names) or "chosen items"


def terms(coupon: Coupon) -> str:
    """Short terms in plain words, e.g.
    "10% off, up to Rs 200 · minimum order Rs 500 · Spa services only · valid till 30 Nov"."""
    if coupon.kind == Coupon.Kind.PERCENT:
        head = f"{coupon.value.normalize():f}% off"
        if coupon.max_discount is not None:
            head += f", up to {rupees(coupon.max_discount)}"
    else:
        head = f"{rupees(coupon.value)} off"
    parts = [head]
    if coupon.min_bill and coupon.min_bill > 0:
        parts.append(f"minimum order {rupees(coupon.min_bill)}")
    covers = scope(coupon)
    if covers:
        parts.append(f"{covers} only")
    if coupon.first_visit_only:
        parts.append("first visit only")
    if coupon.ends_on:
        parts.append(f"valid till {coupon.ends_on.day} {coupon.ends_on:%b}")
    return " · ".join(parts)


def reason(coupon: Coupon, exc: CheckoutError, items_total: Decimal) -> str:
    """Why a listed coupon cannot be used for this payment, for its greyed card."""
    if exc.code == "minimum":
        return f"Add {rupees(max(coupon.min_bill - items_total, ZERO))} more to use this"
    if exc.code == "wrong_items":
        return f"Only for {scope(coupon) or 'other items'}"
    if exc.code == "first_visit":
        return "First visit only"
    if exc.code == "used":
        return "You have already used this"
    if exc.code == "limit":
        return "Usage limit reached"
    return "Not available for this payment"


def amount_for(coupon: Coupon, lines, manual_percent: Decimal) -> Decimal:
    """The rupees this coupon takes off, after any manual discount, with every rule checked."""
    after_manual = [(ln, ln.amount - money(ln.amount * manual_percent / 100)) for ln in lines]
    whole = sum((a for _, a in after_manual), ZERO)
    base = sum((a for ln, a in after_manual if eligible(ln, coupon)), ZERO)
    if base <= 0:
        raise CheckoutError(
            f"{coupon.code} does not apply to anything on this bill (not valid for these items).",
            code="wrong_items",
        )
    if whole < coupon.min_bill:
        raise CheckoutError(
            f"{coupon.code} needs a bill of at least {rupees(coupon.min_bill)}.", code="minimum"
        )
    if coupon.kind == Coupon.Kind.PERCENT:
        amount = money(base * coupon.value / 100)
    else:
        amount = money(coupon.value)
    if coupon.max_discount is not None:
        amount = min(amount, coupon.max_discount)
    return min(amount, base)


def check_usable(coupon: Coupon, customer, manual_percent: Decimal, *, appointment=None) -> None:
    """Dates are shop dates (Asia/Kolkata): valid from the start of `starts_on` to the end of
    `ends_on`."""
    today = timezone.localdate()
    if coupon.customer_id is not None and (customer is None or customer.pk != coupon.customer_id):
        # A private coupon looks exactly like a code that does not exist.
        raise CheckoutError(UNKNOWN, code="invalid")
    if not coupon.is_active:
        raise CheckoutError(f"{coupon.code} is switched off.", code="inactive")
    if coupon.starts_on and today < coupon.starts_on:
        raise CheckoutError(f"{coupon.code} is not valid yet.", code="not_started")
    if coupon.ends_on and today > coupon.ends_on:
        raise CheckoutError(f"{coupon.code} has expired.", code="expired")
    if manual_percent > 0 and not coupon.stackable:
        raise CheckoutError(f"{coupon.code} cannot be used together with another discount.")
    if (
        coupon.first_visit_only
        and customer is not None
        and not is_first_visit(customer, exclude_appointment=appointment)
    ):
        raise CheckoutError(f"{coupon.code} is for a first visit only.", code="first_visit")
    used = CouponRedemption.objects.filter(coupon=coupon, released_at__isnull=True)
    if coupon.total_limit is not None and used.count() >= coupon.total_limit:
        raise CheckoutError(
            f"{coupon.code} has been fully used (usage limit reached).", code="limit"
        )
    if customer is not None and used.filter(customer=customer).count() >= coupon.per_customer_limit:
        raise CheckoutError(
            f"{coupon.code} has already been used the allowed number of times.", code="used"
        )


def usage(coupons) -> dict:
    rows = (
        CouponRedemption.objects.filter(coupon__in=coupons, released_at__isnull=True)
        .values("coupon")
        .annotate(n=Count("id"))
    )
    return {str(r["coupon"]): r["n"] for r in rows}
