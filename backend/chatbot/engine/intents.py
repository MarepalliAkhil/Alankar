"""Intent definitions. Each intent = weighted keywords (canonical words) + optional phrases.
Admin/developer editable. Words are stemmed at load time."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Intent:
    name: str
    keywords: dict[str, float]
    phrases: list[tuple[str, float]] = field(default_factory=list)  # (canonical phrase, bonus)
    personal: bool = False  # reads the logged-in user's own data
    max_tokens: int | None = None  # only valid for short messages (greetings etc.)
    entity_boost: dict[str, float] = field(default_factory=dict)
    requires: list[str] = field(default_factory=list)  # at least one of these words must be present
    excludes: list[str] = field(
        default_factory=list
    )  # intent is skipped if any of these is present
    howto_penalty: float = (
        1.0  # multiply score when the question starts like "how do I..." (process, not data)
    )
    template: str = ""  # canonical rephrased question
    chips: list[str] = field(default_factory=list)


INTENTS: list[Intent] = [
    Intent("greeting", {"hello": 3}, max_tokens=4, template="Hello"),
    Intent("thanks", {"thanks": 3}, max_tokens=5, template="Thank you"),
    Intent("bye", {"bye": 3}, max_tokens=4, template="Goodbye"),
    Intent(
        "shop_info",
        {
            "alankar": 3,
            "about": 2,
            "shop": 1,
            "story": 3,
            "achievement": 2,
            "unisex": 1.5,
            "experience": 1,
        },
        template="What is {shop} and what does it offer?",
        chips=["Our services", "Opening hours", "Where are you located?"],
    ),
    Intent(
        "hours",
        {
            "hours": 3,
            "open": 2,
            "close": 2,
            "closing": 2,
            "sunday": 1,
            "saturday": 1,
            "holiday": 1,
            "weekend": 1,
        },
        phrases=[("what time", 1)],
        template="What are the opening hours?",
    ),
    Intent(
        "location",
        {"location": 3, "where": 1.5, "near": 1, "nearby": 1, "reach": 1.5, "parking": 1.5},
        phrases=[("how reach", 2), ("where shop", 2), ("where located", 2)],
        template="Where is the shop located?",
    ),
    Intent(
        "contact",
        {"contact": 3, "email": 3, "number": 1.5},
        template="How can I contact the salon?",
    ),
    Intent(
        "services_list",
        {"service": 2.5, "menu": 2, "provide": 1.5, "list": 1},
        phrases=[("what service", 1.5), ("which service", 1.5), ("service offer", 1.5)],
        entity_boost={"division": 1, "gender": 0.5},
        template="Which services are available{scope}?",
        chips=["Salon services", "Spa services", "Beauty Parlor services"],
    ),
    Intent(
        "service_price",
        {"price": 3, "rate": 2, "rupees": 1, "budget": 1, "cheap": 1, "affordable": 1},
        entity_boost={"service": 1, "division": 0.5, "gender": 0.5},
        template="What is the price of {what}?",
    ),
    Intent(
        "service_duration",
        {"duration": 3, "minute": 1, "take": 0.5, "time": 1.5},
        entity_boost={"service": 1},
        template="How long does {what} take?",
    ),
    Intent(
        "recommend",
        {
            "recommend": 3,
            "suggest": 3,
            "best": 2,
            "good": 1,
            "suitable": 2,
            "ideal": 2,
            "which": 0.5,
        },
        phrases=[("service best", 5)],
        entity_boost={"gender": 0.5, "division": 0.5},
        template="Which service do you recommend{scope}?",
    ),
    Intent(
        "stylist_info",
        {
            "stylist": 3,
            "expert": 2,
            "team": 3,
            "who": 1.5,
            "specialist": 2,
            "specialization": 2,
            "available": 0.5,
        },
        phrases=[("best stylist", 2)],
        entity_boost={"division": 0.5, "stylist": 1},
        template="Who are the stylists{scope}?",
    ),
    Intent(
        "booking_howto",
        {
            "book": 3,
            "appointment": 1.5,
            "slot": 1.5,
            "tomorrow": 1.5,
            "how": 1,
            "available": 0.5,
        },
        excludes=["cancel", "reschedule", "refund", "previous", "past", "history", "next"],
        phrases=[("how book", 2), ("want book", 1.5)],
        template="How do I book an appointment?",
        chips=["How do I pay?", "Cancellation policy", "Our services"],
    ),
    Intent(
        "payment_howto",
        {
            "pay": 3,
            "accept": 1.5,
            "payment": 2.5,
            "method": 2,
            "upi": 2,
            "card": 1.5,
            "online": 1.5,
            "cash": 1.5,
            "how": 0.5,
        },
        template="How do I pay for my appointment?",
    ),
    Intent(
        "payment_link",
        {
            "link": 3,
            "payment": 1.5,
            "pay": 1,
            "receive": 1.5,
            "expire": 2.5,
            "resend": 3,
            "email": 1.5,
            "spam": 2,
            "send": 1,
            "awaiting": 2,
            "pending": 1.5,
        },
        phrases=[("pay link", 3)],
        template="Where is my payment link or why did it expire?",
    ),
    Intent(
        "cancel_info",
        {"cancel": 3, "policy": 1.5, "free": 1, "window": 1.5},
        phrases=[("cancel appointment", 2), ("cancel book", 2)],
        template="How do I cancel an appointment and what is the policy?",
    ),
    Intent(
        "reschedule_info",
        {"reschedule": 3, "change": 1, "date": 0.5, "another": 0.5},
        phrases=[("change appointment", 5), ("change time", 4), ("reschedule appointment", 3)],
        template="How do I change my appointment time?",
    ),
    Intent(
        "refund_info",
        {"refund": 3, "return": 1, "money": 1},
        phrases=[("refund cancel", 3), ("money return", 3)],
        template="How do refunds work?",
    ),
    Intent(
        "rating_info",
        {
            "rating": 3,
            "review": 3,
            "feedback": 3,
            "mandatory": 2,
            "star": 2,
            "compulsory": 2,
            "rate": 1.5,
        },
        phrases=[("rate stylist", 5)],
        template="Why do I have to rate my stylist?",
    ),
    Intent(
        "chat_howto",
        {"chat": 3, "message": 2, "talk": 2, "text": 1.5},
        phrases=[("chat stylist", 3), ("talk stylist", 3), ("message stylist", 3)],
        template="How do I chat with my stylist?",
    ),
    Intent(
        "login_help",
        {"login": 3, "password": 3, "otp": 3, "forgot": 2, "locked": 2, "account": 1},
        template="I need help logging in.",
    ),
    Intent(
        "register_help",
        {"register": 3, "account": 1, "create": 1.5, "new": 0.5},
        template="How do I create an account?",
    ),
    Intent(
        "offers",
        {"offer": 3, "package": 1.5, "membership": 1.5, "giftcard": 2},
        template="What offers, packages or memberships are available?",
    ),
    Intent(
        "loyalty_info",
        {"loyalty": 3, "point": 3, "earn": 2, "redeem": 2, "work": 1, "use": 1.5},
        template="How do loyalty points work?",
    ),
    # ---- personal intents (use the logged-in user's own data) ----
    Intent(
        "my_loyalty",
        {"loyalty": 1.5, "point": 1.5, "balance": 2, "have": 1},
        phrases=[("how many point", 4), ("point balance", 4), ("my point", 2)],
        personal=True,
        howto_penalty=0.5,
        template="How many loyalty points do I have?",
    ),
    Intent(
        "my_next_appointment",
        {"next": 3, "appointment": 1.5, "when": 1, "book": 1},
        phrases=[("when appointment", 2)],
        personal=True,
        requires=["next", "when"],
        excludes=["cancel", "reschedule", "refund"],
        template="When is my next appointment?",
    ),
    Intent(
        "my_appointments",
        {
            "appointment": 1.5,
            "upcoming": 2.5,
            "status": 2,
            "list": 1,
            "show": 1,
            "view": 1,
            "all": 0.5,
        },
        personal=True,
        excludes=[
            "history",
            "past",
            "previous",
            "last",
            "earlier",
            "next",
            "cancel",
            "reschedule",
            "refund",
        ],
        template="Show my appointments.",
    ),
    Intent(
        "my_history",
        {
            "history": 3,
            "past": 2.5,
            "previous": 2.5,
            "last": 2.5,
            "earlier": 1.5,
            "appointment": 0.5,
            "book": 0.5,
        },
        personal=True,
        requires=["history", "past", "previous", "last", "earlier"],
        template="Show my past appointments.",
    ),
    Intent(
        "my_invoices",
        {"invoice": 3, "spent": 2, "history": 1},
        personal=True,
        template="Show my invoices.",
    ),
]

INTENTS += [
    Intent(
        "my_packages",
        {"package": 2.5, "session": 2, "remaining": 2, "left": 1.5, "balance": 1},
        personal=True,
        howto_penalty=0.5,
        requires=["package"],
        template="How many package sessions do I have left?",
    ),
    Intent(
        "my_membership",
        {"membership": 3, "plan": 1, "member": 2, "renew": 1.5, "expire": 1},
        personal=True,
        howto_penalty=0.5,
        requires=["membership", "member"],
        template="What is my membership status?",
    ),
    Intent(
        "my_giftcard",
        {"giftcard": 3, "balance": 2, "voucher": 1},
        personal=True,
        howto_penalty=0.5,
        requires=["giftcard"],
        template="What is my gift card balance?",
    ),
]

INTENTS.append(
    Intent(
        "service_details",
        {
            "detail": 3,
            "explain": 3,
            "describe": 3,
            "include": 2,
            "about": 1.5,
            "suitable": 2,
            "ideal": 2,
            "good": 1.5,
            "suit": 2,
            "safe": 1.5,
        },
        entity_boost={"service": 1.5},
        excludes=["stylist", "expert", "team"],
        template="Tell me about {what}",
    )
)

INTENT_TO_KB = {
    "shop_info": "what_is_alankar",
    "hours": "hours",
    "location": "location",
    "contact": "contact",
    "booking_howto": "how_to_book",
    "payment_howto": "payment_howto",
    "payment_link": "payment_link",
    "cancel_info": "cancellation_policy",
    "reschedule_info": "reschedule_info",
    "refund_info": "refund_policy",
    "rating_info": "rating_info",
    "chat_howto": "chat_howto",
    "login_help": "login_help",
    "register_help": "register_help",
    "offers": "offers",
    "loyalty_info": "loyalty_info",
}
