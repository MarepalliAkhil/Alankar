"""Sending the three kinds of booking message: in-app, simulated email and simulated text.

Each function writes the audit-free rows only; callers audit the business event itself. All of
it runs inside the caller's transaction, so a message is never sent for a change that rolled back.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.auth import get_user_model

from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from notifications import templates
from notifications.models import Notification, SimulatedSms

logger = logging.getLogger("salon.notifications")


def notify(user, kind: str, key: str, *, link: str = "", appointment_id=None, **context) -> None:
    """One in-app message from template `key` for `user`."""
    if user is None:
        return
    Notification.objects.create(
        user=user,
        kind=kind,
        title=templates.render(key, "title", **context)[:160],
        body=templates.render(key, "body", **context)[:600],
        link=link[:200],
        appointment_id=appointment_id,
    )


def notify_many(users, kind: str, key: str, **kwargs) -> None:
    for user in users:
        notify(user, kind, key, **kwargs)


def staff_users(role: str):
    User = get_user_model()
    return User.objects.filter(role=role, is_active=True)


def mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return f"xxxxxx{digits[-4:]}" if len(digits) >= 4 else ""


def sms(user, phone: str, key: str, *, appointment_id=None, **context) -> None:
    """A simulated text message: only a masked number and the words are kept."""
    body = templates.render(key, "sms", **context)[:480]
    SimulatedSms.objects.create(
        user=user, to_hint=mask_phone(phone), body=body, appointment_id=appointment_id
    )
    if settings.SALON_DEV_TOOLS:
        logger.info("[simulated sms] to=%s", mask_phone(phone))


def tell_customer(
    appt,
    kind: str,
    key: str,
    *,
    link: str = "/customer/appointments",
    email_link: str | None = None,
    mail_kind: str = MailOutbox.Kind.BOOKING,
    **context,
) -> None:
    """In-app + simulated email + simulated SMS to the booking's customer, from one template."""
    from scheduling import booking

    stylist = appt.stylist or getattr(appt, "hold_stylist", None)
    context.setdefault("first_name", first_name(appt))
    context.setdefault("service", appt.service_name)
    context.setdefault("when", booking.when_text(appt.start or appt.preferred_start))
    context.setdefault("stylist", stylist.display_name if stylist else "")
    notify(appt.customer, kind, key, link=link, appointment_id=appt.id, **context)
    queue_mail(
        kind=mail_kind,
        to=appt.contact_email,
        subject=f"{brand.SHOP_NAME}: {templates.render(key, 'subject', **context)}",
        body=f"Hello {appt.contact_name},\n\n{templates.render(key, 'body', **context)}",
        link=email_link if email_link is not None else frontend_link(link),
    )
    sms(appt.customer, appt.contact_phone, key, appointment_id=appt.id, **context)


def first_name(appt) -> str:
    return (appt.contact_name or "").split(" ")[0] or "there"
