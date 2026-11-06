from django.apps import AppConfig


class ChatConfig(AppConfig):
    """Stylist Chat between a customer and their assigned stylist (later tasks)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "chat"
    verbose_name = "Chat"
