"""Session cookies, one-time link tokens and refresh-token revocation."""

import hashlib
import secrets

from django.conf import settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


def new_link_token() -> tuple[str, str]:
    """Returns (token for the link, sha256 hash to store). Only the hash is saved."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cookie_kwargs(path: str, max_age: int) -> dict:
    conf = settings.SALON_AUTH
    return {
        "max_age": max_age,
        "path": path,
        "httponly": True,
        "secure": conf["COOKIE_SECURE"],
        "samesite": conf["COOKIE_SAMESITE"],
    }


def set_session_cookies(response, refresh: RefreshToken) -> None:
    conf = settings.SALON_AUTH
    jwt = settings.SIMPLE_JWT
    response.set_cookie(
        conf["ACCESS_COOKIE"],
        str(refresh.access_token),
        **_cookie_kwargs(
            conf["ACCESS_COOKIE_PATH"], int(jwt["ACCESS_TOKEN_LIFETIME"].total_seconds())
        ),
    )
    response.set_cookie(
        conf["REFRESH_COOKIE"],
        str(refresh),
        **_cookie_kwargs(
            conf["REFRESH_COOKIE_PATH"], int(jwt["REFRESH_TOKEN_LIFETIME"].total_seconds())
        ),
    )


def clear_session_cookies(response) -> None:
    conf = settings.SALON_AUTH
    response.delete_cookie(
        conf["ACCESS_COOKIE"], path=conf["ACCESS_COOKIE_PATH"], samesite=conf["COOKIE_SAMESITE"]
    )
    response.delete_cookie(
        conf["REFRESH_COOKIE"], path=conf["REFRESH_COOKIE_PATH"], samesite=conf["COOKIE_SAMESITE"]
    )


def revoke_all_refresh_tokens(user) -> int:
    """Blacklists every outstanding refresh token of the user (deactivation, password reset)."""
    count = 0
    for token in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        count += int(created)
    return count
