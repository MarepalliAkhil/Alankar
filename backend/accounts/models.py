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
        MARKETING_CONSENT = "marketing_consent", "Marketing messages opted in or out"
        CONTENT_CHANGED = "content_changed", "Website content changed"
        CONTENT_PUBLISHED = "content_published", "Website content published or unpublished"
        MARKETING_CHANGED = "marketing_changed", "Offers, coupons or loyalty settings changed"
        CAMPAIGN_SENT = "campaign_sent", "Campaign sent"
        REPORT_EXPORTED = "report_exported", "Report downloaded"
        AUDIT_EXPORTED = "audit_exported", "Audit log downloaded"
        SESSION_REVOKED = "session_revoked", "Staff session signed out by the admin"
        LOCK_CLEARED = "lock_cleared", "Locked account unlocked by the admin"
        DATA_REQUESTED = "data_requested", "Customer asked for their data or deletion"
        DATA_REQUEST_DECIDED = "data_request_decided", "Data request decided"
        DATA_EXPORTED = "data_exported", "Customer downloaded their data"
        CUSTOMER_ANONYMIZED = "customer_anonymized", "Customer account anonymized"
        PACKAGE_EDITED = "package_edited", "Package created or changed"
        PACKAGE_SOLD = "package_sold", "Package sold"
        PACKAGE_REFUNDED = "package_refunded", "Package refunded"
        PACKAGE_SESSION_RESTORED = "package_session_restored", "Package session put back"
        MEMBERSHIP_PLAN_EDITED = "membership_plan_edited", "Membership plan created or changed"
        MEMBERSHIP_JOINED = "membership_joined", "Membership started"
        MEMBERSHIP_RENEWED = "membership_renewed", "Membership renewed"
        MEMBERSHIP_CANCELLED = "membership_cancelled", "Membership cancelled"
        MEMBERSHIP_SESSION_RESTORED = "membership_session_restored", "Membership session put back"
        GIFT_CARD_SOLD = "gift_card_sold", "Gift card sold"
        GIFT_CARD_REDEEMED = "gift_card_redeemed", "Gift card used to pay"
        GIFT_CARD_VOIDED = "gift_card_voided", "Gift card cancelled"
        GIFT_CODE_LOCKED = "gift_code_locked", "Too many wrong gift card codes"
        WAITLIST_JOINED = "waitlist_joined", "Joined the waitlist"
        WAITLIST_CANCELLED = "waitlist_cancelled", "Waitlist entry cancelled"
        WAITLIST_OFFERED = "waitlist_offered", "Freed slot offered"
        WAITLIST_ACCEPTED = "waitlist_accepted", "Waitlist offer accepted"
        WAITLIST_DECLINED = "waitlist_declined", "Waitlist offer declined"
        WAITLIST_OFFER_EXPIRED = "waitlist_offer_expired", "Waitlist offer ran out"
        COUPONS_ISSUED = "coupons_issued", "Private coupons issued"
        COUPON_REVOKED = "coupon_revoked", "Private coupon withdrawn"
        CAMPAIGN_SCHEDULED = "campaign_scheduled", "Campaign scheduled"
        CAMPAIGN_UNSCHEDULED = "campaign_unscheduled", "Campaign schedule removed"
        TWO_FACTOR_ENABLED = "two_factor_enabled", "Two-step sign-in switched on"
        TWO_FACTOR_DISABLED = "two_factor_disabled", "Two-step sign-in switched off"
        TWO_FACTOR_RESET = "two_factor_reset", "Two-step sign-in reset by another admin"
        TWO_FACTOR_CODES = "two_factor_codes", "New backup codes created"
        TWO_FACTOR_BACKUP_USED = "two_factor_backup_used", "A backup code was used to sign in"
        PO_CREATED = "po_created", "Purchase order created or changed"
        PO_SENT = "po_sent", "Purchase order sent to the supplier"
        PO_RECEIVED = "po_received", "Purchase order goods received"
        PO_CLOSED = "po_closed", "Purchase order cancelled or closed"
        RATING_FLAGGED = "rating_flagged", "Rating put under review"
        RATING_EXCLUDED = "rating_excluded", "Rating excluded from pay and graphs"
        RATING_RESTORED = "rating_restored", "Rating restored after review"
        SHIFTS_CHANGED = "shifts_changed", "Weekly shifts changed"
        PAYROLL_CREATED = "payroll_created", "Payroll run drafted"
        PAYROLL_REFRESHED = "payroll_refreshed", "Payroll run recalculated"
        PAYROLL_ADJUSTED = "payroll_adjusted", "Payroll adjustment added"
        PAYROLL_ADJUSTMENT_VOIDED = "payroll_adjustment_voided", "Payroll adjustment voided"
        PAYROLL_APPROVED = "payroll_approved", "Payroll run approved"
        PAYROLL_PAID = "payroll_paid", "Payroll run marked as paid"
        REVIEW_SAVED = "review_saved", "Performance review saved"

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


class ShiftSchedule(models.Model):
    """One receptionist's shift on one weekday (0 = Monday). No row means a day off. Used only to
    judge punctuality: a session that starts within the grace period of the shift start is on
    time. The admin sets shifts; the receptionist cannot."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shifts"
    )
    weekday = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["user_id", "weekday"]
        constraints = [
            models.UniqueConstraint(fields=["user", "weekday"], name="one_shift_per_weekday"),
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0, weekday__lte=6), name="shift_weekday_0_to_6"
            ),
            models.CheckConstraint(
                condition=models.Q(start_time__lt=models.F("end_time")),
                name="shift_start_before_end",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} day {self.weekday} {self.start_time}-{self.end_time}"


class TwoFactor(models.Model):
    """An admin's authenticator-app secret. Only confirmed ones are asked for at sign-in."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="two_factor"
    )
    secret = models.CharField(max_length=300)  # encrypted
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_step = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Two-step sign-in for {self.user_id}"


class BackupCode(models.Model):
    """A one-time code for a lost phone. Only a keyed hash is stored."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="backup_codes"
    )
    code_hash = models.CharField(max_length=64, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Backup code for {self.user_id}"
