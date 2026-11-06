"""Admin reports API: JSON for the charts and the same data as a CSV download."""

import csv
import re

from django.http import Http404, HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from billing import reports

NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def safe_cell(value) -> str:
    """Stops a spreadsheet from running text that starts with = + - @ as a formula."""
    text = str(value)
    if text and text[0] in "=+-@\t\r" and not NUMBER.match(text):
        return "'" + text
    return text


class ReportListView(APIView):
    policy_action = "reports.view"

    @extend_schema(summary="The available reports", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response([{"key": k, "label": label} for k, (label, _) in reports.REPORTS.items()])


class ReportView(APIView):
    policy_action = "reports.view"

    @extend_schema(
        summary="One report for a date range (export=csv to download)",
        parameters=[
            OpenApiParameter("from", str),
            OpenApiParameter("to", str),
            OpenApiParameter("export", str),
        ],
        responses={200: None},
    )
    def get(self, request: Request, name: str):
        if name not in reports.REPORTS:
            raise Http404
        label, build = reports.REPORTS[name]
        try:
            start, end = reports.parse_range(request.query_params)
            data = build(start, end)
        except reports.ReportError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        data.update({"key": name, "label": label, "from": start.isoformat(), "to": end.isoformat()})
        if request.query_params.get("export") != "csv":
            return Response(data)
        audit(
            AuditLog.Action.REPORT_EXPORTED,
            request=request,
            actor=request.user,
            report=name,
            start=start.isoformat(),
            end=end.isoformat(),
        )
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{name}_{start}_{end}.csv"'
        writer = csv.writer(response)
        keys = [c["key"] for c in data["columns"]]
        writer.writerow([safe_cell(c["label"]) for c in data["columns"]])
        for row in data["rows"]:
            writer.writerow([safe_cell(row.get(k, "")) for k in keys])
        writer.writerow([safe_cell(data["totals"].get(k, "")) for k in keys])
        return response
