from django.apps import AppConfig


class MarketingConfig(AppConfig):
    """Campaigns, coupons and offers (later tasks)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "marketing"
    verbose_name = "Marketing"
