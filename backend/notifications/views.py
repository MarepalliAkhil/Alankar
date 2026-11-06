from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import Notification

MAX_LIST = 50


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "created_at", "read_at"]


class NotificationListView(APIView):
    """Only the signed-in person's own notifications."""

    policy_action = "notifications.list"

    @extend_schema(summary="My notifications (newest first) and how many are unread")
    def get(self, request: Request) -> Response:
        mine = Notification.objects.filter(user=request.user)
        return Response(
            {
                "unread": mine.filter(read_at__isnull=True).count(),
                "results": NotificationSerializer(mine[:MAX_LIST], many=True).data,
            }
        )


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True, max_length=MAX_LIST
    )


class NotificationReadView(APIView):
    policy_action = "notifications.mark_read"

    @extend_schema(
        summary="Mark my notifications as read (all, or the ids given)", request=MarkReadSerializer
    )
    def post(self, request: Request) -> Response:
        body = MarkReadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        qs = Notification.objects.filter(user=request.user, read_at__isnull=True)
        ids = body.validated_data.get("ids")
        if ids:
            qs = qs.filter(pk__in=ids)
        qs.update(read_at=timezone.now())
        remaining = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return Response({"unread": remaining}, status=status.HTTP_200_OK)
