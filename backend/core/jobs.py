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

    return expire_due(now)


def booking_request_reminders(now) -> int:
    """Reminds the front desk or stylist that has not answered a booking request yet."""
    from scheduling.approvals import send_reminders

    return send_reminders(now)


def waitlist(now) -> int:
    from waitlist import engine

    return engine.expire_offers(now) + engine.expire_waiting(now)


def air_expire_holds(now) -> int:
    """AIR (Task AIR-1): ends overdue slot holds, tells customers, hands work to the desk when a
    receptionist is in. Does nothing at all while AIR is switched off."""
    from air import cover, holds

    cover.is_active(now)
    return holds.expire_due(now)


def air_cover_sweep(now) -> int:
    """AIR desk cover: look at every booking request that waits for the front desk and accept the
    receptionist side while AIR covers (every request gets a logged outcome with a reason)."""
    from air import desk

    return desk.sweep(now)["looked_at"]


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
    from marketing.campaigns import send_all

    return send_all(now)["emails"]


def rebook_reminders(now) -> int:
    """Personal recommendations: one "time to rebook" message per customer, service and cycle."""
    from recommendations.reminders import send_due

    return send_due(now)


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


def chat_photo_retention(now) -> int:
    from chat.images import purge_expired

    return purge_expired(now)


def chat_unread_emails(now) -> int:
    """Zen Chat messages still unread after 10 minutes: one short email per conversation."""
    from chat.inbox import email_unread

    return email_unread(now)


JOBS: list[tuple[str, Callable]] = [
    ("expire_unpaid_holds", expire_unpaid_holds),
    ("booking_request_reminders", booking_request_reminders),
    ("waitlist", waitlist),
    ("air_expire_holds", air_expire_holds),
    ("air_cover_sweep", air_cover_sweep),
    ("end_lapsed_memberships", end_lapsed_memberships),
    ("campaigns", campaigns),
    ("rebook_reminders", rebook_reminders),
    ("rating_reminders", rating_reminders),
    ("purge_old_rows", purge_old_rows),
    ("chat_photo_retention", chat_photo_retention),
    ("chat_unread_emails", chat_unread_emails),
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
