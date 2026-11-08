"""Who gave the front desk's yes, recorded in ONE place.

The receptionist's Accept button and AIR's desk cover both end up in `record()`, so the two
paths can never drift apart. Customers only ever see the actor type and a ready-made label;
the receptionist's name or id stays in staff views.
"""

from __future__ import annotations

from datetime import datetime

from django.utils import timezone

RECEPTIONIST = "receptionist"
AIR = "air"

# The ONLY wording about who accepted. Emails, texts, bell notifications, the appointments page
# and the chatbot all read these two strings, so they always agree. AIR is never called a person.
LABELS = {
    RECEPTIONIST: "Accepted by our front desk",
    AIR: "Accepted by AIR, our virtual receptionist (the front desk was closed)",
}


def label(actor_type: str) -> str:
    return LABELS.get(actor_type, "")


def record(appt, *, user=None, by_air: bool = False, now: datetime | None = None) -> None:
    """Stamps the front desk's acceptance on `appt` (the caller saves the row). AIR passes
    `by_air=True`; a receptionist (or the admin acting as one) passes `user`."""
    appt.reception_actor = AIR if by_air else RECEPTIONIST
    appt.reception_user = None if by_air else (user if getattr(user, "pk", None) else None)
    appt.reception_accepted_at = now or timezone.now()
