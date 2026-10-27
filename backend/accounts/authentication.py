from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError

from accounts import work


class CookieJWTAuthentication(JWTAuthentication):
    """Reads the access token from an httpOnly cookie (never from localStorage).

    The user is loaded from the database on every request, so a deactivated account
    (is_active = False) or a changed role takes effect immediately, not only at refresh.
    An invalid or expired cookie is treated as anonymous; protected views then answer 401.
    """

    def authenticate(self, request):
        raw = request.COOKIES.get(settings.SALON_AUTH["ACCESS_COOKIE"])
        if not raw:
            return None
        try:
            validated = self.get_validated_token(raw)
            user = self.get_user(validated)
        except (InvalidToken, TokenError, AuthenticationFailed):
            return None
        if not user.is_active:
            return None
        if not work.enforce(user):
            return None  # a receptionist who went idle (or signed out) must sign in again
        return user, validated

    def authenticate_header(self, request) -> str:
        return 'Cookie realm="api"'
