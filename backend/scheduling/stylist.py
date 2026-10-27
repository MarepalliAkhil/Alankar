"""What a stylist may see and do with their own visits: start, and complete with the services
really done. Everything is scoped to the stylist's own profile; anything else looks like it does
not exist."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from people.models import StylistProfile
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, VisitCompletion

S = AppointmentStatus
PAISA = Decimal("0.01")

# A stylist never sees requests, unpaid holds, rejected, expired, cancelled or no-show visits.
VISIBLE = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)
MAX_NOTE = 500


class VisitError(Exception):
    """`code` is one of invalid, conflict or not_found."""

    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def profile_for(user) -> StylistProfile | None:
    return StylistProfile.objects.filter(user=user).first()


def visible_for(profile: StylistProfile):
    return Appointment.objects.filter(stylist=profile, status__in=VISIBLE).select_related(
        "room", "customer", "service"
    )


def booked_lines(appt: Appointment) -> list[dict]:
    """The main service and each add-on with its price. The main line takes what is left of the
    snapshot price, so the lines always add up to what the customer was quoted."""
    addons = list(appt.addons.all())
    addon_total = sum((a.price for a in addons), Decimal("0"))
    label = appt.service_name + (f" ({appt.variant_label})" if appt.variant_label else "")
    lines = [
        {
            "key": "service",
            "label": label,
            "price": str(max(Decimal("0"), appt.price_total - addon_total)),
        }
    ]
    lines += [{"key": str(a.id), "label": a.label, "price": str(a.price)} for a in addons]
    return lines


def actions(appt: Appointment) -> list[str]:
    if appt.status == S.CHECKED_IN:
        return ["start"]
    if appt.status == S.IN_PROGRESS:
        return ["complete"]
    return []


def _own(appt_id, profile: StylistProfile) -> Appointment:
    appt = (
        Appointment.objects.select_for_update(of=("self",))
        .filter(pk=appt_id, stylist=profile, status__in=VISIBLE)
        .first()
    )
    if appt is None:
        raise VisitError("Appointment not found.", "not_found")
    return appt


def start(appt_id, *, profile: StylistProfile, actor) -> Appointment:
    with transaction.atomic():
        appt = _own(appt_id, profile)
        if appt.status != S.CHECKED_IN:
            raise VisitError("Only a checked-in guest can be started.", "conflict")
        appt.status = S.IN_PROGRESS
        appt.save(update_fields=["status", "updated_at"])
        booking.record(appt, "started", actor=actor, from_status=S.CHECKED_IN)
    return appt


def complete(
    appt_id, *, profile: StylistProfile, actor, done_keys, note: str = ""
) -> tuple[Appointment, VisitCompletion]:
    note = (note or "").strip()
    if len(note) > MAX_NOTE:
        raise VisitError(f"The note can be at most {MAX_NOTE} characters.")
    with transaction.atomic():
        appt = _own(appt_id, profile)
        if appt.status != S.IN_PROGRESS:
            raise VisitError("Only a service in progress can be completed.", "conflict")
        lines = booked_lines(appt)
        wanted = [str(k) for k in (done_keys or [])]
        known = {line["key"] for line in lines}
        if len(set(wanted)) != len(wanted) or not set(wanted) <= known:
            raise VisitError("Choose only services that were booked.")
        if not wanted:
            raise VisitError("Tick at least one service that was done.")
        done = [line for line in lines if line["key"] in wanted]
        removed = [line for line in lines if line["key"] not in wanted]
        completion = VisitCompletion.objects.create(
            appointment=appt,
            done_lines=done,
            removed_lines=removed,
            booked_price=sum((Decimal(line["price"]) for line in lines), Decimal("0")),
            done_price=sum((Decimal(line["price"]) for line in done), Decimal("0")),
            note=note,
            completed_by=actor,
            completed_at=timezone.now(),
        )
        appt.status = S.COMPLETED
        appt.save(update_fields=["status", "updated_at"])
        change = ""
        if removed:
            change = "Not done: " + ", ".join(line["label"] for line in removed)
        booking.record(appt, "completed", actor=actor, from_status=S.IN_PROGRESS, note=change)
    return appt, completion
