"""Admin-only staff management: invites, list, deactivate/reactivate, audit log."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.invites import invite_link, send_invite_email
from accounts.models import AuditLog, StaffInvite, User
from accounts.serializers import (
    AuditLogSerializer,
    InviteCreateSerializer,
    InviteSerializer,
    StaffPaySerializer,
    StaffSerializer,
)
from accounts.tokens import new_link_token, revoke_all_refresh_tokens
from website.content import pos_settings
from website.models import SiteContent

FAILED_HINT = "Email could not be sent. Copy the link instead."


def invite_response(invite: StaffInvite, token: str, status_code: int) -> Response:
    """Invite data; the one-time link is included only when the email failed (to copy)."""
    invite.refresh_from_db()
    data = dict(InviteSerializer(invite).data)
    if invite.email_status == StaffInvite.EmailStatus.FAILED:
        data["link"] = invite_link(token)
        data["detail"] = FAILED_HINT
    return Response(data, status=status_code)


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
            send_invite_email(invite, token, inviter=request.user, request=request)
        audit(
            AuditLog.Action.INVITE_SENT,
            request=request,
            actor=request.user,
            target=user,
            role=user.role,
        )
        return invite_response(invite, token, status.HTTP_201_CREATED)


class InviteResendView(APIView):
    """New link (the old one stops working), new expiry, email sent again."""

    policy_action = "staff.invites.resend"

    @extend_schema(summary="Resend a staff invite", request=None, responses=InviteSerializer)
    def post(self, request: Request, pk) -> Response:
        invite = get_object_or_404(StaffInvite.objects.select_related("user"), pk=pk)
        if invite.accepted_at or invite.user.has_usable_password():
            return Response(
                {"detail": "This invite was already accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        token, token_hash = new_link_token()
        hours = settings.SALON_AUTH["INVITE_HOURS"]
        with transaction.atomic():
            invite.token_hash = token_hash
            invite.expires_at = timezone.now() + timedelta(hours=hours)
            invite.save(update_fields=["token_hash", "expires_at"])
            send_invite_email(invite, token, inviter=request.user, request=request)
        audit(
            AuditLog.Action.INVITE_RESENT,
            request=request,
            actor=request.user,
            target=invite.user,
        )
        return invite_response(invite, token, status.HTTP_200_OK)


def _staff_member(pk) -> User:
    return get_object_or_404(User, pk=pk, role__in=User.STAFF_ROLES)


class StaffPayView(APIView):
    """The admin sets a receptionist's hourly rate (used for My Hours & Pay and payroll)."""

    policy_action = "staff.pay.update"

    @extend_schema(
        summary="Set a receptionist's hourly rate",
        request=StaffPaySerializer,
        responses=StaffSerializer,
    )
    def patch(self, request: Request, pk) -> Response:
        member = _staff_member(pk)
        if member.role != User.Role.RECEPTIONIST:
            return Response(
                {"detail": "An hourly rate applies to receptionists only."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = StaffPaySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        new_rate = body.validated_data["hourly_rate"]
        old_rate = member.hourly_rate
        if new_rate != old_rate:
            member.hourly_rate = new_rate
            member.save(update_fields=["hourly_rate"])
            audit(
                AuditLog.Action.STAFF_RATE_CHANGED,
                request=request,
                actor=request.user,
                target=member,
                old=str(old_rate) if old_rate is not None else None,
                new=str(new_rate) if new_rate is not None else None,
            )
        return Response(StaffSerializer(member).data)


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


class PosSettingsSerializer(serializers.Serializer):
    discount_cap_percent = serializers.IntegerField(min_value=0, max_value=100)


class PosSettingsView(APIView):
    """Billing rules. The receptionist reads the discount cap; only the admin changes it."""

    policy_actions = {"GET": "settings.pos.read", "PATCH": "settings.pos.update"}

    @extend_schema(summary="Billing settings", responses=PosSettingsSerializer)
    def get(self, request: Request) -> Response:
        return Response(PosSettingsSerializer(pos_settings()).data)

    @extend_schema(summary="Change billing settings", request=PosSettingsSerializer)
    def patch(self, request: Request) -> Response:
        body = PosSettingsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        old = pos_settings()
        new = {**old, **body.validated_data}
        if new != old:
            SiteContent.objects.update_or_create(key="pos", defaults={"value": new})
            audit(
                AuditLog.Action.POS_SETTINGS_CHANGED,
                request=request,
                actor=request.user,
                old=old,
                new=new,
            )
        return Response(PosSettingsSerializer(pos_settings()).data)
