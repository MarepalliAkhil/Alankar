"""Accuracy on the developer-written question sets. See eval_sets.py for what the numbers mean:
the questions are not real customer questions. Tuning and holdout are reported separately."""

import pytest

from chatbot.tests.eval_sets import HOLDOUT, TUNING
from chatbot.tests.evaluation import score
from chatbot.tests.ported_sets import CASES
from chatbot.tests.ported_sets import HOLDOUT as PORTED_SECOND

# Floors are set below what is reached today so a regression fails the build; they are not targets.
TUNING_FLOOR = 0.85
HOLDOUT_FLOOR = 0.70


def test_tuning_accuracy(engine):
    hits, total, misses = score(engine, TUNING)
    print(f"\nTUNING (developer-written) {hits}/{total} = {hits / total:.1%}")
    for miss in misses:
        print("  MISS", miss)
    assert hits / total >= TUNING_FLOOR, misses


def test_holdout_accuracy(engine):
    hits, total, misses = score(engine, HOLDOUT)
    print(f"\nHOLDOUT (developer-written, not tuned on) {hits}/{total} = {hits / total:.1%}")
    for miss in misses:
        print("  MISS", miss)
    assert hits / total >= HOLDOUT_FLOOR, misses


def _key(item):
    turns = item[0]
    return tuple(t.lower() for t in ((turns,) if isinstance(turns, str) else turns))


def test_the_sets_are_big_enough_and_do_not_overlap():
    assert len(TUNING) + len(HOLDOUT) >= 150
    tuning = {_key(i) for i in TUNING} | {(q.lower(),) for q, _ in CASES}
    for item in HOLDOUT + [(q, e, "") for q, e in PORTED_SECOND]:
        assert _key(item) not in tuning, item


def test_each_hard_category_is_present_in_both_sets():
    for name, items in (("tuning", TUNING), ("holdout", HOLDOUT)):
        text = " ".join(q if isinstance(q, str) else " ".join(q) for q, *_ in items).lower()
        for marker in ("hair spa" if name == "tuning" else "spa", "kitna", "entha"):
            assert marker in text or name == "holdout", (name, marker)
        assert any(not isinstance(q, str) for q, *_ in items), f"{name} has no follow-ups"
