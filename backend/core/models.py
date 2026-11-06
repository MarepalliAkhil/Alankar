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
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SIMULATED)
    error = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["to_email", "-created_at"], name="mail_to_recent_idx")]

    def __str__(self) -> str:
        return f"{self.subject} -> {self.to_email}"
