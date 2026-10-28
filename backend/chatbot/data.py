"""Builds the engine's inputs from the database: catalogue, shop facts and knowledge base.

Only public information goes in here (services, prices, team names, hours, contact, FAQ).
Nothing about customers is read when the engine is built.
"""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Avg, Count

from chatbot.aliases import DEFAULT_ALIASES, NOT_ALIASES
from chatbot.defaults import BUILTIN_KB
from core import brand
from people.models import Rating, StylistProfile
from scheduling.models import Service
from website.content import booking_settings, content
from website.models import KnowledgeEntry

DIVISION_KEY = {"salon": "salon", "spa": "spa", "beauty-parlor": "parlor"}
MIN_RATINGS_SHOWN = 5


def _clock(value: str) -> str:
    """'20:00' -> '8:00 PM'."""
    try:
        hour, minute = (int(p) for p in value.split(":")[:2])
    except (ValueError, AttributeError):
        return str(value)
    suffix = "AM" if hour < 12 else "PM"
    return f"{(hour % 12) or 12}:{minute:02d} {suffix}"


def hours_text(rows) -> str:
    parts = []
    for row in rows or []:
        try:
            parts.append(f"{row['days']}, {_clock(row['open'])} to {_clock(row['close'])}")
        except (KeyError, TypeError):
            continue
    return " and ".join(parts) if parts else "at the times shown on the home page"


def shop_facts() -> dict:
    contact = content("contact", {}) or {}
    booking = booking_settings()
    return {
        "name": brand.SHOP_NAME,
        "address": contact.get("address") or "the address shown on the Contact section",
        "phone": contact.get("phone") or "the salon",
        "email": contact.get("email") or "the email on our Contact section",
        "hours": hours_text(content("hours", [])),
        "cancel_window_hours": booking["free_cancel_hours"],
        "link_valid_hours": booking["hold_hours"],
    }


def _price(value: Decimal) -> int | float:
    return int(value) if value == int(value) else float(value)


def service_rows() -> list[dict]:
    rows = []
    offered_by: dict[int, list[dict]] = {}
    for p in StylistProfile.objects.filter(is_public=True).prefetch_related("services"):
        first = p.display_name.split()[0] if p.display_name else ""
        if not first:
            continue
        for svc in p.services.all():
            offered_by.setdefault(svc.pk, []).append(
                {"name": first, "specialization": p.specialization or p.title}
            )
    services = (
        Service.objects.filter(is_active=True, category__is_active=True)
        .select_related("category")
        .prefetch_related("variants")
    )
    for s in services:
        tags = [t for t in (s.tags or []) if str(t).lower() not in NOT_ALIASES]
        aliases = list(dict.fromkeys([*DEFAULT_ALIASES.get(s.name, []), *map(str, tags)]))
        rows.append(
            {
                "id": str(s.id),
                "slug": s.slug,
                "name": s.name,
                "aliases": aliases,
                "division": DIVISION_KEY.get(s.category.division, "salon"),
                "gender": s.audience,
                "price_from": _price(s.from_price),
                "duration": s.min_duration,
                "duration_max": s.max_duration,
                "info": s.summary,
                "description": (s.description or "").strip(),
                "category": s.category.name,
                "stylists": offered_by.get(s.pk, []),
            }
        )
    return rows


def stylist_rows() -> list[dict]:
    rated = {
        r["stylist_id"]: r
        for r in Rating.objects.filter(
            status=Rating.Status.SUBMITTED, moderation=Rating.Moderation.ACTIVE
        )
        .values("stylist_id")
        .annotate(avg=Avg("stars"), n=Count("id"))
    }
    rows = []
    for p in StylistProfile.objects.filter(is_public=True):
        stats = rated.get(p.id)
        rating = (
            round(float(stats["avg"]), 1) if stats and stats["n"] >= MIN_RATINGS_SHOWN else None
        )
        divisions = [DIVISION_KEY.get(d, d) for d in (p.divisions or [])]
        rows.append(
            {
                "id": str(p.id),
                "name": p.display_name.split()[0] if p.display_name else "",
                "specialization": p.specialization or p.title,
                "division": divisions[0] if divisions else "",
                "rating": rating,
            }
        )
    return [r for r in rows if r["name"]]


def catalog() -> dict:
    return {"shop": shop_facts(), "services": service_rows(), "stylists": stylist_rows()}


def knowledge_entries() -> list[dict]:
    """Built-in answers plus the admin's active FAQ entries. A FAQ tagged `kb:<id>` replaces the
    built-in answer with that id (the question and tags of the built-in stay)."""
    entries = {e["id"]: dict(e) for e in BUILTIN_KB}
    extra = []
    for faq in KnowledgeEntry.objects.filter(is_active=True):
        tags = [str(t) for t in (faq.tags or [])]
        overrides = [t[3:] for t in tags if t.lower().startswith("kb:") and t[3:] in entries]
        if overrides:
            entries[overrides[0]]["answer"] = faq.answer
            continue
        extra.append(
            {
                "id": f"faq-{faq.pk}",
                "question": faq.question,
                "answer": faq.answer,
                "tags": [t for t in tags if not t.lower().startswith("kb:")],
            }
        )
    return [*entries.values(), *extra]
