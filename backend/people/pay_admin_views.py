"""Admin: stylist pay for a month (estimates until payroll approves them)."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.work import month_bounds
from accounts.work_views import parse_month
from people import pay_admin
from people.models import StylistProfile


class StylistPayListView(APIView):
    policy_action = "pay.read"

    @extend_schema(summary="Every stylist's estimated pay for a month", responses={200: None})
    def get(self, request: Request) -> Response:
        year, month = parse_month(request.query_params.get("month"))
        start, end = month_bounds(year, month)
        return Response({"month": f"{year:04d}-{month:02d}", **pay_admin.month_list(start, end)})


class StylistPayDetailView(APIView):
    policy_action = "pay.read"

    @extend_schema(summary="One stylist's pay breakdown per appointment", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        profile = get_object_or_404(StylistProfile, pk=pk, user__isnull=False)
        year, month = parse_month(request.query_params.get("month"))
        start, end = month_bounds(year, month)
        return Response(
            {"month": f"{year:04d}-{month:02d}", **pay_admin.stylist_month(profile, start, end)}
        )
