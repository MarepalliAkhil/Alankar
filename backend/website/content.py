from website.models import SiteContent

PUBLIC_KEYS = ("hero", "about", "contact", "hours", "social", "video")
POLICY_PAGES = {
    "privacy": "Privacy notice",
    "terms": "Terms of service",
    "cancellation": "Cancellation policy",
}


def content(key: str, default=None):
    row = SiteContent.objects.filter(key=key).first()
    return row.value if row else default
