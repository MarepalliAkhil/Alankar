"""Service catalogue (Task 2a). Rooms, working hours and appointments arrive in Task 2b/3."""

import uuid
from decimal import Decimal

from django.db import models


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
