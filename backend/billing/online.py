"""One calculation for money paid online: the shop checkout and the online booking payment
(Task 8.5 part 3).

The order is fixed and the same everywhere online:

    1. items        every line at its price from the database (incl. GST)
    2. coupon       checked on the server (active, dates, limits, owner, minimum bill, what it
                    applies to, cap) and shared over the lines it applies to
    3. membership   the member's percent off what is left: services always, products only when
                    the plan says so
    4. package      a package session pays for the service line (booking only)
    5. delivery     the shop's delivery charge, if any (shop only)
    6. gift card    last: it pays from whatever is still owed, never more than its balance

Nothing here writes to the database. The counter (POS) keeps its own long-standing order
(membership, manual discount, coupon), which only differs for a flat coupon combined with a
membership; checkout carries an online coupon over so the bill matches what was paid online.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from billing.pos import CheckoutError, Line, money
from marketing import coupons
from marketing.models import Coupon
from wallet import selling

ZERO = Decimal("0")


@dataclass
class Item:
    kind: str  # "service" or "product"
    description: str
    amount: Decimal  # incl. GST
    gst_percent: Decimal = Decimal("18")
    key: str = ""
    after: Decimal = ZERO
    coupon: Decimal = ZERO
    member: Decimal = ZERO
    package: Decimal = ZERO

    @property
    def gst(self) -> Decimal:
        return money(self.after * self.gst_percent / (100 + self.gst_percent))


@dataclass
class Breakdown:
    items: list[Item] = field(default_factory=list)
    items_total: Decimal = ZERO
    coupon: Coupon | None = None
    coupon_amount: Decimal = ZERO
    member_plan: str = ""
    member_percent: Decimal = ZERO
    member_amount: Decimal = ZERO
    package_amount: Decimal = ZERO
    delivery_fee: Decimal = ZERO
    total: Decimal = ZERO  # what is owed before the gift card
    gift_amount: Decimal = ZERO
    due: Decimal = ZERO  # what the gateway takes

    @property
    def discount(self) -> Decimal:
        return self.coupon_amount + self.member_amount

    @property
    def gst_included(self) -> Decimal:
        return sum((i.gst for i in self.items), ZERO)

    def data(self) -> dict:
        return {
            "items_total": str(money(self.items_total)),
            "coupon_code": self.coupon.code if self.coupon else "",
            "coupon_amount": str(money(self.coupon_amount)),
            "member_plan": self.member_plan,
            "member_percent": str(self.member_percent),
            "member_amount": str(money(self.member_amount)),
            "package_amount": str(money(self.package_amount)),
            "discount": str(money(self.discount)),
            "delivery_fee": str(money(self.delivery_fee)),
            "gst_included": str(money(self.gst_included)),
            "total": str(money(self.total)),
            "gift_amount": str(money(self.gift_amount)),
            "due": str(money(self.due)),
        }


def _share(amount: Decimal, targets: list[Item], attr: str) -> Decimal:
    """Takes `amount` off `targets` in proportion to what each still costs. Returns what was
    actually taken (never more than the lines are worth)."""
    base = sum((t.after for t in targets), ZERO)
    want = min(money(amount), base)
    if want <= 0:
        return ZERO
    given = ZERO
    for i, item in enumerate(targets):
        part = want - given if i == len(targets) - 1 else money(want * item.after / base)
        part = min(part, item.after)
        item.after -= part
        setattr(item, attr, getattr(item, attr) + part)
        given += part
    return given


def find_coupon(code: str, customer, *, lock: bool = False) -> Coupon | None:
    code = coupons.normalize(code)
    if not code:
        return None
    coupon = coupons.find(code, lock=lock)
    coupons.check_usable(coupon, customer, ZERO)
    return coupon


def calculate(
    items: list[Item],
    *,
    customer,
    coupon: Coupon | None = None,
    use_membership: bool = True,
    package_amount: Decimal = ZERO,
    delivery_fee: Decimal = ZERO,
    gift_balance: Decimal | None = None,
    gift_wanted: Decimal | None = None,
) -> Breakdown:
    """Applies the steps in order. `coupon` must already be checked with find_coupon (which also
    takes the row lock when the caller is about to save). Raises CheckoutError when a coupon does
    not fit this cart (minimum bill, nothing it applies to)."""
    b = Breakdown(items=items)
    for item in items:
        item.amount = money(item.amount)
        item.after = item.amount
    b.items_total = sum((i.amount for i in items), ZERO)

    # 2. coupon
    if coupon is not None:
        lines = [
            Line(
                kind=i.kind,
                description=i.description,
                quantity=1,
                unit_price=i.amount,
                amount=i.amount,
            )
            for i in items
        ]
        amount = coupons.amount_for(coupon, lines, ZERO)
        targets = [i for i, ln in zip(items, lines, strict=True) if coupons.eligible(ln, coupon)]
        b.coupon = coupon
        b.coupon_amount = _share(amount, targets, "coupon")

    # 3. membership
    membership = selling.current_membership(customer) if use_membership and customer else None
    if membership is not None and membership.discount_percent > 0:
        b.member_plan = membership.plan_name
        b.member_percent = membership.discount_percent
        for item in items:
            if item.kind == "product" and not membership.applies_to_products:
                continue
            part = money(item.after * membership.discount_percent / 100)
            item.after -= part
            item.member += part
            b.member_amount += part

    # 4. package session (pays for the service line)
    if package_amount and package_amount > 0:
        services = [i for i in items if i.kind == "service"]
        if not services:
            raise CheckoutError("A package can only pay for a service.")
        b.package_amount = _share(Decimal(package_amount), services, "package")

    # 5. delivery
    b.delivery_fee = money(delivery_fee or 0)
    b.total = sum((i.after for i in items), ZERO) + b.delivery_fee

    # 6. gift card, last
    if gift_balance is not None:
        wanted = b.total if gift_wanted in (None, "") else money(gift_wanted)
        if wanted <= 0:
            raise CheckoutError("Enter an amount to take from the gift card.")
        b.gift_amount = min(wanted, money(gift_balance), b.total)
    b.due = b.total - b.gift_amount
    return b
