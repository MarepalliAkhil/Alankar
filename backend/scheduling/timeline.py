"""What the customer's appointments page shows for one request: a status timeline, and (when the
salon could not keep its side) a short sorry note with the next step.

Everything here is customer-safe. It names the stylist (their name is already public on the
booking), says WHO accepted only with the shared labels from `scheduling.acceptance`, and never
carries the receptionist's name or id or a stylist's private decline reason. The sorry-note words
come from `notifications.sorry`, the same templates the emails, texts and bell notifications use.
"""

from __future__ import annotations

from decimal import Decimal

from billing.models import Payment, Refund
from notifications import sorry, templates
from scheduling import acceptance, booking
from scheduling.models import AppointmentStatus as S
from scheduling.models import ApprovalStatus as A
from scheduling.models import SlotChange

DONE, WAITING, STOPPED, PROBLEM, SKIPPED = "done", "waiting", "stopped", "problem", "skipped"

CLOSED_BY_SALON = {
    S.DECLINED_BY_STYLIST: "stylist_declined",
    S.DECLINED_BY_RECEPTION: "reception_declined",
    S.EXPIRED: "timed_out",
    S.PAYMENT_EXPIRED: "link_expired",
}
CONFIRMED = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED, S.NO_SHOW)
ENDED = (
    S.DECLINED_BY_STYLIST,
    S.DECLINED_BY_RECEPTION,
    S.EXPIRED,
    S.PAYMENT_EXPIRED,
    S.CANCELLED,
    S.REJECTED,
)


def _stylist_name(appt) -> str:
    stylist = appt.stylist or appt.hold_stylist
    return stylist.display_name if stylist else ""


def _iso(dt):
    return dt.isoformat() if dt else None


def _event_time(appt, action):
    times = [e.created_at for e in appt.events.all() if e.action == action]
    return min(times) if times else None


def _step(key, label, state, text, at=None, extra=None):
    out = {"key": key, "label": label, "state": state, "text": text, "at": _iso(at)}
    if extra:
        out.update(extra)
    return out


def timeline(appt) -> list[dict]:
    """The six steps in order. Each has a text status (never colour alone): `state` is one of
    done, waiting, stopped (not reached because the request ended), problem or skipped."""
    ended = appt.status in ENDED
    steps = [_step("requested", "Requested", DONE, "Requested", appt.created_at)]

    # --- front desk
    if appt.reception_actor or appt.reception_status == A.ACCEPTED:
        actor = appt.reception_actor or acceptance.RECEPTIONIST
        steps.append(
            _step(
                "front_desk",
                "Front desk accepted",
                DONE,
                acceptance.label(actor),
                appt.reception_accepted_at,
                {"actor": actor},
            )
        )
    elif appt.status == S.DECLINED_BY_RECEPTION:
        steps.append(
            _step("front_desk", "Front desk accepted", PROBLEM, "Could not take this request")
        )
    elif ended:
        steps.append(_step("front_desk", "Front desk accepted", STOPPED, "Not reached"))
    else:
        steps.append(_step("front_desk", "Front desk accepted", WAITING, "Waiting"))

    # --- stylist
    name = _stylist_name(appt)
    if appt.stylist_status == A.ACCEPTED or appt.status in CONFIRMED + (
        S.AWAITING_PAYMENT,
        S.PAYMENT_EXPIRED,
    ):
        who = f"Accepted by {name}" if name else "Stylist accepted"
        steps.append(
            _step("stylist", "Stylist accepted", DONE, who, _event_time(appt, "stylist_accepted"))
        )
    elif appt.status == S.DECLINED_BY_STYLIST:
        steps.append(_step("stylist", "Stylist accepted", PROBLEM, "Could not take this slot"))
    elif ended:
        steps.append(_step("stylist", "Stylist accepted", STOPPED, "Not reached"))
    else:
        steps.append(_step("stylist", "Stylist accepted", WAITING, "Waiting"))

    # --- payment link, payment, confirmed
    paid = booking.paid_amount(appt)
    links = sorted(appt.payment_links.all(), key=lambda link: link.created_at)
    free = appt.amount_payable <= 0
    confirmed = appt.status in CONFIRMED
    if free and (confirmed or appt.status == S.AWAITING_PAYMENT):
        steps.append(_step("payment_link", "Payment link sent", SKIPPED, "Not needed"))
        steps.append(_step("paid", "Paid", SKIPPED, "Nothing to pay online"))
    else:
        if appt.status == S.PAYMENT_EXPIRED:
            steps.append(
                _step(
                    "payment_link",
                    "Payment link sent",
                    PROBLEM,
                    "Expired",
                    links[-1].expires_at if links else appt.awaiting_payment_until,
                )
            )
        elif links:
            last = links[-1]
            expiry = appt.awaiting_payment_until or last.expires_at
            text = "Sent" if paid > 0 or confirmed else f"Sent, pay by {booking.when_text(expiry)}"
            steps.append(
                _step(
                    "payment_link",
                    "Payment link sent",
                    DONE,
                    text,
                    last.sent_at or last.created_at,
                    {"expires_at": _iso(expiry)},
                )
            )
        elif ended:
            steps.append(_step("payment_link", "Payment link sent", STOPPED, "Not reached"))
        else:
            steps.append(_step("payment_link", "Payment link sent", WAITING, "Waiting"))
        if paid > 0:
            when = min(
                (p.created_at for p in appt.payments.all() if p.status == Payment.Status.SUCCEEDED),
                default=None,
            )
            steps.append(_step("paid", "Paid", DONE, "Paid", when))
        elif ended:
            steps.append(_step("paid", "Paid", STOPPED, "Not reached"))
        else:
            steps.append(_step("paid", "Paid", WAITING, "Waiting"))
    if confirmed:
        steps.append(
            _step("confirmed", "Confirmed", DONE, "Confirmed", _event_time(appt, "confirmed"))
        )
    elif ended:
        steps.append(_step("confirmed", "Confirmed", STOPPED, "Not reached"))
    else:
        steps.append(_step("confirmed", "Confirmed", WAITING, "Waiting"))
    return steps


# --------------------------------------------------------------------------- the sorry note


def _latest_change(appt):
    changes = list(appt.changes.all())
    return max(changes, key=lambda c: c.seq) if changes else None


def apology_event(appt) -> str | None:
    """Which apology (if any) the page owes this request: only salon-side endings."""
    if appt.status in CLOSED_BY_SALON:
        return CLOSED_BY_SALON[appt.status]
    change = _latest_change(appt)
    if change is None:
        return None
    if change.kind == SlotChange.Kind.CANCELLED and appt.status == S.CANCELLED:
        return "cancelled"
    if (
        change.kind in (SlotChange.Kind.MOVED, SlotChange.Kind.REASSIGNED)
        and change.response == SlotChange.Response.PENDING
        and appt.status in booking.CANCELLABLE
    ):
        return "moved" if change.kind == SlotChange.Kind.MOVED else "reassigned"
    return None


def _refund_note(appt) -> str:
    paid = booking.paid_amount(appt)
    if paid <= 0:
        return templates.PAYMENT_NOTES["none"]
    asked = sum(
        (
            r.amount
            for p in appt.payments.all()
            for r in p.refunds.all()
            if r.status != Refund.Status.REJECTED
        ),
        Decimal("0"),
    )
    if asked > 0:
        return templates.PAYMENT_NOTES["refund"].format(amount=asked)
    return templates.PAYMENT_NOTES["contact"]


def sorry_note(appt) -> dict | None:
    """The short sorry note and next action for a request the salon could not keep, or None."""
    event = apology_event(appt)
    if event is None:
        return None
    change = _latest_change(appt) if event in ("moved", "reassigned", "cancelled") else None
    stylist = _stylist_name(appt)
    ctx = {
        "first_name": sorry.first_word(appt.contact_name) or "there",
        "service": appt.service_name,
        "when": booking.when_text(appt.start or appt.preferred_start),
        "stylist": change.new_stylist_name if change and change.new_stylist_name else stylist,
    }
    if event in ("stylist_declined", "reception_declined", "timed_out", "link_expired"):
        avoid = appt.hold_stylist_id if event == "stylist_declined" else None
        slots = sorry.nearest_slot_times(appt, avoid_stylist_id=avoid)
        ctx["alternatives"] = "; ".join(booking.when_text(s) for s in slots)
        ctx["payment_note"] = templates.PAYMENT_NOTES[
            "contact" if booking.paid_amount(appt) > 0 else "none"
        ]
    else:
        slots = []
        ctx["alternatives"] = ""
        if change is not None:
            ctx.update(
                old_when=booking.when_text(change.old_start) if change.old_start else "",
                new_when=booking.when_text(change.new_start) if change.new_start else "",
                reason=templates.CHANGE_REASONS.get(change.reason, ""),
            )
        ctx["payment_note"] = (
            _refund_note(appt)
            if event == "cancelled"
            else templates.PAYMENT_NOTES["valid" if booking.paid_amount(appt) > 0 else "none"]
        )
    ctx["stylist_first"] = sorry.first_word(ctx["stylist"])
    ctx["next_slots"] = sorry.next_slots_sentence(ctx["alternatives"])
    ctx["contact"] = sorry.contact_sentence()
    rendered = {
        name: templates.render_text(text, **ctx) for name, text in sorry.parts(event).items()
    }
    key = sorry.APOLOGY_EVENTS[event]
    return {
        "event": event,
        "title": templates.TEMPLATES[key]["title"],
        "parts": rendered,
        "text": " ".join(rendered[name] for name in sorry.PARTS_ORDER),
        "nearest_slots": [{"start": s.isoformat(), "label": booking.when_text(s)} for s in slots],
        "phone": sorry.salon_phone(),
    }
