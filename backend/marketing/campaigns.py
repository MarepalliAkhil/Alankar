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
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from marketing import content, limits
from marketing.models import Campaign, CampaignRecipient
from scheduling.models import Appointment, AppointmentStatus

UNSUB_SALT = "marketing-unsubscribe"
RECENT_DAYS = 90


BATCH = 100


class CampaignError(Exception):
    pass


def audience(kind: str, campaign_kind: str | None = None):
    """Customers who opted in (and are active), narrowed by recent visits. Personal kinds also
    leave out customers who switched personal recommendations off."""
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
    if campaign_kind in content.PERSONAL:
        from recommendations.models import CustomerPrefs

        off = CustomerPrefs.objects.filter(enabled=False).values("user_id")
        base = base.exclude(pk__in=off)
    return base.order_by("email")


def unsubscribe_token(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=UNSUB_SALT)


def unsubscribe_links(user: User) -> tuple[str, str]:
    """(the page link shown in the email, the one-click URL for mail apps, RFC 8058)."""
    token = unsubscribe_token(user)
    return (
        frontend_link(f"/unsubscribe?token={token}"),
        frontend_link(f"/api/public/unsubscribe/?token={token}"),
    )


def message_body(campaign: Campaign, user: User) -> tuple[str, str]:
    """The text version for a custom campaign (kept for the preview of older drafts)."""
    page, _ = unsubscribe_links(user)
    built = content.build(campaign, user, "preview", page)
    return built.text, page


def _mail(campaign: Campaign, user: User, token: str, *, test_to: str = "") -> content.Built:
    page, one_click = unsubscribe_links(user)
    built = content.build(campaign, user, token, page)
    queue_mail(
        kind=MailOutbox.Kind.TEST if test_to else MailOutbox.Kind.MARKETING,
        to=test_to or user.email,
        subject=("[Test] " if test_to else "") + built.subject,
        body=built.text,
        link=built.link,
        html=built.html,
        headers={
            "List-Unsubscribe": f"<{one_click}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
    return built


def preview(campaign: Campaign, user: User | None = None) -> dict:
    """What one customer would get, without sending anything."""
    people = list(audience(campaign.audience, campaign.kind)[:50])
    if user is None:
        for person in people:
            try:
                page, _ = unsubscribe_links(person)
                built = content.build(campaign, person, "preview", page)
            except content.Skip:
                continue
            user = person
            break
    if user is None:
        return {"customer": None, "subject": campaign.subject, "text": "", "html": ""}
    page, _ = unsubscribe_links(user)
    built = content.build(campaign, user, "preview", page)
    return {
        "customer": {"id": str(user.pk), "name": user.full_name or user.email},
        "subject": built.subject,
        "text": built.text,
        "html": built.html,
    }


def send_test(campaign_id, *, actor, request=None) -> str:
    """Sends the preview to the admin's own address only (marked [Test])."""
    campaign = Campaign.objects.select_related("coupon").get(pk=campaign_id)
    problem = content.can_create(campaign.kind)
    if problem:
        raise CampaignError(problem)
    sample = preview(campaign)
    if sample["customer"] is None:
        raise CampaignError("No opted-in customer in this audience has anything to receive yet.")
    person = User.objects.get(pk=sample["customer"]["id"])
    _mail(campaign, person, "test", test_to=actor.email)
    audit(
        AuditLog.Action.CAMPAIGN_TEST_SENT,
        request=request,
        actor=actor,
        campaign=campaign.name,
        sample_customer=str(person.pk),
    )
    return actor.email


def send(campaign_id, *, actor=None, request=None, scheduled: bool = False) -> Campaign:
    """Approve and send: snapshots the audience as recipients, then sends them in batches.

    The campaign row is locked, so two senders (a click and the runner) can never both start it,
    and each recipient row is sent at most once. In quiet hours nothing goes out yet: the
    campaign stays "sending" and `send_campaigns` continues at the end of the quiet hours.
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
        problem = content.can_create(campaign.kind)
        if problem and not scheduled:
            raise CampaignError(problem)
        recipients = [] if problem else list(audience(campaign.audience, campaign.kind))
        if not recipients and not scheduled:
            raise CampaignError("No opted-in customers match this audience.")
        CampaignRecipient.objects.bulk_create(
            [CampaignRecipient(campaign=campaign, user=u) for u in recipients],
            ignore_conflicts=True,
        )
        if not scheduled:
            campaign.approved_by = actor if getattr(actor, "is_authenticated", False) else None
            campaign.approved_at = timezone.now()
            audit(
                AuditLog.Action.CAMPAIGN_APPROVED,
                request=request,
                actor=actor,
                campaign=campaign.name,
                kind=campaign.kind,
                audience=campaign.audience,
                recipients=len(recipients),
            )
        campaign.status = Campaign.Status.SENDING
        campaign.save()
    process(campaign_id, actor=actor, request=request, scheduled=scheduled)
    campaign.refresh_from_db()
    return campaign


def process(
    campaign_id, *, now=None, actor=None, request=None, scheduled=False, batches=None
) -> int:
    """Sends pending recipients in batches. Idempotent and safe to run in parallel."""
    from people.models import CustomerProfile
    from recommendations.models import RebookReminder

    sent = 0
    done_batches = 0
    while batches is None or done_batches < batches:
        if limits.in_quiet_hours(now):
            return sent
        with transaction.atomic():
            campaign = Campaign.objects.select_related("coupon").get(pk=campaign_id)
            if campaign.status != Campaign.Status.SENDING:
                return sent
            rows = list(
                CampaignRecipient.objects.select_for_update(skip_locked=True)
                .filter(campaign=campaign, status=CampaignRecipient.Status.PENDING)
                .select_related("user")
                .order_by("id")[:BATCH]
            )
            for row in rows:
                user = row.user
                profile = CustomerProfile.objects.filter(user=user).first()
                reason = ""
                if not user.is_active or profile is None or not profile.marketing_opt_in:
                    reason = "unsubscribed before sending"
                elif limits.emailed_recently(user.email, now):
                    reason = f"already emailed in the last {limits.min_days()} days"
                if not reason:
                    try:
                        built = _mail(campaign, user, str(row.pk))
                    except content.Skip as exc:
                        reason = str(exc)
                if reason:
                    row.status, row.reason = CampaignRecipient.Status.SKIPPED, reason[:60]
                    row.save(update_fields=["status", "reason"])
                    continue
                for service_id, cycle in built.rebook_cycles:
                    reminder, _ = RebookReminder.objects.get_or_create(
                        user=user, service_id=service_id, cycle=cycle
                    )
                    if not reminder.emailed:
                        reminder.emailed = True
                        reminder.save(update_fields=["emailed"])
                row.status, row.sent_at = CampaignRecipient.Status.SENT, timezone.now()
                row.save(update_fields=["status", "sent_at"])
                sent += 1
        done_batches += 1
        if not rows:
            break
    _finish(campaign_id, actor=actor, request=request, scheduled=scheduled)
    return sent


def _finish(campaign_id, *, actor=None, request=None, scheduled=False) -> None:
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status != Campaign.Status.SENDING:
            return
        rows = CampaignRecipient.objects.filter(campaign=campaign)
        if rows.filter(status=CampaignRecipient.Status.PENDING).exists():
            return
        campaign.status = Campaign.Status.SENT
        campaign.sent_at = timezone.now()
        campaign.recipient_count = rows.filter(status=CampaignRecipient.Status.SENT).count()
        campaign.skipped_count = rows.filter(status=CampaignRecipient.Status.SKIPPED).count()
        campaign.save()
        audit(
            AuditLog.Action.CAMPAIGN_SENT,
            request=request,
            actor=actor,
            campaign=campaign.name,
            recipients=campaign.recipient_count,
            skipped=campaign.skipped_count,
            audience=campaign.audience,
            kind=campaign.kind,
            scheduled=scheduled,
        )


def schedule(campaign_id, at, *, actor, request=None) -> Campaign:
    if at <= timezone.now() + timedelta(minutes=1):
        raise CampaignError("Choose a time in the future.")
    if limits.in_quiet_hours(at):
        start, end = limits.quiet_hours()
        raise CampaignError(
            f"No marketing emails between {start}:00 and {end:02d}:00. Choose a time in the day."
        )
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status in (Campaign.Status.SENT, Campaign.Status.SENDING):
            raise CampaignError("This campaign has already been sent.")
        problem = content.can_create(campaign.kind)
        if problem:
            raise CampaignError(problem)
        campaign.status = Campaign.Status.SCHEDULED
        campaign.scheduled_for = at
        # Scheduling is the admin's approval for the later send.
        campaign.approved_by = actor
        campaign.approved_at = timezone.now()
        campaign.save(update_fields=["status", "scheduled_for", "approved_by", "approved_at"])
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
        campaign.approved_by = None
        campaign.approved_at = None
        campaign.save(update_fields=["status", "scheduled_for", "approved_by", "approved_at"])
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


def send_all(now=None, *, batches: int | None = None) -> dict:
    """The runner: starts due scheduled campaigns, then continues every campaign that is still
    sending (after quiet hours, or after a crash). Safe to run as often as you like."""
    started = run_due(now)
    sent = 0
    for pk in Campaign.objects.filter(status=Campaign.Status.SENDING).values_list("pk", flat=True):
        sent += process(pk, now=now, batches=batches)
    return {"started": started, "emails": sent}
