import uuid

from django.db import models


class MailOutbox(models.Model):
    """Simulated email (v1). Shown on the development mailbox page, never sent."""

    class Kind(models.TextChoices):
        INVITE = "invite", "Staff invite"
        PASSWORD_RESET = "password_reset", "Password reset"
        NOTICE = "notice", "Notice"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=30, choices=Kind.choices)
    to_email = models.EmailField()
    subject = models.CharField(max_length=200)
    body = models.TextField()
    link = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.subject} -> {self.to_email}"
