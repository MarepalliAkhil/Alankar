"""Email: always saved to MailOutbox, delivered by SMTP only when EMAIL_HOST is configured.

Delivery happens after the database transaction commits (transaction.on_commit), never
inside it, so a slow or failing SMTP server can never roll back or block the data change.
Failures are recorded without secrets: only the exception type and SMTP code are kept.
"""

import logging
from collections.abc import Callable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from core import brand
from core.models import MailOutbox

logger = logging.getLogger("salon.mail")

Callback = Callable[[MailOutbox], None] | None

BUTTON_LABELS = {
    MailOutbox.Kind.INVITE: "Set your password",
    MailOutbox.Kind.PASSWORD_RESET: "Choose a new password",
}


def smtp_configured() -> bool:
    return bool(settings.SALON_SMTP_CONFIGURED)


def links_enabled() -> bool:
    """Emailed one-time links work in debug mode, or when real email is configured."""
    return bool(settings.SALON_DEV_TOOLS or settings.SALON_SMTP_CONFIGURED)


def frontend_link(path: str) -> str:
    return f"{settings.SALON_FRONTEND_URL}{path}"


def render_message(message: MailOutbox) -> tuple[str, str]:
    """The same content for the saved copy and the real email: (text, html)."""
    footer = f"{brand.SHOP_NAME} · {brand.POWERED_BY}"
    text = message.body
    if message.link:
        text += f"\n\n{message.link}"
    text += f"\n\n--\n{footer}"
    html = render_to_string(
        "email/message.html",
        {
            "shop_name": brand.SHOP_NAME,
            "subject": message.subject,
            "body": message.body,
            "link": message.link,
            "button_label": BUTTON_LABELS.get(message.kind, "Open"),
            "footer": footer,
        },
    )
    return text, html


def safe_error(exc: Exception) -> str:
    """A short, secret-free description of a delivery error (no message text, no links)."""
    code = getattr(exc, "smtp_code", None)
    return f"{type(exc).__name__}{f' ({code})' if code else ''}"[:120]


def deliver(outbox_id, on_success: Callback = None, on_failure: Callback = None) -> bool:
    message = MailOutbox.objects.get(pk=outbox_id)
    text, html = render_message(message)
    email = EmailMultiAlternatives(
        subject=message.subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[message.to_email],
    )
    email.attach_alternative(html, "text/html")
    try:
        email.send(fail_silently=False)
    except Exception as exc:  # any SMTP, TLS or network error must not break the request
        message.status = MailOutbox.Status.FAILED
        message.error = safe_error(exc)
        message.save(update_fields=["status", "error"])
        logger.warning(
            "Email delivery failed: kind=%s to=%s error=%s",
            message.kind,
            message.to_email,
            message.error,
        )
        if on_failure:
            on_failure(message)
        return False
    message.status = MailOutbox.Status.SENT
    message.sent_at = timezone.now()
    message.error = ""
    message.save(update_fields=["status", "sent_at", "error"])
    if on_success:
        on_success(message)
    return True


def queue_mail(
    *,
    kind: str,
    to: str,
    subject: str,
    body: str,
    link: str = "",
    on_success: Callback = None,
    on_failure: Callback = None,
) -> MailOutbox:
    """Saves the email and, if SMTP is configured, delivers it after the transaction commits."""
    real = smtp_configured()
    message = MailOutbox.objects.create(
        kind=kind,
        to_email=to,
        subject=subject,
        body=body,
        link=link,
        status=MailOutbox.Status.QUEUED if real else MailOutbox.Status.SIMULATED,
    )
    if real:
        message_id = message.pk
        transaction.on_commit(lambda: deliver(message_id, on_success, on_failure))
    elif settings.SALON_DEV_TOOLS:
        logger.info("[simulated email] to=%s subject=%s", to, subject)
    return message


# Backwards-compatible name used by Task 1 code.
send_simulated_mail = queue_mail
