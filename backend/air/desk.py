"""Desk cover for requests that did NOT come through AIR's chat (the normal booking form, the shop
and every other path): AIR looks at each waiting booking request, runs fixed checks, and either
accepts the RECEPTIONIST side of the dual approval (with the same server function a receptionist
uses, as the actor "air") or says exactly why it did not.

Rule-based, no language model: it works with every LLM switch OFF. It needs only the AIR desk-cover
switch (`AirSettings.air_enabled`) and an active cover period (`air.cover`).

NO SILENT FAILURES. Every time AIR looks at a request it writes one `AIActionLog` row with a
machine-readable reason code (once per request and outcome, so a sweep that runs every minute does
not flood the log):

  done        accept_reception                                  (written by `service.accept_reception`)
  skipped     desk_cover_check  switch_off | cover_inactive | claim_busy | policy_denied
  handed_off  desk_cover_check  check_failed:<name>             (a person takes it from here)
  failed      desk_cover_check  error:<ExceptionClass>          (caught per request, no message)

AIR never answers for the stylist: the stylist's side is untouched here.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import DatabaseError, transaction
from django.utils import timezone

from air import actionlog, actor, config, cover
from air.models import AIActionLog, AirRequestState, CoverState
from scheduling import approvals, booking
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus

logger = logging.getLogger("salon.air")

S = AppointmentStatus
A = ApprovalStatus
ACTION = "desk_cover_check"

# The limits AIR works inside. A bigger or later request goes to a person.
LIMIT_AMOUNT_RUPEES = Decimal("5000")  # the amount to pay online, GST included, in RUPEES
LIMIT_DAYS_AHEAD = 60
SWEEP_LOOKBACK = timedelta(days=14)
LAZY_GAP = timedelta(seconds=20)  # a lazy sweep never runs more often than this
STALE_AFTER = timedelta(minutes=5)  # "the scheduler has not run" in the admin status box

CHECK_NAMES = (
    "customer_active",
    "service_active",
    "unrated_visit",
    "lead_time",
    "amount_limit",
    "stylist_chosen",
    "shop_hours",
    "stylist_free",
)


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class Outcome:
    result: str  # accepted | skipped | handed_off | failed | noop
    reason: str = ""
    checks: list[Check] = field(default_factory=list)
    logged: bool = False


# --------------------------------------------------------------------------- the checks


def run_checks(appt: Appointment, now: datetime) -> list[Check]:
    """Every check, in order, with the value it saw. Reads only (the diagnose command shows it)."""
    out: list[Check] = []
    customer = appt.customer
    active = bool(customer and customer.is_active)
    out.append(Check("customer_active", active, "active" if active else "account is blocked"))

    service = appt.service
    ok = bool(service and service.is_active)
    out.append(Check("service_active", ok, "active" if ok else "service is not bookable"))

    from people import ratings

    pending = ratings.pending_count(customer) if customer else 0
    out.append(Check("unrated_visit", pending == 0, f"{pending} visit(s) waiting for a rating"))

    start = appt.preferred_start
    days = (start - now).total_seconds() / 86400 if start else None
    lead_ok = start is not None and start > now and days <= LIMIT_DAYS_AHEAD
    out.append(
        Check(
            "lead_time",
            lead_ok,
            "no time" if start is None else f"{days:.1f} days ahead (limit {LIMIT_DAYS_AHEAD})",
        )
    )

    amount = Decimal(appt.amount_payable or 0)  # rupees, GST included (what the customer pays)
    out.append(
        Check(
            "amount_limit",
            amount <= LIMIT_AMOUNT_RUPEES,
            f"Rs. {amount} to pay including GST (limit Rs. {LIMIT_AMOUNT_RUPEES})",
        )
    )

    chosen = appt.hold_stylist_id is not None
    out.append(
        Check(
            "stylist_chosen",
            chosen,
            "stylist asked" if chosen else "no stylist yet: a person chooses one",
        )
    )

    hours_ok, hours_detail = True, "inside opening hours"
    if start is not None and appt.service is not None:
        try:
            booking.check_bookable_time(start, appt.duration_minutes)
        except booking.BookingError as exc:
            hours_ok, hours_detail = False, exc.message
    out.append(Check("shop_hours", hours_ok, hours_detail))

    free_ok, free_detail = True, "no clash with a booking, hold or offer"
    if chosen and start is not None:
        try:
            with transaction.atomic():
                approvals.check_stylist_free(appt, appt.hold_stylist)
        except booking.BookingError as exc:
            free_ok, free_detail = False, exc.message
    elif not chosen:
        free_ok, free_detail = False, "no stylist to check"
    out.append(Check("stylist_free", free_ok, free_detail))
    return out


def first_failure(checks: list[Check]) -> Check | None:
    return next((c for c in checks if not c.passed), None)


# --------------------------------------------------------------------------- logging


def _log_once(appt: Appointment, status: str, reason: str, *, detail: str = "", now=None) -> bool:
    """One row per request, status and reason. Returns True when a row was written now."""
    if AIActionLog.objects.filter(
        action_type=ACTION, booking_ref=appt.pk, status=status, reason_code=reason[:40]
    ).exists():
        return False
    actionlog.write(
        ACTION,
        status=status,
        customer=appt.customer,
        booking=appt,
        after={"reason": detail} if detail else None,
        reason_code=reason,
        now=now,
    )
    return True


def _state(appt: Appointment, now: datetime) -> AirRequestState:
    """AIR's bookkeeping row for a request that did not start in the chat. Submitting the form is
    the customer's own explicit confirmation, so that moment is recorded as the confirmation."""
    state, _ = AirRequestState.objects.get_or_create(
        appointment=appt,
        defaults={
            "session_id": "",
            "source": "form" if appt.source == "online" else "desk",
            "customer_confirmed_at": appt.created_at or now,
            "cover_period": cover.current_period(),
        },
    )
    return state


def _hand_off(appt: Appointment, reason: str, detail: str, now: datetime) -> Outcome:
    with transaction.atomic():
        state = _state(appt, now)
        state = AirRequestState.objects.select_for_update().get(pk=state.pk)
        if not state.handed_to_desk:
            state.handed_to_desk = True
            state.handed_at = now
            state.handled_by = AirRequestState.Handler.HUMAN
            state.save(update_fields=["handed_to_desk", "handed_at", "handled_by"])
        wrote = _log_once(appt, AIActionLog.Status.HANDED_OFF, reason, detail=detail, now=now)
    return Outcome("handed_off", reason, logged=wrote)


# --------------------------------------------------------------------------- one request


def process(appt_id, *, trigger: str = "sweep", now: datetime | None = None) -> Outcome:
    """Looks at one waiting request. Never raises: a failure is logged as `error:<class>` and the
    caller (a request, a sweep) carries on."""
    now = now or timezone.now()
    try:
        with transaction.atomic():
            return _process(appt_id, trigger, now)
    except Exception as exc:  # per request: never abort a sweep, never stay silent
        name = type(exc).__name__
        logger.error("AIR desk cover failed for a request: %s", name)
        try:
            appt = Appointment.objects.filter(pk=appt_id).select_related("customer").first()
            if appt is not None:
                _log_once(appt, AIActionLog.Status.FAILED, f"error:{name}", now=now)
        except Exception as inner:  # even the log failed: say so in the server log, no secrets
            logger.error("AIR could not log a desk cover error: %s", type(inner).__name__)
        return Outcome("failed", f"error:{name}")


def _process(appt_id, trigger: str, now: datetime) -> Outcome:
    appt = (
        Appointment.objects.select_related("customer", "service", "hold_stylist")
        .filter(pk=appt_id)
        .first()
    )
    if appt is None or appt.status != S.REQUESTED or appt.reception_status != A.PENDING:
        return Outcome("noop", "not_waiting")
    existing = AirRequestState.objects.filter(appointment_id=appt.pk).first()
    if existing is not None:
        if existing.handed_to_desk or existing.handled_by == AirRequestState.Handler.HUMAN:
            return Outcome("noop", "handled_by_desk")
        if trigger == "saved" and existing.source == "chat":
            return Outcome("noop", "chat_flow")  # the chat's own submit accepts it

    if not config.get_settings().air_enabled:
        wrote = _log_once(appt, AIActionLog.Status.SKIPPED, "switch_off", now=now)
        return Outcome("skipped", "switch_off", logged=wrote)
    active, why = cover.evaluate(now)
    if not active:
        cover.is_active(now)  # keeps the cover periods in step
        wrote = _log_once(appt, AIActionLog.Status.SKIPPED, "cover_inactive", detail=why, now=now)
        return Outcome("skipped", "cover_inactive", logged=wrote)
    cover.is_active(now)

    checks = run_checks(appt, now)
    failed = first_failure(checks)
    if failed is not None:
        names = ",".join(c.name for c in checks if not c.passed)
        out = _hand_off(appt, f"check_failed:{failed.name}", names, now)
        out.checks = checks
        return out

    if existing is not None:
        try:  # another worker is mid-way with this very row: leave it to them
            with transaction.atomic():
                AirRequestState.objects.select_for_update(nowait=True).filter(
                    pk=existing.pk
                ).first()
        except DatabaseError:
            wrote = _log_once(appt, AIActionLog.Status.SKIPPED, "claim_busy", now=now)
            return Outcome("skipped", "claim_busy", checks, wrote)
    _state(appt, now)

    from air import service

    try:
        service.accept_reception(appt.pk, now=now)
    except actor.AirDenied as exc:
        return _denied(appt, exc, checks, now)
    except booking.BookingError as exc:
        # A rule stopped the accept (for example the stylist became busy): a person decides.
        out = _hand_off(appt, f"check_failed:{(exc.code or 'accept')[:20]}", exc.message[:100], now)
        out.checks = checks
        return out
    return Outcome("accepted", "accepted", checks, True)


def _denied(appt: Appointment, exc: actor.AirDenied, checks: list[Check], now) -> Outcome:
    code = exc.code
    if code in ("already_handled", "handled_by_desk"):
        return Outcome("noop", code, checks)  # a person or another run got there first
    if code == "outside_cover":
        wrote = _log_once(appt, AIActionLog.Status.SKIPPED, "cover_inactive", now=now)
        return Outcome("skipped", "cover_inactive", checks, wrote)
    wrote = _log_once(appt, AIActionLog.Status.SKIPPED, "policy_denied", detail=code, now=now)
    return Outcome("skipped", "policy_denied", checks, wrote)


# --------------------------------------------------------------------------- the sweep


def waiting_requests(now: datetime):
    """Requests that still wait for the front desk's answer (not AIR's chat ones that a person
    already has)."""
    return (
        Appointment.objects.filter(
            status=S.REQUESTED,
            reception_status=A.PENDING,
            created_at__gte=now - SWEEP_LOOKBACK,
        )
        .select_related("customer", "service", "hold_stylist")
        .order_by("created_at")
    )


def sweep(now: datetime | None = None, *, verbose=None) -> dict:
    """Runs `process` over every waiting request. Safe to run as often as you like, from several
    places at once (the claim lock lets exactly one run win each request). `verbose` is an
    optional callable that receives one line per request."""
    now = now or timezone.now()
    cover.is_active(now)
    counts = {"looked_at": 0, "accepted": 0, "skipped": 0, "handed_off": 0, "failed": 0, "noop": 0}
    last_error = ""
    for appt_id in list(waiting_requests(now).values_list("pk", flat=True)):
        out = process(appt_id, trigger="sweep", now=now)
        counts["looked_at"] += 1
        counts[out.result] = counts.get(out.result, 0) + 1
        if out.result == "failed":
            last_error = out.reason[:120]
        if verbose:
            verbose(f"{appt_id}: {out.result} ({out.reason})")
    obj = cover.state()
    CoverState.objects.filter(pk=obj.pk).update(
        last_sweep_at=now, last_sweep_error=last_error, last_sweep_counts=counts
    )
    return counts


def lazy_sweep(now: datetime | None = None) -> dict | None:
    """The same sweep, started by a page load or a stylist's answer, so a request moves even when
    the scheduler is not running. Throttled; never raises."""
    now = now or timezone.now()
    try:
        last = cover.state().last_sweep_at
        if last is not None and now - last < LAZY_GAP:
            return None
        if not config.get_settings().air_enabled:
            return None
        return sweep(now)
    except Exception as exc:
        logger.error("AIR lazy sweep failed: %s", type(exc).__name__)
        return None


# --------------------------------------------------------------------------- reasons and status


def why_not(appt: Appointment, now: datetime) -> str:
    """One line: the reason this waiting request has not been accepted (reads only)."""
    state = AirRequestState.objects.filter(appointment_id=appt.pk).first()
    if state is not None and (state.handed_to_desk or state.handled_by == "human"):
        row = (
            AIActionLog.objects.filter(booking_ref=appt.pk, status=AIActionLog.Status.HANDED_OFF)
            .order_by("-created_at")
            .first()
        )
        return f"handed to the desk ({row.reason_code if row else 'cover_ended'})"
    if not config.get_settings().air_enabled:
        return "switch_off: AIR desk cover is OFF"
    active, why = cover.evaluate(now)
    if not active:
        return f"cover_inactive: {why}"
    failed = first_failure(run_checks(appt, now))
    if failed is not None:
        return f"check_failed:{failed.name}: {failed.detail}"
    return "would be accepted on the next sweep"


def status(now: datetime | None = None) -> dict:
    """What the admin status box shows."""
    now = now or timezone.now()
    cfg = config.get_settings()
    cov = cover.status(now)
    obj = cover.state()
    last = obj.last_sweep_at
    stale = last is None or now - last > STALE_AFTER
    waiting = []
    for appt in waiting_requests(now)[:50]:
        reason = why_not(appt, now)
        if not reason.startswith("would be accepted"):
            waiting.append({"id": str(appt.pk), "reason": reason})
    return {
        "cover_enabled": cfg.air_enabled,
        "cover_active": cov["active"],
        "cover_reason": cov["reason"],
        "cover_reason_text": REASON_TEXT.get(cov["reason"], cov["reason"]),
        "presence_minutes": cfg.presence_minutes,
        "force": cov["force"],
        "last_sweep_at": last,
        "scheduler_stale": stale,
        "scheduler_stale_minutes": None
        if last is None
        else int((now - last).total_seconds() // 60),
        "last_error": obj.last_sweep_error,
        "last_counts": obj.last_sweep_counts,
        "waiting_count": len(waiting),
        "waiting": waiting[:10],
    }


REASON_TEXT = {
    "air_disabled": "AIR desk cover is switched OFF",
    "forced_on": "an admin forced cover ON",
    "forced_off": "an admin forced cover OFF",
    "receptionist_on_shift": "a receptionist is on shift now (Asia/Kolkata)",
    "receptionist_logged_in": "a receptionist is signed in and active at the desk",
    "off_shift_nobody_in": "nobody is on shift and nobody is signed in",
}
