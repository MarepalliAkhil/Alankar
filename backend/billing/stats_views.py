"""Admin shop statistics API (Task 14B): the dashboard JSON and a CSV export of any shown table."""

import csv

from django.http import Http404, HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from billing import shopstats
from billing.report_views import safe_cell


class ShopStatsView(APIView):
    policy_action = "stats.view"

    @extend_schema(
        summary="Shop statistics for a date range, with the period before it",
        parameters=[
            OpenApiParameter("preset", str, description="today, 7d, 30d, month or custom"),
            OpenApiParameter("from", str),
            OpenApiParameter("to", str),
            OpenApiParameter("table", str, description="with export=csv: which table"),
            OpenApiParameter("export", str),
        ],
        responses={200: None},
    )
    def get(self, request: Request):
        try:
            period = shopstats.resolve_period(request.query_params)
        except shopstats.StatsError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        data = shopstats.build(period)
        if request.query_params.get("export") != "csv":
            return Response(data)
        name = request.query_params.get("table", "")
        table = data["tables"].get(name)
        if table is None:
            raise Http404
        audit(
            AuditLog.Action.REPORT_EXPORTED,
            request=request,
            actor=request.user,
            report=f"stats:{name}",
            start=data["period"]["from"],
            end=data["period"]["to"],
        )
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="{name}_{data["period"]["from"]}_{data["period"]["to"]}.csv"'
        )
        writer = csv.writer(response)
        keys = [c["key"] for c in table["columns"]]
        writer.writerow([safe_cell(c["label"]) for c in table["columns"]])
        for row in table["rows"]:
            writer.writerow([safe_cell(row.get(k, "")) for k in keys])
        if table.get("totals"):
            writer.writerow([safe_cell(table["totals"].get(k, "")) for k in keys])
        return response
