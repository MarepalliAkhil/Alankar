from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """In-app notifications and the simulated text messages (Task 13)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
    verbose_name = "Notifications"
