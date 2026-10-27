"""Customer profile (Task 2b). Phone, allergies and preferences are encrypted at rest."""

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from core import crypto
from people.models import CustomerProfile


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
