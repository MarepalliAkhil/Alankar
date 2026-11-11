"""The ONE place that words an apology, and the ONE place that says who accepted a request.

Emails, simulated texts, in-app (bell) notifications and the customer's appointments page all
read the templates below, so the wording can never disagree between them.

An apology is made of five parts, always in this order:

  1. apology   a sincere, short apology in plain words
  2. what      what happened, with no blame, no staff names and no private reasons
  3. next      what happens next
  4. step      the next step: the nearest free times (or Book again) and how to reach us
  5. money     the payment sentence; it says only what the salon's real flow does, and never
               invents an amount, a deadline or a promise

Apology events are the ones where the SALON caused the change. A change the customer asked for
is never an apology event, and neither is good news (accepted, paid, confirmed).

Only the stylist's FIRST name appears (`{stylist_first}`), and no template can reach a stylist's
private decline reason: `notifications.templates.render` only fills whitelisted placeholders.
"""

from __future__ import annotations

from scheduling import acceptance

PARTS_ORDER = ("apology", "what", "next", "step", "money")

# Events where the salon says sorry, and the template keys that carry them.
APOLOGY_EVENTS = {
    "stylist_declined": "customer_declined_by_stylist",
    "reception_declined": "customer_declined_by_reception",
    "timed_out": "customer_expired",
    "link_expired": "customer_link_expired",
    "moved": "slot_moved",
    "reassigned": "slot_reassigned",
    "cancelled": "slot_cancelled",
}
# AIR's older keys stay valid and carry the same wording.
ALIASES = {
    "air_stylist_declined": "customer_declined_by_stylist",
    "air_stylist_timeout": "customer_expired",
    "air_link_expired": "customer_link_expired",
}

# Good news and customer-initiated changes: polite, never an apology.
NON_APOLOGY_KEYS = (
    "air_received",
    "air_stylist_accepted",
    "air_link_sent",
    "air_paid",
    "air_confirmed_free",
    "customer_front_desk_accepted",
    "customer_confirmed",
    "customer_confirmed_free",
    "customer_paid",
    "customer_change_acknowledged",
)

_STEP_SLOTS = "{next_slots} {contact}"
_STEP_BOOK = "You can book again from your appointments page. {contact}"
_STEP_CHANGE = (
    "Open your appointments page to accept the new time, choose another time, or cancel. {contact}"
)

# key -> (title, five parts, sms, subject)
_SPEC = {
    "stylist_declined": (
        "We are sorry: we could not take this slot",
        {
            "apology": (
                "We're sorry, {stylist_first} is not able to take this slot. We know this "
                "isn't what you were hoping for."
            ),
            "what": "Your request for {service} on {when} was not accepted, so we released the time.",
            "next": "Nothing else is needed from you for this request.",
            "step": _STEP_SLOTS,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, your stylist can't take {service} on {when}. {next_slots} {contact}",
        "we are sorry, we could not take this slot",
    ),
    "reception_declined": (
        "We are sorry: we could not take this request",
        {
            "apology": "We're sorry, {first_name}, we could not take your request this time.",
            "what": "Your request for {service} on {when} could not be accepted, so we released the time.",
            "next": "Nothing else is needed from you for this request.",
            "step": _STEP_SLOTS,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, we couldn't take your {service} request for {when}. {next_slots} {contact}",
        "we are sorry, we could not take your request",
    ),
    "timed_out": (
        "We are sorry: your request ran out of time",
        {
            "apology": "We're sorry, {first_name}, we did not answer your request in time.",
            "what": "Your request for {service} on {when} was not confirmed in time, so we released the slot.",
            "next": "Nothing else is needed from you for this request.",
            "step": _STEP_SLOTS,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, we couldn't confirm {service} for {when} in time. {next_slots} {contact}",
        "we are sorry, your request ran out of time",
    ),
    "link_expired": (
        "We are sorry: your payment link expired",
        {
            "apology": "We're sorry, {first_name}, this is not how we wanted your booking to end.",
            "what": (
                "The payment link for {service} on {when} expired before it was used, so we "
                "released the slot."
            ),
            "next": "Nothing else is needed from you for this request.",
            "step": _STEP_SLOTS,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, the payment link for {service} on {when} expired. {next_slots} {contact}",
        "we are sorry, your payment link expired",
    ),
    "moved": (
        "We are sorry: your booking was moved",
        {
            "apology": "We're really sorry, {first_name}, we had to move your booking.",
            "what": ("Your {service} was moved from {old_when} to {new_when} because of {reason}."),
            "next": "The new time is held for you until you answer.",
            "step": _STEP_CHANGE,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, we had to move your {service} from {old_when} to {new_when}. {contact}",
        "we are sorry, your booking was moved",
    ),
    "reassigned": (
        "We are sorry: your stylist changed",
        {
            "apology": "We're sorry, {first_name}, we had to change your stylist.",
            "what": (
                "Because of {reason}, {stylist_first} will look after your {service} on "
                "{new_when} (it was {old_when})."
            ),
            "next": "The new time is held for you until you answer.",
            "step": _STEP_CHANGE,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're sorry, {stylist_first} will now do your {service} on {new_when}. {contact}",
        "we are sorry, your stylist changed",
    ),
    "cancelled": (
        "We are sorry: your booking was cancelled",
        {
            "apology": "We're truly sorry, {first_name}, we had to cancel your booking.",
            "what": "Your {service} on {old_when} was cancelled because of {reason}.",
            "next": "Nothing else is needed from you for this booking.",
            "step": _STEP_BOOK,
            "money": "{payment_note}",
        },
        "Hi {first_name}, we're truly sorry, we had to cancel your {service} on {old_when}. {contact}",
        "we are sorry, your booking was cancelled",
    ),
}


def parts(event: str) -> dict[str, str]:
    """The five unfilled parts of one apology event."""
    return dict(_SPEC[event][1])


def templates() -> dict[str, dict[str, str]]:
    """Template entries for `notifications.templates.TEMPLATES`, one per apology event."""
    out = {}
    for event, key in APOLOGY_EVENTS.items():
        title, five, sms, subject = _SPEC[event]
        body = " ".join(five[name] for name in PARTS_ORDER)
        out[key] = {"title": title, "body": body, "sms": sms, "subject": subject}
    for alias, key in ALIASES.items():
        out[alias] = out[key]
    return out


def is_apology_key(key: str) -> bool:
    return key in APOLOGY_EVENTS.values() or key in ALIASES


# --------------------------------------------------------------------------- context helpers


def first_word(name: str) -> str:
    return (name or "").split(" ")[0]


def salon_phone() -> str:
    from website.content import content

    return str((content("contact", {}) or {}).get("phone", "") or "").strip()


def contact_sentence(phone: str | None = None) -> str:
    phone = salon_phone() if phone is None else phone
    if phone:
        return f"You can also call us on {phone}."
    return "You can also contact our front desk."


def nearest_slot_times(appt, *, avoid_stylist_id=None) -> list:
    """The nearest free starts for this request, using the existing nearest-slot search."""
    from scheduling import booking

    service = appt.service
    if service is None:
        return []
    ids = list(booking.qualified_stylists(service, public_only=True).values_list("id", flat=True))
    others = [i for i in ids if i != avoid_stylist_id] or ids
    if not others:
        return []
    start = appt.preferred_start or appt.start
    return booking.nearest_slots(start, appt.duration_minutes, others)


def nearest_text(appt, *, avoid_stylist_id=None) -> str:
    from scheduling import booking

    return "; ".join(
        booking.when_text(s) for s in nearest_slot_times(appt, avoid_stylist_id=avoid_stylist_id)
    )


def next_slots_sentence(alternatives: str) -> str:
    if alternatives:
        return f"Here are the nearest times that are free: {alternatives}."
    return "You can book again at any time from your appointments page."


def reception_line(appt) -> str:
    """Who accepted, in the shared words ("" until the front desk has accepted)."""
    return acceptance.label(getattr(appt, "reception_actor", ""))


def reception_vars(appt) -> dict:
    line = reception_line(appt)
    return {"reception_line": line, "reception_sentence": f"{line}." if line else ""}


def context_for(appt, key: str, context: dict) -> dict:
    """Fills the shared placeholders every apology (and every acceptance line) needs."""
    out = dict(context)
    for name, value in reception_vars(appt).items():
        out.setdefault(name, value)
    stylist = out.get("stylist") or ""
    out.setdefault("stylist_first", first_word(stylist))
    if is_apology_key(key):
        alternatives = out.get("alternatives")
        if alternatives is None or alternatives == "":
            avoid = (
                appt.hold_stylist_id
                if key in ("customer_declined_by_stylist", "air_stylist_declined")
                else None
            )
            if key in (
                "customer_declined_by_stylist",
                "customer_declined_by_reception",
                "customer_expired",
                "customer_link_expired",
                "air_stylist_declined",
                "air_stylist_timeout",
                "air_link_expired",
            ):
                alternatives = nearest_text(appt, avoid_stylist_id=avoid)
            else:
                alternatives = ""
        out["alternatives"] = alternatives
        out["next_slots"] = next_slots_sentence(alternatives)
        out.setdefault("contact", contact_sentence())
        out.setdefault("payment_note", payment_note(appt))
    return out


def payment_note(appt) -> str:
    """What happened to the customer's money, in the words of the real flow. Before payment
    nothing was charged; if money is held for a booking we cannot describe, the front desk
    contacts the customer. No amount, deadline or promise is made up here."""
    from notifications import templates
    from scheduling import booking

    return (
        templates.PAYMENT_NOTES["contact"]
        if booking.paid_amount(appt) > 0
        else templates.PAYMENT_NOTES["none"]
    )


def event_for_key(key: str) -> str | None:
    key = ALIASES.get(key, key)
    for event, k in APOLOGY_EVENTS.items():
        if k == key:
            return event
    return None


def email_footer(appt) -> str:
    """Added to every email about a request: who accepted it (once the front desk has) and, for
    "Any stylist", the stylist AIR assigned ("Stylist: Asha, assigned by AIR")."""
    from scheduling import anystylist

    lines = [reception_line(appt), anystylist.customer_line(appt)]
    return "\n".join(f"{line}." for line in lines if line)


def email_body(key: str, rendered_body: str, appt, context: dict) -> str:
    """The email text: apologies as five short paragraphs, everything else as written; always
    followed by who accepted the request (when someone did)."""
    from notifications import templates

    event = event_for_key(key)
    if event is not None:
        body = "\n\n".join(templates.render_text(text, **context) for text in parts(event).values())
    else:
        body = rendered_body
    footer = email_footer(appt)
    return f"{body}\n\n{footer}" if footer else body
