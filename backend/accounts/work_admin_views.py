"""Admin: receptionists' hours, sessions that look wrong, punctuality, shifts and monthly pay."""

from django.db import transaction
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import work, work_admin
from accounts.audit import audit
from accounts.models import AuditLog, ShiftSchedule, User
from accounts.work_views import parse_month


def receptionist_or_404(pk) -> User:
    member = User.objects.filter(pk=pk, role=User.Role.RECEPTIONIST).first()
    if member is None:
        raise Http404
    return member


class ReceptionistListView(APIView):
    policy_action = "work.admin.read"

    @extend_schema(summary="Every receptionist's hours, flags, punctuality and pay", responses=None)
    def get(self, request: Request) -> Response:
        year, month = parse_month(request.query_params.get("month"))
        first, nxt = work.month_bounds(year, month)
        rows = [work_admin.overview(u, first, nxt) for u in work_admin.receptionists(first, nxt)]
        total_hours = sum(float(r["pay"]["hours"]) for r in rows)
        total_pay = sum(float(r["pay"]["pay"] or 0) for r in rows)
        return Response(
            {
                "month": f"{year:04d}-{month:02d}",
                "receptionists": rows,
                "totals": {"hours": f"{total_hours:.2f}", "pay": f"{total_pay:.2f}"},
                "grace_minutes": int(work_admin.grace().total_seconds() // 60),
                "long_hours": work_admin.LONG_HOURS,
            }
        )


class ReceptionistDetailView(APIView):
    policy_action = "work.admin.read"

    @extend_schema(summary="One receptionist's sessions, flags, shifts and pay", responses=None)
    def get(self, request: Request, pk) -> Response:
        member = receptionist_or_404(pk)
        year, month = parse_month(request.query_params.get("month"))
        first, nxt = work.month_bounds(year, month)
        return Response(
            {
                "month": f"{year:04d}-{month:02d}",
                "grace_minutes": int(work_admin.grace().total_seconds() // 60),
                "long_hours": work_admin.LONG_HOURS,
                **work_admin.detail(member, first, nxt),
            }
        )


class ShiftDaySerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start = serializers.RegexField(r"^([01]\d|2[0-3]):[0-5]\d$")
    end = serializers.RegexField(r"^([01]\d|2[0-3]):[0-5]\d$")


class ShiftsSerializer(serializers.Serializer):
    days = ShiftDaySerializer(many=True, max_length=7)

    def validate_days(self, days):
        seen = set()
        for day in days:
            if day["weekday"] in seen:
                raise serializers.ValidationError("Each weekday can appear once.")
            seen.add(day["weekday"])
            if day["start"] >= day["end"]:
                raise serializers.ValidationError(
                    f"{work_admin.WEEKDAYS[day['weekday']]}: the shift must end after it starts."
                )
        return days


class ShiftsView(APIView):
    policy_actions = {"GET": "work.admin.read", "PUT": "work.shifts.update"}

    @extend_schema(summary="A receptionist's weekly shifts", responses=None)
    def get(self, request: Request, pk) -> Response:
        member = receptionist_or_404(pk)
        return Response({"id": str(member.pk), "shifts": work_admin.weekly_shifts(member)})

    @extend_schema(summary="Replace a receptionist's weekly shifts", request=ShiftsSerializer)
    def put(self, request: Request, pk) -> Response:
        member = receptionist_or_404(pk)
        body = ShiftsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            before = work_admin.weekly_shifts(member)
            ShiftSchedule.objects.filter(user=member).delete()
            ShiftSchedule.objects.bulk_create(
                ShiftSchedule(
                    user=member,
                    weekday=d["weekday"],
                    start_time=work_admin.parse_time(d["start"]),
                    end_time=work_admin.parse_time(d["end"]),
                )
                for d in body.validated_data["days"]
            )
            after = work_admin.weekly_shifts(member)
            audit(
                AuditLog.Action.SHIFTS_CHANGED,
                request=request,
                actor=request.user,
                target=member,
                before=before,
                after=after,
            )
        return Response({"id": str(member.pk), "shifts": after})
