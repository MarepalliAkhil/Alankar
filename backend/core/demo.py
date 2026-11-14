"""Fictional demo and test accounts. Every name is made up and every email ends in example.com
(a domain reserved for examples, so a message to any of them can never reach a real person)."""

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from people.linking import link_existing
from people.models import CustomerProfile, StylistProfile

DEMO_PASSWORD = "Demo-Pass-2026!"  # fictional accounts only; reset_demo prints it

# (role, email, full name, linked team profile or None, phone)
DEMO_STAFF = [
    ("admin", "owner@demo.example.com", "Demo Owner", None, ""),
    ("receptionist", "reception@demo.example.com", "Demo Receptionist", None, ""),
    ("receptionist", "reception2@demo.example.com", "Demo Receptionist Two", None, ""),
    ("stylist", "rahul@demo.example.com", "Rahul Demo", "Rahul", ""),
    ("stylist", "kiran@demo.example.com", "Kiran Demo", "Kiran", ""),
    ("stylist", "priya@demo.example.com", "Priya Demo", "Priya", ""),
    # Arun has a login too, so an "Any stylist" salon request that AIR gives him can be answered.
    ("stylist", "arun@demo.example.com", "Arun Demo", "Arun", ""),
]

DEMO_CUSTOMERS = [
    ("meera@demo.example.com", "Meera Demo", "9000000001"),
    ("vikram@demo.example.com", "Vikram Demo", "9000000002"),
    ("anita@demo.example.com", "Anita Demo", "9000000003"),
    ("sameer@demo.example.com", "Sameer Demo", "9000000004"),
    ("divya@demo.example.com", "Divya Demo", "9000000005"),
    ("karthik@demo.example.com", "Karthik Demo", "9000000006"),
    # New customers used by the demo story to show every request state (declined, expired,
    # payment expired, "Any stylist", AIR-accepted and paid). See core/demo_story.py `_states`.
    ("nisha@demo.example.com", "Nisha Demo", "9000000007"),
    ("arjun@demo.example.com", "Arjun Demo", "9000000008"),
    ("rohan@demo.example.com", "Rohan Demo", "9000000009"),
    ("lakshmi@demo.example.com", "Lakshmi Demo", "9000000010"),
]


def ensure_user(role, email, full_name, password, phone="") -> User:
    """Creates the account (or updates its password and name). Marked email-verified."""
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        user = User(username=email.lower(), email=email.lower(), role=role)
    user.full_name = full_name
    user.role = role
    user.is_active = True
    user.email_verified_at = user.email_verified_at or timezone.now()
    if role == "admin":
        user.is_staff = True
        user.is_superuser = True
    user.set_password(password)
    user.save()
    if role == "customer":
        profile = CustomerProfile.objects.filter(user=user).first() or CustomerProfile(user=user)
        profile.set_phone(phone or "9000000000")
        profile.save()
    return user


@transaction.atomic
def ensure_staff(rows, password=DEMO_PASSWORD) -> dict[str, User]:
    made = {}
    for role, email, name, profile_name, _phone in rows:
        user = ensure_user(role, email, name, password)
        if profile_name:
            profile = StylistProfile.objects.get(display_name=profile_name)
            if profile.user_id != user.pk:
                link_existing(user, profile)
        made[email] = user
    return made


@transaction.atomic
def ensure_customers(rows, password=DEMO_PASSWORD) -> dict[str, User]:
    return {
        email: ensure_user("customer", email, name, password, phone) for email, name, phone in rows
    }


def ensure_air_cover() -> None:
    """Demo data only: AIR's desk cover is ON so the demo shows it working. (A real installation
    keeps the migration default, OFF, until the admin switches it on in the AIR settings.)"""
    from air import config

    obj = config.get_settings()
    if not obj.air_enabled:
        obj.air_enabled = True
        obj.save(update_fields=["air_enabled", "updated_at"])


# Demo coupons for the payment page (docs/COUPONS.md). get_or_create by code: safe to run twice.
DEMO_COUPONS = (
    {
        "code": "WELCOME10",
        "name": "Welcome 10% off",
        "description": "10% off your first visit.",
        "kind": "percent",
        "value": "10",
        "max_discount": "200",
        "first_visit_only": True,
    },
    {
        "code": "FLAT100",
        "name": "Rs 100 off",
        "description": "Rs 100 off a bill of Rs 999 or more.",
        "kind": "flat",
        "value": "100",
        "min_bill": "999",
        "per_customer_limit": 3,
    },
    {
        "code": "EXPIRED20",
        "name": "Old 20% offer (expired, for testing)",
        "description": "Expired on purpose: shows the 'has expired' message.",
        "kind": "percent",
        "value": "20",
        "max_discount": "300",
        "expired": True,
    },
)


def ensure_demo_coupons() -> list[str]:
    from datetime import timedelta
    from decimal import Decimal

    from django.utils import timezone

    from marketing.models import Coupon

    today = timezone.localdate()
    made = []
    for spec in DEMO_COUPONS:
        spec = dict(spec)
        expired = spec.pop("expired", False)
        code = spec.pop("code")
        for key in ("value", "max_discount", "min_bill"):
            if key in spec:
                spec[key] = Decimal(spec[key])
        if expired:
            spec["starts_on"] = today - timedelta(days=60)
            spec["ends_on"] = today - timedelta(days=30)
        _, created = Coupon.objects.get_or_create(code=code, defaults=spec)
        if created:
            made.append(code)
    return made
