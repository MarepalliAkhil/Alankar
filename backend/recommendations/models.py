"""Personal recommendations (see docs/RECOMMENDATIONS.md).

Only booking history, ratings, the catalogue and what the customer tells us (interests, "not
interested") are used. Never gender, age, caste, religion or any other sensitive attribute: the
customer and staff models do not hold them, and the engine reads none of the customer profile's
private fields (phone, allergies, preferences).
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class RecSettings(models.Model):
    """One row (pk=1): the admin's switches."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    enabled = models.BooleanField(default=True)
    rebook_reminders = models.BooleanField(default=True)
    excluded_services = models.ManyToManyField("scheduling.Service", blank=True, related_name="+")
    pinned_offer = models.ForeignKey(
        "website.Offer", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    def __str__(self) -> str:
        return "Recommendation settings"

    @classmethod
    def load(cls) -> RecSettings:
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CustomerPrefs(models.Model):
    """The customer's own choices. Personal recommendations are on by default; the first time the
    dashboard shows them, a one-time notice explains them and offers the switch."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="rec_prefs",
    )
    enabled = models.BooleanField(default=True)
    notice_seen_at = models.DateTimeField(null=True, blank=True)
    interests = models.ManyToManyField("scheduling.ServiceCategory", blank=True, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Recommendation choices of {self.user_id}"


class NotInterested(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rec_not_interested"
    )
    service = models.ForeignKey("scheduling.Service", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "service"], name="rec_not_interested_once")
        ]

    def __str__(self) -> str:
        return f"{self.user_id} not interested in {self.service_id}"


class ServicePair(models.Model):
    """ "Customers who had A also had B": built by `build_recommendations`."""

    source = models.ForeignKey("scheduling.Service", on_delete=models.CASCADE, related_name="+")
    target = models.ForeignKey("scheduling.Service", on_delete=models.CASCADE, related_name="+")
    support = models.PositiveIntegerField()  # customers who had both
    confidence = models.FloatField()  # P(target | source)
    lift = models.FloatField()  # confidence / P(target)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["source", "target"], name="rec_pair_once"),
        ]

    def __str__(self) -> str:
        return f"{self.source_id} -> {self.target_id} (lift {self.lift:.2f})"


class ServiceStat(models.Model):
    service = models.OneToOneField(
        "scheduling.Service", on_delete=models.CASCADE, primary_key=True, related_name="rec_stat"
    )
    bookings_90d = models.PositiveIntegerField(default=0)
    customers = models.PositiveIntegerField(default=0)
    rating_avg = models.FloatField(null=True, blank=True)
    rating_count = models.PositiveIntegerField(default=0)
    typical_gap_days = models.PositiveSmallIntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Stats for {self.service_id}"


class Snapshot(models.Model):
    """One row (pk=1): when the model was built, the quieter times and the offline evaluation."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    built_at = models.DateTimeField(null=True, blank=True)
    visits_used = models.PositiveIntegerField(default=0)
    pairs = models.PositiveIntegerField(default=0)
    quiet_times = models.JSONField(default=list, blank=True)
    evaluation = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return f"Recommendation build {self.built_at}"

    @classmethod
    def load(cls) -> Snapshot:
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class RecEvent(models.Model):
    """What was shown and clicked (no tracking pixels; impressions are counted by the app)."""

    class Kind(models.TextChoices):
        IMPRESSION = "impression", "Shown"
        CLICK = "click", "Clicked"
        DISMISS = "dismiss", "Not interested"

    class Placement(models.TextChoices):
        DASHBOARD = "dashboard", "Dashboard: For you"
        REBOOK = "rebook", "Rebook reminder"
        ADDON = "addon", "Booking: add after"
        AFTERCARE = "aftercare", "Aftercare products"
        CHAT = "chat", "Chat answer"
        EMAIL = "email", "Email"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rec_events"
    )
    kind = models.CharField(max_length=12, choices=Kind.choices)
    placement = models.CharField(max_length=12, choices=Placement.choices)
    service = models.ForeignKey(
        "scheduling.Service", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    product = models.ForeignKey(
        "inventory.Product", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["kind", "placement", "created_at"])]

    def __str__(self) -> str:
        return f"{self.kind} {self.placement} {self.created_at}"


class RebookReminder(models.Model):
    """At most one reminder per customer, service and cycle (the cycle is the last visit's date)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rebook_reminders"
    )
    service = models.ForeignKey("scheduling.Service", on_delete=models.CASCADE, related_name="+")
    cycle = models.DateField()
    sent_at = models.DateTimeField(auto_now_add=True)
    emailed = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "service", "cycle"], name="rec_one_reminder_per_cycle"
            )
        ]

    def __str__(self) -> str:
        return f"Rebook {self.service_id} for {self.user_id} ({self.cycle})"
