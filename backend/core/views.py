from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core import brand
from core.devtools import require_dev_tools
from core.models import MailOutbox


def database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        return False
    return True


def cache_ok() -> bool:
    """The shared cache (Redis in production) answers a write and a read."""
    from django.core.cache import cache

    try:
        cache.set("health:ping", "1", timeout=10)
        return cache.get("health:ping") == "1"
    except Exception:  # any cache backend error means "unavailable"; no details are returned
        return False


class HealthView(APIView):
    policy_action = "health"
    authentication_classes: list = []

    @extend_schema(
        summary="Health check",
        responses=inline_serializer(
            name="Health",
            fields={
                "status": serializers.CharField(),
                "database": serializers.CharField(),
                "cache": serializers.CharField(),
                "service": serializers.CharField(),
            },
        ),
    )
    def get(self, request: Request) -> Response:
        # Only "ok" / "unavailable" words: never a host name, version, error text or secret.
        db_ok = database_ok()
        c_ok = cache_ok()
        body = {
            "status": "ok" if db_ok and c_ok else "degraded",
            "database": "ok" if db_ok else "unavailable",
            "cache": "ok" if c_ok else "unavailable",
            "service": brand.PLATFORM_NAME,
        }
        code = status.HTTP_200_OK if db_ok and c_ok else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(body, status=code)


class MailOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailOutbox
        fields = [
            "id",
            "kind",
            "to_email",
            "subject",
            "body",
            "link",
            "status",
            "error",
            "created_at",
        ]


class DevMailboxView(APIView):
    """Simulated email outbox. Development only: 404 unless SALON_DEBUG=true."""

    policy_action = "dev.mailbox"
    authentication_classes: list = []

    @extend_schema(summary="Development mailbox", responses=MailOutboxSerializer(many=True))
    def get(self, request: Request) -> Response:
        require_dev_tools()
        messages = MailOutbox.objects.all()[:50]
        return Response(MailOutboxSerializer(messages, many=True).data)
