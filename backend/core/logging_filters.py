"""Log redaction: secrets and personal text never reach the logs.

A filter on the console handler rewrites every message before it is written. It removes:
passwords, tokens and one-time codes written as `key=value` or `key: value`, bearer and JWT
tokens, session and CSRF cookie values, `?token=` link parameters, and card-like numbers
(13 to 19 digits that pass the Luhn check). Nothing in the code base logs chat or chatbot message
text or request bodies in the first place (a test scans for that), so this is the safety net.
"""

from __future__ import annotations

import logging
import re

REDACTED = "[redacted]"
_KEY_VALUE = re.compile(
    r"(?i)\b(password|passwd|pwd|new_password|current_password|token|secret|otp|code|"
    r"authorization|cookie|set-cookie|csrfmiddlewaretoken|csrftoken|sessionid|salon_access|"
    r"salon_refresh|api[_-]?key|challenge)(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&]+)"
)
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}")
_URL_TOKEN = re.compile(r"(?i)([?&](?:token|code|otp)=)[^&\s]+")
_CARD = re.compile(r"(?<![\w.])(?:\d[ -]?){12,18}\d(?![\w.])")


def _luhn(digits: str) -> bool:
    total, flip = 0, False
    for ch in reversed(digits):
        n = int(ch)
        if flip:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        flip = not flip
    return total % 10 == 0


def _card(match: re.Match) -> str:
    digits = re.sub(r"\D", "", match.group(0))
    return "[card number]" if 13 <= len(digits) <= 19 and _luhn(digits) else match.group(0)


def redact(text: str) -> str:
    text = _JWT.sub(REDACTED, text)
    text = _BEARER.sub("Bearer " + REDACTED, text)
    text = _URL_TOKEN.sub(r"\1" + REDACTED, text)
    text = _KEY_VALUE.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
    return _CARD.sub(_card, text)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # a malformed log call must not break logging
            message = str(record.msg)
        record.msg, record.args = redact(message), ()
        if record.exc_text:
            record.exc_text = redact(record.exc_text)
        return True
