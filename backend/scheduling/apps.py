from django.apps import AppConfig


class SchedulingConfig(AppConfig):
    """Services, rooms, working hours and appointments (later tasks)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "scheduling"
    verbose_name = "Scheduling"
