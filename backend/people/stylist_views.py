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
from chat import images
from notifications import templates
from people import dayoff, pay
from people.models import DayOffRequest, StylistProfile
from scheduling import approvals, booking, stylist
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


def card(appt: Appointment, references: set[str] | None = None) -> dict:
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
        # The customer sent a "Style reference" photo for this visit (Zen Chat).
        "reference_photo": str(appt.id) in references if references is not None else False,
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
        **card(appt, images.reference_appointment_ids([appt.id])),
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
        visits = list(qs[:100])
        refs = images.reference_appointment_ids([a.id for a in visits])
        return Response({"scope": scope, "results": [card(a, refs) for a in visits]})


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


# --------------------------------------------------------------------------- Task 13A: Requests


def request_card(appt: Appointment, profile: StylistProfile, now) -> dict:
    """What a stylist sees of a booking request: first name only, the service and the time.
    No phone, email, price or payment, and never the customer's other bookings."""
    waiting = (
        appt.status == S.REQUESTED
        and appt.stylist_status == "pending"
        and appt.approval_expires_at is not None
        and appt.approval_expires_at > now
    )
    left = (
        max(0, int((appt.approval_expires_at - now).total_seconds() // 60))
        if waiting and appt.approval_expires_at
        else None
    )
    return {
        "id": str(appt.id),
        "customer_first_name": first_name(appt),
        "service_name": appt.service_name,
        "variant_label": appt.variant_label,
        "addon_labels": appt.addon_labels,
        "start": appt.start or appt.preferred_start,
        "duration_minutes": appt.duration_minutes,
        "allergy_alert": bool(appt.allergies),
        "my_status": appt.stylist_status,
        "my_status_label": appt.get_stylist_status_display(),
        "reception_status": appt.reception_status,
        "reception_status_label": appt.get_reception_status_display(),
        "booking_status": appt.status,
        "booking_status_label": appt.get_status_display(),
        "answer_by": appt.approval_expires_at if waiting else None,
        "minutes_left": left,
        "can_answer": waiting,
    }


class RequestListView(StylistView):
    policy_action = "stylist.requests.list"

    @extend_schema(summary="Booking requests waiting for me (pending first) and my recent answers")
    def get(self, request: Request) -> Response:
        profile = my_profile(request)
        booking.expire_due()
        now = timezone.now()
        pending = [request_card(a, profile, now) for a in approvals.requests_for(profile)]
        answered = [
            request_card(a, profile, now) for a in approvals.requests_for(profile, answered=True)
        ]
        return Response({"pending_count": len(pending), "pending": pending, "answered": answered})


class RequestAcceptView(StylistView):
    policy_action = "stylist.requests.accept"

    @extend_schema(summary="Accept a booking request (re-checks that I am free)")
    def post(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        try:
            appt = approvals.stylist_accept(pk, profile=profile, actor=request.user)
        except approvals.ApprovalNotFound as exc:
            raise Http404 from exc
        except booking.BookingError as exc:
            return Response(
                {"detail": exc.message},
                status=status.HTTP_409_CONFLICT
                if exc.code == "conflict"
                else status.HTTP_400_BAD_REQUEST,
            )
        audit(
            AuditLog.Action.APPOINTMENT_STYLIST_ACCEPTED,
            request=request,
            actor=request.user,
            target=appt.customer,
            appointment=str(appt.id),
            status=appt.status,
        )
        return Response(request_card(appt, profile, timezone.now()))


class RequestDeclineSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=list(templates.DECLINE_REASONS))


class RequestDeclineView(StylistView):
    policy_action = "stylist.requests.decline"

    @extend_schema(
        summary="Decline a booking request with a private reason category",
        request=RequestDeclineSerializer,
    )
    def post(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        body = RequestDeclineSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            appt = approvals.stylist_decline(
                pk, profile=profile, actor=request.user, reason=body.validated_data["reason"]
            )
        except approvals.ApprovalNotFound as exc:
            raise Http404 from exc
        except booking.BookingError as exc:
            return Response(
                {"detail": exc.message},
                status=status.HTTP_409_CONFLICT
                if exc.code == "conflict"
                else status.HTTP_400_BAD_REQUEST,
            )
        audit(
            AuditLog.Action.APPOINTMENT_STYLIST_DECLINED,
            request=request,
            actor=request.user,
            target=appt.customer,
            appointment=str(appt.id),
            reason=appt.stylist_decline_reason,
        )
        return Response(request_card(appt, profile, timezone.now()))


# --------------------------------------------------------------------------- Task 13B / 13C


class CalendarView(StylistView):
    """My own calendar: my working hours, my days off and my own bookings for a date range.
    There is no way to name another stylist; the range is capped at 35 days."""

    policy_action = "stylist.calendar.read"

    @extend_schema(summary="My calendar for a date range (from, to)")
    def get(self, request: Request) -> Response:
        profile = my_profile(request)
        try:
            first = date.fromisoformat(request.query_params.get("from", ""))
            last = date.fromisoformat(request.query_params.get("to", ""))
        except ValueError:
            first = timezone.localdate()
            last = first + timedelta(days=6)
        if last < first or (last - first).days > 34:
            return Response({"detail": "Choose a range of up to 35 days."}, status=400)
        tz = timezone.get_current_timezone()
        lo = datetime.combine(first, time.min, tzinfo=tz)
        hi = datetime.combine(last + timedelta(days=1), time.min, tzinfo=tz)
        visits = list(
            stylist.visible_for(profile).filter(start__gte=lo, start__lt=hi).order_by("start")
        )
        refs = images.reference_appointment_ids([a.id for a in visits])
        holds = Appointment.objects.filter(
            hold_stylist=profile,
            status=S.REQUESTED,
            approval_expires_at__gt=timezone.now(),
            hold_start__gte=lo,
            hold_start__lt=hi,
        ).order_by("hold_start")
        days = []
        for offset in range((last - first).days + 1):
            day = first + timedelta(days=offset)
            window = booking.stylist_windows(day, [profile.id]).get(profile.id)
            off = DayOffRequest.objects.filter(
                stylist=profile,
                status=DayOffRequest.Status.APPROVED,
                start_date__lte=day,
                end_date__gte=day,
            ).exists()
            days.append(
                {
                    "date": day.isoformat(),
                    "hours": [window[0].strftime("%H:%M"), window[1].strftime("%H:%M")]
                    if window
                    else None,
                    "day_off": off,
                    "visits": [
                        card(a, refs) for a in visits if timezone.localtime(a.start).date() == day
                    ],
                    "waiting_requests": [
                        {
                            "id": str(a.id),
                            "customer_first_name": first_name(a),
                            "service_name": a.service_name,
                            "start": a.hold_start,
                            "end": a.hold_end,
                        }
                        for a in holds
                        if timezone.localtime(a.hold_start).date() == day
                    ],
                }
            )
        return Response({"from": first.isoformat(), "to": last.isoformat(), "days": days})


class ChangeReasonSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=list(templates.CHANGE_REASONS))
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class StylistCancelView(StylistView):
    policy_action = "stylist.appointments.cancel"

    @extend_schema(
        summary="Cancel my own scheduled visit (reason category required)",
        request=ChangeReasonSerializer,
    )
    def post(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        body = ChangeReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            appt = stylist.cancel_own(
                pk,
                profile=profile,
                actor=request.user,
                reason=body.validated_data["reason"],
                note=body.validated_data["note"],
            )
        except stylist.VisitError as exc:
            return Response(
                {"detail": exc.message},
                status={"conflict": 409, "not_found": 404}.get(exc.code, 400),
            )
        audit(
            AuditLog.Action.APPOINTMENT_CANCELLED_BY_STYLIST,
            request=request,
            actor=request.user,
            target=appt.customer,
            appointment=str(appt.id),
            reason=body.validated_data["reason"],
        )
        return Response({"id": str(appt.id), "status": appt.status})


class StylistMoveSerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    reason = serializers.ChoiceField(choices=list(templates.CHANGE_REASONS))


class StylistMoveView(StylistView):
    policy_actions = {"GET": "stylist.appointments.move", "POST": "stylist.appointments.move"}

    @extend_schema(summary="Free times on a day to move my own visit to")
    def get(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        try:
            day = date.fromisoformat(request.query_params.get("date", ""))
        except ValueError:
            return Response({"detail": "Choose a date."}, status=400)
        try:
            starts = stylist.move_slots(pk, profile=profile, day=day)
        except stylist.VisitError as exc:
            return Response({"detail": exc.message}, status=404)
        return Response({"date": day.isoformat(), "slots": [s.isoformat() for s in starts]})

    @extend_schema(
        summary="Move my own scheduled visit (reason category required)",
        request=StylistMoveSerializer,
    )
    def post(self, request: Request, pk) -> Response:
        profile = my_profile(request)
        body = StylistMoveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            appt = stylist.move_own(
                pk,
                profile=profile,
                actor=request.user,
                start=body.validated_data["start"],
                reason=body.validated_data["reason"],
            )
        except stylist.VisitError as exc:
            return Response(
                {"detail": exc.message},
                status={"conflict": 409, "not_found": 404}.get(exc.code, 400),
            )
        audit(
            AuditLog.Action.APPOINTMENT_MOVED_BY_STYLIST,
            request=request,
            actor=request.user,
            target=appt.customer,
            appointment=str(appt.id),
            reason=body.validated_data["reason"],
        )
        return Response({"id": str(appt.id), "status": appt.status, "start": appt.start})
