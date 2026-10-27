"""Public website content. Edited by the admin only (admin screens in Task 5; until then the
developer-only Django admin at /django-admin/ when SALON_DEBUG=true)."""

from django.db import models


class SiteContent(models.Model):
    """Keyed JSON blocks: hero, about, contact, hours, social, video, policies."""

    key = models.SlugField(max_length=40, unique=True)
    value = models.JSONField(default=dict, blank=True)
    # Edited-but-not-yet-published version (admin only); null when there is nothing waiting.
    draft = models.JSONField(null=True, blank=True)
    # Unpublished blocks (announcements, Zenotians page) are hidden from the public site.
    is_published = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]
        verbose_name_plural = "site content"

    def __str__(self) -> str:
        return self.key


class Achievement(models.Model):
    label = models.CharField(max_length=80)
    value = models.PositiveIntegerField()
    suffix = models.CharField(max_length=10, blank=True, help_text='For example "+" or "%"')
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "label"]

    def __str__(self) -> str:
        return f"{self.value}{self.suffix} {self.label}"


class Offer(models.Model):
    title = models.CharField(max_length=120)
    description = models.TextField()
    badge = models.CharField(max_length=30, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "title"]

    def __str__(self) -> str:
        return self.title


class KnowledgeEntry(models.Model):
    """FAQ on the website; later also the knowledge base of the chatbot (Task 8)."""

    question = models.CharField(max_length=200)
    answer = models.TextField()
    tags = models.JSONField(default=list, blank=True)
    show_in_faq = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "question"]
        verbose_name_plural = "knowledge entries"

    def __str__(self) -> str:
        return self.question
