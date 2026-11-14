"""Marketing consent: one place that changes it and keeps the append-only record."""

from __future__ import annotations

from marketing.models import ConsentRecord

# Change this when the wording next to the checkbox changes; every record keeps the version the
# customer saw.
VERSION = "2026-11"
TEXT = (
    "Send me occasional emails with offers and suggestions picked from my visits. "
    "I can unsubscribe at any time."
)


def change(profile, opted_in: bool, source: str) -> bool:
    """Sets the profile's consent and records it. Returns True when it actually changed.
    The caller saves the profile (and audits) inside its own transaction."""
    if not profile.set_marketing(opted_in):
        return False
    ConsentRecord.objects.create(
        user_id=profile.user_id, opted_in=opted_in, version=VERSION, source=source
    )
    return True
