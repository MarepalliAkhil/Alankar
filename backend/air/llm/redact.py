"""Strips personal details from a customer's message before ANY of it can reach a language model.

Removed: web links, email addresses, card-like numbers, phone-like numbers and long digit runs,
control characters. The text is also length-capped. The model never sees names, account data,
other bookings, payments, chat history or photos: only this redacted message (see tools.py).
"""

from __future__ import annotations

import re

MAX_CHARS = 300

_URL = re.compile(r"(?i)\b(?:https?://|www\.)\S+|\b[\w-]+\.(?:com|in|org|net|io|co)\b\S*")
_EMAIL = re.compile(r"[\w.+-]+\s*@\s*[\w-]+(?:\.[\w-]+)+")
_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_PHONE = re.compile(r"(?<!\d)\+?\d[\d\s().-]{6,}\d(?!\d)")
_LONG_DIGITS = re.compile(r"\d{6,}")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_SPACES = re.compile(r"\s+")


def redact(text: str, *, max_chars: int = MAX_CHARS, known: tuple[str, ...] = ()) -> str:
    """`known` are strings the server knows are personal (the customer's own name and email); any
    of them typed into the message is replaced too."""
    text = str(text or "")
    text = _CONTROL.sub(" ", text)
    text = _EMAIL.sub("[email]", text)  # before links, so an address is never half-removed
    text = _URL.sub("[link]", text)
    text = _CARD.sub("[number]", text)
    text = _PHONE.sub("[number]", text)
    text = _LONG_DIGITS.sub("[number]", text)
    for item in known:
        for part in {item, *str(item or "").split()}:
            if len(part) >= 3:
                text = re.sub(re.escape(part), "[name]", text, flags=re.IGNORECASE)
    text = _SPACES.sub(" ", text).strip()
    return text[:max_chars]
