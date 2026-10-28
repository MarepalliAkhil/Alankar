"""Monthly performance reviews: the admin's notes and status next to the rule-based indicators.

Admin only. A review is saved once per person and month and can be updated; every save keeps a
copy of the indicators as they were, and is audited (the audit entry records the status change and
the length of the notes, not the notes themselves). Nothing here deactivates anyone: that stays a
separate, deliberate action on the Staff page.
"""

from __future__ import annotations

from django.db import transaction

from accounts import work, work_admin
from accounts.audit import audit
from accounts.models import AuditLog, User
from people import indicators
from people.models import PerformanceReview, StylistProfile
from people.payroll import PayrollError, parse_month, plain, stylist_profiles

MAX_NOTES = 2000


class ReviewError(Exception):
    pass


def month_range(value):
    try:
        year, month = parse_month(value)
    except PayrollError as exc:
        raise ReviewError(str(exc)) from exc
    first, nxt = work.month_bounds(year, month)
    return f"{year:04d}-{month:02d}", first, nxt


def staff(first, nxt):
    """Stylists with a linked account and receptionists, active or with activity in the month."""
    rows = [p.user for p in stylist_profiles(first, nxt)]
    rows += list(work_admin.receptionists(first, nxt))
    return rows


def row(review: PerformanceReview | None) -> dict | None:
    if review is None:
        return None
    return {
        "id": str(review.id),
        "month": review.month,
        "status": review.status,
        "status_label": review.get_status_display(),
        "notes": review.notes,
        "decided_by": review.decided_by.full_name if review.decided_by_id else "",
        "updated_at": review.updated_at,
    }


def overview(month_value) -> dict:
    key, first, nxt = month_range(month_value)
    saved = {
        r.user_id: r
        for r in PerformanceReview.objects.filter(month=key).select_related("decided_by")
    }
    people = []
    for user in staff(first, nxt):
        profile = StylistProfile.objects.filter(user=user).first()
        people.append(
            {
                "id": str(user.pk),
                "name": profile.display_name if profile else (user.full_name or user.email),
                "role": user.role,
                "active": user.is_active,
                "indicators": indicators.for_user(user, first, nxt),
                "review": row(saved.get(user.pk)),
            }
        )
    return {
        "month": key,
        "people": people,
        "statuses": [{"value": v, "label": label} for v, label in PerformanceReview.Status.choices],
    }


def history(user: User) -> list[dict]:
    rows = PerformanceReview.objects.filter(user=user).select_related("decided_by")[:24]
    return [row(r) for r in rows]


def save(user: User, month_value, status: str, notes: str, *, actor, request=None):
    key, first, nxt = month_range(month_value)
    if status not in PerformanceReview.Status.values:
        raise ReviewError("Choose Continue, Put on notice, or Recommend ending the job.")
    notes = (notes or "").strip()
    if len(notes) > MAX_NOTES:
        raise ReviewError(f"Notes can be at most {MAX_NOTES} characters.")
    if status != PerformanceReview.Status.CONTINUE and len(notes) < 3:
        raise ReviewError("Write your notes for this decision (at least 3 characters).")
    snapshot = indicators.for_user(user, first, nxt)
    with transaction.atomic():
        review = PerformanceReview.objects.select_for_update().filter(user=user, month=key).first()
        before = review.status if review else None
        if review is None:
            review = PerformanceReview(user=user, month=key)
        review.status = status
        review.notes = notes
        review.metrics = plain(snapshot)
        review.decided_by = actor
        review.save()
        audit(
            AuditLog.Action.REVIEW_SAVED,
            request=request,
            actor=actor,
            target=user,
            month=key,
            status_before=before,
            status_after=status,
            notes_length=len(notes),
        )
    return review
