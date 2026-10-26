"""Lockout: 5 failed logins for one email within 15 minutes lock it for 15 minutes.

Counted per email address whether or not an account exists, so the lockout itself
never reveals which emails are registered.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from accounts.models import LoginAttempt, LoginLock


def _window() -> timedelta:
    return timedelta(minutes=settings.SALON_AUTH["LOCKOUT_MINUTES"])


def is_locked(email: str) -> bool:
    return LoginLock.objects.filter(email=email, locked_until__gt=timezone.now()).exists()


def record_failure(email: str, ip: str | None) -> bool:
    """Records a failed attempt. Returns True if this failure triggered a new lock."""
    LoginAttempt.objects.create(email=email, succeeded=False, ip_address=ip)
    now = timezone.now()
    since = now - _window()
    last_success = (
        LoginAttempt.objects.filter(email=email, succeeded=True)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    if last_success and last_success > since:
        since = last_success
    failures = LoginAttempt.objects.filter(
        email=email, succeeded=False, created_at__gt=since
    ).count()
    if failures >= settings.SALON_AUTH["LOCKOUT_THRESHOLD"]:
        LoginLock.objects.update_or_create(email=email, defaults={"locked_until": now + _window()})
        return True
    return False


def record_success(email: str, ip: str | None) -> None:
    LoginAttempt.objects.create(email=email, succeeded=True, ip_address=ip)
    LoginLock.objects.filter(email=email).delete()


def clear_lock(email: str) -> None:
    LoginLock.objects.filter(email=email).delete()
