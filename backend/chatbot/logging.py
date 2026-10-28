"""What the bot remembers about questions: anonymous counters only.

Never stored: the raw message, the user, the session, the IP address. A fallback is stored as its
normalized content words (stemmed, filler removed), and only if it looks like a question about the
salon: anything with digits, an "@", or more than 8 words is dropped, so a phone number, email
address or a pasted paragraph can never end up in the admin's list. Old rows expire.
"""

from __future__ import annotations

import re
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from chatbot.models import IntentUsage, UnansweredQuestion

MAX_WORDS = 8
KEEP_DAYS = 90


PERSONAL = re.compile(r"@|\d{3,}|https?:|www\.", re.I)


def looks_personal(message: str) -> bool:
    """Checked on the raw message (which is not kept): an email, phone number or link in it
    means nothing derived from it is stored, however the words come out after normalizing."""
    return bool(PERSONAL.search(message or ""))


def clean_key(key: str | None) -> str | None:
    if not key:
        return None
    key = key.strip().lower()
    if "@" in key or any(ch.isdigit() for ch in key) or len(key) > 120:
        return None
    if not (1 <= len(key.split()) <= MAX_WORDS):
        return None
    return key


def record_usage(intent: str) -> None:
    today = timezone.localdate()
    with transaction.atomic():
        row, made = IntentUsage.objects.get_or_create(
            day=today, intent=intent[:60], defaults={"count": 1}
        )
        if not made:
            IntentUsage.objects.filter(pk=row.pk).update(count=F("count") + 1)


def record_unanswered(key: str | None) -> None:
    key = clean_key(key)
    if key is None:
        return
    with transaction.atomic():
        row, made = UnansweredQuestion.objects.get_or_create(key=key)
        if not made:
            UnansweredQuestion.objects.filter(pk=row.pk).update(
                count=F("count") + 1, last_seen=timezone.now()
            )
    _expire_old()


def _expire_old() -> None:
    """Once a day, forget open questions that have not come back for 90 days."""
    if not cache.add("chatbot:expired-today", 1, 86400):
        return
    cutoff = timezone.now() - timedelta(days=KEEP_DAYS)
    UnansweredQuestion.objects.filter(last_seen__lt=cutoff).delete()
    IntentUsage.objects.filter(day__lt=(timezone.localdate() - timedelta(days=366))).delete()
