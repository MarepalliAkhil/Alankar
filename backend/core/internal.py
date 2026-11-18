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
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from core import policy
from core.permissions import view_action

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


class InternalPermission(BasePermission):
    """Job endpoints only. They read no cookies (no authentication classes), so a browser session
    can never be used here and the CSRF check (core.permissions) does not apply; cron-job.org
    sends no CSRF token. The X-Tick-Secret header is the only key. A missing or wrong secret, or
    no TICK_SECRET on the server, is always 403."""

    def has_permission(self, request, view) -> bool:
        if view_action(view, request.method) not in policy.known_actions():
            return False
        if not secret_ok(request):
            raise PermissionDenied("Wrong or missing X-Tick-Secret.")
        return True


class _Internal(APIView):
    authentication_classes: list = []
    permission_classes = [InternalPermission]
    throttle_classes = [InternalThrottle]

    def check_permissions(self, request: Request) -> None:
        # Count every call against the rate limit BEFORE the secret is checked, so guessing the
        # secret is limited too (DRF would otherwise check permissions first).
        APIView.check_throttles(self, request)
        super().check_permissions(request)

    def check_throttles(self, request: Request) -> None:
        pass  # already done in check_permissions


class TickView(_Internal):
    policy_action = "internal.tick"

    def post(self, request: Request) -> Response:
        return Response(run_jobs(TICK_JOBS))


class NightlyView(_Internal):
    policy_action = "internal.nightly"

    def post(self, request: Request) -> Response:
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
