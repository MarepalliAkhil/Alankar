"""The production scheduler (docs/DEPLOY.md): one long-running loop in the "scheduler" container.

A plain loop instead of cron, so there is no extra binary in the image. Every entry runs a
management command (or the backup script) on its schedule in shop time (Asia/Kolkata), each run
is logged as one JSON line with its result and duration, and one failing run never stops the
loop. Two scheduler containers would run jobs twice, so compose starts exactly one.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime

from django.core.management import call_command
from django.utils import timezone

MINUTE_JOBS = [
    "expire_unpaid_holds",
    "air_expire_holds",
    "air_cover_sweep",
    "booking_request_reminders",
    "waitlist",
]
OTHER_JOBS = [
    "end_lapsed_memberships",
    "rebook_reminders",
    "rating_reminders",
    "purge_old_rows",
    "chat_photo_retention",
]


@dataclass(frozen=True)
class Entry:
    name: str
    due: object  # (local datetime) -> bool
    run: object  # () -> None


def every(minutes: int):
    return lambda now: now.minute % minutes == 0


def daily(hour: int, minute: int):
    return lambda now: now.hour == hour and now.minute == minute


def _command(*args):
    return lambda: call_command(*args)


def _backup():
    subprocess.run(["/app/deploy/backup.sh"], check=True)  # noqa: S603


ENTRIES = [
    # Release unpaid holds, AIR's holds and desk cover, request reminders, waitlist offers.
    Entry("minute jobs", every(1), _command("run_jobs", "--only", *MINUTE_JOBS)),
    # Marketing campaigns: send_campaigns itself waits outside the quiet hours.
    Entry("send_campaigns", every(15), _command("send_campaigns")),
    # Everything else run_jobs knows (memberships, reminders, clean-up).
    Entry("other jobs", every(10), _command("run_jobs", "--only", *OTHER_JOBS)),
    Entry("build_recommendations", daily(2, 30), _command("build_recommendations")),
    Entry("backup", daily(3, 0), _backup),
]


def log(**data) -> None:
    print(
        json.dumps({"time": timezone.now().isoformat(), "logger": "scheduler", **data}), flush=True
    )


def run_due(now: datetime, entries=ENTRIES) -> list[str]:
    """Runs every entry due at `now` (shop time). Returns the names that ran."""
    ran = []
    for entry in entries:
        if not entry.due(now):
            continue
        started = time.monotonic()
        try:
            entry.run()
            log(job=entry.name, result="ok", seconds=round(time.monotonic() - started, 2))
        except BaseException as exc:  # noqa: BLE001  one failure never stops the loop
            if isinstance(exc, KeyboardInterrupt):
                raise
            log(job=entry.name, result="failed", error=type(exc).__name__)
        ran.append(entry.name)
    return ran


def loop() -> None:  # pragma: no cover - runs forever in the container
    log(job="scheduler", result="started", jobs=[e.name for e in ENTRIES])
    last = None
    while True:
        now = timezone.localtime().replace(second=0, microsecond=0)
        if now != last:
            last = now
            run_due(now)
        time.sleep(5)
        sys.stdout.flush()
