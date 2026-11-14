"""AIR as a limited actor.

AIR has no login, no token and no UI session: it is code running on the server. Everything it may
do is listed under `service_actors.air.allow` in shared/policy.json; anything not listed is
denied. Every AIR function calls `require()` first, which also checks that cover mode is active
(except for the few actions that must keep working to stay safe, see `COVER_FREE`).
"""

from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from air import cover
from core import policy

ACTOR = "air"

# The complete allow-list, mirrored here so a typo in policy.json cannot silently widen it:
# `require()` demands the action be in BOTH places.
ALLOWED_ACTIONS = frozenset(
    {
        "air.services.read",
        "air.availability.read",
        "air.hold.create",
        "air.hold.release",
        "air.booking.request",
        "air.reception.accept",
        "air.payment_link.create",
        "air.payment_link.resend",
        "air.payment_link.expire",
        "air.notify.customer",
        "air.requests.read_own",
        "air.handoff",
        "air.undo",
        "air.products.read",
        "air.order.create",
        "air.order.update",
        "air.order.read_own",
        "air.visit_product.add",
        "air.cancel_own",
        "air.callback",
    }
)

# Safe housekeeping that must not depend on cover: releasing a hold, expiring a link, telling the
# customer and handing work to the desk only ever reduce risk or inform people.
COVER_FREE = frozenset(
    {
        "air.hold.release",
        "air.payment_link.expire",
        "air.notify.customer",
        "air.handoff",
    }
)

# Things AIR can never do. Listed so the policy tests (and the docs) can prove each is refused.
# Things AIR does for a customer who is talking to it right now, with that customer's own data
# only: reading the catalogue and free times, holding a time, sending the request the customer
# confirmed, and reading the customer's own requests and orders. They work with or without desk
# cover (a receptionist may be present: the request then goes to the human queue as today).
# Accepting for the desk, payment links and undo still need cover. Needs `assist=True`, which
# only the customer chat passes.
CUSTOMER_ASSIST = frozenset(
    {
        "air.services.read",
        "air.availability.read",
        "air.hold.create",
        "air.booking.request",
        "air.requests.read_own",
        "air.products.read",
        "air.order.create",
        "air.order.update",
        "air.order.read_own",
        "air.visit_product.add",
        "air.cancel_own",
        "air.callback",
    }
)

NEVER = (
    "stylist.accept",
    "refund.create",
    "discount.apply",
    "price.change",
    "fee.waive",
    "booking.cancel_after_cutoff",
    "rating_block.override",
    "user.edit",
    "staff.edit",
    "customer.read_other",
    "staff.private.read",
    "chat.photo.open",
    # Coupons: AIR never creates, applies or removes one (docs/COUPONS.md).
    "coupon.create",
    "coupon.apply",
    "coupon.remove",
)


class AirDenied(Exception):
    """AIR is not allowed to do this (or not right now)."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


def allowed(action: str) -> bool:
    return action in ALLOWED_ACTIONS and policy.service_actor_can(ACTOR, action)


def require(action: str, *, now: datetime | None = None, assist: bool = False) -> None:
    """Raises AirDenied unless AIR may do `action` right now. `assist=True` (the customer chat
    only) lets the customer-assist actions run without desk cover."""
    if not allowed(action):
        raise AirDenied("not_allowed", f"AIR may not do '{action}'.")
    if assist and action in CUSTOMER_ASSIST and policy.service_actor_assist(ACTOR, action):
        return
    if action not in COVER_FREE and not cover.is_active(now or timezone.now()):
        raise AirDenied("outside_cover", "AIR only acts while it is covering the front desk.")
