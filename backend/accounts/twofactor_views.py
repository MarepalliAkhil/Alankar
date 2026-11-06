"""Admin: set up, use and recover two-step sign-in."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import lockout, twofactor
from accounts.audit import audit
from accounts.models import AuditLog, User
from accounts.tokens import revoke_all_refresh_tokens
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox

BAD_PASSWORD = "Your password is not correct."


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class ProofSerializer(serializers.Serializer):
    """Turning it off or making new backup codes needs the password and a current code."""

    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    code = serializers.CharField(max_length=20)


class ResetSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=300)


def _proof(request: Request) -> Response | None:
    """Checks the password and a code; counts a wrong one towards the lockout."""
    body = ProofSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    user = request.user
    if not user.check_password(body.validated_data["password"]):
        return Response({"password": [BAD_PASSWORD]}, status=status.HTTP_400_BAD_REQUEST)
    if twofactor.verify(user, body.validated_data["code"]) is None:
        lockout.record_failure(user.email, None)
        return Response({"code": [twofactor.WRONG]}, status=status.HTTP_400_BAD_REQUEST)
    return None


class TwoFactorStatusView(APIView):
    policy_action = "twofactor.manage"

    @extend_schema(
        summary="Is two-step sign-in on for me, and who else has it", responses={200: None}
    )
    def get(self, request: Request) -> Response:
        user = request.user
        others = User.objects.filter(role=User.Role.ADMIN, is_active=True).exclude(pk=user.pk)
        return Response(
            {
                "enabled": twofactor.is_enabled(user),
                "backup_codes_left": twofactor.backup_codes_left(user),
                "admins": [
                    {
                        "id": str(a.pk),
                        "name": a.full_name or a.email,
                        "email": a.email,
                        "two_factor": twofactor.is_enabled(a),
                    }
                    for a in others.order_by("full_name", "email")
                ],
            }
        )


class TwoFactorSetupView(APIView):
    policy_action = "twofactor.manage"

    @extend_schema(summary="Start set-up: a new secret and QR code", responses={200: None})
    def post(self, request: Request) -> Response:
        try:
            return Response(twofactor.begin(request.user))
        except twofactor.TwoFactorError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)


class TwoFactorConfirmView(APIView):
    policy_action = "twofactor.manage"

    @extend_schema(summary="Confirm set-up with a code", request=CodeSerializer)
    def post(self, request: Request) -> Response:
        body = CodeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            codes = twofactor.confirm(request.user, body.validated_data["code"])
        except twofactor.TwoFactorError as exc:
            return Response({"code": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        audit(
            AuditLog.Action.TWO_FACTOR_ENABLED,
            request=request,
            actor=request.user,
            target=request.user,
        )
        return Response({"enabled": True, "backup_codes": codes})


class TwoFactorDisableView(APIView):
    policy_action = "twofactor.manage"

    @extend_schema(summary="Switch it off (password and a code needed)", request=ProofSerializer)
    def post(self, request: Request) -> Response:
        if not twofactor.is_enabled(request.user):
            return Response({"detail": "Two-step sign-in is not on."}, status=409)
        refused = _proof(request)
        if refused is not None:
            return refused
        twofactor.disable(request.user)
        audit(
            AuditLog.Action.TWO_FACTOR_DISABLED,
            request=request,
            actor=request.user,
            target=request.user,
        )
        return Response({"enabled": False})


class TwoFactorCodesView(APIView):
    policy_action = "twofactor.manage"

    @extend_schema(summary="Make a fresh set of backup codes", request=ProofSerializer)
    def post(self, request: Request) -> Response:
        if not twofactor.is_enabled(request.user):
            return Response({"detail": "Two-step sign-in is not on."}, status=409)
        refused = _proof(request)
        if refused is not None:
            return refused
        codes = twofactor.new_backup_codes(request.user)
        audit(
            AuditLog.Action.TWO_FACTOR_CODES,
            request=request,
            actor=request.user,
            target=request.user,
        )
        return Response({"backup_codes": codes})


class TwoFactorResetView(APIView):
    """A second admin switches it off for an admin who lost their phone and backup codes."""

    policy_action = "twofactor.reset"

    @extend_schema(summary="Reset another admin's two-step sign-in", request=ResetSerializer)
    def post(self, request: Request, pk) -> Response:
        body = ResetSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        target = User.objects.filter(pk=pk, role=User.Role.ADMIN, is_active=True).first()
        if target is None:
            return Response({"detail": "That admin was not found."}, status=404)
        if target.pk == request.user.pk:
            return Response(
                {"detail": "Another admin has to reset yours."}, status=status.HTTP_403_FORBIDDEN
            )
        if not twofactor.is_enabled(target):
            return Response({"detail": "Two-step sign-in is not on for them."}, status=409)
        twofactor.disable(target)
        revoke_all_refresh_tokens(target)
        audit(
            AuditLog.Action.TWO_FACTOR_RESET,
            request=request,
            actor=request.user,
            target=target,
            reason=body.validated_data["reason"],
        )
        queue_mail(
            kind=MailOutbox.Kind.NOTICE,
            to=target.email,
            subject=f"{brand.SHOP_NAME}: your two-step sign-in was reset",
            body=(
                f"{request.user.full_name or request.user.email} switched off two-step sign-in "
                "on your account because you could not use your authenticator app. You have been "
                "signed out. Sign in with your password and switch it on again in Security."
            ),
            link=frontend_link("/login?role=admin"),
        )
        return Response({"enabled": False})
