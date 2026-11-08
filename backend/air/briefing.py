"""The receptionist's AIR briefing (the popup text, also spoken by the browser).

A fixed template filled with exact counts from `air.stats`. Counts and categories only: never a
customer name, phone number, email, booking time or amount. The optional language model may only
reword it (when the master switch is on), and the rewording is used only if it passes the number
checker, keeps every number, and carries no names, links or digits of its own.
"""

from __future__ import annotations

import json
import re
from datetime import datetime

from django.utils import timezone

from air import config, stats
from air.llm import numbercheck, providers, usage

POLISH_SYSTEM = (
    "Reword this short work briefing for a salon receptionist so it sounds friendly and natural. "
    "Keep every number exactly as given, add no new facts, names, numbers or advice, and answer "
    "with the briefing text only."
)
NUMBER_KEYS = (
    "conversations",
    "booking_requests",
    "reception_accepted",
    "stylist_accepted",
    "declined_or_timed_out",
    "links_paid",
    "links_expired",
    "orders",
    "handed_off",
    "needs_you",
)
_DIGITS = re.compile(r"\d+")


def _n(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def numbers_from(counts: dict, needs: int) -> dict:
    return {
        "conversations": counts["conversations"],
        "booking_requests": counts["booking_requests"],
        "reception_accepted": counts["reception_accepted"],
        "stylist_accepted": counts["stylist_accepted"],
        "declined_or_timed_out": counts["declined"] + counts["timed_out"],
        "links_paid": counts["links_paid"],
        "links_expired": counts["links_expired"],
        "orders": counts["orders_created"] + counts["orders_updated"],
        "handed_off": counts["handed_off"],
        "needs_you": needs,
    }


def did_nothing(n: dict) -> bool:
    return not any(n[k] for k in NUMBER_KEYS if k != "needs_you")


def template(n: dict) -> str:
    """The fixed wording. Every number comes from `n`; nothing else varies."""
    if did_nothing(n):
        text = "Since your last session AIR had nothing to do."
        if n["needs_you"]:
            text += f" {_n(n['needs_you'], 'item still needs', 'items still need')} you."
        return text
    parts = [
        f"Since your last session AIR had {_n(n['conversations'], 'conversation', 'conversations')}"
        f" and took {_n(n['booking_requests'], 'booking request', 'booking requests')}.",
        f"It accepted the desk side of {_n(n['reception_accepted'], 'request', 'requests')}.",
        f"Stylists accepted {n['stylist_accepted']}, and"
        f" {n['declined_or_timed_out']} were declined or not answered in time.",
        f"{_n(n['links_paid'], 'payment link was', 'payment links were')} paid and"
        f" {n['links_expired']} expired.",
        f"AIR placed or changed {_n(n['orders'], 'product order', 'product orders')} and handed"
        f" {_n(n['handed_off'], 'item', 'items')} to a person.",
        f"{_n(n['needs_you'], 'item needs', 'items need')} you now.",
    ]
    return " ".join(parts)


def mood(n: dict) -> str:
    """Which pose the popup shows first: attention, concerned, celebrate, report or idle."""
    if did_nothing(n) and not n["needs_you"]:
        return "idle"
    if n["links_expired"] or n["declined_or_timed_out"] > n["stylist_accepted"]:
        return "concerned"
    if n["needs_you"]:
        return "attention"
    if n["links_paid"] >= 3:
        return "celebrate"
    return "report"


def acceptable(polished: str, original: str, n: dict) -> bool:
    """The rewording may not add, drop or change a number, and may not add a name or a link."""
    if not polished or len(polished) > 2 * len(original) + 80:
        return False
    if sorted(_DIGITS.findall(polished)) != sorted(_DIGITS.findall(original)):
        return False
    if not numbercheck.check(polished, {"numbers": n, "text": original}):
        return False
    return not re.search(r"(?i)https?://|www\.|@|\+?\d{10}", polished)


def polish(text: str, n: dict, *, now: datetime, provider=None) -> str | None:
    """Optional: a reworded briefing, or None (switch off, cap reached, failure or rejected)."""
    cfg = config.get_settings()
    if not cfg.master_enabled:
        return None
    ok, _why = usage.allowed(now)
    provider = provider or providers.get_provider()
    if not ok or provider.name == "disabled":
        return None
    try:
        reply = provider.complete(
            system=POLISH_SYSTEM,
            messages=[{"role": "user", "content": json.dumps({"briefing": text})}],
            tools=[],
            timeout=cfg.request_timeout_seconds,
        )
    except providers.ProviderError as exc:
        usage.record_failure(type(exc).__name__, now)
        return None
    usage.record_call(now=now)
    usage.record_success()
    candidate = (reply.text or "").strip()
    return candidate if acceptable(candidate, text, n) else None


def build(user, now: datetime | None = None, *, provider=None) -> dict:
    now = now or timezone.now()
    w = stats.window_for("since_last", user, now)
    counts = stats.counts(w)
    needs = len(stats.needs_you(now))
    n = numbers_from(counts, needs)
    text = template(n)
    reworded = polish(text, n, now=now, provider=provider)
    return {
        "since": w.start.isoformat(),
        "numbers": n,
        "text": reworded or text,
        "template_text": text,
        "wording_by_ai": reworded is not None,
        "did_nothing": did_nothing(n),
        "mood": mood(n),
    }
