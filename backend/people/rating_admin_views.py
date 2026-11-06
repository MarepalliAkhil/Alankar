"""Admin: ratings overview, a stylist's ratings with comments, and moderation."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from people import rating_admin
from people.models import StylistProfile


class RatingsOverviewView(APIView):
    policy_action = "ratings.read"

    @extend_schema(summary="Every stylist's average, count and trend", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(rating_admin.overview())


class StylistRatingsView(APIView):
    policy_action = "ratings.read"

    @extend_schema(summary="One stylist's ratings with comments", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        profile = get_object_or_404(StylistProfile, pk=pk, user__isnull=False)
        moderation = request.query_params.get("moderation", "")
        return Response(rating_admin.detail(profile, moderation))


class ModerateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=rating_admin.ACTIONS)
    reason = serializers.CharField(max_length=300)


class ModerateRatingView(APIView):
    policy_action = "ratings.moderate"

    @extend_schema(summary="Put under review, exclude or restore", request=ModerateSerializer)
    def post(self, request: Request, pk) -> Response:
        data = ModerateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            rating = rating_admin.moderate(
                pk,
                data.validated_data["action"],
                data.validated_data["reason"],
                actor=request.user,
                request=request,
            )
        except LookupError:
            return Response({"detail": "Not found."}, status=404)
        except rating_admin.ModerationError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(
            {
                "id": str(rating.pk),
                "moderation": rating.moderation,
                "moderation_label": rating.get_moderation_display(),
            }
        )
