from django.apps import AppConfig


class BillingConfig(AppConfig):
    """Invoices, payments, refunds and payroll (later tasks)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "billing"
    verbose_name = "Billing"
