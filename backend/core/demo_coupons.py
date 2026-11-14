"""Demo coupons created by the owner's admin account (`python manage.py seed_demo_coupons`).

ADD ONLY: a code that already exists is skipped and reported, never edited or deleted. The admin
account is only read (to set `created_by`); nothing about it changes. Every coupon added is tagged
in core.DemoExtra, so `remove_demo_extras` can remove exactly these.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from core.models import DemoExtra

OWNER_ADMIN = "akhimarepalli666@gmail.com"

# code: (title, description, fields). Validity is today to 90 days from today (shop dates).
SPECS = {
    "WELCOME10": (
        "Welcome 10% off",
        "10% off your first visit, up to Rs 200.",
        {
            "kind": "percent",
            "value": "10",
            "max_discount": "200",
            "first_visit_only": True,
            "per_customer_limit": 1,
            "total_limit": 500,
        },
    ),
    "FLAT100": (
        "Rs 100 off",
        "Rs 100 off an order of Rs 999 or more.",
        {
            "kind": "flat",
            "value": "100",
            "min_bill": "999",
            "per_customer_limit": 3,
            "total_limit": 300,
        },
    ),
    "SPA15": (
        "Spa 15% off",
        "15% off Spa services, up to Rs 300.",
        {
            "kind": "percent",
            "value": "15",
            "max_discount": "300",
            "applies_to": "chosen",
            "divisions": ["spa"],
            "per_customer_limit": 3,
            "total_limit": 300,
        },
    ),
    "GLOW200": (
        "Glow Rs 200 off",
        "Rs 200 off facials on an order of Rs 1,500 or more.",
        {
            "kind": "flat",
            "value": "200",
            "min_bill": "1500",
            "applies_to": "chosen",
            "facials": True,
            "per_customer_limit": 3,
            "total_limit": 200,
        },
    ),
    "HAIR50": (
        "Hair Rs 50 off",
        "Rs 50 off Salon services on an order of Rs 400 or more.",
        {
            "kind": "flat",
            "value": "50",
            "min_bill": "400",
            "applies_to": "chosen",
            "divisions": ["salon"],
            "per_customer_limit": 3,
            "total_limit": 500,
        },
    ),
    "CARE10": (
        "Aftercare 10% off",
        "10% off products, up to Rs 150.",
        {
            "kind": "percent",
            "value": "10",
            "max_discount": "150",
            "applies_to": "products",
            "per_customer_limit": 3,
            "total_limit": 300,
        },
    ),
    "VIP25": (
        "VIP 25% off",
        "Private code for campaigns: 25% off, up to Rs 500.",
        {
            "kind": "percent",
            "value": "25",
            "max_discount": "500",
            "listed": False,
            "per_customer_limit": 1,
            "total_limit": 100,
        },
    ),
}


class NoOwnerAdmin(Exception):
    pass


def owner_admin() -> User:
    user = User.objects.filter(email__iexact=OWNER_ADMIN).first()
    if user is None:
        raise NoOwnerAdmin(f"No account with the email {OWNER_ADMIN}. Nothing was created.")
    if user.role != User.Role.ADMIN:
        raise NoOwnerAdmin(f"{OWNER_ADMIN} is not an admin account. Nothing was created.")
    return user


def seed(write=print) -> dict[str, list[str]]:
    """Returns {"created": [...], "skipped": [...]} (skipped = the code already exists)."""
    from marketing.models import Coupon
    from scheduling.models import Service

    admin = owner_admin()
    today = timezone.localdate()
    result: dict[str, list[str]] = {"created": [], "skipped": []}
    with transaction.atomic():
        for code, (title, description, spec) in SPECS.items():
            if Coupon.objects.filter(code__iexact=code).exists():
                result["skipped"].append(code)
                continue
            spec = dict(spec)
            facials = spec.pop("facials", False)
            for key in ("value", "max_discount", "min_bill"):
                if key in spec:
                    spec[key] = Decimal(spec[key])
            coupon = Coupon.objects.create(
                code=code,
                name=title,
                description=description,
                starts_on=today,
                ends_on=today + timedelta(days=90),
                created_by=admin,
                **spec,
            )
            if facials:
                found = Service.objects.filter(name__icontains="facial")
                if found.exists():
                    coupon.services.add(*found)
                else:  # no facial in this catalogue: the Beauty Parlor division instead
                    coupon.divisions = ["beauty-parlor"]
                    coupon.save(update_fields=["divisions"])
            DemoExtra.objects.create(
                key=f"row:marketing.coupon:{coupon.pk}",
                label="marketing.coupon",
                object_pk=str(coupon.pk),
            )
            result["created"].append(code)
    write(
        "  demo coupons: created "
        + (", ".join(result["created"]) or "none")
        + "; skipped (already exist) "
        + (", ".join(result["skipped"]) or "none")
    )
    return result
