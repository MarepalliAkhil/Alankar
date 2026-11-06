"""POST /api/chatbot/ask/: the public question endpoint (guests and customers only)."""

from __future__ import annotations

import re
import uuid

from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import client_ip
from accounts.models import User
from chatbot import logging as chat_log
from chatbot import registry
from chatbot.engine import Session
from chatbot.engine.engine import MAX_QUERY_CHARS
from chatbot.tools import UserTools

RATE_LIMIT = 20  # questions ...
RATE_WINDOW = 60  # ... per minute, per signed-in user or per IP address
SESSION_SECONDS = 30 * 60
SESSION_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class AskSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=MAX_QUERY_CHARS, trim_whitespace=True)
    session_id = serializers.CharField(max_length=64, required=False, allow_blank=True)


def _who(request: Request) -> str:
    user = request.user
    return f"u{user.pk}" if user.is_authenticated else f"ip{client_ip(request) or 'unknown'}"


def over_limit(who: str) -> bool:
    """A fixed one-minute window; the counter lives in the cache and holds no message text."""
    key = f"chatbot:rate:{who}"
    cache.add(key, 0, RATE_WINDOW)
    try:
        used = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, RATE_WINDOW)
        used = 1
    return used > RATE_LIMIT


def public_reply(reply) -> dict:
    """Only what the widget needs. The unanswered key never leaves the server."""
    return {
        "text": reply.text,
        "intent": reply.intent,
        "rephrased": reply.rephrased,
        "show_rephrase": reply.show_rephrase,
        "actions": reply.actions,
        "suggestions": reply.suggestions,
        "needs_login": reply.needs_login,
        "source": reply.source,
    }


class AskView(APIView):
    policy_action = "chatbot.ask"

    @extend_schema(summary="Ask AI Alankar Intelligence a question", request=AskSerializer)
    def post(self, request: Request) -> Response:
        user = request.user if request.user.is_authenticated else None
        # Staff accounts use their own screens: the assistant is for guests and customers.
        if user is not None and user.role != User.Role.CUSTOMER:
            return Response({"detail": "This assistant is for guests and customers."}, status=403)
        body = AskSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        who = _who(request)
        if over_limit(who):
            return Response(
                {"detail": "You are asking quickly. Please wait a minute and try again."},
                status=429,
                headers={"Retry-After": str(RATE_WINDOW)},
            )
        supplied = body.validated_data.get("session_id") or ""
        session_id = supplied if SESSION_ID.match(supplied) else str(uuid.uuid4())
        session_key = f"chatbot:session:{who}:{session_id}"
        session = cache.get(session_key) or Session()

        engine = registry.get_engine()
        reply = engine.answer(
            body.validated_data["message"],
            user={"id": str(user.pk), "name": user.full_name} if user else None,
            tools=UserTools(user) if user else None,
            session=session,
        )
        cache.set(session_key, session, SESSION_SECONDS)
        chat_log.record_usage(reply.intent)
        if reply.intent == "unknown" and not chat_log.looks_personal(
            body.validated_data["message"]
        ):
            chat_log.record_unanswered(reply.unanswered_key)
        return Response({"session_id": session_id, "reply": public_reply(reply)})
