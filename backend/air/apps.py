from django.apps import AppConfig


class AirConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "air"
    verbose_name = "AIR (Alankar Intelligence Receptionist)"

    def ready(self) -> None:
        from air import signals  # noqa: F401
