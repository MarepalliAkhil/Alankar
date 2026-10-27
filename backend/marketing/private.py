"""Private coupons: one unique code per chosen customer, usable only by that customer, once.

They are made from a template (type, value, minimum bill, expiry). The code is random, so it
cannot be guessed, and the checkout answers "not valid" for anyone else, exactly as for a code that
does not exist. The customer sees it under their own coupons; an email is queued only for customers
who agreed to receive offers.
"""

from __future__ import annotations

import secrets
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from core import brand
from core.mail import queue_mail
from core.models import MailOutbox
from marketing.models import Coupon, CouponRedemption

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_BATCH = 500


class PrivateCouponError(Exception):
    pass


def new_code(prefix: str) -> str:
    return f"{prefix}-{''.join(secrets.choice(ALPHABET) for _ in range(8))}"


def state_of(coupon: Coupon, used: int, today: date | None = None) -> str:
    today = today or timezone.localdate()
    if used >= 1:
        return "used"
    if not coupon.is_active:
        return "withdrawn"
    if coupon.ends_on and today > coupon.ends_on:
        return "expired"
    if coupon.starts_on and today < coupon.starts_on:
        return "scheduled"
    return "ready"


def issue(
    *, customers, template: dict, prefix: str, actor, request=None
) -> list[tuple[Coupon, bool]]:
    """Makes one private coupon per customer. Returns (coupon, emailed) pairs."""
    customers = list(customers)
    if not customers:
        raise PrivateCouponError("Choose at least one customer.")
    if len(customers) > MAX_BATCH:
        raise PrivateCouponError(f"At most {MAX_BATCH} customers at a time.")
    out: list[tuple[Coupon, bool]] = []
    with transaction.atomic():
        for user in customers:
            for _ in range(5):
                code = new_code(prefix)
                if not Coupon.objects.filter(code=code).exists():
                    break
            coupon = Coupon.objects.create(
                code=code,
                customer=user,
                issued_by=actor,
                total_limit=1,
                per_customer_limit=1,
                stackable=False,
                **template,
            )
            emailed = False
            profile = getattr(user, "customer_profile", None)
            if profile is not None and profile.marketing_opt_in:
                queue_mail(
                    kind=MailOutbox.Kind.MARKETING,
                    to=user.email,
                    subject=f"{brand.SHOP_NAME}: a coupon just for you",
                    body=(
                        f"Hello {user.full_name.split(' ')[0] if user.full_name else 'there'},\n\n"
                        f"{describe(coupon)} Use code {coupon.code} when you pay"
                        f"{' before ' + coupon.ends_on.isoformat() if coupon.ends_on else ''}."
                        " It works once and only for you."
                    ),
                )
                emailed = True
            out.append((coupon, emailed))
        audit(
            AuditLog.Action.COUPONS_ISSUED,
            request=request,
            actor=actor,
            name=template["name"],
            count=len(out),
            emailed=sum(1 for _, e in out if e),
            ends_on=template["ends_on"].isoformat() if template.get("ends_on") else None,
        )
    return out


def revoke(coupon_id, *, actor, request=None) -> Coupon:
    with transaction.atomic():
        coupon = Coupon.objects.select_for_update().get(pk=coupon_id, customer__isnull=False)
        if CouponRedemption.objects.filter(coupon=coupon).exists():
            raise PrivateCouponError("This coupon has already been used.")
        if not coupon.is_active:
            raise PrivateCouponError("This coupon is already withdrawn.")
        coupon.is_active = False
        coupon.save(update_fields=["is_active"])
        audit(
            AuditLog.Action.COUPON_REVOKED,
            request=request,
            actor=actor,
            target=coupon.customer,
            coupon=coupon.code,
        )
    return coupon


def describe(coupon: Coupon) -> str:
    value = Decimal(coupon.value)
    off = f"{value:f}% off" if coupon.kind == Coupon.Kind.PERCENT else f"Rs. {value:f} off"
    extra = f" on a bill of Rs. {coupon.min_bill:f} or more" if coupon.min_bill else ""
    cap = f" (up to Rs. {coupon.max_discount:f})" if coupon.max_discount is not None else ""
    return f"{off}{extra}{cap}."
