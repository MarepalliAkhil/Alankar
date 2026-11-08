"""AIR activity for the receptionist and the admin (Task 3): statistics, the activity table,
the needs-you list (claim / resolve), Undo of AIR's own reversible actions, the masked phone
reveal, and the popup briefing. Customers, stylists and guests are refused by the role policy.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from air import briefing, config, cover, needs, service, stats
from air.actor import AirDenied
from air.llm import usage
from air.models import AiUsage, NeedsYouState

AUDIT_UNDO = "air_action_undone_by_staff"
AUDIT_PHONE = "air_phone_revealed"


def _window(request: Request):
    key = request.query_params.get("range") or "since_last"
    return stats.window_for(key, request.user)


class StatsView(APIView):
    policy_action = "air.desk.stats"

    @extend_schema(
        summary="AIR statistics for a range, with the period before it",
        parameters=[OpenApiParameter("range", str, description="since_last, today, 7d or 30d")],
    )
    def get(self, request: Request) -> Response:
        try:
            w = _window(request)
        except stats.StatsError as exc:
            return Response({"detail": str(exc)}, status=400)
        data = stats.build(w)
        state = cover.status()
        data["cover"] = {"active": state["active"], "since": state["since"]}
        return Response(data)


class ActivityView(APIView):
    policy_action = "air.desk.activity"

    @extend_schema(
        summary="What AIR did, newest first (filters: type, customer)",
        parameters=[
            OpenApiParameter("range", str),
            OpenApiParameter("type", str, description="booking, payment, order, handoff, other"),
            OpenApiParameter("customer", str, description="customer id"),
        ],
    )
    def get(self, request: Request) -> Response:
        try:
            w = _window(request)
        except stats.StatsError as exc:
            return Response({"detail": str(exc)}, status=400)
        rows = stats.activity(
            w,
            kind=(request.query_params.get("type") or "")[:20],
            customer=(request.query_params.get("customer") or "")[:40],
        )
        return Response({"results": rows})


class NeedsSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=NeedsYouState.Kind.choices)
    ref = serializers.UUIDField()


class _NeedsView(APIView):
    policy_action = "air.desk.needs"
    func = None

    def post(self, request: Request) -> Response:
        body = NeedsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            state = type(self).func(
                body.validated_data["kind"],
                body.validated_data["ref"],
                user=request.user,
                request=request,
            )
        except needs.NeedsError as exc:
            code = {"not_found": 404, "claimed": 409, "resolved": 409}.get(exc.code, 400)
            return Response({"detail": exc.message, "code": exc.code}, status=code)
        return Response(
            {
                "kind": state.kind,
                "ref": str(state.ref),
                "claimed_by": stats._name(state.claimed_by) if state.claimed_by else "",
                "resolved": state.resolved_at is not None,
            }
        )


class NeedsClaimView(_NeedsView):
    func = staticmethod(needs.claim)

    @extend_schema(summary="Claim a needs-you item (one person at a time)", request=NeedsSerializer)
    def post(self, request: Request) -> Response:
        return super().post(request)


class NeedsResolveView(_NeedsView):
    func = staticmethod(needs.resolve)

    @extend_schema(summary="Mark a needs-you item as resolved", request=NeedsSerializer)
    def post(self, request: Request) -> Response:
        return super().post(request)


class UndoView(APIView):
    policy_action = "air.desk.undo"

    @extend_schema(
        summary="Undo one of AIR's own reversible actions (never a paid booking)", request=None
    )
    def post(self, request: Request, pk) -> Response:
        try:
            row = service.undo(pk, by=request.user)
        except AirDenied as exc:
            code = 404 if exc.code == "not_found" else 409
            return Response({"detail": exc.message, "code": exc.code}, status=code)
        audit(AUDIT_UNDO, request=request, actor=request.user, log_id=str(pk))
        return Response({"id": str(row.pk), "result": "Undone"})


class PhoneView(APIView):
    policy_action = "air.desk.phone"

    @extend_schema(summary="Show one customer's phone number (audited)")
    def get(self, request: Request, pk) -> Response:
        from people.models import CustomerProfile

        profile = CustomerProfile.objects.filter(user_id=pk).first()
        if profile is None:
            return Response({"detail": "No phone number on file."}, status=404)
        audit(AUDIT_PHONE, request=request, actor=request.user, target=profile.user)
        return Response({"phone": profile.phone or ""})


class BriefingView(APIView):
    policy_action = "air.desk.briefing"

    @extend_schema(summary="What AIR did since your last session (counts only, for the popup)")
    def get(self, request: Request) -> Response:
        return Response(briefing.build(request.user))


class UsageView(APIView):
    policy_action = "air.settings.read"

    @extend_schema(summary="AI provider use and estimated cost (admin)")
    def get(self, request: Request) -> Response:
        now = timezone.now()
        today = timezone.localdate(now)
        month_start = today.replace(day=1)
        cfg = config.get_settings()
        day = AiUsage.objects.filter(day=today).first()
        month = AiUsage.objects.filter(day__gte=month_start, day__lte=today).aggregate(
            requests=Sum("requests"), cost=Sum("cost_rupees")
        )
        ok, why = usage.allowed(now)
        breaker = usage.breaker_state()
        return Response(
            {
                "today_requests": day.requests if day else 0,
                "today_cost_rupees": str(day.cost_rupees if day else 0),
                "month_requests": month["requests"] or 0,
                "month_cost_rupees": str(month["cost"] or 0),
                "daily_request_cap": cfg.daily_request_cap,
                "monthly_request_cap": cfg.monthly_request_cap,
                "monthly_spend_cap_rupees": str(cfg.monthly_spend_cap_rupees),
                "ai_available": ok,
                "ai_blocked_reason": "" if ok else why,
                "breaker_open": bool(breaker.open_until and breaker.open_until > now),
                "breaker_open_until": breaker.open_until,
                "cost_is_estimate": True,
                "last_30_days_requests": AiUsage.objects.filter(
                    day__gte=today - timedelta(days=29)
                ).aggregate(n=Sum("requests"))["n"]
                or 0,
            }
        )
