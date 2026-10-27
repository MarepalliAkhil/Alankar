"""Role-specific appointment serializers.

Customer-safe: own data only, stylist shown by display name only (never phone, pay or schedule).
Desk (receptionist/admin): adds customer contact, allergies, notes and history.
"""

from rest_framework import serializers

from core import crypto
from scheduling import booking
from scheduling.models import Appointment, AppointmentEvent, Room

MAX_TEXT = 500


class SlotQuerySerializer(serializers.Serializer):
    service = serializers.SlugField()
    variant = serializers.UUIDField(required=False, allow_null=True)
    addons = serializers.ListField(child=serializers.UUIDField(), required=False)
    date = serializers.DateField()
    stylist = serializers.UUIDField(required=False, allow_null=True)


class BookingRequestSerializer(serializers.Serializer):
    service = serializers.SlugField()
    variant = serializers.UUIDField(required=False, allow_null=True)
    addons = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list, max_length=10
    )
    start = serializers.DateTimeField()
    stylist = serializers.UUIDField(required=False, allow_null=True)
    contact_name = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    contact_email = serializers.EmailField(max_length=254)
    contact_phone = serializers.CharField(max_length=20)
    notes = serializers.CharField(max_length=MAX_TEXT, required=False, allow_blank=True, default="")
    allergies = serializers.CharField(
        max_length=MAX_TEXT, required=False, allow_blank=True, default=""
    )
    consent = serializers.BooleanField()

    def validate_contact_phone(self, value: str) -> str:
        if not crypto.is_valid_indian_mobile(value):
            raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
        return crypto.normalize_phone(value)

    def validate_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError("Please accept the cancellation policy.")
        return value


class ConfirmSerializer(serializers.Serializer):
    stylist = serializers.UUIDField()
    start = serializers.DateTimeField()
    room = serializers.UUIDField(required=False, allow_null=True)


class DeskBookingSerializer(serializers.Serializer):
    """A walk-in or phone booking made by staff for an existing customer."""

    customer = serializers.UUIDField()
    service = serializers.SlugField()
    variant = serializers.UUIDField(required=False, allow_null=True)
    addons = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list, max_length=10
    )
    start = serializers.DateTimeField()
    stylist = serializers.UUIDField()
    room = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.ChoiceField(choices=["walk_in", "phone"])
    notes = serializers.CharField(max_length=MAX_TEXT, required=False, allow_blank=True, default="")
    allergies = serializers.CharField(
        max_length=MAX_TEXT, required=False, allow_blank=True, default=""
    )
    check_in_now = serializers.BooleanField(required=False, default=False)


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300, trim_whitespace=True)


class DeskCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300, trim_whitespace=True)


class DismissSerializer(serializers.Serializer):
    flag = serializers.ChoiceField(choices=["reschedule", "cancel"])
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class RescheduleSerializer(serializers.Serializer):
    preferred = serializers.DateTimeField()
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class PaySerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["success", "fail"])
    link = serializers.CharField(max_length=100, required=False, allow_blank=True)


class _AppointmentBase(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    stylist_name = serializers.SerializerMethodField()
    preferred_stylist_name = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    division = serializers.CharField(source="service.category.division", read_only=True)
    service_slug = serializers.CharField(source="service.slug", read_only=True)

    def get_stylist_name(self, obj: Appointment) -> str | None:
        return obj.stylist.display_name if obj.stylist_id else None

    def get_preferred_stylist_name(self, obj: Appointment) -> str | None:
        return obj.preferred_stylist.display_name if obj.preferred_stylist_id else None

    def get_room_name(self, obj: Appointment) -> str | None:
        return obj.room.name if obj.room_id else None


COMMON_FIELDS = [
    "id",
    "status",
    "status_label",
    "service_name",
    "service_slug",
    "division",
    "variant_label",
    "addon_labels",
    "duration_minutes",
    "price_total",
    "gst_amount",
    "amount_payable",
    "preferred_start",
    "preferred_stylist_name",
    "stylist_name",
    "room_name",
    "start",
    "end",
    "awaiting_payment_until",
    "arrived_at",
    "reschedule_requested",
    "reschedule_preferred",
    "cancel_requested",
    "reject_reason",
    "created_at",
]


class CustomerAppointmentSerializer(_AppointmentBase):
    actions = serializers.SerializerMethodField()
    free_cancel_until = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    chat_thread_id = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            *COMMON_FIELDS,
            "notes",
            "allergies",
            "actions",
            "free_cancel_until",
            "amount_paid",
            "chat_thread_id",
        ]

    def get_chat_thread_id(self, obj: Appointment) -> str | None:
        """The Zen Chat thread with this visit's stylist (only once the visit is scheduled)."""
        from chat.models import Thread
        from chat.service import ELIGIBLE

        if not obj.stylist_id or obj.status not in ELIGIBLE:
            return None
        thread, _ = Thread.objects.get_or_create(
            customer_id=obj.customer_id, stylist_id=obj.stylist_id
        )
        return str(thread.id)

    def get_actions(self, obj: Appointment) -> list[str]:
        return booking.customer_actions(obj)

    def get_free_cancel_until(self, obj: Appointment):
        value = booking.free_cancel_until(obj)
        return value.isoformat() if value else None

    def get_amount_paid(self, obj: Appointment) -> str:
        return str(booking.paid_amount(obj))


class EventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AppointmentEvent
        fields = ["action", "from_status", "to_status", "note", "actor_name", "created_at"]

    def get_actor_name(self, obj: AppointmentEvent) -> str:
        return obj.actor.full_name if obj.actor_id else "System"


class DeskAppointmentSerializer(_AppointmentBase):
    customer_name = serializers.CharField(source="contact_name", read_only=True)
    customer_email = serializers.CharField(source="contact_email", read_only=True)
    customer_phone = serializers.CharField(source="contact_phone", read_only=True)
    preferred_stylist_id = serializers.UUIDField(read_only=True)
    stylist_id = serializers.UUIDField(read_only=True)
    room_id = serializers.UUIDField(read_only=True)
    events = EventSerializer(many=True, read_only=True)
    actions = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            *COMMON_FIELDS,
            "customer_name",
            "customer_email",
            "customer_phone",
            "preferred_stylist_id",
            "stylist_id",
            "room_id",
            "notes",
            "allergies",
            "reschedule_note",
            "cancel_reason",
            "source",
            "events",
            "actions",
        ]

    def get_actions(self, obj: Appointment) -> list[str]:
        return booking.desk_actions(obj)


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "division"]


class ScheduleItemSerializer(serializers.ModelSerializer):
    """One block on the day board. No contact details, notes or allergies."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="contact_name", read_only=True)
    stylist_id = serializers.UUIDField(read_only=True)
    room_id = serializers.UUIDField(read_only=True)
    actions = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id",
            "status",
            "status_label",
            "service_name",
            "customer_name",
            "stylist_id",
            "room_id",
            "start",
            "end",
            "duration_minutes",
            "arrived_at",
            "reschedule_requested",
            "cancel_requested",
            "source",
            "actions",
        ]

    def get_actions(self, obj: Appointment) -> list[str]:
        return booking.desk_actions(obj)
