"""Trusted devices (Task 13D): "Remember this device for 30 days", customers only.

The browser keeps a random 256-bit token in an HttpOnly cookie; the server keeps only its
SHA-256 hash. The token rotates on every use. A trusted device skips the emailed code and
nothing else: the password is always checked first, staff never get here, and sensitive actions
ask for a fresh code regardless (see stepup.py).
"""

import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog, TrustedDevice, User
from accounts.tokens import hash_token

COOKIE = "salon_trusted"
COOKIE_PATH = "/api/auth/"
DAYS = 30
MAX_DEVICES = 10


def eligible(user: User) -> bool:
    """Only customers can remember a device; staff always use their own second step."""
    return user.role == User.Role.CUSTOMER


def device_label(user_agent: str) -> str:
    """A short human label such as "Chrome on Windows" (never the raw user-agent string)."""
    ua = user_agent or ""
    browser = "Browser"
    for name, pattern in (
        ("Edge", r"Edg/"),
        ("Opera", r"OPR/|Opera"),
        ("Firefox", r"Firefox/"),
        ("Chrome", r"Chrome/|CriOS/"),
        ("Safari", r"Safari/"),
    ):
        if re.search(pattern, ua):
            browser = name
            break
    system = "unknown device"
    for name, pattern in (
        ("Android", r"Android"),
        ("iPhone", r"iPhone"),
        ("iPad", r"iPad"),
        ("Windows", r"Windows"),
        ("macOS", r"Macintosh|Mac OS X"),
        ("Linux", r"Linux|X11"),
    ):
        if re.search(pattern, ua):
            system = name
            break
    return f"{browser} on {system}"[:80]


def _cookie_kwargs(max_age: int) -> dict:
    conf = settings.SALON_AUTH
    return {
        "max_age": max_age,
        "path": COOKIE_PATH,
        "httponly": True,
        "secure": conf["COOKIE_SECURE"],
        "samesite": conf["COOKIE_SAMESITE"],
    }


def set_cookie(response, token: str, expires_at) -> None:
    remaining = max(int((expires_at - timezone.now()).total_seconds()), 1)
    response.set_cookie(COOKIE, token, **_cookie_kwargs(remaining))


def clear_cookie(response) -> None:
    response.delete_cookie(
        COOKIE, path=COOKIE_PATH, samesite=settings.SALON_AUTH["COOKIE_SAMESITE"]
    )


def remember(user: User, request, response) -> TrustedDevice:
    """Creates a trusted device for the signed-in customer and puts its cookie on the response."""
    token = secrets.token_urlsafe(32)  # 256 bits
    now = timezone.now()
    # Keep the list short: the oldest remembered devices are dropped first.
    live = list(
        TrustedDevice.objects.filter(user=user, revoked_at__isnull=True, expires_at__gt=now)
    )
    for old in sorted(live, key=lambda d: d.last_used_at or d.created_at)[: -(MAX_DEVICES - 1)]:
        revoke(old, request=request, why="limit")
    device = TrustedDevice.objects.create(
        user=user,
        token_hash=hash_token(token),
        label=device_label(request.META.get("HTTP_USER_AGENT", "")),
        expires_at=now + timedelta(days=DAYS),
    )
    set_cookie(response, token, device.expires_at)
    audit(
        AuditLog.Action.TRUSTED_DEVICE_ADDED,
        request=request,
        actor=user,
        target=user,
        device=str(device.id),
        label=device.label,
    )
    return device


def check(user: User, request) -> TrustedDevice | None:
    """The device this request's cookie belongs to, if it is valid for THIS user. Else None."""
    token = request.COOKIES.get(COOKIE)
    if not token or len(token) > 200 or not eligible(user):
        return None
    digest = hash_token(token)
    now = timezone.now()
    device = TrustedDevice.objects.filter(token_hash=digest).first()
    if device is None:
        replayed = TrustedDevice.objects.filter(
            previous_hash=digest, revoked_at__isnull=True
        ).first()
        if replayed is not None:
            # An already-rotated token came back: the cookie was copied. Cancel that device.
            revoke(replayed, request=request, why="replayed_token")
        _reject(request, user, "unknown_token")
        return None
    if device.user_id != user.id:
        _reject(request, user, "other_account")
        return None
    if device.revoked_at is not None:
        _reject(request, user, "revoked")
        return None
    if device.expires_at <= now:
        _reject(request, user, "expired")
        return None
    return device


def _reject(request, user: User, reason: str) -> None:
    audit(
        AuditLog.Action.TRUSTED_DEVICE_REJECTED,
        request=request,
        target=user,
        email=user.email,
        reason=reason,
    )


def rotate(device: TrustedDevice, request, response) -> None:
    """Gives the browser a new token (the old one stops working) and records the use."""
    token = secrets.token_urlsafe(32)
    device.previous_hash = device.token_hash
    device.token_hash = hash_token(token)
    device.last_used_at = timezone.now()
    device.save(update_fields=["previous_hash", "token_hash", "last_used_at"])
    set_cookie(response, token, device.expires_at)
    audit(
        AuditLog.Action.TRUSTED_DEVICE_USED,
        request=request,
        actor=device.user,
        target=device.user,
        device=str(device.id),
        label=device.label,
    )


def revoke(device: TrustedDevice, request=None, why: str = "user") -> None:
    if device.revoked_at is not None:
        return
    device.revoked_at = timezone.now()
    device.save(update_fields=["revoked_at"])
    audit(
        AuditLog.Action.TRUSTED_DEVICE_REVOKED,
        request=request,
        actor=device.user if why == "user" else None,
        target=device.user,
        device=str(device.id),
        label=device.label,
        why=why,
    )


def revoke_all(user: User, request=None, why: str = "user") -> int:
    count = 0
    for device in TrustedDevice.objects.filter(user=user, revoked_at__isnull=True):
        revoke(device, request=request, why=why)
        count += 1
    return count


def live_devices(user: User):
    return TrustedDevice.objects.filter(
        user=user, revoked_at__isnull=True, expires_at__gt=timezone.now()
    )


def check_quiet(user: User, request) -> TrustedDevice | None:
    """Like check(), but without audit entries: used only to mark "this device" in the list."""
    token = request.COOKIES.get(COOKIE)
    if not token or len(token) > 200:
        return None
    device = TrustedDevice.objects.filter(token_hash=hash_token(token), user=user).first()
    if device is None or device.revoked_at is not None or device.expires_at <= timezone.now():
        return None
    return device
