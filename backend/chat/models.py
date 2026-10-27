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
