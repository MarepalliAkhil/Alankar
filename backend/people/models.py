from django.conf import settings
from django.db import models

from core import crypto
from core.fields import EncryptedTextField

PHONE_CONTEXT = "people.customerprofile.phone"


class CustomerProfile(models.Model):
    """Customer details. The phone number is encrypted at rest; search it via phone_index."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="customer_profile",
    )
    phone = EncryptedTextField(context=PHONE_CONTEXT)
    phone_index = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Customer profile {self.user_id}"

    def set_phone(self, raw: str) -> None:
        normalized = crypto.normalize_phone(raw)
        self.phone = normalized
        self.phone_index = phone_index(normalized)


def phone_index(raw: str) -> str:
    return crypto.blind_index(crypto.normalize_phone(raw), PHONE_CONTEXT)
