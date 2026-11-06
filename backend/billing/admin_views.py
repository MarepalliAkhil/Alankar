"""Admin-only: review the receptionists' daily cash closes."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from billing.models import CashClose


def close_row(c: CashClose) -> dict:
    return {
        "id": str(c.id),
        "date": c.business_date,
        "expected_cash": str(c.expected_cash),
        "expected_card": str(c.expected_card),
        "expected_upi": str(c.expected_upi),
        "counted_cash": str(c.counted_cash),
        "difference": str(c.difference),
        "invoice_count": c.invoice_count,
        "note": c.note,
        "closed_by": c.closed_by.full_name if c.closed_by_id else "",
        "closed_at": c.closed_at,
        "reviewed": c.reviewed_at is not None,
        "reviewed_by": c.reviewed_by.full_name if c.reviewed_by_id else "",
        "reviewed_at": c.reviewed_at,
        "review_note": c.review_note,
    }


class CashCloseListView(APIView):
    policy_action = "cash.close.review"

    @extend_schema(summary="Signed-off cash closes (add ?reviewed=no for the waiting ones)")
    def get(self, request: Request) -> Response:
        rows = CashClose.objects.select_related("closed_by", "reviewed_by")
        wanted = request.query_params.get("reviewed")
        if wanted == "no":
            rows = rows.filter(reviewed_at__isnull=True)
        elif wanted == "yes":
            rows = rows.filter(reviewed_at__isnull=False)
        rows = rows.order_by("-business_date")[:90]
        waiting = CashClose.objects.filter(reviewed_at__isnull=True).count()
        mismatched = CashClose.objects.filter(~Q(difference=0), reviewed_at__isnull=True).count()
        return Response(
            {
                "waiting": waiting,
                "waiting_with_difference": mismatched,
                "results": [close_row(c) for c in rows],
            }
        )


class ReviewSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class CashCloseReviewView(APIView):
    policy_action = "cash.close.review"

    @extend_schema(summary="Mark a cash close as reviewed", request=ReviewSerializer)
    def post(self, request: Request, pk) -> Response:
        body = ReviewSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        note = body.validated_data["note"].strip()
        record = get_object_or_404(CashClose, pk=pk)
        if record.difference != 0 and len(note) < 3:
            return Response(
                {"detail": "This close has a cash difference. Add a note to mark it reviewed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # update() on purpose: a signed-off close is never saved again, only reviewed once.
        done = CashClose.objects.filter(pk=pk, reviewed_at__isnull=True).update(
            reviewed_by=request.user, reviewed_at=timezone.now(), review_note=note
        )
        if not done:
            return Response(
                {"detail": "This close was already reviewed."}, status=status.HTTP_409_CONFLICT
            )
        record = CashClose.objects.select_related("closed_by", "reviewed_by").get(pk=pk)
        audit(
            AuditLog.Action.CASH_CLOSE_REVIEWED,
            request=request,
            actor=request.user,
            date=record.business_date.isoformat(),
            difference=str(record.difference),
            note=note,
        )
        return Response(close_row(record))
