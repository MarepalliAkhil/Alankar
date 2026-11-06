"""Shared helpers for billing tests."""

from accounts.models import User
from billing import checkout
from scheduling.models import Appointment, AppointmentStatus


def admin_actor() -> User:
    user, _ = User.objects.get_or_create(
        email="helper-admin@example.com",
        defaults={"username": "helper-admin@example.com", "role": "admin"},
    )
    return user


def bill(appt_id, method="cash", actor=None, **options):
    """Checks a visit in (directly in the database) and bills it, paying the whole amount."""
    Appointment.objects.filter(
        pk=appt_id, status__in=[AppointmentStatus.SCHEDULED, AppointmentStatus.REQUESTED]
    ).update(status=AppointmentStatus.CHECKED_IN)
    actor = actor or admin_actor()
    data = {"appointment": str(appt_id), **options}
    result = checkout.quote(appt_id, data, actor=actor)
    due = result["totals"].payable_now + result["tip"]
    data["payments"] = [{"method": method, "amount": str(due)}] if due > 0 else []
    return checkout.checkout(appt_id, data, actor=actor)
