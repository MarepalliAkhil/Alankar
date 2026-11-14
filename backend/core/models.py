import uuid

from django.db import models


class MailOutbox(models.Model):
    """Every email the app sends. Always saved; delivered by SMTP only when it is configured.

    Without SMTP the message is "simulated": it is only shown on the development mailbox.
    """

    class Kind(models.TextChoices):
        INVITE = "invite", "Staff invite"
        PASSWORD_RESET = "password_reset", "Password reset"
        NOTICE = "notice", "Notice"
        PAYMENT_LINK = "payment_link", "Payment link"
        BOOKING = "booking", "Booking update"
        OTP = "otp", "Verification code"
        INVOICE = "invoice", "Invoice and receipt"
        MARKETING = "marketing", "Marketing campaign"
        GIFT_CARD = "gift_card", "Gift card"
        ORDER = "order", "Shop order update"
        TEST = "test", "Test email"

    class Status(models.TextChoices):
        SIMULATED = "simulated", "Simulated (no SMTP configured)"
        QUEUED = "queued", "Queued (sent after the database commit)"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=30, choices=Kind.choices)
    to_email = models.EmailField()
    subject = models.CharField(max_length=200)
    body = models.TextField()
    link = models.URLField(max_length=500, blank=True)
    # Marketing mails: a ready HTML version and List-Unsubscribe headers (one-click unsubscribe).
    html = models.TextField(blank=True, default="")
    headers = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SIMULATED)
    error = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["to_email", "-created_at"], name="mail_to_recent_idx")]

    def __str__(self) -> str:
        return f"{self.subject} -> {self.to_email}"


class DemoExtra(models.Model):
    """A row added by `seed_demo_extras` (docs/START_HERE.md, "Demo extras").

    `key` is stable: "step:<name>" marks a finished step (so a second run adds nothing) and
    "row:<app.model>:<pk>" names one row the command created, so `remove_demo_extras` can delete
    exactly those rows and nothing else.
    """

    key = models.CharField(max_length=200, unique=True)
    label = models.CharField(max_length=100, blank=True)  # app_label.model_name
    object_pk = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.key
