"""Role-specific appointment serializers.

Customer-safe: own data only, stylist shown by display name only (never phone, pay or schedule).
Desk (receptionist/admin): adds customer contact, allergies, notes and history.
"""

from rest_framework import serializers

from core import crypto
from notifications import templates
from scheduling import booking
from scheduling.models import (
    Appointment,
    AppointmentEvent,
    AppointmentStatus,
    Room,
    SlotChange,
)

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
    package_code = serializers.CharField(
        max_length=60, required=False, allow_blank=True, default=""
    )
    products = serializers.ListField(
        child=serializers.DictField(), required=False, default=list, max_length=10
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


class AcceptSerializer(serializers.Serializer):
    """The front desk's Accept. The time is the one the customer asked for; a stylist is only
    named for an "any" request, and a room is optional."""

    stylist = serializers.UUIDField(required=False, allow_null=True)
    room = serializers.UUIDField(required=False, allow_null=True)


class ReassignSerializer(serializers.Serializer):
    stylist = serializers.UUIDField()
    reason = serializers.ChoiceField(choices=list(templates.CHANGE_REASONS))


class StylistDeclineSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=list(templates.DECLINE_REASONS))


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


class ChangeReasonField(serializers.ChoiceField):
    """The reason category staff must pick before changing a customer's slot (13C). The choices
    are the customer-safe ones only; a stylist's private reasons are not among them."""

    def __init__(self, **kwargs):
        super().__init__(choices=list(templates.CHANGE_REASONS), **kwargs)


class DeskCancelSerializer(serializers.Serializer):
    reason = ChangeReasonField()
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class MoveSerializer(ConfirmSerializer):
    reason = ChangeReasonField()


class ChangeResponseSerializer(serializers.Serializer):
    response = serializers.ChoiceField(choices=["accept", "rebook", "cancel"])
    preferred = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


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
    gift_card_code = serializers.CharField(max_length=60, required=False, allow_blank=True)
    gift_card_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=0
    )
    coupon = serializers.CharField(max_length=40, required=False, allow_blank=True)


# What the customer's card says while their request is being answered (13A). The wording never
# names who said no, and never carries a stylist's private reason.
APPROVAL_STAGE = {
    AppointmentStatus.REQUESTED: (
        ("waiting", "Waiting for approval"),
        "The salon and your stylist both need to say yes. We will tell you as soon as they do.",
    ),
    AppointmentStatus.DECLINED_BY_STYLIST: (
        ("declined", "Declined"),
        "Your stylist isn't available for this time. Please choose another time or stylist.",
    ),
    AppointmentStatus.DECLINED_BY_RECEPTION: (
        ("declined", "Declined"),
        "We're sorry, we could not take this request. Please choose another time or stylist.",
    ),
    AppointmentStatus.EXPIRED: (
        ("declined", "Expired"),
        "We did not manage to confirm this in time, so the slot was released. We are sorry.",
    ),
    AppointmentStatus.AWAITING_PAYMENT: (
        ("confirmed", "Confirmed"),
        "Approved. Pay to keep your slot.",
    ),
    AppointmentStatus.SCHEDULED: (("confirmed", "Confirmed"), "Your booking is confirmed."),
}
REBOOKABLE = (
    AppointmentStatus.DECLINED_BY_STYLIST,
    AppointmentStatus.DECLINED_BY_RECEPTION,
    AppointmentStatus.EXPIRED,
)


class _AppointmentBase(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    stylist_name = serializers.SerializerMethodField()
    preferred_stylist_name = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    division = serializers.CharField(source="service.category.division", read_only=True)
    service_slug = serializers.CharField(source="service.slug", read_only=True)
    package_used = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()

    def get_products(self, obj: Appointment) -> list[dict]:
        """Task 8.5 part 4: products added to the visit (held, or billed)."""
        from scheduling import products

        return products.rows_data(obj)

    def get_stylist_name(self, obj: Appointment) -> str | None:
        return obj.stylist.display_name if obj.stylist_id else None

    def get_preferred_stylist_name(self, obj: Appointment) -> str | None:
        return obj.preferred_stylist.display_name if obj.preferred_stylist_id else None

    def get_room_name(self, obj: Appointment) -> str | None:
        return obj.room.name if obj.room_id else None

    def get_package_used(self, obj: Appointment) -> dict | None:
        """Task 8.5: so the receptionist/admin never bill this line again. Never the full code
        -- only the last four characters, same as everywhere else a package code is shown."""
        if not obj.package_purchase_id:
            return None
        from wallet import packagecodes

        return packagecodes.summary_for_appointment(obj)


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
    "package_used",
    "products",
    "created_at",
]


class CustomerAppointmentSerializer(_AppointmentBase):
    actions = serializers.SerializerMethodField()
    free_cancel_until = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    chat_thread_id = serializers.SerializerMethodField()
    approval = serializers.SerializerMethodField()
    rebook = serializers.SerializerMethodField()
    pending_change = serializers.SerializerMethodField()

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
            "approval",
            "rebook",
            "pending_change",
        ]

    def get_approval(self, obj: Appointment) -> dict | None:
        """Plain words for the booking card: Waiting for approval, Declined or Confirmed.
        Never says who answered, and never anything the stylist wrote privately."""
        stage = APPROVAL_STAGE.get(obj.status)
        if stage is None:
            return None
        label, message = stage
        out = {"stage": label[0], "label": label[1], "message": message}
        if obj.status == AppointmentStatus.REQUESTED and obj.approval_expires_at:
            out["answer_by"] = obj.approval_expires_at.isoformat()
        return out

    def get_rebook(self, obj: Appointment) -> dict | None:
        """What the one-click "Choose another time or stylist" button pre-fills."""
        if obj.status not in REBOOKABLE:
            return None
        return {
            "service": obj.service.slug,
            "variant": str(obj.variant_id) if obj.variant_id else None,
            "addons": [str(a.id) for a in obj.addons.all()],
            "start": obj.preferred_start.isoformat(),
        }

    def get_pending_change(self, obj: Appointment) -> dict | None:
        """The latest staff change this customer has not answered yet (13C)."""
        # `changes` is prefetched (newest first) by the list queries, so no query per row.
        change = next(
            (c for c in obj.changes.all() if c.response == SlotChange.Response.PENDING), None
        )
        if change is None or obj.status not in booking.CANCELLABLE + (AppointmentStatus.CANCELLED,):
            return None
        return {
            "id": str(change.id),
            "kind": change.kind,
            "reason": templates.CHANGE_REASONS.get(change.reason, ""),
            "old_start": change.old_start.isoformat() if change.old_start else None,
            "new_start": change.new_start.isoformat() if change.new_start else None,
            "new_stylist_name": change.new_stylist_name,
            "can_accept": change.kind != SlotChange.Kind.CANCELLED
            and obj.status in booking.CANCELLABLE,
            "can_cancel": obj.status in booking.CANCELLABLE,
            "can_rebook": True,
        }

    def get_chat_thread_id(self, obj: Appointment) -> str | None:
        """The Zen Chat thread with this visit's stylist (only once the visit is scheduled)."""
        from chat.models import Thread
        from chat.service import ELIGIBLE

        if not obj.stylist_id or obj.status not in ELIGIBLE:
            return None
        known = self.context.get("threads")  # lists pass {stylist_id: thread_id} in one query
        if known is not None and obj.stylist_id in known:
            return str(known[obj.stylist_id])
        thread, _ = Thread.objects.get_or_create(
            customer_id=obj.customer_id, stylist_id=obj.stylist_id
        )
        if known is not None:
            known[obj.stylist_id] = thread.id
        return str(thread.id)

    def get_actions(self, obj: Appointment) -> list[str]:
        return booking.customer_actions(obj, free_hours=self.context.get("free_cancel_hours"))

    def get_free_cancel_until(self, obj: Appointment):
        value = booking.free_cancel_until(obj, self.context.get("free_cancel_hours"))
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
    reception_status_label = serializers.CharField(
        source="get_reception_status_display", read_only=True
    )
    stylist_status_label = serializers.CharField(
        source="get_stylist_status_display", read_only=True
    )
    asked_stylist_id = serializers.SerializerMethodField()
    asked_stylist_name = serializers.SerializerMethodField()
    stylist_decline_reason_label = serializers.SerializerMethodField()

    def get_asked_stylist_id(self, obj: Appointment):
        asked = obj.hold_stylist_id or obj.stylist_id
        return str(asked) if asked else None

    def get_asked_stylist_name(self, obj: Appointment) -> str | None:
        asked = obj.hold_stylist or obj.stylist
        return asked.display_name if asked else None

    def get_stylist_decline_reason_label(self, obj: Appointment) -> str:
        """Private: only the front desk (and the stylist) ever see this."""
        return templates.DECLINE_REASONS.get(obj.stylist_decline_reason, "")

    class Meta:
        model = Appointment
        fields = [
            *COMMON_FIELDS,
            "reject_reason",
            "reception_status",
            "reception_status_label",
            "stylist_status",
            "stylist_status_label",
            "approval_expires_at",
            "asked_stylist_id",
            "asked_stylist_name",
            "stylist_decline_reason",
            "stylist_decline_reason_label",
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
