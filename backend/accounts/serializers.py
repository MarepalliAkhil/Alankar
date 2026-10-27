from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import AuditLog, StaffInvite, User
from core import crypto, policy

GENERIC_LOGIN_ERROR = "Email or password is incorrect for this role."


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def check_password_strength(password: str, user: User | None = None) -> None:
    try:
        password_validation.validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"password": list(exc.messages)}) from exc


class MeSerializer(serializers.ModelSerializer):
    home = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "home"]

    def get_home(self, obj: User) -> str:
        return policy.role_home(obj.role)


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    consent = serializers.BooleanField()
    marketing_opt_in = serializers.BooleanField(required=False, default=False)

    def validate_email(self, value: str) -> str:
        return normalize_email(value)

    def validate_phone(self, value: str) -> str:
        if not crypto.is_valid_indian_mobile(value):
            raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
        return crypto.normalize_phone(value)

    def validate_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError("Please accept the terms and cancellation policy.")
        return value

    def validate(self, attrs):
        probe = User(email=attrs["email"], username=attrs["email"], full_name=attrs["full_name"])
        check_password_strength(attrs["password"], probe)
        return attrs


class LoginSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.Role.choices)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class OtpVerifySerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    code = serializers.RegexField(r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code."})
    purpose = serializers.ChoiceField(choices=["register", "login"])

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class OtpResendSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    purpose = serializers.ChoiceField(choices=["register", "login"])

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value: str) -> str:
        return normalize_email(value)


class SetPasswordWithTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)


class StaffSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "is_active",
            "status",
            "date_joined",
            "hourly_rate",
        ]

    def get_status(self, obj: User) -> str:
        if obj.is_active:
            return "active"
        if obj.has_usable_password():
            return "deactivated"
        return "invited"


class StaffPaySerializer(serializers.Serializer):
    hourly_rate = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, max_value=10000, allow_null=True
    )


class InviteCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=[User.Role.STYLIST, User.Role.RECEPTIONIST])

    def validate_email(self, value: str) -> str:
        email = normalize_email(value)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email


class InviteSerializer(serializers.ModelSerializer):
    """status: sent | failed | accepted | expired. delivery: email | dev_mailbox."""

    full_name = serializers.CharField(source="user.full_name", read_only=True)
    status = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()

    class Meta:
        model = StaffInvite
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "status",
            "delivery",
            "created_at",
            "expires_at",
            "accepted_at",
            "last_sent_at",
            "send_count",
        ]

    def get_status(self, obj: StaffInvite) -> str:
        from django.utils import timezone

        if obj.accepted_at:
            return "accepted"
        if obj.expires_at <= timezone.now():
            return "expired"
        if obj.email_status == StaffInvite.EmailStatus.FAILED:
            return "failed"
        return "sent"

    def get_delivery(self, obj: StaffInvite) -> str:
        if obj.email_status == StaffInvite.EmailStatus.SIMULATED:
            return "dev_mailbox"
        return "email"


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "action", "actor_email", "email", "ip_address", "metadata", "created_at"]

    def to_representation(self, instance):
        from accounts.security_views import mask

        data = super().to_representation(instance)
        data["metadata"] = mask(data["metadata"])
        return data


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
