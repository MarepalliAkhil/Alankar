"""Admin-only business settings: shop details, opening hours, booking rules, billing, security
and the rating bands used for stylist pay. Every change is audited with old and new values."""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from people.admin_views import WEEKDAYS, WeeklyHoursField
from website.content import (
    booking_settings,
    content,
    package_settings,
    pay_rules,
    pos_settings,
    security_settings,
)
from website.models import SiteContent

DAY_NAMES = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}


def public_hours(weekly: dict) -> list[dict]:
    """The opening-hours list shown on the public site, grouped from the weekly hours."""
    groups: list[list] = []
    for day in WEEKDAYS:
        hours = weekly.get(day)
        if groups and groups[-1][1] == hours:
            groups[-1][0].append(day)
        else:
            groups.append([[day], hours])
    rows = []
    for days, hours in groups:
        label = (
            DAY_NAMES[days[0]]
            if len(days) == 1
            else f"{DAY_NAMES[days[0]]} – {DAY_NAMES[days[-1]]}"
        )
        if hours:
            rows.append({"days": label, "open": hours[0], "close": hours[1]})
        else:
            rows.append({"days": label, "open": "Closed", "close": "", "closed": True})
    return rows


class ShopSerializer(serializers.Serializer):
    address = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    map_url = serializers.URLField(max_length=300, required=False, allow_blank=True)
    gst_number = serializers.RegexField(
        r"^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$",
        required=False,
        allow_blank=True,
        error_messages={"invalid": "A GST number has 15 characters, like 37ABCDE1234F1Z5."},
    )

    def to_internal_value(self, data):
        data = {**data}
        if isinstance(data.get("gst_number"), str):
            data["gst_number"] = data["gst_number"].strip().upper()
        return super().to_internal_value(data)


class HoursSerializer(serializers.Serializer):
    weekly_hours = WeeklyHoursField()


class BookingRulesSerializer(serializers.Serializer):
    free_cancel_hours = serializers.IntegerField(min_value=0, max_value=720, required=False)
    hold_hours = serializers.IntegerField(min_value=1, max_value=72, required=False)
    waitlist_offer_minutes = serializers.IntegerField(min_value=5, max_value=240, required=False)


class BillingSerializer(serializers.Serializer):
    discount_cap_percent = serializers.IntegerField(min_value=0, max_value=100, required=False)


class SecuritySerializer(serializers.Serializer):
    idle_minutes = serializers.IntegerField(min_value=5, max_value=120, required=False)
    late_grace_minutes = serializers.IntegerField(min_value=0, max_value=60, required=False)


class BandSerializer(serializers.Serializer):
    min_average = serializers.DecimalField(
        max_digits=3, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("5")
    )
    multiplier = serializers.DecimalField(
        max_digits=4, decimal_places=2, min_value=Decimal("0.50"), max_value=Decimal("2.00")
    )


class RatingSerializer(serializers.Serializer):
    min_ratings = serializers.IntegerField(min_value=1, max_value=100, required=False)
    flag_below = serializers.DecimalField(
        max_digits=3,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("5"),
        required=False,
    )
    bands = BandSerializer(many=True, required=False)

    def validate_bands(self, bands):
        if not bands:
            raise serializers.ValidationError("Add at least one band.")
        averages = [b["min_average"] for b in bands]
        if averages != sorted(set(averages), reverse=True):
            raise serializers.ValidationError(
                "List the bands from the highest average down, once each."
            )
        if averages[-1] != 0:
            raise serializers.ValidationError(
                "The last band must start at 0 so everyone is covered."
            )
        return bands


class PackageSettingsSerializer(serializers.Serializer):
    # None = no deadline on a cancellation request.
    refund_window_days = serializers.IntegerField(
        min_value=1, max_value=3650, required=False, allow_null=True
    )
    cancellation_fee_percent = serializers.IntegerField(min_value=0, max_value=100, required=False)
    refund_expired_packages = serializers.BooleanField(required=False)
    no_show_consumes_session = serializers.BooleanField(required=False)


class SettingsSerializer(serializers.Serializer):
    shop = ShopSerializer(required=False)
    hours = HoursSerializer(required=False)
    booking = BookingRulesSerializer(required=False)
    billing = BillingSerializer(required=False)
    security = SecuritySerializer(required=False)
    rating = RatingSerializer(required=False)
    packages = PackageSettingsSerializer(required=False)


def two(value) -> str:
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


def snapshot() -> dict:
    contact = content("contact", {}) or {}
    rules = pay_rules()
    booking = booking_settings()
    return {
        "shop": {
            "address": contact.get("address", ""),
            "phone": contact.get("phone", ""),
            "email": contact.get("email", ""),
            "map_url": contact.get("map_url", ""),
            "gst_number": contact.get("gst_number", ""),
        },
        "hours": {"weekly_hours": booking["weekly_hours"]},
        "booking": {
            "free_cancel_hours": booking["free_cancel_hours"],
            "hold_hours": booking["hold_hours"],
            "waitlist_offer_minutes": booking["waitlist_offer_minutes"],
        },
        "billing": {"discount_cap_percent": pos_settings()["discount_cap_percent"]},
        "security": security_settings(),
        "packages": package_settings(),
        "rating": {
            "min_ratings": rules["min_ratings"],
            "flag_below": two(rules["flag_below"]),
            "bands": [
                {"min_average": two(low), "multiplier": two(mult)}
                for low, mult in rules["rating_bands"]
            ],
        },
    }


def save_key(key: str, updates: dict) -> None:
    row, _ = SiteContent.objects.get_or_create(key=key, defaults={"value": {}})
    row.value = {**(row.value or {}), **updates}
    row.save()


def norm(value):
    """Values compared and logged as plain text so Decimal('4.5') equals '4.50'."""
    if isinstance(value, (list, tuple)):
        return [norm(v) for v in value]
    if isinstance(value, dict):
        return {k: norm(v) for k, v in value.items()}
    if isinstance(value, (Decimal, int, float)) and not isinstance(value, bool):
        try:
            return str(Decimal(str(value)).normalize()) if "." in str(value) else str(value)
        except InvalidOperation:
            return str(value)
    return value


class SettingsView(APIView):
    policy_actions = {"GET": "settings.business.read", "PATCH": "settings.business.update"}

    @extend_schema(summary="Business settings", responses=SettingsSerializer)
    def get(self, request: Request) -> Response:
        return Response(snapshot())

    @extend_schema(summary="Change business settings", request=SettingsSerializer)
    def patch(self, request: Request) -> Response:
        body = SettingsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        before = snapshot()
        with transaction.atomic():
            if "shop" in data:
                save_key("contact", dict(data["shop"]))
            if "hours" in data:
                weekly = {**booking_settings()["weekly_hours"], **data["hours"]["weekly_hours"]}
                save_key("booking", {"weekly_hours": weekly})
                SiteContent.objects.update_or_create(
                    key="hours", defaults={"value": public_hours(weekly)}
                )
            if "booking" in data:
                save_key("booking", dict(data["booking"]))
            if "billing" in data:
                save_key("pos", dict(data["billing"]))
            if "security" in data:
                save_key("security", dict(data["security"]))
            if "packages" in data:
                save_key("packages", dict(data["packages"]))
            if "rating" in data:
                rating = data["rating"]
                updates: dict = {}
                if "min_ratings" in rating:
                    updates["min_ratings"] = rating["min_ratings"]
                if "flag_below" in rating:
                    updates["flag_below"] = str(rating["flag_below"])
                if "bands" in rating:
                    updates["rating_bands"] = [
                        [str(b["min_average"]), str(b["multiplier"])] for b in rating["bands"]
                    ]
                save_key("pay_rules", updates)
        after = snapshot()
        for section in data:
            changes = {}
            for field, new in after[section].items():
                old = before[section].get(field)
                if norm(old) != norm(new):
                    changes[field] = [old, new]
            if changes:
                audit(
                    AuditLog.Action.SETTINGS_CHANGED,
                    request=request,
                    actor=request.user,
                    section=section,
                    changes=changes,
                )
        return Response(after)
