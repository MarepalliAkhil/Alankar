"""Shared long-random-code scheme for gift cards and packages (Task 8.5).

Both use the same alphabet/shape (20 characters, grouped for readability) and the same
keyed-hash lookup so a code can be verified without decrypting every row. `code_hash` is what
finds the right row; `code_encrypted` (AES-256-GCM, see core/crypto.py) is what lets the owner
view the full code again later from the Wallet/Packages page -- it is blank for rows created
before this existed, since no plaintext was ever kept for those.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from django.conf import settings

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I
GROUPS, GROUP_LEN = 4, 5
CODE_LENGTH = GROUPS * GROUP_LEN  # 20 characters from 32 = 100 bits


def new_code() -> str:
    chars = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return "-".join(chars[i : i + GROUP_LEN] for i in range(0, CODE_LENGTH, GROUP_LEN))


def normalize(text: str) -> str:
    return "".join(c for c in str(text or "").upper() if c in ALPHABET)


def code_hash(normalized: str, *, purpose: str) -> str:
    """`purpose` keeps gift-card and package hashes in separate namespaces even though they use
    the same alphabet and the same secret key."""
    key = settings.SECRET_KEY.encode("utf-8")
    message = f"{purpose}:{normalized}".encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def mask(last4: str) -> str:
    return f"•••• {last4}"
