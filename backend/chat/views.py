"""Zen Chat REST API (history, unread cards, send fallback, mark read). Customer and stylist only;
the policy denies every other role, and a thread that is not yours is a plain 404."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from chat import service
from chat.models import Message

PAGE = 100


def thread_or_404(request: Request, pk):
    thread = service.get_thread(request.user, pk)
    if thread is None:
        raise Http404
    return thread


class ThreadListView(APIView):
    policy_action = "chat.threads.list"

    @extend_schema(summary="My conversations as person cards")
    def get(self, request: Request) -> Response:
        service.sync_threads(request.user)
        threads = service.threads_for(request.user).select_related(
            "customer", "stylist", "stylist__user"
        )
        cards = [service.thread_card(t, request.user) for t in threads]
        # A pair whose visit was cancelled and who never wrote has nothing to show.
        return Response({"results": [c for c in cards if c["appointment"] or c["last_message"]]})


class SendSerializer(serializers.Serializer):
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)


class MessagesView(APIView):
    policy_actions = {"GET": "chat.messages.list", "POST": "chat.messages.send"}

    @extend_schema(summary="Recent messages of one conversation")
    def get(self, request: Request, pk) -> Response:
        thread = thread_or_404(request, pk)
        service.broadcast_status(
            thread.id, service.mark_delivered(thread, request.user), "delivered"
        )
        rows = list(
            Message.objects.filter(thread=thread)
            .select_related("appointment")
            .order_by("-created_at")[:PAGE]
        )[::-1]
        st = service.state(thread)
        return Response(
            {
                "thread": service.thread_card(thread, request.user),
                "open": st["open"],
                "closes_at": st["closes_at"],
                "max_length": service.MAX_LENGTH,
                "messages": [service.message_data(m, request.user.id) for m in rows],
            }
        )

    @extend_schema(summary="Send a message (fallback when the live connection is down)")
    def post(self, request: Request, pk) -> Response:
        thread = thread_or_404(request, pk)
        body = SendSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            message = service.send(thread, request.user, body.validated_data["text"])
        except service.ChatError as exc:
            code = {"closed": 409, "rate_limited": 429}.get(exc.code, 400)
            return Response({"detail": exc.message, "code": exc.code}, status=code)
        service.broadcast(
            thread.id, {"type": "chat.message", "message": service.message_payload(message)}
        )
        return Response(
            service.message_data(message, request.user.id), status=status.HTTP_201_CREATED
        )


class ReadView(APIView):
    policy_action = "chat.messages.read"

    @extend_schema(summary="Mark the conversation as read", request=None)
    def post(self, request: Request, pk) -> Response:
        thread = thread_or_404(request, pk)
        ids = service.mark_read(thread, request.user)
        service.broadcast_status(thread.id, ids, "read")
        return Response({"read": len(ids)})
