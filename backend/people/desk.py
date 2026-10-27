"""Customer records for the front desk (receptionist and admin).

Staff see the phone number, allergies, preferences, visit history and front-desk notes.
They never see passwords, and notes meant for the stylist only are not returned here.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from accounts.models import User
from core import crypto
from people import ratings
from people.models import CustomerNote, CustomerProfile, phone_index
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
LIMIT = 50


class CustomerError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def customers() -> QuerySet[User]:
    return User.objects.filter(role=User.Role.CUSTOMER, is_active=True).select_related(
        "customer_profile"
    )


def search(term: str) -> QuerySet[User]:
    """Name or email (partial), or a full mobile number (exact, through the blind index)."""
    qs = customers()
    term = (term or "").strip()
    if term:
        condition = Q(full_name__icontains=term) | Q(email__icontains=term)
        if crypto.is_valid_indian_mobile(term):
            condition |= Q(customer_profile__phone_index=phone_index(term))
        qs = qs.filter(condition)
    return qs.annotate(
        visit_count=Count("appointments", filter=Q(appointments__status=S.COMPLETED), distinct=True)
    ).order_by("full_name", "email")[:LIMIT]


def get(pk) -> User | None:
    return customers().filter(pk=pk).first()


def stats(user: User) -> dict:
    appts = Appointment.objects.filter(customer=user)
    last = appts.filter(status=S.COMPLETED).order_by("-start").first()
    upcoming = (
        appts.filter(
            status__in=(S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN), start__gte=timezone.now()
        )
        .order_by("start")
        .first()
    )
    return {
        "visits": appts.filter(status=S.COMPLETED).count(),
        "no_shows": appts.filter(status=S.NO_SHOW).count(),
        "cancellations": appts.filter(status=S.CANCELLED).count(),
        "last_visit": last.start if last else None,
        "next_visit": upcoming.start if upcoming else None,
        "pending_ratings": ratings.pending_count(user),
    }


def visits(user: User) -> list[Appointment]:
    return list(
        Appointment.objects.filter(customer=user)
        .exclude(status__in=(S.REQUESTED, S.REJECTED))
        .select_related("stylist", "room")
        .order_by("-start", "-created_at")[:100]
    )


def desk_notes(user: User) -> QuerySet[CustomerNote]:
    return user.staff_notes.filter(audience=CustomerNote.Audience.DESK).select_related("author")


def create(
    *, name: str, email: str, phone: str, allergies: str = "", preferences: str = ""
) -> User:
    """Registers a customer at the desk. No password: they use "Forgot password" to set one."""
    if User.objects.filter(email__iexact=email).exists():
        raise CustomerError("A customer or staff member with this email already exists.", "exists")
    with transaction.atomic():
        user = User(username=email, email=email, full_name=name, role=User.Role.CUSTOMER)
        user.set_unusable_password()
        user.save()
        profile = CustomerProfile(user=user, allergies=allergies, preferences=preferences)
        profile.set_phone(phone)
        profile.save()
    return user


def update(user: User, data: dict) -> list[str]:
    """Applies the allowed edits and returns the names of the fields that changed."""
    changed: list[str] = []
    with transaction.atomic():
        profile, _ = CustomerProfile.objects.get_or_create(
            user=user, defaults={"phone": "", "phone_index": ""}
        )
        if "full_name" in data and data["full_name"] != user.full_name:
            user.full_name = data["full_name"]
            user.save(update_fields=["full_name"])
            changed.append("full_name")
        if "phone" in data and data["phone"] != profile.phone:
            profile.set_phone(data["phone"])
            changed.append("phone")
        for field in ("allergies", "preferences"):
            if field in data and data[field] != getattr(profile, field):
                setattr(profile, field, data[field])
                changed.append(field)
        if changed:
            profile.save()
    return changed


def add_note(user: User, *, author: User, body: str) -> CustomerNote:
    return CustomerNote.objects.create(
        customer=user, author=author, body=body, audience=CustomerNote.Audience.DESK
    )
