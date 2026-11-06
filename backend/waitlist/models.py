"""Waitlist and gap filler (Task 5e-1)."""

import uuid

from django.conf import settings
from django.db import models


class WaitlistEntry(models.Model):
    """A customer asking to be offered a slot that frees up for a service, a stylist (or any) and
    a time window."""

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        OFFERED = "offered", "A slot is being offered"
        BOOKED = "booked", "Booked"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Window passed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="waitlist_entries"
    )
    service = models.ForeignKey("scheduling.Service", on_delete=models.PROTECT, related_name="+")
    variant = models.ForeignKey(
        "scheduling.ServiceVariant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    stylist = models.ForeignKey(
        "people.StylistProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    note = models.CharField(max_length=200, blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.WAITING, db_index=True
    )
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"WaitlistEntry {self.pk}"


class WaitlistOffer(models.Model):
    """A freed slot offered to one waitlisted customer for a short time."""

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for the customer"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Ran out"
        LOST = "lost", "Slot was taken"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(WaitlistEntry, on_delete=models.CASCADE, related_name="offers")
    stylist = models.ForeignKey("people.StylistProfile", on_delete=models.CASCADE, related_name="+")
    room = models.ForeignKey(
        "scheduling.Room", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    start = models.DateTimeField()
    end = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Two people can never hold the same slot at once.
            models.UniqueConstraint(
                fields=["stylist", "start"],
                condition=models.Q(status="pending"),
                name="one_open_offer_per_slot",
            ),
            # One open offer per waitlist entry.
            models.UniqueConstraint(
                fields=["entry"],
                condition=models.Q(status="pending"),
                name="one_open_offer_per_entry",
            ),
        ]

    def __str__(self) -> str:
        return f"WaitlistOffer {self.pk}"
