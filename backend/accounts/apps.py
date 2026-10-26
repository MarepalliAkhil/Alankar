from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """User accounts and roles. Login, invites and audit arrive in Task 1."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Accounts"
