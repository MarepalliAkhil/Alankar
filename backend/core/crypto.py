"""Field-level encryption (AES-256-GCM) and blind indexes (HMAC-SHA256).

Both keys are derived with HKDF from SALON_FIELD_KEY (base64, 32 bytes) kept only in .env.
Generate one with (see README):
    python -c "import secrets,base64;
               print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

PREFIX = "v1:"


class DecryptionError(Exception):
    pass


def _master_key() -> bytes:
    raw = settings.SALON_FIELD_KEY
    try:
        key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured("SALON_FIELD_KEY must be base64 (32 bytes).") from exc
    if len(key) != 32:
        raise ImproperlyConfigured("SALON_FIELD_KEY must decode to exactly 32 bytes.")
    return key


@lru_cache(maxsize=8)
def _derive(master: bytes, purpose: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(master)


def _enc_key() -> bytes:
    return _derive(_master_key(), b"salon-field-encryption-v1")


def _index_key() -> bytes:
    return _derive(_master_key(), b"salon-blind-index-v1")


def encrypt(plaintext: str, context: str) -> str:
    nonce = os.urandom(12)
    sealed = AESGCM(_enc_key()).encrypt(nonce, plaintext.encode("utf-8"), context.encode())
    return PREFIX + base64.urlsafe_b64encode(nonce + sealed).decode("ascii")


def decrypt(token: str, context: str) -> str:
    if not token.startswith(PREFIX):
        raise DecryptionError("Unknown ciphertext format")
    try:
        blob = base64.urlsafe_b64decode(token[len(PREFIX) :])
        plain = AESGCM(_enc_key()).decrypt(blob[:12], blob[12:], context.encode())
    except (InvalidTag, ValueError) as exc:
        raise DecryptionError("Ciphertext could not be decrypted") from exc
    return plain.decode("utf-8")


def blind_index(value: str, context: str) -> str:
    message = f"{context}:{value}".encode()
    return hmac.new(_index_key(), message, hashlib.sha256).hexdigest()


def normalize_phone(value: str) -> str:
    """'+91 98765-43210' / '09876543210' / '9876543210' -> '9876543210'."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def is_valid_indian_mobile(value: str) -> bool:
    return bool(re.fullmatch(r"[6-9]\d{9}", normalize_phone(value)))
