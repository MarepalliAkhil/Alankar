from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """Products and the stock ledger (later tasks)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"
    verbose_name = "Inventory"
