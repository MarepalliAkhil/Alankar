"""Scores the engine on the question sets in eval_sets.py (no network, no database writes)."""

from chatbot.engine import Session
from chatbot.engine.intents import INTENT_TO_KB
from chatbot.tests.test_engine import USER, FakeTools


def _turns(item):
    turns = item[0]
    return (turns,) if isinstance(turns, str) else tuple(turns)


def is_hit(reply, expected: str, needle: str) -> bool:
    ok = (
        reply.intent == expected
        or reply.intent == f"kb:{INTENT_TO_KB.get(expected)}"
        or (expected == "services_list" and reply.source == "entity")
        or (expected == "service_details" and reply.source == "entity")
    )
    return ok and (not needle or needle.lower() in reply.text.lower())


def score(engine, items):
    """Returns (hits, total, misses); a miss is (question(s), expected, got intent, got source)."""
    misses = []
    for item in items:
        _, expected, needle = item
        session = Session()
        reply = None
        for question in _turns(item):
            reply = engine.answer(question, user=USER, tools=FakeTools(), session=session)
        if not is_hit(reply, expected, needle):
            misses.append((" -> ".join(_turns(item)), expected, reply.intent, reply.source))
    return len(items) - len(misses), len(items), misses
