"""Jobs over HTTP for hosts without a background worker (docs/DEPLOY_FREE.md).

cron-job.org calls POST /api/internal/tick/ every 15 minutes and POST /api/internal/nightly/ once
a night, with the header X-Tick-Secret. Nothing here is needed for correctness: unpaid holds and
expired requests are released whenever a booking or payment page is read (booking.expire_due()),
and AIR decides on desk cover when a request is created or a stylist answers. The tick only does
it on time for pages nobody opens, and sends campaigns and reminders.
"""

from __future__ import annotations

import hmac
import time

from django.conf import settings
from django.http import Http404
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

TICK_JOBS = [
    "expire_unpaid_holds",
    "air_expire_holds",
    "air_cover_sweep",
    "booking_request_reminders",
    "waitlist",
    "campaigns",  # marketing/campaigns.send_all: waits outside the quiet hours itself
]
NIGHTLY_JOBS = [
    "end_lapsed_memberships",
    "rebook_reminders",
    "rating_reminders",
    "purge_old_rows",
    "chat_photo_retention",
]
BUDGET_SECONDS = 25


class InternalThrottle(AnonRateThrottle):
    """Per client address: enough for the schedule and a few manual tries, no more."""

    scope = "internal"
    rate = "20/hour"

    def get_rate(self):
        return self.rate


def secret_ok(request: Request) -> bool:
    expected = getattr(settings, "SALON_TICK_SECRET", "") or ""
    given = request.headers.get("X-Tick-Secret", "")
    return bool(expected) and hmac.compare_digest(given.encode(), expected.encode())


def run_jobs(names: list[str], budget: float = BUDGET_SECONDS) -> dict:
    """Runs the named run_jobs steps in order, stopping before the time budget runs out."""
    from core import jobs

    by_name = dict(jobs.JOBS)
    started = time.monotonic()
    results: dict[str, int | str] = {}
    skipped: list[str] = []
    now = timezone.now()
    for name in names:
        if time.monotonic() - started > budget:
            skipped.append(name)
            continue
        try:
            results[name] = int(by_name[name](now) or 0)
        except Exception as exc:  # one failing step never stops the others; no details leak
            results[name] = f"failed ({type(exc).__name__})"
    done = sum(v for v in results.values() if isinstance(v, int))
    failed = [k for k, v in results.items() if isinstance(v, str)]
    status = "failed" if failed else ("done" if done else "nothing to do")
    return {
        "status": status,
        "results": results,
        "skipped": skipped,
        "seconds": round(time.monotonic() - started, 2),
    }


class _Internal(APIView):
    authentication_classes: list = []
    throttle_classes = [InternalThrottle]

    def check(self, request: Request) -> None:
        if not getattr(settings, "SALON_TICK_SECRET", ""):
            raise Http404  # switched off (no TICK_SECRET): looks like any unknown address
        if not secret_ok(request):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Wrong or missing X-Tick-Secret.")


class TickView(_Internal):
    policy_action = "internal.tick"

    def post(self, request: Request) -> Response:
        self.check(request)
        return Response(run_jobs(TICK_JOBS))


class NightlyView(_Internal):
    policy_action = "internal.nightly"

    def post(self, request: Request) -> Response:
        self.check(request)
        from django.core.management import call_command

        body = run_jobs(NIGHTLY_JOBS, budget=120)
        try:
            call_command("build_recommendations", verbosity=0)
            body["results"]["build_recommendations"] = 1
        except Exception as exc:
            body["results"]["build_recommendations"] = f"failed ({type(exc).__name__})"
            body["status"] = "failed"
        return Response(body)


class PingView(APIView):
    """Liveness for Render's health check and the keep-awake ping: no database, no cache."""

    policy_action = "ping"
    authentication_classes: list = []
    throttle_classes: list = []

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
