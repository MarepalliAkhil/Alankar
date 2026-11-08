"""Rule-based accuracy of the AIR reader on developer-written utterances (see eval_sets.py).
Tuning and holdout are reported separately; the holdout set is never used for tuning."""

import pytest

from air import catalogue
from air.tests.air_evaluation import rule_reader, score
from air.tests.eval_sets import HOLDOUT, TUNING
from chatbot.tests.conftest import demo  # noqa: F401  (the demo catalogue)

# Floors sit below today's measurement so a regression fails the build; they are not targets.
TUNING_FLOOR = 0.85
HOLDOUT_FLOOR = 0.60


def _report(name, result):
    print(
        f"\nAIR {name}: {result['hits']}/{result['total']} = {result['hits'] / result['total']:.1%}"
    )
    for field, (ok, total) in result["per_field"].items():
        if total:
            print(f"  {field:13s} {ok}/{total}")
    for text, wrong in result["misses"]:
        print("  MISS", repr(text), wrong)


def test_the_sets_are_big_enough_and_do_not_overlap():
    assert len(TUNING) + len(HOLDOUT) >= 80
    assert not {t.lower() for t, _ in TUNING} & {t.lower() for t, _ in HOLDOUT}


@pytest.mark.django_db
def test_rule_based_tuning_accuracy(demo):  # noqa: F811
    result = score(TUNING, rule_reader(catalogue.build(with_products=True)))
    _report("TUNING (developer-written)", result)
    assert result["hits"] / result["total"] >= TUNING_FLOOR, result["misses"]


@pytest.mark.django_db
def test_rule_based_holdout_accuracy(demo):  # noqa: F811
    result = score(HOLDOUT, rule_reader(catalogue.build(with_products=True)))
    _report("HOLDOUT (developer-written, never tuned on)", result)
    assert result["hits"] / result["total"] >= HOLDOUT_FLOOR, result["misses"]


def _live_script():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "scripts" / "air_live_eval.py"
    spec = importlib.util.spec_from_file_location("air_live_eval", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.django_db
def test_the_live_script_scores_model_answers_without_any_network(demo):  # noqa: F811
    from decimal import Decimal

    from air.llm.providers import FAKE

    live = _live_script()
    cat = catalogue.build(with_products=True)
    FAKE.script = [
        {
            "tool_calls": [
                {
                    "name": "report",
                    "arguments": {
                        "intent": "book",
                        "services": ["Men's Haircut"],
                        "day": "2026-11-09",
                        "time": "11:00",
                        "stylist": "rahul",
                    },
                }
            ]
        },
        {"text": "no tool call"},
    ]
    stats = {"latency": [], "rupees": Decimal("0"), "errors": 0}
    cases = [TUNING[0], ("what time do you open", {"intent": "hours"})]
    result = score(cases, live.model_reader(FAKE, cat, stats, Decimal("5")))
    assert result["hits"] == 1 and len(stats["latency"]) == 2
    sent = str(FAKE.calls)
    assert "report" in sent and "Deep Tissue Massage" in sent  # the vocabulary went along
    assert live.main(["--yes"]) == 2  # no real provider configured: refuses to run


@pytest.mark.django_db
def test_the_for_zenotians_page_quotes_the_measured_air_numbers(demo):  # noqa: F811
    """The AIR limitation on the For Zenotians page quotes these figures; they must equal a fresh
    measurement (never a number that was not measured)."""
    from website.zenotians_seed import LIMITATIONS

    text = next(i for i in LIMITATIONS["items"] if i["id"] == "air")["today"]
    reader = rule_reader(catalogue.build(with_products=True))
    for cases in (TUNING, HOLDOUT):
        result = score(cases, reader)
        pct = f"{result['hits'] / result['total'] * 100:.1f}%"
        assert f"{result['hits']} of {result['total']} ({pct})" in text
