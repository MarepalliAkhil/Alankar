import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from core import crypto
from core.fields import EncryptedTextField

PHONE_CONTEXT = "people.customerprofile.phone"
ALLERGIES_CONTEXT = "people.customerprofile.allergies"
PREFERENCES_CONTEXT = "people.customerprofile.preferences"
NOTE_CONTEXT = "people.customernote.body"


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
    # Marketing consent: off unless the customer ticks it; the date records the last change.
    marketing_opt_in = models.BooleanField(default=False)
    marketing_opt_changed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Customer profile {self.user_id}"

    def set_marketing(self, value: bool) -> bool:
        """Record a consent change; returns True when the value actually changed."""
        if value == self.marketing_opt_in:
            return False
        self.marketing_opt_in = value
        self.marketing_opt_changed_at = timezone.now()
        return True

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
    # Weekday (mon..sun) -> [start, end] or null for a day off. Empty means the salon's hours.
    # Admin edits it in Task 5/6; the booking engine uses it from then on.
    weekly_hours = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["sort_order", "display_name"]

    def __str__(self) -> str:
        return self.display_name


RATING_TAGS = ("Late", "Rushed", "Not as requested", "Hygiene")


class Rating(models.Model):
    """The customer's rating of the stylist for one completed, paid visit.

    A pending rating is created when the visit is billed. It is filled in once by the customer
    and is immutable afterwards. Nobody else (stylist, receptionist, admin) can edit or delete it.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for the customer"
        SUBMITTED = "submitted", "Rated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(
        "scheduling.Appointment", on_delete=models.PROTECT, related_name="rating"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ratings"
    )
    stylist = models.ForeignKey(
        StylistProfile, null=True, on_delete=models.SET_NULL, related_name="ratings"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    stars = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(stars__isnull=True) | models.Q(stars__gte=1, stars__lte=5),
                name="rating_stars_1_to_5",
            )
        ]

    def __str__(self) -> str:
        return f"Rating {self.status} for {self.appointment_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            before = Rating.objects.filter(pk=self.pk).values_list("status", flat=True).first()
            if before == self.Status.SUBMITTED:
                raise ValueError("A submitted rating cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Ratings cannot be deleted.")


class CustomerNote(models.Model):
    """A private note about a customer, encrypted at rest.

    `audience` says who may read it. Front-desk notes are shared by the receptionist and the
    admin. Notes meant for the stylist only (written in the stylist slice) are never returned by
    the desk API, and the customer never sees any note.
    """

    class Audience(models.TextChoices):
        DESK = "desk", "Front desk"
        STYLIST = "stylist", "Stylist only"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_notes"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.DESK)
    body = EncryptedTextField(context=NOTE_CONTEXT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Note for {self.customer_id}"


class LoyaltyEntry(models.Model):
    """Loyalty points ledger: positive = earned, negative = redeemed. Never edited."""

    class Reason(models.TextChoices):
        EARNED = "earned", "Earned on a visit"
        REDEEMED = "redeemed", "Used at checkout"
        REFUND = "refund", "Adjusted by a refund"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="loyalty_entries"
    )
    points = models.IntegerField()
    reason = models.CharField(max_length=10, choices=Reason.choices)
    invoice = models.ForeignKey(
        "billing.Invoice", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.points:+d} points ({self.reason})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A loyalty entry cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("A loyalty entry cannot be deleted.")


class DayOffRequest(models.Model):
    """A stylist asks for days off. The admin decides in Task 6."""

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for the admin"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stylist = models.ForeignKey(StylistProfile, on_delete=models.CASCADE, related_name="days_off")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("start_date")), name="dayoff_dates_order"
            )
        ]

    def __str__(self) -> str:
        return f"{self.stylist_id} {self.start_date}..{self.end_date} ({self.status})"


class DataRequest(models.Model):
    """A customer's request to download their data or to have their account deleted.

    The admin decides. An approved export can be downloaded by the customer for a limited time
    (the data is built fresh from the database, never stored). An approved deletion anonymizes the
    account: invoices stay (they are immutable) but carry no personal details.
    """

    class Kind(models.TextChoices):
        EXPORT = "export", "Download my data"
        DELETE = "delete", "Delete my account"

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for the admin"
        COMPLETED = "completed", "Done"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled by the customer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="data_requests"
    )
    # Kept after anonymizing, so the admin can still see who asked (never the email address).
    customer_label = models.CharField(max_length=120, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "kind"],
                condition=models.Q(status="pending"),
                name="one_pending_request_per_kind",
            )
        ]

    def __str__(self) -> str:
        return f"{self.kind} request ({self.status})"
