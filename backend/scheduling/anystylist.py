""" "Any stylist": AIR's rules choose a free stylist (deterministic, rule-based, no language model).

Works on every booking path (form, chat, AIR) and whether or not a receptionist is on duty. The
front-desk side is unchanged: a receptionist accepts when on duty, AIR accepts in cover mode.

Who can be picked: stylists shown to customers who offer the service (the existing service-stylist
link) and whose user account is active, who work the whole visit (their weekly hours), are not on
approved time off, and have no clashing booking, pending request hold or waitlist offer. That is
exactly `approvals.check_stylist_free`, which also LOCKS the stylist row, so two customers asking at
the same moment queue up and the second sees the first one's hold. (There are no buffers between
visits in this salon's rules, so none are added.) Stylists who already declined or did not answer
this request are never offered it again.

Order: fewest bookings that day, then the higher average rating (submitted, counted ratings), then
a stable order by id.

Reassignment: if the stylist declines, or does not answer within the stylist timeout (AIR setting
`stylist_timeout_minutes`, 15 by default), the request goes to the next free stylist by the same
rules, at most `MAX_REASSIGNMENTS` more times, keeping the front desk's yes if it was given. Only if
nobody can take it does the request end with the usual sorry note and the nearest free times.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone

from people.models import Rating, StylistProfile
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus, StylistOffer

S = AppointmentStatus
A = ApprovalStatus
Outcome = StylistOffer.Outcome

ANY_LABEL = "Any available stylist (AIR picks one who is free)"
MAX_REASSIGNMENTS = 2
DEFAULT_TIMEOUT_MINUTES = 15

# Visits that count as "a booking that day" for load balancing.
BOOKED = (S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)


def timeout_minutes() -> int:
    try:
        from air import config

        return int(config.get_settings().stylist_timeout_minutes or DEFAULT_TIMEOUT_MINUTES)
    except Exception:  # noqa: BLE001 - the AIR settings table may not exist in an old database
        return DEFAULT_TIMEOUT_MINUTES


# --------------------------------------------------------------------------- the order


def _day_bounds(day_of: datetime) -> tuple[datetime, datetime]:
    local = booking.local(day_of)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def bookings_that_day(stylist_ids, day_of: datetime, *, exclude=None) -> dict:
    """Booked visits plus pending request holds per stylist on the local day of `day_of`."""
    lo, hi = _day_bounds(day_of)
    counts = {sid: 0 for sid in stylist_ids}
    visits = Appointment.objects.filter(
        stylist_id__in=stylist_ids, status__in=BOOKED, start__gte=lo, start__lt=hi
    )
    holds = Appointment.objects.filter(
        hold_stylist_id__in=stylist_ids,
        status=S.REQUESTED,
        preferred_start__gte=lo,
        preferred_start__lt=hi,
    )
    if exclude is not None:
        visits = visits.exclude(pk=exclude.pk)
        holds = holds.exclude(pk=exclude.pk)
    for row in visits.values("stylist_id").annotate(n=Count("id")):
        counts[row["stylist_id"]] = counts.get(row["stylist_id"], 0) + row["n"]
    for row in holds.values("hold_stylist_id").annotate(n=Count("id")):
        counts[row["hold_stylist_id"]] = counts.get(row["hold_stylist_id"], 0) + row["n"]
    return counts


def average_ratings(stylist_ids) -> dict:
    rows = (
        Rating.objects.filter(
            stylist_id__in=stylist_ids,
            status=Rating.Status.SUBMITTED,
            moderation=Rating.Moderation.ACTIVE,
            stars__isnull=False,
        )
        .values("stylist_id")
        .annotate(avg=Avg("stars"))
    )
    return {row["stylist_id"]: float(row["avg"] or 0) for row in rows}


def order_ids(stylist_ids, day_of: datetime, *, exclude=None) -> list:
    """`stylist_ids` best first: fewest bookings that day, higher rating, then id."""
    ids = list(stylist_ids)
    load = bookings_that_day(ids, day_of, exclude=exclude)
    stars = average_ratings(ids)
    return sorted(ids, key=lambda sid: (load.get(sid, 0), -stars.get(sid, 0.0), str(sid)))


def candidates(appt: Appointment, exclude_ids=()) -> list[StylistProfile]:
    """Qualified stylists for this request in the order AIR tries them (not yet checked free)."""
    if appt.service is None:
        return []
    qualified = booking.qualified_stylists(appt.service, public_only=True)
    ids = [sid for sid in qualified.values_list("id", flat=True) if sid not in set(exclude_ids)]
    by_id = {s.id: s for s in StylistProfile.objects.filter(id__in=ids)}
    return [by_id[sid] for sid in order_ids(ids, appt.preferred_start, exclude=appt)]


def pick(appt: Appointment, exclude_ids=()) -> StylistProfile | None:
    """The first candidate who is free for the whole visit. Must run inside the caller's
    transaction: the chosen stylist's row stays locked until it commits."""
    from scheduling import approvals

    for stylist in candidates(appt, exclude_ids):
        try:
            with transaction.atomic():
                approvals.check_stylist_free(appt, stylist, own=False)
        except booking.BookingError:
            continue
        return stylist
    return None


def no_one_free_error(appt: Appointment) -> booking.BookingError:
    ids = list(
        booking.qualified_stylists(appt.service, public_only=True).values_list("id", flat=True)
    )
    return booking.BookingError(
        "No stylist is free at that time. Here are the nearest free times.",
        code="conflict",
        slots=booking.nearest_slots(appt.preferred_start, appt.duration_minutes, ids, exclude=appt)
        if ids
        else [],
    )


# --------------------------------------------------------------------------- offers


def offered_ids(appt: Appointment) -> list:
    return list(appt.offers.values_list("stylist_id", flat=True))


def current_offer(appt: Appointment) -> StylistOffer | None:
    return appt.offers.filter(outcome=Outcome.PENDING).order_by("-seq").first()


def _offer(appt: Appointment, stylist, *, by: str, actor=None, now: datetime) -> StylistOffer:
    last = appt.offers.order_by("-seq").first()
    return StylistOffer.objects.create(
        appointment=appt,
        seq=(last.seq + 1) if last else 1,
        stylist=stylist,
        by=by,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        offered_at=now,
        answer_by=now + timedelta(minutes=timeout_minutes()),
    )


def close_offers(appt: Appointment, outcome: str, now: datetime | None = None) -> None:
    appt.offers.filter(outcome=Outcome.PENDING).update(
        outcome=outcome, answered_at=now or timezone.now()
    )


def reassignments(appt: Appointment) -> int:
    """How many times AIR moved this request to another stylist."""
    return appt.offers.filter(by=StylistOffer.By.AIR, seq__gt=1).count()


def _log(appt: Appointment, action: str, reason: str, stylist_id=None, now=None) -> None:
    try:
        from air import actionlog
    except Exception:  # noqa: BLE001
        return
    actionlog.write(
        action,
        customer=appt.customer,
        booking=appt,
        before={"status": appt.status},
        after={"stylist_id": stylist_id} if stylist_id else None,
        reason_code=reason,
        now=now,
    )


def _deadline(appt: Appointment, offer: StylistOffer) -> None:
    """The request lives at least until this offer's answer time (never past 10 minutes before
    the visit). An AIR chat hold moves with it."""
    cap = appt.preferred_start - timedelta(minutes=10)
    wanted = min(max(appt.approval_expires_at or offer.answer_by, offer.answer_by), cap)
    appt.approval_expires_at = wanted


def _move_air_hold(appt: Appointment, stylist, until: datetime) -> None:
    try:
        from air.models import SlotHold
    except Exception:  # noqa: BLE001
        return
    for hold in SlotHold.objects.select_for_update().filter(
        request=appt, status=SlotHold.Status.ACTIVE
    ):
        hold.stylist = stylist
        hold.expires_at = until
        hold.save(update_fields=["stylist", "expires_at"])


# --------------------------------------------------------------------------- the three moments


class NoStylistFree(booking.BookingError):
    """Nobody can take an "Any stylist" request: nothing is created, nearest times offered."""


def assign_new(appt: Appointment, *, now: datetime | None = None) -> StylistProfile:
    """A new "Any stylist" request: pick, hold and offer. Called inside the creating transaction;
    raises NoStylistFree (with the nearest free times) when nobody is free, so the caller's
    transaction rolls back and no request exists."""
    from scheduling import approvals

    now = now or timezone.now()
    stylist = pick(appt)
    if stylist is None:
        err = no_one_free_error(appt)
        raise NoStylistFree(err.message, code=err.code, slots=err.slots)
    appt.any_stylist = True
    approvals.open_request(appt, stylist=stylist)
    offer = _offer(appt, stylist, by=StylistOffer.By.AIR, now=now)
    _deadline(appt, offer)
    appt.save()
    _log(appt, "stylist_auto_assigned", "any_stylist", stylist.id, now)
    return stylist


def log_no_one_free(customer, service, start: datetime) -> None:
    """Written after the rolled-back attempt, so the AIR activity page shows it."""
    try:
        from air import actionlog

        actionlog.write(
            "no_stylist_free",
            customer=customer,
            after={"start": start, "service_id": service.pk if service else None},
            reason_code="no_stylist_free",
        )
    except Exception:  # noqa: BLE001 - logging must never break the answer to the customer
        pass


def mark_chat_request(appt: Appointment, stylist, *, now: datetime | None = None) -> None:
    """A chat request where the customer said "any stylist": AIR's rules chose `stylist` when
    the slot was held. From now on it behaves like any other "Any stylist" request."""
    now = now or timezone.now()
    appt.any_stylist = True
    appt.save(update_fields=["any_stylist", "updated_at"])
    if not appt.offers.exists():
        offer = _offer(appt, stylist, by=StylistOffer.By.AIR, now=now)
        offer.answer_by = appt.approval_expires_at or offer.answer_by
        offer.save(update_fields=["answer_by"])
    _log(appt, "stylist_auto_assigned", "any_stylist", stylist.id, now)


def chat_pick(stylist_ids, start: datetime) -> list:
    """The chat's free stylists for one time, in AIR's order (best first)."""
    return order_ids(stylist_ids, start)


def try_next(appt: Appointment, outcome: str, *, now: datetime | None = None, actor=None) -> bool:
    """The stylist declined (`outcome` "declined") or did not answer ("timed_out"). Offers the
    request to the next free stylist; returns False when nobody can take it (or the limit is
    reached), and the caller ends the request as before. The appointment row is locked by the
    caller; the front desk's yes is kept."""
    from scheduling import approvals

    now = now or timezone.now()
    current = current_offer(appt)
    if current is not None:
        current.outcome = outcome
        current.answered_at = now
        current.save(update_fields=["outcome", "answered_at"])
    if reassignments(appt) >= MAX_REASSIGNMENTS or appt.preferred_start <= now:
        _log(appt, "no_stylist_free", "reassign_limit", None, now)
        return False
    stylist = pick(appt, exclude_ids=offered_ids(appt))
    if stylist is None:
        _log(appt, "no_stylist_free", "no_stylist_free", None, now)
        return False
    approvals._hold(appt, stylist)
    appt.status = S.REQUESTED
    appt.stylist_decline_reason = ""
    offer = _offer(appt, stylist, by=StylistOffer.By.AIR, now=now)
    _deadline(appt, offer)
    appt.save()
    _move_air_hold(appt, stylist, appt.approval_expires_at)
    booking.record(appt, "reassigned", from_status=S.REQUESTED, note=f"any stylist: {outcome}")
    _log(appt, "stylist_reassigned", outcome, stylist.id, now)
    approvals.tell_new_stylist(appt)
    return True


def staff_moved(appt: Appointment, stylist, *, actor, now: datetime | None = None) -> None:
    """A receptionist or the admin gave an "Any stylist" request to another stylist."""
    now = now or timezone.now()
    close_offers(appt, Outcome.MOVED, now)
    offer = _offer(appt, stylist, by=StylistOffer.By.STAFF, actor=actor, now=now)
    _deadline(appt, offer)
    _move_air_hold(appt, stylist, appt.approval_expires_at)


def handle_timeouts(now: datetime | None = None) -> int:
    """Offers whose stylist did not answer in time move on (or end the request). Safe to run
    as often as you like; `approvals.expire_requests` calls it first."""
    from scheduling import approvals

    now = now or timezone.now()
    moved = 0
    due = (
        StylistOffer.objects.filter(
            outcome=Outcome.PENDING,
            answer_by__lte=now,
            appointment__status=S.REQUESTED,
            appointment__stylist_status=A.PENDING,
        )
        .values_list("appointment_id", flat=True)
        .distinct()
    )
    for appt_id in list(due):
        with transaction.atomic():
            appt = (
                Appointment.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("service", "customer", "hold_stylist")
                .filter(pk=appt_id, status=S.REQUESTED, stylist_status=A.PENDING)
                .first()
            )
            if appt is None:
                continue
            offer = current_offer(appt)
            if offer is None or offer.answer_by is None or offer.answer_by > now:
                continue
            gone = appt.hold_stylist
            if try_next(appt, Outcome.TIMED_OUT, now=now):
                moved += 1
                if gone is not None:
                    approvals.tell_stylist_gone(appt, gone)
            else:
                # Nobody else: the usual expiry ends it with the sorry note (same transaction run).
                appt.approval_expires_at = now
                appt.save(update_fields=["approval_expires_at", "updated_at"])
    return moved


# --------------------------------------------------------------------------- what people see


def first_name(name: str) -> str:
    return (name or "").split(" ")[0]


def customer_line(appt: Appointment) -> str:
    """ "Stylist: Asha, assigned by AIR" for an "Any stylist" request (only the current stylist,
    never who declined or why)."""
    if not appt.any_stylist:
        return ""
    stylist = appt.stylist or appt.hold_stylist
    return f"Stylist: {first_name(stylist.display_name)}, assigned by AIR" if stylist else ""


def history(appt: Appointment) -> list[dict]:
    """Staff only: who was offered the request and what came of it."""
    return [
        {
            "seq": o.seq,
            "stylist_name": o.stylist.display_name,
            "by": o.by,
            "by_label": "AIR" if o.by == StylistOffer.By.AIR else "Staff",
            "outcome": o.outcome,
            "outcome_label": o.get_outcome_display(),
            "offered_at": o.offered_at.isoformat(),
            "answered_at": o.answered_at.isoformat() if o.answered_at else None,
        }
        for o in sorted(appt.offers.all(), key=lambda o: o.seq)
    ]
