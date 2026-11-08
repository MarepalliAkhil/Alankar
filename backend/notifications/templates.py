"""Every customer- and staff-facing booking message, in ONE place (Task 13).

Edit the wording here and nowhere else. Each entry has an in-app title and body, a short text
message (SMS) and an email subject. The placeholders are filled by `render()`:

  {first_name}  the customer's first name        {service}   the service name
  {when}        the visit time                    {stylist}   the stylist's display name
  {old_when} / {new_when}   the old and the new time of a changed booking
  {reason}      the reason category chosen by staff (a friendly phrase, never a private reason)
  {payment_note}  what happens to any payment (stays valid, or will be refunded)
  {minutes_left} / {hours_left}  time left for a pending request

The stylist's own private decline reasons (busy, personal plans...) are NEVER passed to a
customer message. `render()` refuses any placeholder that is not in the list above, so a typo
cannot leak a field.
"""

from __future__ import annotations

import string

from notifications import sorry
from notifications.air_templates import AIR_TEMPLATES

ALLOWED = {
    "first_name",
    "service",
    "when",
    "stylist",
    "old_when",
    "new_when",
    "reason",
    "payment_note",
    "hours_left",
    "customer",
    "pay_by",
    "amount",
    "alternatives",
    "next_slots",
    "contact",
    "stylist_first",
    "reception_line",
    "reception_sentence",
}

# --- reasons staff may pick when they change a customer's slot (shown to the customer) -----------

CHANGE_REASONS = {
    "stylist_unavailable": "your stylist is not available at that time",
    "schedule_change": "a change in our schedule",
    "room_or_equipment": "a room or equipment problem",
    "staff_emergency": "an unexpected staff emergency",
    "other": "an unexpected change at the salon",
}

# --- the stylist's private reasons for declining (only the receptionist and the stylist see) -----

DECLINE_REASONS = {
    "busy": "Busy at that time",
    "personal_plans": "Personal plans",
    "outside_hours": "Outside my working hours",
    "other": "Other",
}

TEMPLATES: dict[str, dict[str, str]] = {
    # ---- booking approval (13A): to the customer ------------------------------------------------
    "customer_received": {
        "title": "We got your booking request",
        "body": (
            "Hi {first_name}, we have your request for {service} on {when}. Our front desk and "
            "your stylist both need to say yes. We will tell you as soon as they do."
        ),
        "sms": "Hi {first_name}, we got your {service} request for {when}. We will confirm soon.",
        "subject": "booking request received",
    },
    "customer_confirmed": {
        "title": "Your booking is approved",
        "body": (
            "Good news, {first_name}! The salon and {stylist} have both approved your {service} "
            "on {when}. {reception_sentence} Please pay to lock in your slot."
        ),
        "sms": "Good news {first_name}! Your {service} on {when} is approved. Please pay to keep it.",
        "subject": "your booking is approved",
    },
    "customer_confirmed_free": {
        "title": "Your booking is confirmed",
        "body": (
            "Good news, {first_name}! The salon and {stylist} have both approved your {service} "
            "on {when}. {reception_sentence} It is booked, so we will see you then."
        ),
        "sms": "Good news {first_name}! Your {service} on {when} is booked. See you soon!",
        "subject": "your booking is confirmed",
    },
    "customer_reassigned": {
        "title": "We asked another stylist",
        "body": (
            "Hi {first_name}, we have asked {stylist} to take your {service} on {when}. We will "
            "tell you as soon as they confirm."
        ),
        "sms": "Hi {first_name}, we asked {stylist} to take your {service} on {when}. We'll confirm soon.",
        "subject": "we asked another stylist for your booking",
    },
    # ---- booking approval (13A): to staff -------------------------------------------------------
    "stylist_new_request": {
        "title": "New booking request",
        "body": "{first_name} would like {service} on {when}. Please accept or decline in Requests.",
    },
    "stylist_reminder": {
        "title": "A request is still waiting for you",
        "body": "{first_name}'s request for {service} on {when} needs your answer ({hours_left} left).",
    },
    "stylist_reception_declined": {
        "title": "A request was declined by the front desk",
        "body": "The request from {first_name} for {service} on {when} was declined, so no answer is needed.",
    },
    "stylist_expired": {
        "title": "A request ran out of time",
        "body": "The request from {first_name} for {service} on {when} expired before it was answered.",
    },
    "reception_new_request": {
        "title": "New booking request",
        "body": "{first_name} asked for {service} on {when}. Accept or decline it in Appointments.",
    },
    "reception_reminder": {
        "title": "A request is still waiting for you",
        "body": "{first_name}'s request for {service} on {when} needs an answer ({hours_left} left).",
    },
    "reception_stylist_accepted": {
        "title": "{stylist} accepted a request",
        "body": "{stylist} accepted {first_name}'s {service} on {when}.",
    },
    "reception_stylist_declined": {
        "title": "{stylist} declined a request",
        "body": (
            "{stylist} declined {first_name}'s {service} on {when} ({reason}). You can assign "
            "another stylist."
        ),
    },
    "reception_expired": {
        "title": "A request ran out of time",
        "body": "{first_name}'s request for {service} on {when} expired before everyone answered.",
    },
    "stylist_reception_accepted": {
        "title": "The front desk accepted a request",
        "body": "The front desk accepted {first_name}'s {service} on {when}. It now waits for you.",
    },
    # (every apology: notifications/sorry.py)
}

# Good news. The line {reception_line} is the shared "who accepted" wording (never an apology).
ACCEPTANCE_TEMPLATES: dict[str, dict[str, str]] = {
    "customer_front_desk_accepted": {
        "title": "The front desk accepted your request",
        "body": (
            "Good news, {first_name}! Your {service} request for {when} has been accepted. "
            "{reception_sentence} We are now waiting for your stylist to answer."
        ),
        "sms": "Good news {first_name}! Your {service} request for {when} was accepted. {reception_sentence}",
        "subject": "the front desk accepted your request",
    },
}


TEMPLATES.update(AIR_TEMPLATES)  # Task AIR-1: messages for requests AIR handles
TEMPLATES.update(sorry.templates())  # every apology is worded in notifications/sorry.py
TEMPLATES.update(ACCEPTANCE_TEMPLATES)

PAYMENT_NOTES = {
    "valid": "Your payment stays valid for the new time.",
    # What `booking.desk_cancel` really does: it files a refund request that waits for the admin.
    "refund": (
        "We have asked our team to approve a refund of your online payment of Rs. {amount}."
    ),
    "none": "Nothing has been charged.",
    # Used when money was paid but no refund flow applies: no amount, no deadline, no promise.
    "contact": "Our front desk will contact you about your payment.",
}


class TemplateError(Exception):
    pass


def render_text(text: str, **context: str) -> str:
    """Fills a loose piece of template text (one apology part) with the same safety checks."""
    names = {name for _, name, _, _ in string.Formatter().parse(text) if name}
    unknown = names - ALLOWED
    if unknown:
        raise TemplateError(f"Unknown fields: {sorted(unknown)}")
    return text.format(**{name: str(context.get(name, "")) for name in names})


def render(key: str, field: str = "body", **context: str) -> str:
    """Fills one field of a template. Unknown placeholders raise, so nothing private slips in."""
    try:
        text = TEMPLATES[key][field]
    except KeyError as exc:
        raise TemplateError(f"No template {key}/{field}") from exc
    names = {name for _, name, _, _ in string.Formatter().parse(text) if name}
    unknown = names - ALLOWED
    if unknown:
        raise TemplateError(f"Template {key}/{field} uses unknown fields: {sorted(unknown)}")
    safe = {name: str(context.get(name, "")) for name in names}
    return text.format(**safe)
