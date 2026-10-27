"""ASGI entry point (HTTP + WebSockets via Channels / Daphne)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from django.urls import re_path  # noqa: E402

from chat.consumers import ChatConsumer  # noqa: E402

# WebSocket routes. They live under /api/ so the httpOnly sign-in cookie (path /api/) is sent.
# Every route here must be listed in shared/policy.json under "websocket" (a test checks it).
websocket_urlpatterns = [
    re_path(r"^api/ws/chat/(?P<thread_id>[0-9a-f-]{36})/$", ChatConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(URLRouter(websocket_urlpatterns)),
    }
)
