"""The customer consent store for the optional language model.

Without a row saying `granted=True` the model is NEVER called for that customer's messages.
(The customer-facing consent screen is built in Prompt 2; this is only the store and the rule.)
"""

from __future__ import annotations

from django.utils import timezone

from air.models import AirConsent

CURRENT_VERSION = 1
# The exact wording shown to the customer. Changing it means a new version number, so an old
# "yes" never counts for new wording.
NOTICE = (
    "Your messages are sent to an AI service to understand your request. "
    "Don't include phone numbers, emails or payment details."
)


def granted(customer) -> bool:
    if customer is None or not getattr(customer, "pk", None):
        return False
    return AirConsent.objects.filter(
        customer=customer, granted=True, version=CURRENT_VERSION
    ).exists()


def grant(customer) -> AirConsent:
    obj, _ = AirConsent.objects.update_or_create(
        customer=customer,
        defaults={
            "granted": True,
            "granted_at": timezone.now(),
            "withdrawn_at": None,
            "version": CURRENT_VERSION,
        },
    )
    return obj


def state(customer) -> dict:
    """What we store: yes or no, when, and which wording version. For the privacy screen."""
    row = AirConsent.objects.filter(customer=customer).first()
    return {
        "granted": bool(row and row.granted and row.version == CURRENT_VERSION),
        "granted_at": row.granted_at if row else None,
        "withdrawn_at": row.withdrawn_at if row else None,
        "version": row.version if row else None,
        "current_version": CURRENT_VERSION,
        "text": NOTICE,
    }


def withdraw(customer) -> None:
    AirConsent.objects.filter(customer=customer).update(granted=False, withdrawn_at=timezone.now())
