"""Per-client rate limits for the endpoints that create things or are open to guests.

The limit counts per signed-in user, or per IP address for guests (REMOTE_ADDR only: the
REST_FRAMEWORK NUM_PROXIES setting stops a client from dodging the limit by sending a forged
X-Forwarded-For header). The rates come from SALON_BOOKING_RATE and SALON_PUBLIC_WRITE_RATE.
"""

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


class _PerClient(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        ident = user.pk if user is not None and user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class BookingThrottle(_PerClient):
    scope = "booking"


class PublicWriteThrottle(_PerClient):
    scope = "public_write"


# The general ceilings stay on; the scoped one is added on top.
BOOKING_THROTTLES = [AnonRateThrottle, UserRateThrottle, BookingThrottle]
PUBLIC_WRITE_THROTTLES = [AnonRateThrottle, UserRateThrottle, PublicWriteThrottle]
