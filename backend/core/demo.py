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
]

DEMO_CUSTOMERS = [
    ("meera@demo.example.com", "Meera Demo", "9000000001"),
    ("vikram@demo.example.com", "Vikram Demo", "9000000002"),
    ("anita@demo.example.com", "Anita Demo", "9000000003"),
    ("sameer@demo.example.com", "Sameer Demo", "9000000004"),
    ("divya@demo.example.com", "Divya Demo", "9000000005"),
    ("karthik@demo.example.com", "Karthik Demo", "9000000006"),
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
