"""Rebook reminders: one in-app message per customer, service and cycle, with real free times.

The simulated email copy is sent only to customers who agreed to receive messages from the shop
(marketing consent); everyone with personal recommendations on gets the in-app message.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import User
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from marketing import limits
from recommendations import engine
from recommendations.models import CustomerPrefs, RebookReminder, RecSettings
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus

LOOK_BACK_DAYS = 365


def slot_text(slots: list[str]) -> str:
    return "; ".join(booking.when_text(datetime.fromisoformat(s)) for s in slots)


def book_path(entry: dict) -> str:
    path = f"/customer/book?service={entry['service'].slug}"
    if entry["slots"]:
        path += f"&start={entry['slots'][0]}"
    if entry.get("stylist"):
        path += f"&stylist={entry['stylist']['id']}"
    return path


def message(entry: dict) -> tuple[str, str]:
    info = entry["service"]
    title = f"Time to rebook {info.name}?"
    body = entry["reason"]
    if entry["slots"]:
        who = f" with {entry['stylist']['name']}" if entry.get("stylist") else ""
        body += f" Free times{who}: {slot_text(entry['slots'])}."
    else:
        body += " Pick any time that suits you."
    return title, body


def candidates(now: datetime):
    since = now - timedelta(days=LOOK_BACK_DAYS)
    ids = (
        Appointment.objects.filter(status=AppointmentStatus.COMPLETED, start__gte=since)
        .values_list("customer_id", flat=True)
        .distinct()
    )
    off = CustomerPrefs.objects.filter(enabled=False).values_list("user_id", flat=True)
    return User.objects.filter(pk__in=list(ids), role=User.Role.CUSTOMER, is_active=True).exclude(
        pk__in=list(off)
    )


def send_due(now: datetime | None = None) -> int:
    """Safe to run as often as you like: the unique (customer, service, cycle) row is the lock."""
    from notifications.models import Notification

    now = now or timezone.now()
    settings_ = RecSettings.load()
    if not (settings_.enabled and settings_.rebook_reminders):
        return 0
    model = engine.stored_model()
    catalogue = engine.bookable(settings_.excluded_services.values_list("pk", flat=True))
    sent = 0
    for user in candidates(now):
        # One message per customer per run (the most overdue service); the next run sends the
        # next one, so nobody gets a pile of reminders at once.
        for entry in engine.rebook(user, model=model, catalogue=catalogue, slots=False)[:1]:
            if RebookReminder.objects.filter(
                user=user, service_id=entry["service"].id, cycle=entry["cycle"]
            ).exists():
                continue
            entry = next(
                (
                    e
                    for e in engine.rebook(user, model=model, catalogue=catalogue)
                    if e["service"].id == entry["service"].id
                ),
                entry,
            )
            try:
                with transaction.atomic():
                    reminder = RebookReminder.objects.create(
                        user=user, service_id=entry["service"].id, cycle=entry["cycle"]
                    )
                    title, body = message(entry)
                    Notification.objects.create(
                        user=user,
                        kind=Notification.Kind.REBOOK,
                        title=title[:160],
                        body=body[:600],
                        link=book_path(entry)[:200],
                    )
                    profile = getattr(user, "customer_profile", None)
                    if (
                        profile is not None
                        and profile.marketing_opt_in
                        and not limits.in_quiet_hours(now)
                        and not limits.emailed_recently(user.email, now)
                    ):
                        from marketing.campaigns import unsubscribe_token

                        stop = frontend_link(f"/unsubscribe?token={unsubscribe_token(user)}")
                        queue_mail(
                            kind=MailOutbox.Kind.MARKETING,
                            to=user.email,
                            subject=title,
                            body=(f"{body}\n\nTo stop these messages, unsubscribe here: {stop}"),
                            link=frontend_link(book_path(entry)),
                        )
                        reminder.emailed = True
                        reminder.save(update_fields=["emailed"])
            except IntegrityError:
                continue  # already reminded in this cycle
            sent += 1
    return sent
