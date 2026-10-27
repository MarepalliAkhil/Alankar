"""WebSocket sign-in: the same httpOnly access cookie as the REST API (never a token in the URL).

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
