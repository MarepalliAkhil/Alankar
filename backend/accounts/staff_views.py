"""Admin-only staff management: invites, list, deactivate/reactivate, audit log."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog, StaffInvite, User
from accounts.serializers import (
    AuditLogSerializer,
    InviteCreateSerializer,
    InviteSerializer,
    StaffSerializer,
)
from accounts.tokens import new_link_token, revoke_all_refresh_tokens
from core import brand
from core.mail import frontend_link, send_simulated_mail
from core.models import MailOutbox


class StaffListView(APIView):
    policy_action = "staff.list"

    @extend_schema(summary="List staff accounts", responses=StaffSerializer(many=True))
    def get(self, request: Request) -> Response:
        staff = User.objects.filter(role__in=User.STAFF_ROLES).order_by("full_name", "email")
        return Response(StaffSerializer(staff, many=True).data)


class InviteListCreateView(APIView):
    policy_actions = {"GET": "staff.invites.list", "POST": "staff.invites.create"}

    @extend_schema(summary="List staff invites", responses=InviteSerializer(many=True))
    def get(self, request: Request) -> Response:
        invites = StaffInvite.objects.select_related("user")[:100]
        return Response(InviteSerializer(invites, many=True).data)

    @extend_schema(
        summary="Invite a stylist or receptionist",
        request=InviteCreateSerializer,
        responses={201: InviteSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = InviteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        token, token_hash = new_link_token()
        hours = settings.SALON_AUTH["INVITE_HOURS"]
        with transaction.atomic():
            user = User(
                username=data["email"],
                email=data["email"],
                full_name=data["full_name"],
                role=data["role"],
                is_active=False,
            )
            user.set_unusable_password()
            user.save()
            invite = StaffInvite.objects.create(
                user=user,
                email=user.email,
                role=user.role,
                token_hash=token_hash,
                created_by=request.user,
                expires_at=timezone.now() + timedelta(hours=hours),
            )
        role_label = User.Role(user.role).label.lower()
        send_simulated_mail(
            kind=MailOutbox.Kind.INVITE,
            to=user.email,
            subject=f"You're invited to join {brand.SHOP_NAME} as a {role_label}",
            body=(
                f"Hi {user.full_name}, {request.user.full_name or 'the admin'} invited you to "
                f"{brand.SHOP_NAME}. Open the link within {hours} hours to set your password."
            ),
            link=frontend_link(f"/accept-invite?token={token}"),
        )
        audit(
            AuditLog.Action.INVITE_SENT,
            request=request,
            actor=request.user,
            target=user,
            role=user.role,
        )
        return Response(InviteSerializer(invite).data, status=status.HTTP_201_CREATED)


def _staff_member(pk) -> User:
    return get_object_or_404(User, pk=pk, role__in=User.STAFF_ROLES)


class StaffDeactivateView(APIView):
    policy_action = "staff.deactivate"

    @extend_schema(summary="Deactivate a staff account", request=None, responses=StaffSerializer)
    def post(self, request: Request, pk) -> Response:
        member = _staff_member(pk)
        if member.is_active:
            member.is_active = False
            member.save(update_fields=["is_active"])
            revoked = revoke_all_refresh_tokens(member)
            audit(
                AuditLog.Action.STAFF_DEACTIVATED,
                request=request,
                actor=request.user,
                target=member,
                revoked_sessions=revoked,
            )
        return Response(StaffSerializer(member).data)


class StaffReactivateView(APIView):
    policy_action = "staff.reactivate"

    @extend_schema(summary="Reactivate a staff account", request=None, responses=StaffSerializer)
    def post(self, request: Request, pk) -> Response:
        member = _staff_member(pk)
        if not member.has_usable_password():
            return Response(
                {"detail": "This person has not accepted the invite yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not member.is_active:
            member.is_active = True
            member.save(update_fields=["is_active"])
            audit(
                AuditLog.Action.STAFF_REACTIVATED,
                request=request,
                actor=request.user,
                target=member,
            )
        return Response(StaffSerializer(member).data)


class AuditLogListView(APIView):
    policy_action = "audit.list"

    @extend_schema(summary="Latest audit log entries", responses=AuditLogSerializer(many=True))
    def get(self, request: Request) -> Response:
        entries = AuditLog.objects.select_related("actor")[:100]
        return Response(AuditLogSerializer(entries, many=True).data)
