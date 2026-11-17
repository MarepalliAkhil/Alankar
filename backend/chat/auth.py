"""WebSocket sign-in: the same httpOnly access cookie as the REST API, or (when the socket is on
another host than the site) a 30-second single-use ticket from /api/ws-ticket/ (chat/tickets.py).

The cookie path is /api/, so the socket lives under /api/ws/. The browser's Origin is checked by
AllowedHostsOriginValidator in config.asgi; this module only loads the user from the cookie."""

from http.cookies import SimpleCookie

from channels.db import database_sync_to_async
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError


def cookie_value(scope, name: str) -> str | None:
    for key, value in scope.get("headers", []):
        if key == b"cookie":
            jar = SimpleCookie()
            jar.load(value.decode("latin-1"))
            morsel = jar.get(name)
            return morsel.value if morsel else None
    return None


@database_sync_to_async
def user_from_cookie(scope):
    raw = cookie_value(scope, settings.SALON_AUTH["ACCESS_COOKIE"])
    if not raw:
        return None
    auth = JWTAuthentication()
    try:
        user = auth.get_user(auth.get_validated_token(raw))
    except (InvalidToken, TokenError, AuthenticationFailed):
        return None
    return user if user.is_active else None


def query_value(scope, name: str) -> str | None:
    from urllib.parse import parse_qs

    raw = scope.get("query_string", b"").decode("latin-1")
    values = parse_qs(raw).get(name)
    return values[0] if values else None


@database_sync_to_async
def user_from_ticket(scope):
    """The user of a single-use ticket from GET /api/ws-ticket/ (chat/tickets.py), or None."""
    from django.contrib.auth import get_user_model

    from chat import tickets

    if not getattr(settings, "SALON_WS_TICKETS", True):
        return None
    user_id = tickets.redeem(query_value(scope, "ticket"))
    if user_id is None:
        return None
    user = get_user_model().objects.filter(pk=user_id).first()
    return user if user is not None and user.is_active else None


async def socket_user(scope):
    """A ticket when the URL carries one (free mode: the socket is on another host), else the
    sign-in cookie (same-domain setups: local, Docker, Azure)."""
    if query_value(scope, "ticket"):
        return await user_from_ticket(scope)
    return await user_from_cookie(scope)
