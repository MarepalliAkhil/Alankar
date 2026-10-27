"""The stylist's own area: day, appointments, ratings, earnings and schedule. Every query starts
from the signed-in stylist's linked profile; there is no way to name another stylist."""

from datetime import date, datetime, time, timedelta

from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from accounts.work import month_bounds
from accounts.work_views import parse_month
from people import dayoff, pay
from people.models import DayOffRequest, StylistProfile
from scheduling import stylist
from scheduling.models import Appointment, AppointmentStatus
from website.content import booking_settings

S = AppointmentStatus
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def my_profile(request: Request) -> StylistProfile:
    """The stylist's team profile. An account that is not linked to one has nothing to show."""
    profile = stylist.profile_for(request.user)
    if profile is None:
        raise NotLinked
    return profile


class NotLinked(Exception):
    pass


class StylistView(APIView):
    """Base class: turns 'no linked profile' into a clear 409 for the page to explain."""

    def handle_exception(self, exc):
        if isinstance(exc, NotLinked):
            return Response(
                {
                    "detail": "Your account is not linked to a team profile yet. "
                    "Ask the admin to link it.",
                    "code": "not_linked",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().handle_exception(exc)


def first_name(appt: Appointment) -> str:
    parts = (appt.contact_name or "").split()
    return parts[0] if parts else "Guest"


def card(appt: Appointment) -> dict:
    """What a stylist sees of a visit. Deliberately has no phone, email, price or payment."""
    allergies = appt.allergies
    return {
        "id": str(appt.id),
        "status": appt.status,
        "status_label": appt.get_status_display(),
        "start": appt.start,
        "end": appt.end,
        "duration_minutes": appt.duration_minutes,
        "customer_first_name": first_name(appt),
        "service_name": appt.service_name,
        "variant_label": appt.variant_label,
        "addon_labels": appt.addon_labels,
        "room_name": appt.room.name if appt.room_id else None,
        "allergy_alert": bool(allergies),
        "actions": stylist.actions(appt),
    }


def detail(appt: Appointment, profile: StylistProfile) -> dict:
    customer_profile = getattr(appt.customer, "customer_profile", None)
    allergies = [appt.allergies]
    preferences = [appt.notes]
    if customer_profile is not None:
        allergies.append(customer_profile.allergies)
        preferences.append(customer_profile.preferences)
    allergy_text = "; ".join(dict.fromkeys(a.strip() for a in allergies if a and a.strip()))
    preference_text = "; ".join(dict.fromkeys(p.strip() for p in preferences if p and p.strip()))
    history = (
        Appointment.objects.filter(stylist=profile, customer=appt.customer, status=S.COMPLETED)
        .exclude(pk=appt.pk)
        .order_by("-start")[:10]
    )
    data = {
        **card(appt),
        "allergies": allergy_text,
        "preferences": preference_text,
        "booked_services": [
            {"key": line["key"], "label": line["label"]} for line in stylist.booked_lines(appt)
        ],
        "history": [
            {
                "date": h.start,
                "service_name": h.service_name,
                "variant_label": h.variant_label,
            }
            for h in history
        ],
        "completion": None,
    }
    completion = getattr(appt, "completion", None)
    if completion is not None:
        data["completion"] = {
            "done": [line["label"] for line in completion.done_lines],
            "removed": [line["label"] for line in completion.removed_lines],
            "note": completion.note,
            "completed_at": completion.completed_at,
        }
    return data


def day_bounds(day: date):
    tz = timezone.get_current_timezone()
    first = datetime.combine(day, time.min, tzinfo=tz)
    return first, first + timedelta(days=1)


class AppointmentListView(StylistView):
    """scope=today (My Day) | upcoming | past (My Appointments)."""

    policy_action = "stylist.appointments.list"

    @extend_schema(summary="My appointments (stylist)")
    def get(self, request: Request) -> Response:
        profile = my_profile(request)
        scope = request.query_params.get("scope", "today")
        qs = stylist.visible_for(profile)
        first, last = day_bounds(timezone.localdate())
        if scope == "today":
            qs = qs.filter(start__gte=first, start__lt=last).order_by("start")
        elif scope == "upcoming":
            qs = qs.filter(start__gte=last, status=S.SCHEDULED).order_by("start")
        elif scope == "past":
            qs = qs.filter(start__lt=first, status=S.COMPLETED).order_by("-start")
        else:
            return Response({"detail": "Unknown scope."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"scope": scope, "results": [card(a) for a in qs[:100]]})


class AppointmentDetailView(StylistView):
    policy_action = "stylist.appointments.read"

    @extend_schema(summary="One of my appointments with what I need to know")
    def get(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        appt = (
            stylist.visible_for(profile)
            .select_related("customer__customer_profile")
            .filter(pk=pk)
            .first()
        )
        if appt is None:
            raise Http404
        return Response(detail(appt, profile))


def run_action(request: Request, pk, action: str, **extra) -> Response:
    profile = my_profile(request)
    try:
        if action == "start":
            appt = stylist.start(pk, profile=profile, actor=request.user)
            log = AuditLog.Action.APPOINTMENT_STARTED
            meta: dict = {}
        else:
            appt, completion = stylist.complete(pk, profile=profile, actor=request.user, **extra)
            log = AuditLog.Action.APPOINTMENT_COMPLETED
            meta = {
                "removed": [line["label"] for line in completion.removed_lines],
                "done_price": str(completion.done_price),
            }
    except stylist.VisitError as exc:
        code = {"conflict": 409, "not_found": 404}.get(exc.code, 400)
        return Response({"detail": exc.message}, status=code)
    audit(
        log,
        request=request,
        actor=request.user,
        target=appt.customer,
        appointment=str(appt.id),
        **meta,
    )
    fresh = (
        stylist.visible_for(profile).select_related("customer__customer_profile").get(pk=appt.pk)
    )
    return Response(detail(fresh, profile))


class StartView(StylistView):
    policy_action = "stylist.appointments.start"

    @extend_schema(summary="Start the service (checked in to in progress)", request=None)
    def post(self, request: Request, pk) -> Response:
        return run_action(request, pk, "start")


class CompleteSerializer(serializers.Serializer):
    done = serializers.ListField(child=serializers.CharField(max_length=40), allow_empty=True)
    note = serializers.CharField(
        max_length=stylist.MAX_NOTE, required=False, allow_blank=True, default=""
    )


class CompleteView(StylistView):
    policy_action = "stylist.appointments.complete"

    @extend_schema(
        summary="Complete the service with the services really done", request=CompleteSerializer
    )
    def post(self, request: Request, pk) -> Response:
        body = CompleteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return run_action(
            request,
            pk,
            "complete",
            done_keys=body.validated_data["done"],
            note=body.validated_data["note"],
        )


class RatingsView(StylistView):
    policy_action = "stylist.ratings.read"

    @extend_schema(summary="My ratings and comments (anonymous)")
    def get(self, request: Request) -> Response:
        return Response(pay.ratings_overview(my_profile(request)))


class EarningsView(StylistView):
    policy_action = "stylist.earnings.read"

    @extend_schema(summary="My estimated pay for a month")
    def get(self, request: Request) -> Response:
        profile = my_profile(request)
        year, month = parse_month(request.query_params.get("month"))
        first, nxt = month_bounds(year, month)
        return Response({"month": f"{year:04d}-{month:02d}", **pay.earnings(profile, first, nxt)})


def day_off_row(row: DayOffRequest) -> dict:
    return {
        "id": str(row.id),
        "start_date": row.start_date,
        "end_date": row.end_date,
        "reason": row.reason,
        "status": row.status,
        "status_label": row.get_status_display(),
        "decision_note": row.decision_note,
        "created_at": row.created_at,
    }


class ScheduleView(StylistView):
    policy_action = "stylist.schedule.read"

    @extend_schema(summary="My working hours and days-off requests")
    def get(self, request: Request) -> Response:
        profile = my_profile(request)
        shop = booking_settings()["weekly_hours"]
        own = profile.weekly_hours or {}
        hours = [
            {"day": day, "hours": own[day] if day in own else shop.get(day), "own": day in own}
            for day in WEEKDAYS
        ]
        rows = DayOffRequest.objects.filter(stylist=profile).order_by("-start_date")[:30]
        return Response({"hours": hours, "days_off": [day_off_row(r) for r in rows]})


class DayOffSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField(min_length=3, max_length=200)


class DayOffCreateView(StylistView):
    policy_action = "stylist.daysoff.create"

    @extend_schema(summary="Ask for days off", request=DayOffSerializer)
    def post(self, request: Request) -> Response:
        profile = my_profile(request)
        body = DayOffSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            row = dayoff.request_days_off(
                profile, start=data["start_date"], end=data["end_date"], reason=data["reason"]
            )
        except dayoff.DayOffError as exc:
            payload: dict = {"detail": exc.message}
            if exc.visits:
                payload["visits"] = [
                    {
                        "id": str(v.id),
                        "start": v.start,
                        "service_name": v.service_name,
                        "customer_first_name": first_name(v),
                        "status_label": v.get_status_display(),
                    }
                    for v in exc.visits
                ]
            code = 409 if exc.code in ("conflict", "visits") else 400
            return Response(payload, status=code)
        audit(
            AuditLog.Action.DAY_OFF_REQUESTED,
            request=request,
            actor=request.user,
            target=request.user,
            start=str(row.start_date),
            end=str(row.end_date),
            reason=row.reason,
        )
        return Response(day_off_row(row), status=status.HTTP_201_CREATED)


class DayOffWithdrawView(StylistView):
    policy_action = "stylist.daysoff.withdraw"

    @extend_schema(summary="Withdraw a days-off request that is still waiting", request=None)
    def post(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        try:
            row = dayoff.withdraw(profile, pk)
        except dayoff.DayOffError as exc:
            code = {"conflict": 409, "not_found": 404}.get(exc.code, 400)
            return Response({"detail": exc.message}, status=code)
        audit(
            AuditLog.Action.DAY_OFF_WITHDRAWN,
            request=request,
            actor=request.user,
            target=request.user,
            start=str(row.start_date),
            end=str(row.end_date),
        )
        return Response(day_off_row(row))
