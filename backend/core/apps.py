from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Shared pieces: brand config, env helpers, health check."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Core"
