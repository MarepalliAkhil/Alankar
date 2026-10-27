import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user. Public IDs are UUIDs; username is set to the (lower-cased) email.

    Registration always forces role = customer. Staff roles exist only through an admin
    invite; the first admin is created with `manage.py create_admin`.
    """

    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        RECEPTIONIST = "receptionist", "Receptionist"
        STYLIST = "stylist", "Stylist"
        ADMIN = "admin", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField("email address", unique=True)
    full_name = models.CharField(max_length=120, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    # Set the first time the customer proves they own the email with a one-time code.
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # Receptionist pay per hour in INR (set by the admin). Empty for every other role.
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    STAFF_ROLES = (Role.RECEPTIONIST, Role.STYLIST)

    def __str__(self) -> str:
        return self.email or self.username


class AuditLog(models.Model):
    class Action(models.TextChoices):
        REGISTER = "register", "Customer registered"
        LOGIN_SUCCESS = "login_success", "Login succeeded"
        LOGIN_FAILED = "login_failed", "Login failed"
        LOCKOUT = "lockout", "Account locked after failed logins"
        LOGOUT = "logout", "Logout"
        INVITE_SENT = "invite_sent", "Staff invite sent"
        INVITE_ACCEPTED = "invite_accepted", "Staff invite accepted"
        ROLE_CHANGED = "role_changed", "Role changed"
        STAFF_DEACTIVATED = "staff_deactivated", "Staff account deactivated"
        STAFF_REACTIVATED = "staff_reactivated", "Staff account reactivated"
        PASSWORD_RESET_REQUESTED = "password_reset_requested", "Password reset requested"
        PASSWORD_RESET_DONE = "password_reset_done", "Password reset completed"
        INVITE_RESENT = "invite_resent", "Staff invite resent"
        EMAIL_FAILED = "email_failed", "Email could not be sent"
        PASSWORD_CHANGED = "password_changed", "Password changed"
        APPOINTMENT_CONFIRMED = "appointment_confirmed", "Booking confirmed by staff"
        APPOINTMENT_REJECTED = "appointment_rejected", "Booking request rejected"
        APPOINTMENT_RESCHEDULED = "appointment_rescheduled", "Booking moved by staff"
        APPOINTMENT_CANCELLED = "appointment_cancelled", "Booking cancelled by staff"
        APPOINTMENT_NO_SHOW = "appointment_no_show", "Booking marked as no-show"
        APPOINTMENT_FLAG_DECLINED = "appointment_flag_declined", "Customer request declined"
        PAYMENT_LINK_RESENT = "payment_link_resent", "Payment link resent by staff"
        STAFF_RATE_CHANGED = "staff_rate_changed", "Receptionist hourly rate changed"
        POS_SETTINGS_CHANGED = "pos_settings_changed", "Billing settings changed"
        APPOINTMENT_CHECKED_IN = "appointment_checked_in", "Customer checked in"
        APPOINTMENT_CREATED_BY_STAFF = (
            "appointment_created_by_staff",
            "Walk-in or phone booking created by staff",
        )
        CUSTOMER_CREATED = "customer_created", "Customer registered at the desk"
        CUSTOMER_UPDATED = "customer_updated", "Customer details changed by staff"
        CUSTOMER_NOTE_ADDED = "customer_note_added", "Customer note added"
        INVOICE_CREATED = "invoice_created", "Visit billed at the POS"
        REFUND_REQUESTED = "refund_requested", "Refund requested"
        REFUND_APPROVED = "refund_approved", "Refund approved"
        REFUND_REJECTED = "refund_rejected", "Refund rejected"
        CASH_CLOSE_SIGNED = "cash_close_signed", "Daily cash close signed off"
        APPOINTMENT_STARTED = "appointment_started", "Service started by the stylist"
        APPOINTMENT_COMPLETED = "appointment_completed", "Service completed by the stylist"
        STYLIST_LINKED = "stylist_linked", "Stylist account linked to a team profile"
        DAY_OFF_REQUESTED = "day_off_requested", "Days off requested"
        DAY_OFF_WITHDRAWN = "day_off_withdrawn", "Days off request withdrawn"
        PRODUCT_CHANGED = "product_changed", "Product added or changed"
        SUPPLIER_CHANGED = "supplier_changed", "Supplier added or changed"
        STOCK_MOVED = "stock_moved", "Stock received, adjusted or written off"
        CASH_CLOSE_REVIEWED = "cash_close_reviewed", "Cash close reviewed by the admin"
        SETTINGS_CHANGED = "settings_changed", "Business settings changed"
        WORK_SESSION_CORRECTED = "work_session_corrected", "Working hours corrected by the admin"
        STAFF_PROFILE_UPDATED = "staff_profile_updated", "Staff details changed by the admin"
        CATALOGUE_CHANGED = "catalogue_changed", "Services, categories or rooms changed"
        DAY_OFF_DECIDED = "day_off_decided", "Days-off request decided"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action = models.CharField(max_length=40, choices=Action.choices, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_actions",
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_targets",
    )
    email = models.EmailField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} {self.email}"


class LoginAttempt(models.Model):
    """One row per login attempt, keyed by email whether or not an account exists."""

    email = models.EmailField(db_index=True)
    succeeded = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"{self.email} {'ok' if self.succeeded else 'failed'}"


class LoginLock(models.Model):
    email = models.EmailField(unique=True)
    locked_until = models.DateTimeField()

    def __str__(self) -> str:
        return f"{self.email} until {self.locked_until}"


class StaffInvite(models.Model):
    class EmailStatus(models.TextChoices):
        PENDING = "pending", "Waiting for the database commit"
        SIMULATED = "simulated", "Simulated (dev mailbox)"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invites"
    )
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=User.Role.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="invites_sent",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    email_status = models.CharField(
        max_length=20, choices=EmailStatus.choices, default=EmailStatus.PENDING
    )
    last_sent_at = models.DateTimeField(null=True, blank=True)
    send_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Invite {self.email} ({self.role})"


class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reset_tokens"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Reset for {self.user_id}"


class OtpChallenge(models.Model):
    """A one-time 6-digit code emailed to a customer (register or sign-in).

    Only a keyed hash of the code is stored. A challenge is valid for a few minutes, allows a
    few wrong tries, and is closed as soon as it is used or replaced by a newer one.
    """

    class Purpose(models.TextChoices):
        REGISTER = "register", "Verify email after registration"
        LOGIN = "login", "Sign-in code"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="otp_challenges"
    )
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "purpose", "-created_at"])]

    def __str__(self) -> str:
        return f"OTP {self.purpose} for {self.user_id}"


class WorkSession(models.Model):
    """One stretch of work for a receptionist: sign-in to sign-out (or to the last activity before
    an idle sign-out). Hours and pay are worked out from these rows. Only the admin can correct
    one, with a reason, and every correction is audited."""

    class EndReason(models.TextChoices):
        LOGOUT = "logout", "Signed out"
        IDLE = "idle", "Signed out after being idle"
        REPLACED = "replaced", "Signed in again elsewhere"
        CORRECTED = "corrected", "Closed by the admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="work_sessions"
    )
    started_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=12, choices=EndReason.choices, blank=True)
    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    correction_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["user", "-started_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["user"], condition=models.Q(ended_at__isnull=True), name="one_open_session"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.started_at:%Y-%m-%d %H:%M}"
