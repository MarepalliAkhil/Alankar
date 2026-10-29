"""Background jobs: one place that runs every timed task, safe to run as often as you like.

Each step is idempotent (running it twice does the same as running it once), takes row locks
where it changes money or slots, and is isolated: if one step fails the others still run and
the command exits with an error so a scheduler can alert.
"""

import logging
from collections.abc import Callable
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("salon.jobs")

KEEP_TOKENS_DAYS = 7
KEEP_LOGIN_ATTEMPTS_DAYS = 90


def expire_unpaid_holds(now) -> int:
    from scheduling.booking import expire_due

    return expire_due()


def waitlist(now) -> int:
    from waitlist import engine

    return engine.expire_offers(now) + engine.expire_waiting(now)


def end_lapsed_memberships(now) -> int:
    from wallet.models import Membership
    from wallet.selling import end_lapsed

    lapsed = (
        Membership.objects.filter(
            status__in=[Membership.Status.ACTIVE, Membership.Status.CANCELLED],
            period_end__lte=now,
        )
        .values_list("customer_id", flat=True)
        .distinct()
    )
    from accounts.models import User

    done = 0
    for customer in User.objects.filter(pk__in=list(lapsed)):
        with transaction.atomic():
            end_lapsed(customer, now)
        done += 1
    return done


def campaigns(now) -> int:
    from marketing.campaigns import run_due

    return run_due(now)


def rating_reminders(now) -> int:
    from people.ratings import send_due_reminders

    return send_due_reminders()


def purge_old_rows(now) -> int:
    """Removes expired one-time tokens and old sign-in attempts. Audit logs are never purged."""
    from accounts.models import LoginAttempt, OtpChallenge, PasswordResetToken

    tokens_before = now - timedelta(days=KEEP_TOKENS_DAYS)
    removed = PasswordResetToken.objects.filter(expires_at__lt=tokens_before).delete()[0]
    removed += OtpChallenge.objects.filter(expires_at__lt=tokens_before).delete()[0]
    old = now - timedelta(days=KEEP_LOGIN_ATTEMPTS_DAYS)
    removed += LoginAttempt.objects.filter(created_at__lt=old).delete()[0]
    return removed


JOBS: list[tuple[str, Callable]] = [
    ("expire_unpaid_holds", expire_unpaid_holds),
    ("waitlist", waitlist),
    ("end_lapsed_memberships", end_lapsed_memberships),
    ("campaigns", campaigns),
    ("rating_reminders", rating_reminders),
    ("purge_old_rows", purge_old_rows),
]


def run_all(now=None, only: list[str] | None = None) -> dict[str, int | str]:
    """Runs the steps in order. Returns {step: count} or {step: "failed: <ErrorType>"}."""
    now = now or timezone.now()
    results: dict[str, int | str] = {}
    for name, job in JOBS:
        if only and name not in only:
            continue
        try:
            results[name] = job(now)
        except Exception as exc:  # one broken step must not stop the others
            logger.exception("Job %s failed", name)
            results[name] = f"failed: {type(exc).__name__}"
    return results
