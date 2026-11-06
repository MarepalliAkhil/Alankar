"""Zen Chat: one thread per customer-stylist pair. Message text is encrypted at rest with a key
derived per thread (core.crypto.thread_key); nothing outside this app reads it."""

import uuid

from django.conf import settings
from django.db import models

from core import crypto


class Thread(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_threads"
    )
    stylist = models.ForeignKey(
        "people.StylistProfile", on_delete=models.CASCADE, related_name="chat_threads"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["customer", "stylist"], name="chat_one_thread_per_pair")
        ]

    def __str__(self) -> str:
        return f"Thread {self.id}"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # "text", or "image" (the caption, if any, is the encrypted text; the photo is a ChatImage).
    kind = models.CharField(max_length=10, default="text")
    body_enc = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["thread", "created_at"])]

    def __str__(self) -> str:
        return f"Message {self.id}"

    @property
    def text(self) -> str:
        return crypto.decrypt_for_thread(str(self.thread_id), self.body_enc)

    def set_text(self, value: str) -> None:
        self.body_enc = crypto.encrypt_for_thread(str(self.thread_id), value)

    @property
    def status(self) -> str:
        if self.read_at:
            return "read"
        return "delivered" if self.delivered_at else "sent"


class ChatImage(models.Model):
    """One photo in a conversation. The bytes (original and 480 px thumbnail) are stored encrypted
    in this row and wiped (set to NULL) when the sender deletes the photo or the retention job
    runs. Nothing here is ever served from a public URL or named by the user."""

    class Tag(models.TextChoices):
        STYLE_REFERENCE = "style_reference", "Style reference"
        CURRENT_HAIR = "current_hair", "Current hair"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.OneToOneField(Message, on_delete=models.CASCADE, related_name="image")
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="images")
    tag = models.CharField(max_length=20, choices=Tag.choices, default=Tag.OTHER)
    mime = models.CharField(max_length=20)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size = models.PositiveIntegerField(default=0)
    original_enc = models.BinaryField(null=True, blank=True)
    thumb_enc = models.BinaryField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    # "sender" (the person who sent it deleted it) or "retention" (the clean-up job).
    deleted_by = models.CharField(max_length=12, blank=True, default="")

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["thread", "created_at"])]

    def __str__(self) -> str:
        return f"Photo {self.id}"

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
