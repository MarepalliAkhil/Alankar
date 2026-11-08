"""Scores the rule-based reader (or, from scripts/air_live_eval.py, AI mode) against eval_sets."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from air import understand

NOW = datetime(2026, 11, 8, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))  # a Sunday
FIELDS = ("intent", "services", "services_any", "day", "time", "stylist", "products", "quantity")


def structured(parsed: understand.Parsed, cat: understand.Catalogue) -> dict:
    """The reader's result in the same shape as the expected results."""
    services = {s["id"]: s["name"] for s in cat.services}
    products = {p["id"]: p["name"] for p in cat.products}
    stylists = {s["id"]: s["name"].split()[0].lower() for s in cat.stylists}
    if parsed.time_exact:
        when = parsed.time_exact.strftime("%H:%M")
    elif parsed.time_from and parsed.time_to:
        window = next(
            (
                n
                for n, (lo, hi) in understand.WINDOWS.items()
                if (lo, hi) == (parsed.time_from, parsed.time_to)
            ),
            None,
        )
        when = window or f"{parsed.time_from:%H:%M}-{parsed.time_to:%H:%M}"
    elif parsed.time_from:
        when = f"after {parsed.time_from:%H:%M}"
    elif parsed.time_to:
        when = f"before {parsed.time_to:%H:%M}"
    else:
        when = None
    if parsed.day_is_week:
        day = "week"
    elif isinstance(parsed.day, date):
        day = (parsed.day - NOW.date()).days
    else:
        day = None
    return {
        "intent": parsed.intent,
        "services": {services.get(i, i) for i in parsed.service_ids},
        "day": day,
        "time": when,
        "stylist": "any"
        if parsed.stylist == "any"
        else stylists.get(parsed.stylist, parsed.stylist or None),
        "products": {products.get(i, i) for i in parsed.products},
        "quantity": parsed.quantity,
    }


def field_ok(name: str, want, got: dict) -> bool:
    if name == "services_any":
        found = got["services"]
        return len(found) >= 2 and found <= set(want)
    return got.get(name) == want


def score_one(text: str, want: dict, got: dict) -> tuple[bool, dict]:
    wrong = {
        k: (v, got.get("services" if k == "services_any" else k))
        for k, v in want.items()
        if not field_ok(k, v, got)
    }
    return not wrong, wrong


def score(cases, read) -> dict:
    """`read(text) -> structured dict`. Returns totals, per-field totals and the misses."""
    hits, misses = 0, []
    per_field = {f: [0, 0] for f in FIELDS}
    for text, want in cases:
        got = read(text)
        ok, wrong = score_one(text, want, got)
        hits += ok
        if not ok:
            misses.append((text, wrong))
        for name in want:
            per_field[name][1] += 1
            per_field[name][0] += field_ok(name, want[name], got)
    return {"hits": hits, "total": len(cases), "per_field": per_field, "misses": misses}


def rule_reader(cat: understand.Catalogue):
    def read(text: str) -> dict:
        return structured(understand.understand(text, NOW, cat), cat)

    return read
