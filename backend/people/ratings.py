"""Customer ratings of stylists: who is waiting to rate, submitting, and reminders."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from people.models import RATING_TAGS, Rating

REMINDER_AFTER = timedelta(hours=24)


class RatingError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def pending_for(customer):
    return Rating.objects.filter(customer=customer, status=Rating.Status.PENDING).select_related(
        "appointment", "stylist"
    )


def pending_count(customer) -> int:
    return Rating.objects.filter(customer=customer, status=Rating.Status.PENDING).count()


def validate(stars: int, comment: str, tags: list[str]) -> None:
    if stars < 1 or stars > 5:
        raise RatingError("Choose 1 to 5 stars.")
    if stars <= 2 and len(comment.strip()) < 3:
        raise RatingError("Please tell us what went wrong (a short comment is needed).")
    if any(tag not in RATING_TAGS for tag in tags):
        raise RatingError("Unknown reason tag.")


def submit(rating_id, *, customer, stars: int, comment: str, tags: list[str]) -> Rating:
    """Saves the customer's rating once. A second attempt is refused (ratings are immutable)."""
    validate(stars, comment, tags)
    with transaction.atomic():
        rating = Rating.objects.select_for_update().filter(pk=rating_id, customer=customer).first()
        if rating is None:
            raise RatingError("Rating not found.", code="not_found")
        if rating.status != Rating.Status.PENDING:
            raise RatingError("This visit has already been rated.", code="conflict")
        rating.stars = stars
        rating.comment = comment.strip()
        rating.tags = sorted(set(tags))
        rating.status = Rating.Status.SUBMITTED
        rating.submitted_at = timezone.now()
        rating.save()
    return rating


def send_due_reminders(now=None) -> int:
    """Emails customers whose rating has been waiting for 24 hours (once per rating)."""
    now = now or timezone.now()
    due = Rating.objects.filter(
        status=Rating.Status.PENDING,
        reminder_sent_at__isnull=True,
        created_at__lte=now - REMINDER_AFTER,
    ).select_related("appointment", "customer")
    sent = 0
    for rating in due:
        appt = rating.appointment
        with transaction.atomic():
            claimed = Rating.objects.filter(pk=rating.pk, reminder_sent_at__isnull=True).update(
                reminder_sent_at=now
            )
            if not claimed:
                continue
            queue_mail(
                kind=MailOutbox.Kind.NOTICE,
                to=appt.contact_email,
                subject=f"{brand.SHOP_NAME}: how was your visit?",
                body=(
                    f"Hello {appt.contact_name},\n\nYou have a visit waiting to be rated "
                    f"({appt.service_name}). It takes a few seconds, and you need to rate it "
                    "before your next booking."
                ),
                link=frontend_link("/customer/appointments"),
            )
        sent += 1
    return sent
