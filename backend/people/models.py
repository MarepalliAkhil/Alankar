import uuid

from django.conf import settings
from django.db import models

from core import crypto
from core.fields import EncryptedTextField

PHONE_CONTEXT = "people.customerprofile.phone"
ALLERGIES_CONTEXT = "people.customerprofile.allergies"
PREFERENCES_CONTEXT = "people.customerprofile.preferences"


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
    allergies = EncryptedTextField(context=ALLERGIES_CONTEXT, blank=True, default="")
    preferences = EncryptedTextField(context=PREFERENCES_CONTEXT, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Customer profile {self.user_id}"

    def set_phone(self, raw: str) -> None:
        normalized = crypto.normalize_phone(raw)
        self.phone = normalized
        self.phone_index = phone_index(normalized)


def phone_index(raw: str) -> str:
    return crypto.blind_index(crypto.normalize_phone(raw), PHONE_CONTEXT)


class StylistProfile(models.Model):
    """Public team profile (customer-safe: no phone, no pay, no schedule).

    `user` links the profile to a stylist account (linking arrives with the stylist slice). A
    profile whose linked account is deactivated cannot be booked or assigned.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stylist_profile",
    )
    display_name = models.CharField(max_length=80)
    title = models.CharField(max_length=80)
    specialization = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    photo_url = models.URLField(blank=True)
    divisions = models.JSONField(default=list, blank=True)
    services = models.ManyToManyField(
        "scheduling.Service", blank=True, related_name="stylist_profiles"
    )
    is_public = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "display_name"]

    def __str__(self) -> str:
        return self.display_name
