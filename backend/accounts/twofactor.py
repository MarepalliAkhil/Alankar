"""Optional two-step sign-in for admins (authenticator app codes, with one-time backup codes).

Once an admin has confirmed a code from their phone, every sign-in needs it. The secret is
stored encrypted; backup codes are stored only as keyed hashes and shown once. A code can be
used once (a used time step is remembered), and wrong tries count towards the normal lockout.
"""

from __future__ import annotations

import secrets
import time

import pyotp
from django.core import signing
from django.db import transaction
from django.utils import timezone

from accounts import qr
from accounts.models import BackupCode, TwoFactor, User
from core import brand
from core.crypto import blind_index, decrypt, encrypt

CHALLENGE_SALT = "two-factor-challenge"
CHALLENGE_SECONDS = 300
CONTEXT = "two-factor-secret"
BACKUP_COUNT = 10
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alike characters
WRONG = "That code is incorrect or has expired."


class TwoFactorError(Exception):
    pass


def is_enabled(user: User) -> bool:
    return TwoFactor.objects.filter(user=user, confirmed_at__isnull=False).exists()


def applies_to(user: User) -> bool:
    return user.role == User.Role.ADMIN and is_enabled(user)


# --------------------------------------------------------------------------- challenge


def make_challenge(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=CHALLENGE_SALT)


def user_from_challenge(token: str) -> User | None:
    try:
        data = signing.loads(token, salt=CHALLENGE_SALT, max_age=CHALLENGE_SECONDS)
    except signing.BadSignature:
        return None
    user = User.objects.filter(pk=data.get("u"), role=User.Role.ADMIN, is_active=True).first()
    return user if user is not None and is_enabled(user) else None


# --------------------------------------------------------------------------- set up


def _totp(row: TwoFactor) -> pyotp.TOTP:
    return pyotp.TOTP(decrypt(row.secret, CONTEXT))


def begin(user: User) -> dict:
    """Creates (or replaces an unfinished) secret and returns what the phone needs."""
    if is_enabled(user):
        raise TwoFactorError("Two-step sign-in is already on.")
    secret = pyotp.random_base32()
    TwoFactor.objects.update_or_create(
        user=user,
        defaults={"secret": encrypt(secret, CONTEXT), "confirmed_at": None, "last_step": 0},
    )
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=brand.SHOP_NAME)
    return {"secret": secret, "uri": uri, "qr": qr.encode(uri)}


def _fresh_backup_codes(user: User) -> list[str]:
    BackupCode.objects.filter(user=user).delete()
    codes = []
    for _ in range(BACKUP_COUNT):
        raw = "".join(secrets.choice(ALPHABET) for _ in range(10))
        BackupCode.objects.create(user=user, code_hash=blind_index(raw, "backup-code"))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def confirm(user: User, code: str) -> list[str]:
    """The first correct code switches it on. Returns the backup codes (shown once)."""
    with transaction.atomic():
        row = TwoFactor.objects.select_for_update().filter(user=user).first()
        if row is None or row.confirmed_at is not None:
            raise TwoFactorError("Start the set-up first.")
        step = _matching_step(row, code)
        if step is None:
            raise TwoFactorError(WRONG)
        row.confirmed_at = timezone.now()
        row.last_step = step
        row.save(update_fields=["confirmed_at", "last_step"])
        return _fresh_backup_codes(user)


def new_backup_codes(user: User) -> list[str]:
    with transaction.atomic():
        return _fresh_backup_codes(user)


def disable(user: User) -> None:
    TwoFactor.objects.filter(user=user).delete()
    BackupCode.objects.filter(user=user).delete()


def backup_codes_left(user: User) -> int:
    return BackupCode.objects.filter(user=user, used_at__isnull=True).count()


# --------------------------------------------------------------------------- checking a code


def _now() -> float:
    return time.time()


def _matching_step(row: TwoFactor, code: str) -> int | None:
    """The time step a correct code belongs to, if it is newer than the last one used."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != 6:
        return None
    totp = _totp(row)
    now = int(_now())
    for offset in (0, -1, 1):  # this step, then one earlier or later for clock drift
        step = now // totp.interval + offset
        if secrets.compare_digest(totp.at(step * totp.interval), code) and step > row.last_step:
            return step
    return None


def verify(user: User, code: str) -> str | None:
    """Checks an app code or a backup code. Returns "totp", "backup" or None."""
    code = (code or "").strip()
    with transaction.atomic():
        row = TwoFactor.objects.select_for_update().filter(user=user, confirmed_at__isnull=False)
        row = row.first()
        if row is None:
            return None
        step = _matching_step(row, code)
        if step is not None:
            row.last_step = step
            row.save(update_fields=["last_step"])
            return "totp"
        raw = code.replace("-", "").replace(" ", "").lower()
        if len(raw) == 10:
            hit = (
                BackupCode.objects.select_for_update()
                .filter(user=user, used_at__isnull=True, code_hash=blind_index(raw, "backup-code"))
                .first()
            )
            if hit is not None:
                hit.used_at = timezone.now()
                hit.save(update_fields=["used_at"])
                return "backup"
    return None
