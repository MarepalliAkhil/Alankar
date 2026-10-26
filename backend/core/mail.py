import logging

from django.conf import settings

from core.models import MailOutbox

logger = logging.getLogger("salon.mail")


def send_simulated_mail(
    *, kind: str, to: str, subject: str, body: str, link: str = ""
) -> MailOutbox:
    """Stores the email in the outbox instead of sending it (v1 has no real email)."""
    message = MailOutbox.objects.create(
        kind=kind, to_email=to, subject=subject, body=body, link=link
    )
    if settings.SALON_DEV_TOOLS:
        logger.info("[simulated email] to=%s subject=%s link=%s", to, subject, link)
    return message


def frontend_link(path: str) -> str:
    return f"{settings.SALON_FRONTEND_URL}{path}"
