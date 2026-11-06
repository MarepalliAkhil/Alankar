"""In-app notifications and simulated text messages.

Nothing here is sent to a real phone: `SimulatedSms` only records that a message would have gone
out, with the number masked, so the demo can show it without ever holding a phone number in the
clear.
"""

import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One in-app message for one person. Only that person can read it."""

    class Kind(models.TextChoices):
        REQUEST_NEW = "request_new", "New booking request"
        REQUEST_REMINDER = "request_reminder", "Reminder: request waiting"
        REQUEST_UPDATE = "request_update", "Request update"
        BOOKING_OUTCOME = "booking_outcome", "Booking outcome"
        SLOT_CHANGE = "slot_change", "Change to your booking"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=600)
    # An in-app path such as /customer/appointments. Never an external address.
    link = models.CharField(max_length=200, blank=True)
    # The booking this is about, so one booking's messages can be found and cleaned up together.
    appointment_id = models.UUIDField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"], name="notif_user_recent_idx")]

    def __str__(self) -> str:
        return f"{self.kind} for {self.user_id}"


class SimulatedSms(models.Model):
    """A text message that would have been sent. The number is kept masked (last 4 digits only)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    to_hint = models.CharField(max_length=20, blank=True)
    body = models.CharField(max_length=480)
    appointment_id = models.UUIDField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"SMS to {self.to_hint or 'unknown'}"
