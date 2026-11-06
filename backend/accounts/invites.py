"""Sending staff invite emails (simulated or real SMTP)."""

from django.conf import settings
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog, StaffInvite
from core import brand
from core.mail import frontend_link, queue_mail, smtp_configured
from core.models import MailOutbox


def invite_link(token: str) -> str:
    return frontend_link(f"/accept-invite?token={token}")


def send_invite_email(invite: StaffInvite, token: str, *, inviter, request=None) -> MailOutbox:
    """Queues the invite email; real delivery happens after the transaction commits.

    On failure the invite stays valid, its email_status becomes "failed" and the failure is
    audited (never with the token or link).
    """
    hours = settings.SALON_AUTH["INVITE_HOURS"]
    user = invite.user
    invite.email_status = (
        StaffInvite.EmailStatus.PENDING if smtp_configured() else StaffInvite.EmailStatus.SIMULATED
    )
    invite.last_sent_at = timezone.now()
    invite.send_count += 1
    invite.save(update_fields=["email_status", "last_sent_at", "send_count"])

    def on_success(message: MailOutbox) -> None:
        StaffInvite.objects.filter(pk=invite.pk).update(email_status=StaffInvite.EmailStatus.SENT)

    def on_failure(message: MailOutbox) -> None:
        StaffInvite.objects.filter(pk=invite.pk).update(email_status=StaffInvite.EmailStatus.FAILED)
        audit(
            AuditLog.Action.EMAIL_FAILED,
            request=request,
            actor=inviter,
            target=user,
            kind="invite",
            error=message.error,
        )

    role_label = user.get_role_display().lower()
    inviter_name = getattr(inviter, "full_name", "") or "the admin"
    return queue_mail(
        kind=MailOutbox.Kind.INVITE,
        to=user.email,
        subject=f"You're invited to join {brand.SHOP_NAME} as a {role_label}",
        body=(
            f"Hi {user.full_name}, {inviter_name} invited you to {brand.SHOP_NAME}. "
            f"Open the link within {hours} hours to set your password."
        ),
        link=invite_link(token),
        on_success=on_success,
        on_failure=on_failure,
    )
