from django.http import Http404

from core.mail import links_enabled


def require_dev_tools() -> None:
    """Development-only features answer 404 unless SALON_DEBUG=true."""
    from django.conf import settings

    if not settings.SALON_DEV_TOOLS:
        raise Http404


def require_links_enabled() -> None:
    """Emailed links (invites) work in debug mode or when real email (SMTP) is configured."""
    if not links_enabled():
        raise Http404
