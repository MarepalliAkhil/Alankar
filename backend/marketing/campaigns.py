"""Sending campaigns, now or at a scheduled time.

A campaign is a simulated email to customers who ticked the marketing box. `send` is the only place
that turns a campaign into outbox mails, so the "Send" button, a scheduled send and the
`run_campaigns` command all behave the same way (and a campaign can never be sent twice).
"""

from __future__ import annotations

from datetime import timedelta

from django.core import signing
from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog, User
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from marketing.models import Campaign
from scheduling.models import Appointment, AppointmentStatus

UNSUB_SALT = "marketing-unsubscribe"
RECENT_DAYS = 90


class CampaignError(Exception):
    pass


def audience(kind: str):
    """Customers who opted in (and are active), narrowed by recent visits."""
    base = User.objects.filter(
        role=User.Role.CUSTOMER,
        is_active=True,
        customer_profile__marketing_opt_in=True,
    )
    cutoff = timezone.now() - timedelta(days=RECENT_DAYS)
    visited = Appointment.objects.filter(
        status=AppointmentStatus.COMPLETED, start__gte=cutoff
    ).values("customer")
    if kind == Campaign.Audience.RECENT:
        base = base.filter(pk__in=visited)
    elif kind == Campaign.Audience.LAPSED:
        base = base.exclude(pk__in=visited)
    return base.order_by("email")


def unsubscribe_token(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=UNSUB_SALT)


def message_body(campaign: Campaign, user: User) -> tuple[str, str]:
    name = user.full_name.split(" ")[0] if user.full_name else "there"
    lines = [f"Hello {name},", "", campaign.body.strip()]
    if campaign.coupon_id:
        lines += ["", f"Use coupon {campaign.coupon.code} at the counter."]
    link = frontend_link(f"/unsubscribe?token={unsubscribe_token(user)}")
    lines += [
        "",
        "You are getting this because you agreed to receive offers from "
        f"{brand.SHOP_NAME}. To stop these messages, unsubscribe here: {link}",
    ]
    return "\n".join(lines), link


def send(campaign_id, *, actor=None, request=None, scheduled: bool = False) -> Campaign:
    """Queues one outbox mail per opted-in recipient and marks the campaign sent.

    The campaign row is locked, so two senders (a click and the runner) can never both send it.
    A scheduled campaign with nobody to reach is closed with 0 recipients so it is not retried.
    """
    with transaction.atomic():
        campaign = (
            Campaign.objects.select_for_update(of=("self",))
            .select_related("coupon")
            .get(pk=campaign_id)
        )
        allowed = (
            (Campaign.Status.SCHEDULED,)
            if scheduled
            else (
                Campaign.Status.DRAFT,
                Campaign.Status.SCHEDULED,
            )
        )
        if campaign.status not in allowed:
            raise CampaignError("This campaign has already been sent.")
        recipients = list(audience(campaign.audience))
        if not recipients and not scheduled:
            raise CampaignError("No opted-in customers match this audience.")
        for user in recipients:
            body, link = message_body(campaign, user)
            queue_mail(
                kind=MailOutbox.Kind.MARKETING,
                to=user.email,
                subject=campaign.subject,
                body=body,
                link=link,
            )
        campaign.status = Campaign.Status.SENT
        campaign.sent_at = timezone.now()
        campaign.recipient_count = len(recipients)
        campaign.save()
        audit(
            AuditLog.Action.CAMPAIGN_SENT,
            request=request,
            actor=actor,
            campaign=campaign.name,
            recipients=len(recipients),
            audience=campaign.audience,
            scheduled=scheduled,
        )
    return campaign


def schedule(campaign_id, at, *, actor, request=None) -> Campaign:
    if at <= timezone.now() + timedelta(minutes=1):
        raise CampaignError("Choose a time in the future.")
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status == Campaign.Status.SENT:
            raise CampaignError("This campaign has already been sent.")
        campaign.status = Campaign.Status.SCHEDULED
        campaign.scheduled_for = at
        campaign.save(update_fields=["status", "scheduled_for"])
        audit(
            AuditLog.Action.CAMPAIGN_SCHEDULED,
            request=request,
            actor=actor,
            campaign=campaign.name,
            send_at=at.isoformat(),
        )
    return campaign


def unschedule(campaign_id, *, actor, request=None) -> Campaign:
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.Status.SCHEDULED:
            raise CampaignError("This campaign is not scheduled.")
        campaign.status = Campaign.Status.DRAFT
        campaign.scheduled_for = None
        campaign.save(update_fields=["status", "scheduled_for"])
        audit(
            AuditLog.Action.CAMPAIGN_UNSCHEDULED,
            request=request,
            actor=actor,
            campaign=campaign.name,
        )
    return campaign


def run_due(now=None, *, actor=None, request=None) -> int:
    """Sends every scheduled campaign whose time has come. Safe to run as often as you like."""
    now = now or timezone.now()
    ids = list(
        Campaign.objects.filter(status=Campaign.Status.SCHEDULED, scheduled_for__lte=now)
        .order_by("scheduled_for")
        .values_list("pk", flat=True)
    )
    sent = 0
    for pk in ids:
        try:
            send(pk, actor=actor, request=request, scheduled=True)
        except (CampaignError, Campaign.DoesNotExist):
            continue  # another runner got there first
        sent += 1
    return sent
