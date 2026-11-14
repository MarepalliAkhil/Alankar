from django.apps import AppConfig


class RecommendationsConfig(AppConfig):
    """Personal recommendations for customers (deterministic, no language models)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "recommendations"
    verbose_name = "Recommendations"
