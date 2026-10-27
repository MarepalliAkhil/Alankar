from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.middleware.csrf import get_token, rotate_token
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts import lockout, otp, work
from accounts.audit import audit, client_ip
from accounts.models import AuditLog, OtpChallenge, PasswordResetToken, StaffInvite, User
from accounts.serializers import (
    GENERIC_LOGIN_ERROR,
    LoginSerializer,
    MeSerializer,
    OtpResendSerializer,
    OtpVerifySerializer,
    PasswordChangeSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    SetPasswordWithTokenSerializer,
    check_password_strength,
)
from accounts.tokens import (
    clear_session_cookies,
    hash_token,
    new_link_token,
    revoke_all_refresh_tokens,
    set_session_cookies,
)
from core import brand
from core.devtools import require_links_enabled
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from people.linking import link_new_profile
from people.models import CustomerProfile

REGISTER_MESSAGE = "Thanks! If the details are valid, your account is ready. Please sign in."
RESET_REQUEST_MESSAGE = "If a customer account exists for this email, we have sent a reset link."
RESET_INVALID = "This reset link is invalid or has expired."
INVITE_INVALID = "This invite link is invalid or has expired."
LOCKED_MESSAGE = "Too many attempts. Please wait 15 minutes and try again."


class AuthThrottleMixin:
    """Rate limit for auth endpoints (SALON_AUTH_RATE, default 20/min per IP)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class CsrfView(APIView):
    """Sets the csrftoken cookie that the SPA echoes in the X-CSRFToken header."""

    policy_action = "auth.csrf"
    authentication_classes: list = []

    @extend_schema(summary="Get a CSRF cookie", responses={204: None})
    def get(self, request: Request) -> Response:
        get_token(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(AuthThrottleMixin, APIView):
    policy_action = "auth.register"
    authentication_classes: list = []

    @extend_schema(summary="Register a customer", request=RegisterSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"]
        if User.objects.filter(email__iexact=email).exists():
            # Same response as success: never reveal that the email is registered.
            make_password(data["password"])  # keep timing similar
            queue_mail(
                kind=MailOutbox.Kind.NOTICE,
                to=email,
                subject=f"{brand.SHOP_NAME}: someone tried to register with your email",
                body=(
                    "Someone tried to create an account with this email address. "
                    "If it was you, sign in or reset your password instead."
                ),
                link=frontend_link("/login?role=customer"),
            )
        else:
            with transaction.atomic():
                user = User(
                    username=email,
                    email=email,
                    full_name=data["full_name"],
                    role=User.Role.CUSTOMER,  # always customer, whatever the client sends
                )
                user.set_password(data["password"])
                user.save()
                profile = CustomerProfile(user=user)
                profile.set_phone(data["phone"])
                profile.save()
            audit(AuditLog.Action.REGISTER, request=request, actor=user, target=user)
            if otp.otp_enabled():
                try:
                    otp.issue(user, OtpChallenge.Purpose.REGISTER, request)
                except otp.OtpThrottled:
                    pass
        # Identical for new and existing emails; the code step is shown either way.
        body = {"detail": REGISTER_MESSAGE, "otp_required": otp.otp_enabled()}
        return Response(body, status=status.HTTP_201_CREATED)


class LoginView(AuthThrottleMixin, APIView):
    policy_action = "auth.login"
    authentication_classes: list = []

    @extend_schema(
        summary="Sign in with a role tab", request=LoginSerializer, responses=MeSerializer
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data["role"]
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        ip = client_ip(request)

        if lockout.is_locked(email):
            audit(AuditLog.Action.LOGIN_FAILED, request=request, email=email, reason="locked")
            return Response({"detail": LOCKED_MESSAGE}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = User.objects.filter(email__iexact=email).first()
        reason = None
        if user is None:
            make_password(password)  # similar timing for unknown emails
            reason = "bad_credentials"
        elif not user.check_password(password):
            reason = "bad_credentials"
        elif not user.is_active:
            reason = "inactive"
        elif user.role != role:
            reason = "role_mismatch"

        if reason:
            audit(
                AuditLog.Action.LOGIN_FAILED,
                request=request,
                target=user,
                email=email,
                reason=reason,
                tab=role,
            )
            if lockout.record_failure(email, ip):
                audit(AuditLog.Action.LOCKOUT, request=request, target=user, email=email)
            return Response({"detail": GENERIC_LOGIN_ERROR}, status=status.HTTP_401_UNAUTHORIZED)

        lockout.record_success(email, ip)
        if user.role == User.Role.CUSTOMER and otp.otp_enabled():
            # Right password: now ask for the emailed code before any session starts.
            # An account whose email was never proven gets the registration code instead, so
            # entering it (not the password alone) is what lets that customer in.
            purpose = otp.purpose_for(user)
            try:
                otp.issue(user, purpose, request)
            except otp.OtpThrottled:
                return Response(
                    {"detail": "Too many codes were requested. Please try again in an hour."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            return Response(
                {
                    "otp_required": True,
                    "email": email,
                    "purpose": purpose,
                    "detail": otp.sent_message(),
                }
            )
        return start_session(request, user)


def start_session(request: Request, user: User) -> Response:
    """Records the sign-in and returns the user with fresh session cookies."""
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    audit(AuditLog.Action.LOGIN_SUCCESS, request=request, actor=user, target=user)
    work.start(user)
    rotate_token(request._request)
    response = Response(MeSerializer(user).data)
    set_session_cookies(response, RefreshToken.for_user(user))
    return response


def otp_user(email: str) -> User | None:
    return User.objects.filter(email__iexact=email, role=User.Role.CUSTOMER, is_active=True).first()


class OtpVerifyView(AuthThrottleMixin, APIView):
    policy_action = "auth.otp_verify"
    authentication_classes: list = []

    @extend_schema(
        summary="Check the emailed 6-digit code and start the session",
        request=OtpVerifySerializer,
        responses=MeSerializer,
    )
    def post(self, request: Request) -> Response:
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = otp_user(data["email"])
        # The purpose must be the one the server expects for this account; anything else
        # fails exactly like a wrong code (and does not use up a try).
        purpose_ok = user is not None and data["purpose"] == otp.purpose_for(user)
        if not purpose_ok or not otp.verify(user, data["purpose"], data["code"]):
            audit(
                AuditLog.Action.LOGIN_FAILED,
                request=request,
                target=user,
                email=data["email"],
                reason="bad_otp",
                tab="customer",
            )
            return Response({"detail": otp.GENERIC_OTP_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        return start_session(request, user)


class OtpResendView(AuthThrottleMixin, APIView):
    policy_action = "auth.otp_resend"
    authentication_classes: list = []

    @extend_schema(
        summary="Email a new 6-digit code", request=OtpResendSerializer, responses={200: None}
    )
    def post(self, request: Request) -> Response:
        serializer = OtpResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = otp_user(data["email"])
        if user is not None and otp.otp_enabled() and data["purpose"] == otp.purpose_for(user):
            otp.resend(user, data["purpose"], request)
        # Same answer whether or not a code was sent.
        return Response({"detail": f"If a code is due, we sent a new one. {otp.sent_message()}"})


def rotate_refresh(request: Request) -> tuple[User | None, RefreshToken | None, bool]:
    """Validates the refresh cookie and rotates it.

    Returns (user, new_refresh, had_cookie). The old refresh token is blacklisted, so a
    stolen copy cannot be replayed. Inactive users get nothing.
    """
    raw = request.COOKIES.get(settings.SALON_AUTH["REFRESH_COOKIE"])
    if not raw:
        return None, None, False
    try:
        old = RefreshToken(raw)
        user = User.objects.filter(pk=old["user_id"], is_active=True).first()
        if user is None:
            return None, None, True
        old.blacklist()
    except TokenError:
        return None, None, True
    if not work.enforce(user):
        return None, None, True
    return user, RefreshToken.for_user(user), True


class RefreshView(APIView):
    policy_action = "auth.refresh"
    authentication_classes: list = []

    @extend_schema(summary="Rotate the session cookies", request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        user, refresh, had_cookie = rotate_refresh(request)
        if user is None:
            failure = Response({"detail": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
            if had_cookie:
                clear_session_cookies(failure)
            return failure
        response = Response(status=status.HTTP_204_NO_CONTENT)
        set_session_cookies(response, refresh)
        return response


class SessionView(APIView):
    """Who is signed in, or `{"user": null}`. Always 200, so guests see no errors.

    If the access cookie has expired but the refresh cookie is valid, the session is
    renewed (rotated cookies) and the user is returned.
    """

    policy_action = "auth.session"

    @extend_schema(summary="Current session", responses={200: None})
    def get(self, request: Request) -> Response:
        if request.user and request.user.is_authenticated:
            return Response({"user": MeSerializer(request.user).data})
        user, refresh, had_cookie = rotate_refresh(request)
        if user is None:
            response = Response({"user": None})
            if had_cookie:
                clear_session_cookies(response)
            return response
        response = Response({"user": MeSerializer(user).data})
        set_session_cookies(response, refresh)
        return response


class LogoutView(APIView):
    policy_action = "auth.logout"

    @extend_schema(summary="Sign out", request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        raw = request.COOKIES.get(settings.SALON_AUTH["REFRESH_COOKIE"])
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        if request.user and request.user.is_authenticated:
            work.end(request.user)
            audit(AuditLog.Action.LOGOUT, request=request, actor=request.user, target=request.user)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_session_cookies(response)
        return response


class MeView(APIView):
    policy_action = "auth.me"

    @extend_schema(summary="The signed-in account", responses=MeSerializer)
    def get(self, request: Request) -> Response:
        return Response(MeSerializer(request.user).data)


class PasswordResetRequestView(AuthThrottleMixin, APIView):
    policy_action = "auth.password_reset"
    authentication_classes: list = []

    @extend_schema(
        summary="Request a customer password reset",
        request=PasswordResetRequestSerializer,
        responses={200: None},
    )
    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(
            email__iexact=email, role=User.Role.CUSTOMER, is_active=True
        ).first()
        if user is not None:
            token, token_hash = new_link_token()
            minutes = settings.SALON_AUTH["PASSWORD_RESET_MINUTES"]

            def on_failure(message: MailOutbox) -> None:
                audit(
                    AuditLog.Action.EMAIL_FAILED,
                    request=request,
                    target=user,
                    kind="password_reset",
                    error=message.error,
                )

            with transaction.atomic():
                PasswordResetToken.objects.create(
                    user=user,
                    token_hash=token_hash,
                    expires_at=timezone.now() + timedelta(minutes=minutes),
                )
                queue_mail(
                    kind=MailOutbox.Kind.PASSWORD_RESET,
                    to=user.email,
                    subject=f"{brand.SHOP_NAME}: reset your password",
                    body=f"Use this link within {minutes} minutes to choose a new password.",
                    link=frontend_link(f"/reset-password?token={token}"),
                    on_failure=on_failure,
                )
            audit(AuditLog.Action.PASSWORD_RESET_REQUESTED, request=request, target=user)
        return Response({"detail": RESET_REQUEST_MESSAGE})


class PasswordResetConfirmView(AuthThrottleMixin, APIView):
    policy_action = "auth.password_reset_confirm"
    authentication_classes: list = []

    @extend_schema(
        summary="Set a new password from a reset link",
        request=SetPasswordWithTokenSerializer,
        responses={200: None},
    )
    def post(self, request: Request) -> Response:
        serializer = SetPasswordWithTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset = (
            PasswordResetToken.objects.select_related("user")
            .filter(
                token_hash=hash_token(serializer.validated_data["token"]),
                used_at__isnull=True,
                expires_at__gt=timezone.now(),
                user__is_active=True,
            )
            .first()
        )
        if reset is None:
            return Response({"detail": RESET_INVALID}, status=status.HTTP_400_BAD_REQUEST)
        user = reset.user
        check_password_strength(serializer.validated_data["password"], user)
        with transaction.atomic():
            user.set_password(serializer.validated_data["password"])
            user.save(update_fields=["password"])
            PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(
                used_at=timezone.now()
            )
        revoke_all_refresh_tokens(user)
        lockout.clear_lock(user.email)
        audit(AuditLog.Action.PASSWORD_RESET_DONE, request=request, target=user)
        return Response({"detail": "Your password has been changed. Please sign in."})


def _valid_invite(token: str) -> StaffInvite | None:
    return (
        StaffInvite.objects.select_related("user")
        .filter(
            token_hash=hash_token(token),
            accepted_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .first()
    )


class InviteCheckView(APIView):
    """Reads an invite from its link. Works in debug mode or when real email is configured."""

    policy_action = "auth.invite_check"
    authentication_classes: list = []

    @extend_schema(summary="Read a staff invite", responses={200: None})
    def get(self, request: Request) -> Response:
        require_links_enabled()
        invite = _valid_invite(request.query_params.get("token", ""))
        if invite is None:
            return Response({"detail": INVITE_INVALID}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {"email": invite.email, "full_name": invite.user.full_name, "role": invite.role}
        )


class InviteAcceptView(AuthThrottleMixin, APIView):
    """Sets the password and activates the account (debug mode or real email configured)."""

    policy_action = "auth.invite_accept"
    authentication_classes: list = []

    @extend_schema(
        summary="Accept a staff invite",
        request=SetPasswordWithTokenSerializer,
        responses={200: None},
    )
    def post(self, request: Request) -> Response:
        require_links_enabled()
        serializer = SetPasswordWithTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invite = _valid_invite(serializer.validated_data["token"])
        if invite is None:
            return Response({"detail": INVITE_INVALID}, status=status.HTTP_400_BAD_REQUEST)
        user = invite.user
        check_password_strength(serializer.validated_data["password"], user)
        with transaction.atomic():
            user.set_password(serializer.validated_data["password"])
            user.is_active = True
            user.save(update_fields=["password", "is_active"])
            invite.accepted_at = timezone.now()
            invite.save(update_fields=["accepted_at"])
            if user.role == User.Role.STYLIST:
                link_new_profile(user)
        audit(AuditLog.Action.INVITE_ACCEPTED, request=request, actor=user, target=user)
        return Response({"detail": "Your password is set. You can now sign in.", "role": user.role})


class PasswordChangeView(AuthThrottleMixin, APIView):
    """Signed-in password change. Other sessions are signed out; this one gets new cookies."""

    policy_action = "auth.password_change"

    @extend_schema(summary="Change my password", request=PasswordChangeSerializer)
    def post(self, request: Request) -> Response:
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": ["Your current password is not correct."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        new_password = serializer.validated_data["new_password"]
        try:
            check_password_strength(new_password, user)
        except Exception as exc:  # ValidationError keyed as "password"; rename the field
            detail = getattr(exc, "detail", {})
            return Response(
                {"new_password": detail.get("password", ["Choose a stronger password."])},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.save(update_fields=["password"])
        revoke_all_refresh_tokens(user)
        audit(AuditLog.Action.PASSWORD_CHANGED, request=request, actor=user, target=user)
        response = Response({"detail": "Your password has been changed."})
        set_session_cookies(response, RefreshToken.for_user(user))
        return response
