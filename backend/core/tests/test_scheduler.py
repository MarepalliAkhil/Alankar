"""The production scheduler loop (core/scheduler.py)."""

from datetime import datetime

from core import scheduler


def at(hour, minute):
    return datetime(2026, 11, 14, hour, minute)


def names(now):
    return [e.name for e in scheduler.ENTRIES if e.due(now)]


def test_the_schedule():
    assert names(at(10, 1)) == ["minute jobs"]
    assert names(at(10, 15)) == ["minute jobs", "send_campaigns"]
    assert names(at(10, 30)) == ["minute jobs", "send_campaigns", "other jobs"]
    assert "build_recommendations" in names(at(2, 30))
    assert "backup" in names(at(3, 0))
    assert "backup" not in names(at(15, 0))


def test_one_failing_job_never_stops_the_others(capsys):
    ran = []

    def boom():
        raise RuntimeError("secret detail")

    entries = [
        scheduler.Entry("bad", scheduler.every(1), boom),
        scheduler.Entry("good", scheduler.every(1), lambda: ran.append("good")),
    ]
    assert scheduler.run_due(at(9, 0), entries) == ["bad", "good"]
    assert ran == ["good"]
    out = capsys.readouterr().out
    assert '"job": "bad", "result": "failed", "error": "RuntimeError"' in out
    assert "secret detail" not in out  # only the kind of error is logged
    assert '"job": "good", "result": "ok"' in out
