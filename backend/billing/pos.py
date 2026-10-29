"""The money rules of a checkout: discount, GST, loyalty points and what is left to pay.

Everything here is pure (no database writes) so the quote shown at the counter and the invoice
written at checkout are always computed by the same code. Prices include GST, so GST is the part
of each line's price after the discount: price * rate / (100 + rate).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

PAISA = Decimal("0.01")
ZERO = Decimal("0")
METHODS = ("cash", "card", "upi")


class CheckoutError(Exception):
    """The bill cannot be made as asked. `code` lets the API pick the HTTP status."""

    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def money(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


@dataclass
class Line:
    kind: str  # "service" or "product"
    description: str
    quantity: int
    unit_price: Decimal  # incl. GST
    amount: Decimal  # quantity * unit_price, incl. GST
    gst_percent: Decimal | None = None  # products
    gst_included: Decimal | None = None  # services: GST inside `amount` before any discount
    product: object = None
    member: Decimal = ZERO  # membership discount on this line (inside `discount`)
    # Task 8.5 part 4: a product booked with the visit; its stock is already held, so checkout
    # bills it without taking it from stock again.
    prefilled: bool = False
    paid_online: bool = False
    discount: Decimal = ZERO
    after: Decimal = ZERO
    gst: Decimal = ZERO


@dataclass
class Totals:
    lines: list[Line] = field(default_factory=list)
    gross: Decimal = ZERO
    discount_amount: Decimal = ZERO
    total: Decimal = ZERO
    gst_amount: Decimal = ZERO
    subtotal: Decimal = ZERO
    prepaid_applied: Decimal = ZERO
    excess_prepaid: Decimal = ZERO
    loyalty_redeemed: int = 0
    loyalty_value: Decimal = ZERO
    payable_now: Decimal = ZERO
    loyalty_earned: int = 0
    max_redeemable: int = 0
    coupon_amount: Decimal = ZERO
    coupon_code: str = ""
    member_discount: Decimal = ZERO  # membership discount (inside discount_amount)
    credit_amount: Decimal = ZERO  # package or included-session value that paid for the service


def compute(
    lines: list[Line],
    *,
    discount_percent: Decimal,
    prepaid: Decimal,
    redeem_points: int,
    points_available: int,
    rules: dict,
    coupon_amount: Decimal = ZERO,
    coupon_applies=lambda line: True,
    member_percent: Decimal = ZERO,
    member_applies=lambda line: True,
    credit_cap: Decimal | None = None,
) -> Totals:
    t = Totals(lines=lines)
    pct = Decimal(discount_percent)
    mpct = Decimal(member_percent)
    for line in lines:
        # A membership discount comes off first; the manual discount is taken from what is left.
        line.member = money(line.amount * mpct / 100) if mpct > 0 and member_applies(line) else ZERO
        line.discount = line.member + money((line.amount - line.member) * pct / 100)
        line.after = line.amount - line.discount
        t.member_discount += line.member
    if coupon_amount > 0:
        # The coupon is shared out over the lines it applies to, in proportion to their price.
        targets = [ln for ln in lines if coupon_applies(ln)]
        base = sum((ln.after for ln in targets), ZERO)
        want = min(coupon_amount, base)
        given = ZERO
        for i, line in enumerate(targets):
            share = want - given if i == len(targets) - 1 else money(want * line.after / base)
            share = min(share, line.after)
            line.discount += share
            line.after -= share
            given += share
        t.coupon_amount = given
    for line in lines:
        if line.kind == "product":
            rate = line.gst_percent or ZERO
            line.gst = money(line.after * rate / (100 + rate))
        elif line.amount > 0:
            line.gst = money((line.gst_included or ZERO) * line.after / line.amount)
        t.gross += line.amount
        t.discount_amount += line.discount
        t.total += line.after
        t.gst_amount += line.gst
    t.subtotal = t.total - t.gst_amount
    if credit_cap is not None:
        # A package session or an included membership session pays for the service line (up to the
        # session's value); the online prepayment, points and cash cover the rest.
        service = next(ln for ln in lines if ln.kind == "service")
        t.credit_amount = min(Decimal(credit_cap), service.after)
    after_credit = t.total - t.credit_amount
    t.prepaid_applied = min(prepaid, after_credit)
    t.excess_prepaid = prepaid - t.prepaid_applied

    value = Decimal(rules["loyalty_point_value"])
    owed = after_credit - t.prepaid_applied
    by_share = (t.total * Decimal(rules["loyalty_max_redeem_percent"]) / 100) // value
    t.max_redeemable = int(max(ZERO, min(Decimal(points_available), by_share, owed // value)))
    if redeem_points < 0:
        raise CheckoutError("Points to use cannot be negative.")
    if redeem_points > t.max_redeemable:
        raise CheckoutError(
            f"At most {t.max_redeemable} loyalty points can be used on this bill.",
            code="invalid",
        )
    t.loyalty_redeemed = redeem_points
    t.loyalty_value = value * redeem_points
    t.payable_now = owed - t.loyalty_value
    paid_in_money = t.total - t.credit_amount - t.loyalty_value
    t.loyalty_earned = int(paid_in_money // 100 * Decimal(rules["loyalty_points_per_100"]))
    return t
