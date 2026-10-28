from django.apps import AppConfig


class ChatbotConfig(AppConfig):
    """AI Alankar Intelligence: the deterministic website assistant (no LLMs, no external APIs)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "chatbot"
    verbose_name = "AI Alankar Intelligence"

    def ready(self) -> None:
        from chatbot import registry

        registry.connect_signals()
