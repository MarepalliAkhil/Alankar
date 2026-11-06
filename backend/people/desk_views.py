"""Customers (receptionist and admin). Every response is built for staff, never a raw model."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog, User
from core import crypto
from people import desk


def phone_of(user: User) -> str:
    profile = getattr(user, "customer_profile", None)
    return profile.phone if profile else ""


def summary(user: User) -> dict:
    profile = getattr(user, "customer_profile", None)
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "phone": phone_of(user),
        "has_allergies": bool(profile and profile.allergies),
        "email_verified": user.email_verified_at is not None,
        "visits": getattr(user, "visit_count", None),
    }


def detail(user: User) -> dict:
    profile = getattr(user, "customer_profile", None)
    return {
        **summary(user),
        "allergies": profile.allergies if profile else "",
        "preferences": profile.preferences if profile else "",
        "joined": user.date_joined,
        "stats": desk.stats(user),
        "visits_list": [
            {
                "id": str(a.id),
                "status": a.status,
                "status_label": a.get_status_display(),
                "service_name": a.service_name,
                "variant_label": a.variant_label,
                "start": a.start,
                "stylist_name": a.stylist.display_name if a.stylist_id else None,
                "amount": str(a.price_total),
                "source": a.source,
                "invoice_number": getattr(getattr(a, "invoice", None), "number", None),
            }
            for a in desk.visits(user)
        ],
        "notes": [
            {
                "id": str(n.id),
                "body": n.body,
                "author_name": n.author.full_name if n.author_id else "Former staff",
                "created_at": n.created_at,
            }
            for n in desk.desk_notes(user)
        ],
    }


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not crypto.is_valid_indian_mobile(value):
            raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
        return crypto.normalize_phone(value)


class CustomerCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    phone = PhoneField(max_length=20)
    allergies = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    preferences = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )


class CustomerUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(
        min_length=2, max_length=80, trim_whitespace=True, required=False
    )
    phone = PhoneField(max_length=20, required=False)
    allergies = serializers.CharField(max_length=500, required=False, allow_blank=True)
    preferences = serializers.CharField(max_length=500, required=False, allow_blank=True)


class NoteSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=2, max_length=1000, trim_whitespace=True)


def customer_or_404(pk) -> User:
    user = desk.get(pk)
    if user is None:
        raise Http404
    return user


class CustomerListView(APIView):
    policy_actions = {"GET": "desk.customers.list", "POST": "desk.customers.create"}

    @extend_schema(summary="Search customers (name, email or full mobile number)")
    def get(self, request: Request) -> Response:
        results = [summary(u) for u in desk.search(request.query_params.get("q", ""))]
        return Response({"count": len(results), "results": results})

    @extend_schema(summary="Register a customer at the desk", request=CustomerCreateSerializer)
    def post(self, request: Request) -> Response:
        body = CustomerCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            user = desk.create(
                name=data["full_name"],
                email=data["email"],
                phone=data["phone"],
                allergies=data["allergies"],
                preferences=data["preferences"],
            )
        except desk.CustomerError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)
        audit(AuditLog.Action.CUSTOMER_CREATED, request=request, actor=request.user, target=user)
        return Response(detail(customer_or_404(user.pk)), status=status.HTTP_201_CREATED)


class CustomerDetailView(APIView):
    policy_actions = {"GET": "desk.customers.read", "PATCH": "desk.customers.update"}

    @extend_schema(summary="One customer with visit history and front-desk notes")
    def get(self, request: Request, pk) -> Response:
        return Response(detail(customer_or_404(pk)))

    @extend_schema(summary="Edit name, phone, allergies or preferences")
    def patch(self, request: Request, pk) -> Response:
        user = customer_or_404(pk)
        body = CustomerUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        changed = desk.update(user, body.validated_data)
        if changed:
            audit(
                AuditLog.Action.CUSTOMER_UPDATED,
                request=request,
                actor=request.user,
                target=user,
                fields=changed,
            )
        return Response(detail(customer_or_404(pk)))


class CustomerNoteView(APIView):
    policy_action = "desk.customers.notes"

    @extend_schema(summary="Add a front-desk note", request=NoteSerializer)
    def post(self, request: Request, pk) -> Response:
        user = customer_or_404(pk)
        body = NoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        note = desk.add_note(user, author=request.user, body=body.validated_data["body"])
        audit(
            AuditLog.Action.CUSTOMER_NOTE_ADDED,
            request=request,
            actor=request.user,
            target=user,
            note=str(note.id),
        )
        return Response(detail(customer_or_404(pk)), status=status.HTTP_201_CREATED)
