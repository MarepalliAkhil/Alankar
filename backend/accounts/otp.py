"""Customer one-time codes (email OTP) for registration and sign-in.

Codes are 6 digits, valid for SALON_AUTH["OTP_MINUTES"], allow a few wrong tries and are
stored only as a keyed hash. Without a way to deliver the email (no SMTP and not in debug
mode) the step is skipped, so customers are never locked out of a misconfigured server.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog, OtpChallenge, User
from core import brand
from core.mail import queue_mail
from core.models import MailOutbox

GENERIC_OTP_ERROR = "That code is incorrect or has expired."
OTP_SENT_MESSAGE = "We emailed you a 6-digit code. It is valid for {minutes} minutes."


class OtpThrottled(Exception):
    """Too many codes were requested for this account."""


def otp_enabled() -> bool:
    return bool(
        settings.SALON_CUSTOMER_OTP and (settings.SALON_SMTP_CONFIGURED or settings.SALON_DEV_TOOLS)
    )


def purpose_for(user: User) -> str:
    """Register code until the email is proven, login code afterwards (decided by the server)."""
    return (
        OtpChallenge.Purpose.REGISTER
        if user.email_verified_at is None
        else OtpChallenge.Purpose.LOGIN
    )


def email_verified_or_not_required(user: User) -> bool:
    """False for an unverified customer while email codes are in force."""
    return user.email_verified_at is not None or not otp_enabled()


def _digest(challenge_id, code: str) -> str:
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def sent_message() -> str:
    return OTP_SENT_MESSAGE.format(minutes=settings.SALON_AUTH["OTP_MINUTES"])


def issue(user: User, purpose: str, request=None) -> OtpChallenge:
    """Closes older codes, creates a new one and emails it (after the transaction commits)."""
    cfg = settings.SALON_AUTH
    now = timezone.now()
    recent = OtpChallenge.objects.filter(user=user, created_at__gte=now - timedelta(hours=1))
    if recent.count() >= cfg["OTP_MAX_PER_HOUR"]:
        raise OtpThrottled
    code = f"{secrets.randbelow(10**6):06d}"

    def on_failure(message: MailOutbox) -> None:
        audit(
            AuditLog.Action.EMAIL_FAILED,
            request=request,
            target=user,
            kind="otp",
            error=message.error,
        )

    with transaction.atomic():
        OtpChallenge.objects.filter(user=user, closed_at__isnull=True).update(closed_at=now)
        challenge = OtpChallenge(
            user=user, purpose=purpose, expires_at=now + timedelta(minutes=cfg["OTP_MINUTES"])
        )
        challenge.code_hash = _digest(challenge.id, code)
        challenge.save()
        queue_mail(
            kind=MailOutbox.Kind.OTP,
            to=user.email,
            subject=f"{brand.SHOP_NAME}: your verification code",
            body=(
                f"Your verification code is {code}.\n\n"
                f"It is valid for {cfg['OTP_MINUTES']} minutes. "
                "If you did not try to sign in or register, you can ignore this email."
            ),
            on_failure=on_failure,
        )
    return challenge


def resend(user: User, purpose: str, request=None) -> bool:
    """Sends a fresh code if one was requested recently and the cool-down has passed."""
    cfg = settings.SALON_AUTH
    now = timezone.now()
    latest = OtpChallenge.objects.filter(user=user, purpose=purpose).first()
    if latest is None or latest.created_at < now - timedelta(minutes=30):
        return False
    if now - latest.created_at < timedelta(seconds=cfg["OTP_RESEND_SECONDS"]):
        return False
    try:
        issue(user, purpose, request)
    except OtpThrottled:
        return False
    return True


def verify(user: User | None, purpose: str, code: str) -> bool:
    """True once for a correct, unexpired code. Wrong tries are counted and burn the code."""
    cfg = settings.SALON_AUTH
    now = timezone.now()
    challenge = None
    if user is not None:
        challenge = (
            OtpChallenge.objects.filter(
                user=user, purpose=purpose, closed_at__isnull=True, expires_at__gt=now
            )
            .order_by("-created_at")
            .first()
        )
    if challenge is None or challenge.attempts >= cfg["OTP_MAX_ATTEMPTS"]:
        _digest("none", code)  # keep the timing similar
        return False
    OtpChallenge.objects.filter(pk=challenge.pk).update(attempts=F("attempts") + 1)
    if not hmac.compare_digest(challenge.code_hash, _digest(challenge.id, code)):
        return False
    # Close it only if nobody else did first, so one code can never be used twice.
    closed = OtpChallenge.objects.filter(pk=challenge.pk, closed_at__isnull=True).update(
        closed_at=now
    )
    if not closed:
        return False
    if user.email_verified_at is None:
        user.email_verified_at = now
        user.save(update_fields=["email_verified_at"])
    return True
