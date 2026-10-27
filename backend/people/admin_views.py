"""Admin-only: edit a staff member's role-specific details, link a stylist account to a team
profile, and decide days-off requests. Every change is written to the audit log."""

from datetime import time

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog, User
from core import brand
from core.mail import queue_mail
from core.models import MailOutbox
from people import dayoff, linking
from people.models import DayOffRequest, StylistProfile
from scheduling.models import Division, Service
from website.content import booking_settings

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def staff_member(pk) -> User:
    return get_object_or_404(User, pk=pk, role__in=User.STAFF_ROLES)


def profile_data(profile: StylistProfile) -> dict:
    shop = booking_settings()["weekly_hours"]
    own = profile.weekly_hours or {}
    return {
        "id": str(profile.id),
        "display_name": profile.display_name,
        "title": profile.title,
        "specialization": profile.specialization,
        "bio": profile.bio,
        "photo_url": profile.photo_url,
        "divisions": profile.divisions,
        "service_ids": [str(i) for i in profile.services.values_list("id", flat=True)],
        "is_public": profile.is_public,
        "weekly_hours": own,
        "effective_hours": {day: own[day] if day in own else shop.get(day) for day in WEEKDAYS},
    }


def details(member: User) -> dict:
    data: dict = {
        "user_id": str(member.id),
        "role": member.role,
        "full_name": member.full_name,
        "email": member.email,
    }
    if member.role == User.Role.RECEPTIONIST:
        data["hourly_rate"] = None if member.hourly_rate is None else str(member.hourly_rate)
        return data
    profile = StylistProfile.objects.filter(user=member).first()
    data["profile"] = profile_data(profile) if profile else None
    data["services"] = [
        {
            "id": str(s.id),
            "name": s.name,
            "division": s.category.division,
            "category": s.category.name,
            "is_active": s.is_active,
        }
        for s in Service.objects.select_related("category").order_by(
            "category__division", "category__sort_order", "sort_order", "name"
        )
    ]
    data["divisions"] = [{"value": v, "label": label} for v, label in Division.choices]
    data["unlinked_profiles"] = [
        {"id": str(p.id), "display_name": p.display_name, "title": p.title}
        for p in StylistProfile.objects.filter(user__isnull=True).order_by("display_name")
    ]
    return data


def _hhmm(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise serializers.ValidationError("Use times like 09:30.") from exc


class WeeklyHoursField(serializers.Field):
    """{"mon": ["10:00", "18:00"], "sun": null}. Missing days follow the salon's hours."""

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Send the hours as an object per weekday.")
        clean: dict = {}
        for day, hours in data.items():
            if day not in WEEKDAYS:
                raise serializers.ValidationError(f"Unknown day: {day}")
            if hours in (None, []):
                clean[day] = None
                continue
            if not isinstance(hours, (list, tuple)) or len(hours) != 2:
                raise serializers.ValidationError("Each day needs a start and an end time.")
            start, end = _hhmm(hours[0]), _hhmm(hours[1])
            if start >= end:
                raise serializers.ValidationError(f"{day}: the end must be after the start.")
            clean[day] = [start.strftime("%H:%M"), end.strftime("%H:%M")]
        return clean

    def to_representation(self, value):
        return value


class StylistDetailsSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=80, required=False)
    title = serializers.CharField(max_length=80, required=False)
    specialization = serializers.CharField(max_length=160, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    photo_url = serializers.URLField(max_length=200, required=False, allow_blank=True)
    divisions = serializers.ListField(
        child=serializers.ChoiceField(choices=Division.values), required=False
    )
    service_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    weekly_hours = WeeklyHoursField(required=False)
    is_public = serializers.BooleanField(required=False)


class StaffDetailsView(APIView):
    policy_actions = {"GET": "staff.details.read", "PATCH": "staff.details.update"}

    @extend_schema(summary="Role-specific details of one staff member")
    def get(self, request: Request, pk) -> Response:
        return Response(details(staff_member(pk)))

    @extend_schema(
        summary="Edit a stylist's profile, services and hours", request=StylistDetailsSerializer
    )
    def patch(self, request: Request, pk) -> Response:
        member = staff_member(pk)
        if member.role != User.Role.STYLIST:
            return Response(
                {"detail": "Only stylists have a team profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile = StylistProfile.objects.filter(user=member).first()
        if profile is None:
            return Response(
                {"detail": "This stylist has no team profile yet. Link one first."},
                status=status.HTTP_409_CONFLICT,
            )
        body = StylistDetailsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        changes: dict = {}
        for field in (
            "display_name",
            "title",
            "specialization",
            "bio",
            "photo_url",
            "divisions",
            "weekly_hours",
            "is_public",
        ):
            if field in data and getattr(profile, field) != data[field]:
                changes[field] = [getattr(profile, field), data[field]]
                setattr(profile, field, data[field])
        if "service_ids" in data:
            wanted = set(data["service_ids"])
            found = Service.objects.filter(pk__in=wanted)
            if found.count() != len(wanted):
                return Response(
                    {"detail": "One of the services does not exist."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            old = set(profile.services.values_list("id", flat=True))
            if old != wanted:
                names = lambda ids: sorted(  # noqa: E731
                    Service.objects.filter(pk__in=ids).values_list("name", flat=True)
                )
                changes["services"] = [names(old), names(wanted)]
                profile.services.set(found)
        if changes:
            profile.save()
            audit(
                AuditLog.Action.STAFF_PROFILE_UPDATED,
                request=request,
                actor=request.user,
                target=member,
                changes={
                    k: [str(v[0]), str(v[1])] if k != "services" else v for k, v in changes.items()
                },
            )
        return Response(details(member))


class LinkSerializer(serializers.Serializer):
    profile = serializers.UUIDField()


class StaffLinkProfileView(APIView):
    policy_action = "staff.details.link"

    @extend_schema(
        summary="Link a stylist account to an existing team profile", request=LinkSerializer
    )
    def post(self, request: Request, pk) -> Response:
        member = staff_member(pk)
        if member.role != User.Role.STYLIST:
            return Response({"detail": "Only stylists have a team profile."}, status=400)
        body = LinkSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        profile = get_object_or_404(StylistProfile, pk=body.validated_data["profile"])
        try:
            linking.link_existing(member, profile)
        except linking.LinkError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        audit(
            AuditLog.Action.STYLIST_LINKED,
            request=request,
            actor=request.user,
            target=member,
            profile=profile.display_name,
        )
        return Response(details(member))


# --------------------------------------------------------------------------- days off


def visit_data(appt) -> dict:
    return {
        "id": str(appt.id),
        "start": appt.start,
        "service_name": appt.service_name,
        "customer_name": appt.contact_name,
        "status_label": appt.get_status_display(),
    }


def day_off_data(row: DayOffRequest, with_conflicts: bool = True) -> dict:
    conflicts = []
    if with_conflicts and row.status in (
        DayOffRequest.Status.PENDING,
        DayOffRequest.Status.APPROVED,
    ):
        conflicts = [
            visit_data(a) for a in dayoff.clashes(row.stylist, row.start_date, row.end_date)
        ]
    return {
        "id": str(row.id),
        "stylist": {"id": str(row.stylist_id), "name": row.stylist.display_name},
        "start_date": row.start_date,
        "end_date": row.end_date,
        "reason": row.reason,
        "status": row.status,
        "status_label": row.get_status_display(),
        "decision_note": row.decision_note,
        "decided_by": row.decided_by.full_name if row.decided_by_id else "",
        "decided_at": row.decided_at,
        "created_at": row.created_at,
        "conflicts": conflicts,
    }


class DayOffListView(APIView):
    policy_action = "staff.daysoff.list"

    @extend_schema(summary="Days-off requests (waiting first)")
    def get(self, request: Request) -> Response:
        rows = DayOffRequest.objects.select_related("stylist", "decided_by")
        wanted = request.query_params.get("status")
        if wanted in DayOffRequest.Status.values:
            rows = rows.filter(status=wanted)
        rows = sorted(
            rows[:200],
            key=lambda r: (r.status != DayOffRequest.Status.PENDING, -r.start_date.toordinal()),
        )
        return Response({"results": [day_off_data(r) for r in rows]})


class DecideSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "decline"])
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    acknowledge_conflicts = serializers.BooleanField(required=False, default=False)


class DayOffDecideView(APIView):
    policy_action = "staff.daysoff.decide"

    @extend_schema(summary="Approve or decline a days-off request", request=DecideSerializer)
    def post(self, request: Request, pk) -> Response:
        body = DecideSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            row, conflicting = dayoff.decide(
                pk,
                admin=request.user,
                decision=data["decision"],
                reason=data["reason"],
                acknowledge_conflicts=data["acknowledge_conflicts"],
            )
        except dayoff.DayOffError as exc:
            payload: dict = {"detail": exc.message, "code": exc.code}
            if exc.visits:
                payload["visits"] = [visit_data(v) for v in exc.visits]
            code = {"conflict": 409, "visits": 409, "not_found": 404}.get(exc.code, 400)
            return Response(payload, status=code)
        audit(
            AuditLog.Action.DAY_OFF_DECIDED,
            request=request,
            actor=request.user,
            target=row.stylist.user,
            decision=row.status,
            stylist=row.stylist.display_name,
            start=str(row.start_date),
            end=str(row.end_date),
            reason=row.decision_note,
            visits_left=len(conflicting),
        )
        if row.stylist.user_id:
            verdict = "approved" if row.status == DayOffRequest.Status.APPROVED else "declined"
            queue_mail(
                kind=MailOutbox.Kind.NOTICE,
                to=row.stylist.user.email,
                subject=f"{brand.SHOP_NAME}: your days off were {verdict}",
                body=(
                    f"Hello {row.stylist.display_name},\n\nYour request for {row.start_date} to "
                    f"{row.end_date} was {verdict}."
                    + (f"\nNote: {row.decision_note}" if row.decision_note else "")
                ),
            )
        return Response(day_off_data(row))
