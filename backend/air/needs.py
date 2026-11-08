"""Claim and resolve items on the AIR "needs you" list.

The `NeedsYouState` row for an item is locked while it changes (select_for_update), so two people
can never both claim it. A booking item (waiting for the stylist, handed to the desk) also takes
the Prompt 1 request claim (`handover.claim_for_person`): from then on AIR never touches that
request again.
"""

from __future__ import annotations

from datetime import datetime

from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from air import callback, handover
from air.models import AIActionLog, CallbackNote, NeedsYouState
from billing.models import PaymentLink
from scheduling.models import Appointment

K = NeedsYouState.Kind
BOOKING_KINDS = (K.AWAITING_STYLIST, K.HANDED_TO_DESK)
AUDIT_CLAIMED = "air_needs_you_claimed"
AUDIT_RESOLVED = "air_needs_you_resolved"


class NeedsError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _exists(kind: str, ref) -> bool:
    if kind in BOOKING_KINDS:
        return Appointment.objects.filter(pk=ref, air_state__isnull=False).exists()
    if kind == K.EXPIRED_LINK:
        return PaymentLink.objects.filter(pk=ref, appointment__air_state__isnull=False).exists()
    if kind == K.CALLBACK:
        return CallbackNote.objects.filter(pk=ref).exists()
    if kind == K.REFUND_REQUEST:
        return AIActionLog.objects.filter(pk=ref).exists()
    return False


def _locked(kind: str, ref) -> NeedsYouState:
    if kind not in K.values:
        raise NeedsError("bad_kind", "Unknown item type.")
    if not _exists(kind, ref):
        raise NeedsError("not_found", "That item no longer exists.")
    if kind in BOOKING_KINDS:
        # A booking can move from "waiting for the stylist" to "handed to the desk"; both kinds
        # share one row (stored under the first kind used) so a claim follows the booking.
        existing = NeedsYouState.objects.filter(kind__in=BOOKING_KINDS, ref=ref).first()
        if existing is not None:
            return NeedsYouState.objects.select_for_update().get(pk=existing.pk)
    NeedsYouState.objects.get_or_create(kind=kind, ref=ref)
    return NeedsYouState.objects.select_for_update().get(kind=kind, ref=ref)


def _name(user) -> str:
    return getattr(user, "full_name", "") or getattr(user, "email", "")


def claim(kind: str, ref, *, user, request=None, now: datetime | None = None) -> NeedsYouState:
    now = now or timezone.now()
    with transaction.atomic():
        state = _locked(kind, ref)
        if state.resolved_at:
            raise NeedsError("resolved", "This item is already resolved.")
        if state.claimed_by_id and state.claimed_by_id != user.pk:
            raise NeedsError("claimed", f"{_name(state.claimed_by)} is already handling this.")
        if state.claimed_by_id != user.pk:
            state.claimed_by, state.claimed_at = user, now
            state.save(update_fields=["claimed_by", "claimed_at"])
            if kind in BOOKING_KINDS:
                handover.claim_for_person(ref, now=now)
            audit(AUDIT_CLAIMED, request=request, actor=user, kind=kind, ref=str(ref))
    return state


def resolve(kind: str, ref, *, user, request=None, now: datetime | None = None) -> NeedsYouState:
    """Marks the item done. Someone else's claim can only be overridden by the admin."""
    now = now or timezone.now()
    with transaction.atomic():
        state = _locked(kind, ref)
        if state.resolved_at:
            return state
        if state.claimed_by_id and state.claimed_by_id != user.pk and user.role != "admin":
            raise NeedsError("claimed", f"{_name(state.claimed_by)} is handling this.")
        if not state.claimed_by_id:
            state.claimed_by, state.claimed_at = user, now
            if kind in BOOKING_KINDS:
                handover.claim_for_person(ref, now=now)
        state.resolved_by, state.resolved_at = user, now
        state.save(update_fields=["claimed_by", "claimed_at", "resolved_by", "resolved_at"])
        if kind == K.CALLBACK:
            callback.mark_done(ref, by=user)
        audit(AUDIT_RESOLVED, request=request, actor=user, kind=kind, ref=str(ref))
    return state
