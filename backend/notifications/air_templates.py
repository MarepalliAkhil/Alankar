"""Customer messages for requests handled by AIR (Alankar Intelligence Receptionist).

Merged into `notifications.templates.TEMPLATES`. AIR messages are honest: a booking is CONFIRMED
ONLY AFTER PAYMENT. Extra placeholders (allowed in `templates.ALLOWED`): {pay_by} when the held
slot ends, {amount} what to pay. AIR's apologies (stylist declined or timed out, payment link
ended) share the wording in `notifications/sorry.py`.
"""

AIR_TEMPLATES: dict[str, dict[str, str]] = {
    "air_received": {
        "title": "We have your booking request",
        "body": (
            "Hi {first_name}, we have your request for {service} on {when}. We are holding the "
            "slot while your stylist answers. Nothing is confirmed until the stylist accepts and "
            "you have paid."
        ),
        "sms": "Hi {first_name}, we have your {service} request for {when}. It is confirmed only after your stylist accepts and you pay.",
        "subject": "we have your booking request",
    },
    "air_stylist_accepted": {
        "title": "Your stylist accepted",
        "body": (
            "Hi {first_name}, {stylist} accepted your {service} on {when}. {reception_sentence} "
            "Your booking is confirmed only after payment, so please use the payment link we "
            "send next."
        ),
        "sms": "Hi {first_name}, {stylist} accepted your {service} on {when}. It is confirmed only after you pay.",
        "subject": "your stylist accepted",
    },
    "air_link_sent": {
        "title": "Pay to confirm your booking",
        "body": (
            "Hi {first_name}, your slot for {service} on {when} is held until {pay_by}. Pay "
            "Rs. {amount} with the link we emailed. Your booking is confirmed only after payment."
        ),
        "sms": "Hi {first_name}, your {service} slot is held until {pay_by}. Pay Rs. {amount} using the emailed link; it is confirmed only after payment.",
        "subject": "pay to confirm your booking",
    },
    "air_paid": {
        "title": "Payment received: booking confirmed",
        "body": (
            "Hi {first_name}, we received your payment. Your {service} with {stylist} on "
            "{when} is now confirmed."
        ),
        "sms": "Hi {first_name}, payment received. Your {service} on {when} is now confirmed.",
        "subject": "payment received, booking confirmed",
    },
    "air_confirmed_free": {
        "title": "Your booking is confirmed",
        "body": (
            "Hi {first_name}, your {service} with {stylist} on {when} is confirmed. Nothing "
            "needs to be paid online."
        ),
        "sms": "Hi {first_name}, your {service} on {when} is confirmed. Nothing to pay online.",
        "subject": "your booking is confirmed",
    },
}
