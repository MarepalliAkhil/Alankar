"""Admin-only AIR endpoints: settings, cover mode (with force on/off) and the action log.

AIR itself has no endpoint: it is code on the server. Customers, receptionists and stylists have
no way in here (the role policy refuses them), and nothing returned from here ever includes an
API key, a payment-link token, a prompt or a raw model answer.
"""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from air import config, cover, desk
from air.models import AIActionLog

MAX_LOG = 100


class SettingsView(APIView):
    policy_actions = {"GET": "air.settings.read", "PATCH": "air.settings.update"}

    @extend_schema(summary="AIR settings (never the key; only whether one is configured)")
    def get(self, request: Request) -> Response:
        return Response(config.public_view())

    @extend_schema(summary="Change AIR settings (audited)", request=None, responses={200: None})
    def patch(self, request: Request) -> Response:
        if not isinstance(request.data, dict):
            return Response({"detail": "Send a JSON object."}, status=400)
        try:
            obj = config.update_settings(dict(request.data), actor=request.user, request=request)
        except config.SettingsError as exc:
            return Response({"detail": exc.message, "field": exc.field}, status=400)
        cover.is_active()  # a switch change can start or end cover straight away
        return Response(config.public_view(obj))


class ForceSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["auto", "on", "off"])
    reason = serializers.CharField(max_length=200, allow_blank=True)


class CoverView(APIView):
    policy_actions = {"GET": "air.cover.read", "POST": "air.cover.force"}

    @extend_schema(summary="Is AIR covering the front desk right now?")
    def get(self, request: Request) -> Response:
        return Response(cover.status())

    @extend_schema(
        summary="Force AIR cover on or off, or back to automatic (reason required, audited)",
        request=ForceSerializer,
    )
    def post(self, request: Request) -> Response:
        body = ForceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            data = cover.force(
                body.validated_data["mode"],
                actor=request.user,
                reason=body.validated_data["reason"],
                request=request,
            )
        except cover.CoverError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(data)


class LogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIActionLog
        fields = [
            "id",
            "created_at",
            "actor",
            "cover_period",
            "channel",
            "session_id",
            "action_type",
            "status",
            "customer_ref",
            "booking_ref",
            "order_ref",
            "before",
            "after",
            "reason_code",
            "reversible_until",
            "undo_of",
            "provider",
            "model",
            "latency_ms",
            "estimated_cost_rupees",
            "input_hash",
        ]
        read_only_fields = fields


class LogListView(APIView):
    policy_action = "air.log.list"

    @extend_schema(
        summary="The AIR action log (newest first; filter by action_type or status)",
        responses={200: LogSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        rows = AIActionLog.objects.all()
        action_type = request.query_params.get("action_type")
        if action_type:
            rows = rows.filter(action_type=action_type[:40])
        status_value = request.query_params.get("status")
        if status_value in AIActionLog.Status.values:
            rows = rows.filter(status=status_value)
        return Response({"results": LogSerializer(rows[:MAX_LOG], many=True).data})


class StatusView(APIView):
    """The admin status box: is desk cover on, is it active and why, when the sweep last ran, the
    last error, and the waiting requests AIR could not handle with the reason for each."""

    policy_action = "air.cover.status"

    @extend_schema(summary="AIR desk cover status (admin)")
    def get(self, request: Request) -> Response:
        return Response(desk.status())
