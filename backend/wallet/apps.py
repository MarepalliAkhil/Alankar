from django.apps import AppConfig


class WalletConfig(AppConfig):
    """Packages, memberships and gift cards, and the sales that pay for them."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "wallet"
    verbose_name = "Packages, memberships and gift cards"
