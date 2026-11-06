"""Admin "Chatbot insights": anonymous unanswered questions, intent usage and a test box.

Nothing here touches user data: the log holds normalized keys and counts only, and the test box
asks the engine as a guest (public information only), without logging or remembering anything.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from chatbot import registry
from chatbot.api import public_reply
from chatbot.engine.engine import MAX_QUERY_CHARS
from chatbot.models import IntentUsage, UnansweredQuestion
from scheduling.models import Service
from website.models import KnowledgeEntry

USAGE_DAYS = 30
FALLBACK_INTENTS = {"unknown"}


def question_row(q: UnansweredQuestion) -> dict:
    return {
        "id": q.pk,
        "key": q.key,
        "count": q.count,
        "first_seen": q.first_seen,
        "last_seen": q.last_seen,
        "status": q.status,
    }


class InsightsView(APIView):
    policy_action = "chatbot.insights.read"

    @extend_schema(summary="Unanswered questions and intent usage for the chatbot", responses=None)
    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status", "open")
        questions = UnansweredQuestion.objects.all()
        if wanted in UnansweredQuestion.Status.values:
            questions = questions.filter(status=wanted)
        since = timezone.localdate() - timedelta(days=USAGE_DAYS - 1)
        usage = (
            IntentUsage.objects.filter(day__gte=since)
            .values("intent")
            .annotate(total=Sum("count"))
            .order_by("-total", "intent")
        )
        rows = [{"intent": u["intent"], "count": u["total"]} for u in usage]
        total = sum(r["count"] for r in rows)
        missed = sum(r["count"] for r in rows if r["intent"] in FALLBACK_INTENTS)
        undescribed = (
            Service.objects.filter(is_active=True, category__is_active=True, description="")
            .select_related("category")
            .order_by("category__division", "name")
        )
        return Response(
            {
                "days": USAGE_DAYS,
                "services_without_description": [
                    {"id": str(sv.id), "name": sv.name, "division": sv.category.division}
                    for sv in undescribed
                ],
                "total_questions": total,
                "unanswered_questions": missed,
                "unanswered": [question_row(q) for q in questions[:100]],
                "usage": rows,
            }
        )


class AddFaqSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=200, trim_whitespace=True)
    answer = serializers.CharField(max_length=2000, trim_whitespace=True)


class AddFaqView(APIView):
    policy_action = "chatbot.insights.manage"

    @extend_schema(summary="Turn an unanswered question into an FAQ", request=AddFaqSerializer)
    def post(self, request: Request, pk: int) -> Response:
        body = AddFaqSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            item = get_object_or_404(UnansweredQuestion.objects.select_for_update(), pk=pk)
            faq = KnowledgeEntry.objects.create(
                question=body.validated_data["question"],
                answer=body.validated_data["answer"],
                tags=[],
                show_in_faq=True,
                is_active=True,
            )
            item.status = UnansweredQuestion.Status.ANSWERED
            item.save(update_fields=["status", "last_seen"])
            audit(
                AuditLog.Action.CHATBOT_QUESTION_HANDLED,
                request=request,
                actor=request.user,
                step="added_as_faq",
                key=item.key,
                faq=faq.question[:80],
            )
        return Response(
            {"question": question_row(item), "faq_id": faq.pk}, status=status.HTTP_201_CREATED
        )


class DismissView(APIView):
    policy_action = "chatbot.insights.manage"

    @extend_schema(summary="Dismiss an unanswered question", request=None)
    def post(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            item = get_object_or_404(UnansweredQuestion.objects.select_for_update(), pk=pk)
            item.status = UnansweredQuestion.Status.DISMISSED
            item.save(update_fields=["status", "last_seen"])
            audit(
                AuditLog.Action.CHATBOT_QUESTION_HANDLED,
                request=request,
                actor=request.user,
                step="dismissed",
                key=item.key,
            )
        return Response(question_row(item))


class TestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=MAX_QUERY_CHARS, trim_whitespace=True)


class TestBoxView(APIView):
    policy_action = "chatbot.insights.test"

    @extend_schema(summary="Try a question as a guest (nothing is logged)", request=TestSerializer)
    def post(self, request: Request) -> Response:
        body = TestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reply = registry.get_engine().answer(body.validated_data["message"], user=None, tools=None)
        return Response(public_reply(reply))
