from django.conf import settings
from django.http import Http404


def require_dev_tools() -> None:
    """Development-only features answer 404 unless SALON_DEBUG=true."""
    if not settings.SALON_DEV_TOOLS:
        raise Http404
