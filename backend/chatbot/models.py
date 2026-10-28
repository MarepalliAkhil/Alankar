"""Anonymous counters for the admin's Chatbot insights. No user, no session, no raw message."""

from django.db import models


class UnansweredQuestion(models.Model):
    """A question the bot could not answer, as its normalized, anonymous key, with a count."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ANSWERED = "answered", "Added as an FAQ"
        DISMISSED = "dismissed", "Dismissed"

    key = models.CharField(max_length=120, unique=True)
    count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ["-count", "-last_seen"]

    def __str__(self) -> str:
        return self.key


class IntentUsage(models.Model):
    """How often each intent (or knowledge answer) was used on a day."""

    day = models.DateField(db_index=True)
    intent = models.CharField(max_length=60)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["day", "intent"], name="uniq_intent_day")]
        ordering = ["-day", "intent"]

    def __str__(self) -> str:
        return f"{self.day} {self.intent}: {self.count}"
