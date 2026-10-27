"""Working hours: the activity ping, a receptionist's own hours and pay, and the admin's view and
corrections. The rules live in accounts.work."""

from datetime import date, timedelta

from django.db import transaction
from django.db.models import F, Q
from django.db.models.functions import Coalesce
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import work
from accounts.audit import audit
from accounts.models import AuditLog, User, WorkSession

MAX_SESSION_HOURS = 16


class ActivityView(APIView):
    policy_action = "work.ping"

    @extend_schema(
        summary="The page saw real activity (keeps the session alive)", responses={204: None}
    )
    def post(self, request: Request) -> Response:
        if not work.ping(request.user):
            return Response({"detail": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(status=status.HTTP_204_NO_CONTENT)


def parse_month(value) -> tuple[int, int]:
    today = timezone.localdate()
    try:
        year, month = (int(part) for part in str(value).split("-"))
        date(year, month, 1)
    except (TypeError, ValueError):
        return today.year, today.month
    return year, month


def session_row(session: WorkSession) -> dict:
    seconds = work.worked_seconds(session)
    return {
        "id": str(session.id),
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "hours": str(work.hours(seconds)),
        "open": session.ended_at is None,
        "end_reason": session.end_reason,
        "end_reason_label": session.get_end_reason_display() if session.end_reason else "",
        "corrected": session.corrected_by_id is not None,
        "correction_reason": session.correction_reason,
    }


def hours_payload(user: User, month_value) -> dict:
    year, month = parse_month(month_value)
    first, nxt = work.month_bounds(year, month)
    rows = list(work.sessions_in(user, first, nxt).select_related("corrected_by"))
    total = sum(work.worked_seconds(s) for s in rows)
    day_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    today = sum(work.worked_seconds(s) for s in work.sessions_in(user, day_start, day_end))
    rate = user.hourly_rate
    earned = work.pay(total, rate)
    return {
        "month": f"{year:04d}-{month:02d}",
        "hourly_rate": None if rate is None else str(rate),
        "total_hours": str(work.hours(total)),
        "today_hours": str(work.hours(today)),
        "estimated_pay": None if earned is None else str(earned),
        "working_now": any(s.ended_at is None for s in rows),
        "idle_minutes": int(work.idle_limit().total_seconds() // 60),
        "sessions": [session_row(s) for s in rows],
    }


class MyHoursView(APIView):
    policy_action = "hours.read"

    @extend_schema(summary="My hours and estimated pay for a month")
    def get(self, request: Request) -> Response:
        return Response(hours_payload(request.user, request.query_params.get("month")))


class StaffHoursView(APIView):
    policy_action = "staff.hours.read"

    @extend_schema(summary="A receptionist's hours and estimated pay for a month")
    def get(self, request: Request, pk) -> Response:
        member = User.objects.filter(pk=pk, role=User.Role.RECEPTIONIST).first()
        if member is None:
            raise Http404
        return Response(
            {
                **hours_payload(member, request.query_params.get("month")),
                "name": member.full_name or member.email,
            }
        )


class CorrectionSerializer(serializers.Serializer):
    started_at = serializers.DateTimeField()
    ended_at = serializers.DateTimeField()
    reason = serializers.CharField(min_length=3, max_length=200)


class SessionCorrectView(APIView):
    policy_action = "staff.hours.correct"

    @extend_schema(summary="Correct the times of a work session", request=CorrectionSerializer)
    def post(self, request: Request, pk) -> Response:
        body = CorrectionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        start, stop = data["started_at"], data["ended_at"]
        if stop <= start:
            return Response(
                {"detail": "The end must be after the start."}, status=status.HTTP_400_BAD_REQUEST
            )
        if stop > timezone.now():
            return Response(
                {"detail": "The end cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST
            )
        if (stop - start).total_seconds() > MAX_SESSION_HOURS * 3600:
            return Response(
                {"detail": f"A session cannot be longer than {MAX_SESSION_HOURS} hours."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            session = WorkSession.objects.select_for_update().filter(pk=pk).first()
            if session is None:
                raise Http404
            clash = (
                WorkSession.objects.filter(user=session.user_id)
                .exclude(pk=session.pk)
                .annotate(stop=Coalesce("ended_at", F("last_seen_at")))
                .filter(Q(started_at__lt=stop) & Q(stop__gt=start))
                .exists()
            )
            if clash:
                return Response(
                    {"detail": "These times overlap another work session."},
                    status=status.HTTP_409_CONFLICT,
                )
            before = {"started_at": session.started_at, "ended_at": session.ended_at}
            session.started_at = start
            session.ended_at = stop
            session.last_seen_at = max(session.last_seen_at, stop)
            if not session.end_reason:
                session.end_reason = WorkSession.EndReason.CORRECTED
            session.corrected_by = request.user
            session.correction_reason = data["reason"]
            session.save()
            audit(
                AuditLog.Action.WORK_SESSION_CORRECTED,
                request=request,
                actor=request.user,
                target=session.user,
                session=str(session.id),
                old_start=before["started_at"].isoformat(),
                old_end=before["ended_at"].isoformat() if before["ended_at"] else None,
                new_start=start.isoformat(),
                new_end=stop.isoformat(),
                reason=data["reason"],
            )
        return Response(session_row(session))
