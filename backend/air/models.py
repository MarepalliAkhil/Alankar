"""AIR (Alankar Intelligence Receptionist): a limited back-office actor that covers the front desk
when no human receptionist is present. Everything here is OFF by default.

Tables: settings (one row), cover state + cover periods, slot holds (with PostgreSQL exclusion
constraints, see migration 0001), the per-request AIR state, the append-only action log, the
customer consent store, and the LLM usage / circuit-breaker counters. No customer names, phone
numbers, emails or raw prompts are stored here.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class AirSettings(models.Model):
    """The single settings row (pk=1). Every switch is OFF by default. Changes are audited."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    master_enabled = models.BooleanField(default=False)  # the optional LLM layer, as a whole
    # "AIR desk cover enabled": AIR may cover the front desk at all. Rule-based, so it has nothing
    # to do with the optional language-model switches. OFF by default, ON in the demo data.
    air_enabled = models.BooleanField(default=False)
    # A receptionist whose page was active this recently counts as present at the desk.
    presence_minutes = models.PositiveSmallIntegerField(
        default=10, validators=[MinValueValidator(1), MaxValueValidator(120)]
    )
    stylist_timeout_minutes = models.PositiveSmallIntegerField(
        default=15, validators=[MinValueValidator(1), MaxValueValidator(240)]
    )
    payment_link_minutes = models.PositiveSmallIntegerField(
        default=45, validators=[MinValueValidator(5), MaxValueValidator(1440)]
    )
    undo_window_minutes = models.PositiveSmallIntegerField(
        default=10, validators=[MinValueValidator(1), MaxValueValidator(120)]
    )
    daily_request_cap = models.PositiveIntegerField(default=200)
    monthly_request_cap = models.PositiveIntegerField(default=3000)
    monthly_spend_cap_rupees = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("500.00")
    )
    cost_per_request_rupees = models.DecimalField(
        max_digits=8, decimal_places=4, default=Decimal("0.5000")
    )
    breaker_failures = models.PositiveSmallIntegerField(default=5)
    breaker_cooldown_seconds = models.PositiveIntegerField(default=300)
    request_timeout_seconds = models.PositiveSmallIntegerField(
        default=8, validators=[MinValueValidator(1), MaxValueValidator(60)]
    )
    retry_limit = models.PositiveSmallIntegerField(default=1, validators=[MaxValueValidator(3)])
    max_order_quantity = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(50)]
    )
    spend_shutoff_month = models.CharField(max_length=7, blank=True)  # "2026-11" when auto-off
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(id=1), name="air_settings_single_row"),
        ]

    def __str__(self) -> str:
        return "AIR settings"


class CoverPeriod(models.Model):
    """One stretch of time in which AIR covered the front desk."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=40)  # off_shift_nobody_in | forced_on
    ended_reason = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["-started_at"], name="air_cover_started_idx")]

    def __str__(self) -> str:
        return f"AIR cover from {self.started_at:%Y-%m-%d %H:%M}"


class CoverState(models.Model):
    """The single row (pk=1) holding the admin's force switch and the open period."""

    class Force(models.TextChoices):
        AUTO = "auto", "Automatic"
        ON = "on", "Forced on"
        OFF = "off", "Forced off"

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    force = models.CharField(max_length=4, choices=Force.choices, default=Force.AUTO)
    force_reason = models.CharField(max_length=200, blank=True)
    forced_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    forced_at = models.DateTimeField(null=True, blank=True)
    open_period = models.ForeignKey(
        CoverPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # The desk-cover sweep (scheduler, lazy runs and the command) leaves its trace here.
    last_sweep_at = models.DateTimeField(null=True, blank=True)
    last_sweep_error = models.CharField(max_length=120, blank=True)  # an error class, no message
    last_sweep_counts = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return f"AIR cover control ({self.force})"


class SlotHold(models.Model):
    """A stylist's time held for one customer from the moment the slot is offered.

    The exclusion constraints in migration 0001 make it impossible (at the database level) for
    two live holds to overlap for the same stylist, or for one customer to hold two overlapping
    times. "Live" means status active or confirmed.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Held"
        CONFIRMED = "confirmed", "Booked (kept while the booking is live)"
        RELEASED = "released", "Released"
        EXPIRED = "expired", "Expired"
        CONSUMED = "consumed", "Finished"

    LIVE = ("active", "confirmed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stylist = models.ForeignKey("people.StylistProfile", on_delete=models.CASCADE, related_name="+")
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    service = models.ForeignKey("scheduling.Service", on_delete=models.CASCADE, related_name="+")
    variant_id = models.UUIDField(null=True, blank=True)
    addon_ids = models.JSONField(default=list, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    request = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="air_holds",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    expires_at = models.DateTimeField()
    session_id = models.CharField(max_length=64, blank=True)
    idempotency_key = models.CharField(max_length=64, blank=True)
    release_reason = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "expires_at"], name="air_hold_due_idx"),
            models.Index(fields=["stylist", "starts_at"], name="air_hold_stylist_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")), name="air_hold_range_valid"
            ),
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="air_hold_idempotency",
            ),
        ]

    def __str__(self) -> str:
        return f"Hold {self.id} ({self.status})"


class AirRequestState(models.Model):
    """AIR's bookkeeping for one booking request it submitted (the row-level claim lives here)."""

    class Handler(models.TextChoices):
        NONE = "", "Not claimed"
        AIR = "air", "AIR"
        HUMAN = "human", "A person"

    appointment = models.OneToOneField(
        "scheduling.Appointment", on_delete=models.CASCADE, related_name="air_state"
    )
    session_id = models.CharField(max_length=64, blank=True)  # empty for a form request
    customer_confirmed_at = models.DateTimeField()
    cover_period = models.ForeignKey(
        CoverPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Where the request came from: the chat, the normal booking form, or another path.
    source = models.CharField(max_length=8, default="chat")
    # When AIR accepted the front-desk side (empty until it does).
    accepted_at = models.DateTimeField(null=True, blank=True)
    handled_by = models.CharField(max_length=5, choices=Handler.choices, blank=True, default="")
    claimed_at = models.DateTimeField(null=True, blank=True)
    handed_to_desk = models.BooleanField(default=False)
    handed_at = models.DateTimeField(null=True, blank=True)
    link_deadline_set = models.BooleanField(default=False)
    link_resends = models.PositiveSmallIntegerField(default=0)
    notified = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"AIR request {self.appointment_id}"


class AppendOnlyQuerySet(models.QuerySet):
    """No bulk edits and no bulk deletes: the AIR log only ever grows."""

    def update(self, **kwargs):
        raise PermissionError("The AIR action log is append-only.")

    def delete(self):
        raise PermissionError("The AIR action log is append-only.")

    def bulk_update(self, objs, fields, batch_size=None):
        raise PermissionError("The AIR action log is append-only.")


class AIActionLog(models.Model):
    """Append-only record of everything AIR did. Rows are never edited or deleted; an undo is a
    NEW row that points at the original. Only allow-listed fields go in before/after, and never
    a raw prompt or raw model output (only a one-way hash of the redacted input)."""

    class Status(models.TextChoices):
        DONE = "done", "Done"
        FAILED = "failed", "Failed"
        HANDED_OFF = "handed_off", "Handed to the desk"
        SKIPPED = "skipped", "Looked at, nothing done"
        UNDONE = "undone", "Undone"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    actor = models.CharField(max_length=8, default="air", editable=False)
    cover_period = models.ForeignKey(
        CoverPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    channel = models.CharField(max_length=8, default="chat")  # chat | voice
    session_id = models.CharField(max_length=64, blank=True)
    action_type = models.CharField(max_length=40)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DONE)
    customer_ref = models.UUIDField(null=True, blank=True)  # the customer's public id only
    booking_ref = models.UUIDField(null=True, blank=True)
    order_ref = models.UUIDField(null=True, blank=True)  # used from Prompt 2
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    reason_code = models.CharField(max_length=40, blank=True)
    reversible_until = models.DateTimeField(null=True, blank=True)
    undo_of = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="undone_by"
    )
    provider = models.CharField(max_length=20, blank=True)
    model = models.CharField(max_length=60, blank=True)
    latency_ms = models.PositiveIntegerField(default=0)
    estimated_cost_rupees = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    input_hash = models.CharField(max_length=64, blank=True)

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"], name="air_log_time_idx"),
            models.Index(fields=["action_type", "-created_at"], name="air_log_action_idx"),
            models.Index(fields=["customer_ref", "-created_at"], name="air_log_customer_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.action_type} ({self.status})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("The AIR action log is append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("The AIR action log is append-only.")


class AirConsent(models.Model):
    """Whether a customer allows their chat message to go to the optional language model. Without
    a row with `granted=True` the model is never called for that customer."""

    customer = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    granted = models.BooleanField(default=False)
    granted_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveSmallIntegerField(default=1)

    def __str__(self) -> str:
        return f"AIR consent {self.customer_id}"


class AiUsage(models.Model):
    """Provider calls made on one day (for the daily / monthly caps and the spending cap)."""

    day = models.DateField(unique=True)
    requests = models.PositiveIntegerField(default=0)
    cost_rupees = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    def __str__(self) -> str:
        return f"AI usage {self.day}"


class ProviderState(models.Model):
    """The single row (pk=1) for the circuit breaker."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    consecutive_failures = models.PositiveSmallIntegerField(default=0)
    open_until = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=60, blank=True)  # an error CLASS name, never a message

    def __str__(self) -> str:
        return "AI provider state"


class CallbackNote(models.Model):
    """A customer asked, in the chat, to talk to a person. The receptionist sees it on the normal
    booking-request screen. The text is fixed wording plus an optional preferred time written by
    the server: the chat itself is never shown to staff."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        DONE = "done", "Done"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    appointment = models.ForeignKey(
        "scheduling.Appointment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=200)
    status = models.CharField(max_length=4, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"], name="air_callback_open_idx")]

    def __str__(self) -> str:
        return f"Callback {self.status} {self.created_at:%Y-%m-%d %H:%M}"


class NeedsYouState(models.Model):
    """A receptionist (or the admin) claimed or resolved one item on the AIR "needs you" list.
    One row per item; the row is locked while it changes, so two people never claim the same
    item. Booking items also take the Prompt 1 request claim (`handover.claim_for_person`)."""

    class Kind(models.TextChoices):
        AWAITING_STYLIST = "awaiting_stylist", "Waiting for the stylist"
        EXPIRED_LINK = "expired_link", "Payment link expired"
        HANDED_TO_DESK = "handed_to_desk", "Handed to the desk"
        CALLBACK = "callback", "Asked to talk to a person"
        REFUND_REQUEST = "refund_request", "Money request handed to the desk"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    ref = models.UUIDField()
    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "ref"], name="air_needs_you_one_row_per_item")
        ]

    def __str__(self) -> str:
        return f"{self.kind} {self.ref}"
