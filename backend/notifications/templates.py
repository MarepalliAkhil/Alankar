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
            "on {when}. Please pay to lock in your slot."
        ),
        "sms": "Good news {first_name}! Your {service} on {when} is approved. Please pay to keep it.",
        "subject": "your booking is approved",
    },
    "customer_confirmed_free": {
        "title": "Your booking is confirmed",
        "body": (
            "Good news, {first_name}! The salon and {stylist} have both approved your {service} "
            "on {when}. It is booked, so we will see you then."
        ),
        "sms": "Good news {first_name}! Your {service} on {when} is booked. See you soon!",
        "subject": "your booking is confirmed",
    },
    "customer_declined_by_stylist": {
        "title": "Please choose another time or stylist",
        "body": (
            "Hi {first_name}, your stylist isn't available for this time. Please choose another "
            "time or stylist."
        ),
        "sms": "Hi {first_name}, your stylist isn't available for {when}. Please choose another time or stylist.",
        "subject": "please choose another time or stylist",
    },
    "customer_declined_by_reception": {
        "title": "We could not take this request",
        "body": (
            "Hi {first_name}, we're sorry, we could not take your {service} request for {when}. "
            "Please choose another time or stylist."
        ),
        "sms": "Hi {first_name}, sorry, we couldn't take your {service} request for {when}. Please pick another time.",
        "subject": "we could not take your booking request",
    },
    "customer_expired": {
        "title": "Your request ran out of time",
        "body": (
            "Hi {first_name}, we did not manage to confirm your {service} request for {when} in "
            "time, so we released the slot. We are sorry. Please choose another time."
        ),
        "sms": "Hi {first_name}, we couldn't confirm {service} for {when} in time, so the slot was released. Sorry!",
        "subject": "your booking request expired",
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
    # ---- sorry notes when staff change a slot (13C): to the customer ----------------------------
    "slot_moved": {
        "title": "We are sorry: your booking was moved",
        "body": (
            "Hi {first_name}, we are really sorry. We had to move your {service} from {old_when} "
            "to {new_when} because of {reason}. {payment_note}"
        ),
        "sms": "Hi {first_name}, sorry! We had to move your {service} from {old_when} to {new_when}. Open the app to accept or change it.",
        "subject": "we are sorry, your booking was moved",
    },
    "slot_reassigned": {
        "title": "We are sorry: your stylist changed",
        "body": (
            "Hi {first_name}, we are sorry. Because of {reason}, {stylist} will look after your "
            "{service} on {new_when} (it was {old_when}). {payment_note}"
        ),
        "sms": "Hi {first_name}, sorry! {stylist} will now do your {service} on {new_when}. Open the app to accept or change it.",
        "subject": "we are sorry, your stylist changed",
    },
    "slot_cancelled": {
        "title": "We are sorry: your booking was cancelled",
        "body": (
            "Hi {first_name}, we are truly sorry. We had to cancel your {service} on {old_when} "
            "because of {reason}. {payment_note}"
        ),
        "sms": "Hi {first_name}, we are truly sorry: we had to cancel your {service} on {old_when}. Open the app to rebook.",
        "subject": "we are sorry, your booking was cancelled",
    },
}

PAYMENT_NOTES = {
    "valid": "Your payment stays valid for the new time.",
    "refund": "Your online payment of Rs. {amount} will be refunded once approved.",
    "none": "Nothing has been charged yet.",
}


class TemplateError(Exception):
    pass


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
