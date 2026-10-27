"""Customer profile (Task 2b). Phone, allergies and preferences are encrypted at rest."""

from django.db import transaction
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core import crypto
from people import ratings
from people.models import RATING_TAGS, CustomerProfile, Rating


class ProfileSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    email = serializers.EmailField(read_only=True)
    phone = serializers.CharField(max_length=20)
    allergies = serializers.CharField(max_length=500, allow_blank=True, required=False)
    preferences = serializers.CharField(max_length=500, allow_blank=True, required=False)

    def validate_phone(self, value: str) -> str:
        if not crypto.is_valid_indian_mobile(value):
            raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
        return crypto.normalize_phone(value)


def profile_data(user) -> dict:
    profile = CustomerProfile.objects.filter(user=user).first()
    return {
        "full_name": user.full_name,
        "email": user.email,
        "phone": profile.phone if profile else "",
        "allergies": profile.allergies if profile else "",
        "preferences": profile.preferences if profile else "",
    }


class ProfileView(APIView):
    policy_actions = {"GET": "my.profile.read", "PATCH": "my.profile.update"}

    @extend_schema(summary="My profile", responses=ProfileSerializer)
    def get(self, request: Request) -> Response:
        return Response(profile_data(request.user))

    @extend_schema(
        summary="Update my profile", request=ProfileSerializer, responses=ProfileSerializer
    )
    def patch(self, request: Request) -> Response:
        current = profile_data(request.user)
        serializer = ProfileSerializer(data={**current, **request.data})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            user = request.user
            user.full_name = data["full_name"]
            user.save(update_fields=["full_name"])
            profile, _ = CustomerProfile.objects.get_or_create(
                user=user, defaults={"phone": "", "phone_index": ""}
            )
            profile.set_phone(data["phone"])
            profile.allergies = data.get("allergies", "")
            profile.preferences = data.get("preferences", "")
            profile.save()
        return Response(profile_data(request.user))


class RatingSubmitSerializer(serializers.Serializer):
    stars = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    tags = serializers.ListField(
        child=serializers.ChoiceField(choices=RATING_TAGS),
        required=False,
        default=list,
        max_length=4,
    )


def pending_card(rating: Rating) -> dict:
    appt = rating.appointment
    return {
        "id": str(rating.id),
        "service_name": appt.service_name,
        "visit_start": appt.start.isoformat() if appt.start else None,
        "stylist_name": rating.stylist.display_name if rating.stylist else None,
    }


class PendingRatingsView(APIView):
    policy_action = "my.ratings.list"

    @extend_schema(summary="Visits waiting for my rating", responses={200: None})
    def get(self, request: Request) -> Response:
        pending = [pending_card(r) for r in ratings.pending_for(request.user)]
        return Response({"count": len(pending), "results": pending, "tags": list(RATING_TAGS)})


class RatingSubmitView(APIView):
    policy_action = "my.ratings.submit"

    @extend_schema(
        summary="Rate my stylist for a visit (once, cannot be changed)",
        request=RatingSubmitSerializer,
        responses={200: None},
    )
    def post(self, request: Request, pk) -> Response:
        body = RatingSubmitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            ratings.submit(
                pk,
                customer=request.user,
                stars=data["stars"],
                comment=data["comment"],
                tags=data["tags"],
            )
        except ratings.RatingError as exc:
            if exc.code == "not_found":
                raise Http404 from exc
            code = 409 if exc.code == "conflict" else 400
            return Response({"detail": exc.message}, status=code)
        remaining = ratings.pending_count(request.user)
        return Response({"detail": "Thank you for your rating.", "pending": remaining})
