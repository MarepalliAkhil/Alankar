"""Service catalogue (Task 2a), rooms and appointments (Task 2b). Working hours arrive later."""

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.fields import EncryptedTextField


class Division(models.TextChoices):
    SALON = "salon", "Salon"
    SPA = "spa", "Spa"
    BEAUTY_PARLOR = "beauty-parlor", "Beauty Parlor"


class Audience(models.TextChoices):
    MEN = "men", "Men"
    WOMEN = "women", "Women"
    KIDS = "kids", "Kids"
    UNISEX = "unisex", "Unisex"


class ServiceCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    division = models.CharField(max_length=20, choices=Division.choices, db_index=True)
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=90, unique=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["division", "sort_order", "name"]
        verbose_name_plural = "service categories"

    def __str__(self) -> str:
        return f"{self.get_division_display()} / {self.name}"


class Service(models.Model):
    """Prices are in INR and include GST (shown as "from ₹X incl. GST")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="services")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    summary = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.UNISEX)
    duration_minutes = models.PositiveSmallIntegerField(default=30)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    image_url = models.URLField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__division", "category__sort_order", "sort_order", "name"]

    def __str__(self) -> str:
        return self.name

    def active_variants(self) -> list["ServiceVariant"]:
        return [v for v in self.variants.all() if v.is_active]

    @property
    def from_price(self) -> Decimal:
        variants = self.active_variants()
        return min(v.price for v in variants) if variants else self.price

    @property
    def min_duration(self) -> int:
        variants = self.active_variants()
        return min(v.duration_minutes for v in variants) if variants else self.duration_minutes

    @property
    def max_duration(self) -> int:
        variants = self.active_variants()
        return max(v.duration_minutes for v in variants) if variants else self.duration_minutes


class ServiceVariant(models.Model):
    """E.g. hair length short / medium / long, each with its own price and duration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="variants")
    label = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    duration_minutes = models.PositiveSmallIntegerField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "price"]

    def __str__(self) -> str:
        return f"{self.service.name} – {self.label}"


class ServiceAddon(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="addons")
    label = models.CharField(max_length=80)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    duration_minutes = models.PositiveSmallIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "label"]

    def __str__(self) -> str:
        return f"{self.service.name} + {self.label}"


class Room(models.Model):
    """A chair, bed or room. Managed by admin (Task 5); demo rooms come from seed_demo."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=60, unique=True)
    division = models.CharField(max_length=20, choices=Division.choices, db_index=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["division", "sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class AppointmentStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    AWAITING_PAYMENT = "awaiting_payment", "Awaiting payment"
    SCHEDULED = "scheduled", "Scheduled"
    CHECKED_IN = "checked_in", "Checked in"
    IN_PROGRESS = "in_progress", "In progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    REJECTED = "rejected", "Rejected"
    PAYMENT_EXPIRED = "payment_expired", "Payment expired"
    NO_SHOW = "no_show", "No-show"


# Statuses that hold a stylist's (and room's) time. Requests do not hold time.
BLOCKING_STATUSES = (
    AppointmentStatus.AWAITING_PAYMENT,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
)

NOTES_CONTEXT = "scheduling.appointment.notes"
ALLERGIES_CONTEXT = "scheduling.appointment.allergies"
CONTACT_PHONE_CONTEXT = "scheduling.appointment.contact_phone"


class Appointment(models.Model):
    """One visit. Service, price and duration are snapshots taken when the request is sent."""

    class Source(models.TextChoices):
        ONLINE = "online", "Online"
        WALK_IN = "walk_in", "Walk-in"
        PHONE = "phone", "Phone"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="appointments"
    )
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointments")
    variant = models.ForeignKey(
        ServiceVariant, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    addons = models.ManyToManyField(ServiceAddon, blank=True, related_name="+")
    service_name = models.CharField(max_length=120)
    variant_label = models.CharField(max_length=80, blank=True)
    addon_labels = models.JSONField(default=list, blank=True)
    duration_minutes = models.PositiveSmallIntegerField()
    price_total = models.DecimalField(max_digits=10, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2)
    amount_payable = models.DecimalField(max_digits=10, decimal_places=2)

    preferred_start = models.DateTimeField()
    preferred_stylist = models.ForeignKey(
        "people.StylistProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    stylist = models.ForeignKey(
        "people.StylistProfile",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    room = models.ForeignKey(
        Room, null=True, blank=True, on_delete=models.PROTECT, related_name="appointments"
    )
    start = models.DateTimeField(null=True, blank=True, db_index=True)
    end = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=AppointmentStatus.choices,
        default=AppointmentStatus.REQUESTED,
        db_index=True,
    )
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.ONLINE)
    awaiting_payment_until = models.DateTimeField(null=True, blank=True, db_index=True)

    contact_name = models.CharField(max_length=120)
    contact_email = models.EmailField()
    contact_phone = EncryptedTextField(context=CONTACT_PHONE_CONTEXT, blank=True, default="")
    notes = EncryptedTextField(context=NOTES_CONTEXT, blank=True, default="")
    allergies = EncryptedTextField(context=ALLERGIES_CONTEXT, blank=True, default="")
    policy_accepted_at = models.DateTimeField()

    # Customer flags: they never change the status.
    arrived_at = models.DateTimeField(null=True, blank=True)
    reschedule_requested = models.BooleanField(default=False)
    reschedule_preferred = models.DateTimeField(null=True, blank=True)
    reschedule_note = models.CharField(max_length=300, blank=True)
    cancel_requested = models.BooleanField(default=False)

    reject_reason = models.CharField(max_length=300, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["stylist", "start"]),
            models.Index(fields=["room", "start"]),
        ]

    def __str__(self) -> str:
        return f"{self.service_name} for {self.contact_name} ({self.status})"

    @property
    def when(self):
        """The confirmed start, or the preferred one while it is still a request."""
        return self.start or self.preferred_start


class AppointmentEvent(models.Model):
    """Status history (who moved the appointment, from what, to what)."""

    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    action = models.CharField(max_length=40)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.action}: {self.from_status} -> {self.to_status}"
