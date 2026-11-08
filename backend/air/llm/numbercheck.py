"""The number checker: a reworded reply may only use facts that are in the structured result.

Every number (counts, prices, times, dates) and every capitalised word (names) in the model's text
must already appear in the structured data the tools returned. If anything is new or changed, the
caller throws the model's wording away and uses the fixed template text instead.
"""

from __future__ import annotations

import re

_NUMBER = re.compile(r"\d+(?:[.,:]\d+)*")
# Identifiers (UUIDs) are random digits, not facts a customer is shown: never let their digit groups
# make an invented time or price look "known".
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")
# Ordinary words that may be capitalised in a sentence and are not facts.
SAFE_WORDS = frozenset(
    {
        "i",
        "i'm",
        "i'll",
        "i've",
        "you",
        "your",
        "yes",
        "no",
        "ok",
        "okay",
        "hi",
        "hello",
        "thanks",
        "thank",
        "please",
        "sorry",
        "the",
        "a",
        "an",
        "air",
        "alankar",
        "rs",
        "am",
        "pm",
        "inr",
        "gst",
        "intelligence",
        "receptionist",
    }
)


def _flatten(value, out: list[str]) -> None:
    if isinstance(value, dict):
        for item in value.values():
            _flatten(item, out)
    elif isinstance(value, list | tuple | set):
        for item in value:
            _flatten(item, out)
    elif value is not None:
        out.append(str(value))


def _norm_number(token: str) -> str:
    return token.replace(",", "").strip(".:")


def facts(structured) -> tuple[set[str], set[str]]:
    """(numbers, words) present in the structured result."""
    strings: list[str] = []
    _flatten(structured, strings)
    blob = _UUID.sub(" ", " ".join(strings))
    numbers = {_norm_number(n) for n in _NUMBER.findall(blob)}
    # also each digit group on its own: "10:30" gives 10 and 30, "2026-11-07" gives 2026, 11, 07
    numbers |= {g for n in list(numbers) for g in re.findall(r"\d+", n)}
    numbers |= {g.lstrip("0") or "0" for g in list(numbers)}
    words = {w.lower() for w in _WORD.findall(blob)}
    return numbers, words


def check(text: str, structured) -> bool:
    """True when `text` introduces no number, time, date, price or name that is not in
    `structured`."""
    numbers, words = facts(structured)
    for token in _NUMBER.findall(text):
        value = _norm_number(token)
        parts = re.findall(r"\d+", value)
        if value not in numbers and not all(
            p in numbers or (p.lstrip("0") or "0") in numbers for p in parts
        ):
            return False
    for match in re.finditer(r"(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z'-]+)", text):
        word = match.group(1).lower()
        if word not in words and word not in SAFE_WORDS:
            return False
    return True
