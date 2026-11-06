from django.apps import AppConfig


class WebsiteConfig(AppConfig):
    """Public website content (about, contact, hours, achievements, offers, FAQ, policies)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "website"
    verbose_name = "Website content"
