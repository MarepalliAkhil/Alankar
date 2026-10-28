"""Admin view of ratings: per stylist overview, comments, and moderation.

A rating is never edited or deleted. Moderation only decides whether it counts: a rating put
under review or excluded is left out of the stylist's average, graphs and pay. The original stars
stay in the database and in the audit entry. Customers' names are for the admin only.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from people.models import Rating, StylistProfile
from people.pay import money
from website.content import pay_rules

M = Rating.Moderation
ACTIONS = ("flag", "exclude", "restore")
MIN_REASON = 3


class ModerationError(Exception):
    pass


def _average(stars: list[int]) -> Decimal | None:
    return money(Decimal(sum(stars)) / len(stars)) if stars else None


def _trend(rows: list[Rating], months: int = 6) -> list[dict]:
    grouped: dict[str, list[int]] = {}
    for r in rows:
        grouped.setdefault(r.submitted_at.astimezone().strftime("%Y-%m"), []).append(r.stars)
    return [
        {"month": m, "average": str(_average(v)), "count": len(v)}
        for m, v in sorted(grouped.items())[-months:]
    ]


def direction(trend: list[dict]) -> str:
    """up / down / steady comparing the latest month with the one before it."""
    if len(trend) < 2:
        return "new"
    last, before = Decimal(trend[-1]["average"]), Decimal(trend[-2]["average"])
    if last - before >= Decimal("0.2"):
        return "up"
    if before - last >= Decimal("0.2"):
        return "down"
    return "steady"


def overview() -> list[dict]:
    rules = pay_rules()
    flag_below = Decimal(str(rules["flag_below"]))
    needed = int(rules["min_ratings"])
    by_stylist: dict = {}
    for r in Rating.objects.filter(status=Rating.Status.SUBMITTED, stylist__isnull=False):
        by_stylist.setdefault(r.stylist_id, []).append(r)
    out = []
    profiles = StylistProfile.objects.filter(user__isnull=False).order_by("display_name")
    for profile in profiles:
        rows = by_stylist.get(profile.id, [])
        counted = [r for r in rows if r.moderation == M.ACTIVE]
        average = _average([r.stars for r in counted])
        trend = _trend(counted)
        out.append(
            {
                "id": str(profile.id),
                "name": profile.display_name,
                "active": bool(profile.user and profile.user.is_active),
                "count": len(counted),
                "average": None if average is None else str(average),
                "trend": trend,
                "direction": direction(trend),
                "under_review": sum(1 for r in rows if r.moderation == M.UNDER_REVIEW),
                "excluded": sum(1 for r in rows if r.moderation == M.EXCLUDED),
                "needs_attention": bool(
                    average is not None and len(counted) >= needed and average < flag_below
                ),
            }
        )
    return out


def detail(profile: StylistProfile, moderation: str = "", limit: int = 100) -> dict:
    qs = Rating.objects.filter(stylist=profile, status=Rating.Status.SUBMITTED).select_related(
        "customer", "appointment", "moderated_by"
    )
    if moderation in {m.value for m in M}:
        qs = qs.filter(moderation=moderation)
    rows = list(qs.order_by("-submitted_at")[:limit])
    distribution = {str(n): 0 for n in range(1, 6)}
    counted = Rating.objects.filter(
        stylist=profile, status=Rating.Status.SUBMITTED, moderation=M.ACTIVE
    )
    stars = list(counted.values_list("stars", flat=True))
    for value in stars:
        distribution[str(value)] += 1
    average = _average(stars)
    all_counted = list(counted)
    trend = _trend(all_counted)
    return {
        "id": str(profile.id),
        "name": profile.display_name,
        "count": len(stars),
        "average": None if average is None else str(average),
        "distribution": distribution,
        "trend": trend,
        "direction": direction(trend),
        "pending": Rating.objects.filter(stylist=profile, status=Rating.Status.PENDING).count(),
        "ratings": [
            {
                "id": str(r.id),
                "stars": r.stars,
                "comment": r.comment,
                "tags": r.tags,
                "date": r.submitted_at,
                "customer": r.customer.full_name,
                "service": r.appointment.service_name,
                "moderation": r.moderation,
                "moderation_label": r.get_moderation_display(),
                "reason": r.moderation_reason,
                "moderated_by": r.moderated_by.full_name if r.moderated_by else "",
                "moderated_at": r.moderated_at,
            }
            for r in rows
        ],
    }


_ALLOWED = {
    "flag": ({M.ACTIVE}, M.UNDER_REVIEW, AuditLog.Action.RATING_FLAGGED),
    "exclude": ({M.ACTIVE, M.UNDER_REVIEW}, M.EXCLUDED, AuditLog.Action.RATING_EXCLUDED),
    "restore": ({M.UNDER_REVIEW, M.EXCLUDED}, M.ACTIVE, AuditLog.Action.RATING_RESTORED),
}


def moderate(rating_id, action: str, reason: str, *, actor, request=None) -> Rating:
    reason = (reason or "").strip()
    if action not in _ALLOWED:
        raise ModerationError("Unknown action.")
    if len(reason) < MIN_REASON:
        raise ModerationError("Please give a reason (at least 3 characters).")
    allowed_from, new_state, audit_action = _ALLOWED[action]
    with transaction.atomic():
        rating = (
            Rating.objects.select_for_update(of=("self",))
            .select_related("stylist")
            .filter(pk=rating_id, status=Rating.Status.SUBMITTED)
            .first()
        )
        if rating is None:
            raise LookupError
        if rating.moderation not in allowed_from:
            raise ModerationError("That rating cannot be changed this way right now.")
        before = rating.moderation
        # A queryset update on purpose: the rating row itself is immutable.
        Rating.objects.filter(pk=rating.pk).update(
            moderation=new_state,
            moderation_reason=reason,
            moderated_by=actor,
            moderated_at=timezone.now(),
        )
        audit(
            audit_action,
            request=request,
            actor=actor,
            rating=str(rating.pk),
            appointment=str(rating.appointment_id),
            stylist=rating.stylist.display_name if rating.stylist else "",
            original_stars=rating.stars,
            from_state=before,
            to_state=new_state,
            reason=reason,
        )
    rating.refresh_from_db()
    return rating
