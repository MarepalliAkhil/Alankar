from django.apps import AppConfig


class ShopConfig(AppConfig):
    """Online product shop: delivery addresses, orders, their payments and tracking timeline."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "shop"
    verbose_name = "Online shop"
