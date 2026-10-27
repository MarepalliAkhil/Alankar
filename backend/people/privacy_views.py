"""Data requests: the customer asks, the admin decides (export or anonymize)."""

import json
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from people import privacy
from people.models import DataRequest

K = DataRequest.Kind
S = DataRequest.Status


def _expires(req: DataRequest):
    if req.kind == K.EXPORT and req.status == S.COMPLETED and req.decided_at:
        return req.decided_at + timedelta(days=privacy.EXPORT_DAYS)
    return None


class MyRequestSerializer(serializers.ModelSerializer):
    download_until = serializers.SerializerMethodField()
    can_download = serializers.SerializerMethodField()

    class Meta:
        model = DataRequest
        fields = [
            "id", "kind", "status", "created_at", "decided_at", "decision_note",
            "download_until", "can_download",
        ]  # fmt: skip

    def get_download_until(self, obj):
        return _expires(obj)

    def get_can_download(self, obj):
        until = _expires(obj)
        return bool(until and until > timezone.now())


class MyDataRequestView(APIView):
    policy_actions = {"GET": "my.datarequests.list", "POST": "my.datarequests.create"}

    @extend_schema(summary="My data requests", responses=MyRequestSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs = DataRequest.objects.filter(customer=request.user)[:20]
        return Response(MyRequestSerializer(qs, many=True).data)

    @extend_schema(summary="Ask for my data or for my account to be deleted", responses={201: None})
    def post(self, request: Request) -> Response:
        kind = request.data.get("kind")
        if kind not in K.values:
            raise ValidationError({"kind": "Choose export or delete."})
        try:
            with transaction.atomic():
                req = DataRequest.objects.create(
                    customer=request.user, customer_label=request.user.full_name, kind=kind
                )
        except IntegrityError:
            raise ValidationError({"detail": "You already have this request waiting."}) from None
        audit(AuditLog.Action.DATA_REQUESTED, request=request, actor=request.user, kind=kind)
        return Response(MyRequestSerializer(req).data, status=status.HTTP_201_CREATED)


class MyDataRequestCancelView(APIView):
    policy_action = "my.datarequests.cancel"

    @extend_schema(summary="Cancel a waiting request", request=None, responses={200: None})
    def post(self, request: Request, pk) -> Response:
        req = get_object_or_404(DataRequest, pk=pk, customer=request.user)
        if req.status != S.PENDING:
            raise ValidationError({"detail": "Only a waiting request can be cancelled."})
        req.status = S.CANCELLED
        req.save(update_fields=["status"])
        return Response(MyRequestSerializer(req).data)


class MyDataDownloadView(APIView):
    policy_action = "my.datarequests.download"

    @extend_schema(summary="Download my data (after the admin approves)", responses={200: None})
    def get(self, request: Request, pk):
        req = get_object_or_404(DataRequest, pk=pk, customer=request.user, kind=K.EXPORT)
        until = _expires(req)
        if not until or until <= timezone.now():
            return Response(
                {"detail": "This download is not available."}, status=status.HTTP_403_FORBIDDEN
            )
        audit(AuditLog.Action.DATA_EXPORTED, request=request, actor=request.user)
        response = HttpResponse(
            json.dumps(privacy.export_data(request.user), indent=2, ensure_ascii=False),
            content_type="application/json",
        )
        response["Content-Disposition"] = 'attachment; filename="my-data.json"'
        return response


class AdminRequestSerializer(serializers.ModelSerializer):
    customer_email = serializers.SerializerMethodField()
    decided_by_email = serializers.EmailField(source="decided_by.email", default="", read_only=True)
    blockers = serializers.SerializerMethodField()

    class Meta:
        model = DataRequest
        fields = [
            "id", "kind", "status", "customer_label", "customer_email", "created_at",
            "decided_at", "decided_by_email", "decision_note", "blockers",
        ]  # fmt: skip

    def get_customer_email(self, obj):
        # Once the account is anonymized there is no address left to show.
        c = obj.customer
        return c.email if c and c.is_active else ""

    def get_blockers(self, obj):
        c = obj.customer
        if obj.kind == K.DELETE and obj.status == S.PENDING and c:
            return privacy.blockers(c)
        return []


class AdminDataRequestListView(APIView):
    policy_action = "datarequests.list"

    @extend_schema(summary="Customer data requests", responses=AdminRequestSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs = DataRequest.objects.select_related("customer", "decided_by")
        if request.query_params.get("status") in S.values:
            qs = qs.filter(status=request.query_params["status"])
        return Response(AdminRequestSerializer(qs[:100], many=True).data)


class AdminDataRequestDecideView(APIView):
    policy_action = "datarequests.decide"

    @extend_schema(summary="Complete or decline a data request", responses={200: None})
    def post(self, request: Request, pk) -> Response:
        decision = request.data.get("decision")
        note = str(request.data.get("note", "")).strip()[:300]
        if decision not in ("complete", "decline"):
            raise ValidationError({"decision": "Choose complete or decline."})
        if decision == "decline" and not note:
            raise ValidationError({"note": "Tell the customer why."})
        with transaction.atomic():
            req = get_object_or_404(DataRequest.objects.select_for_update(), pk=pk)
            if req.status != S.PENDING:
                raise ValidationError({"detail": "This request was already decided."})
            customer = req.customer
            if decision == "complete" and req.kind == K.DELETE and customer is not None:
                try:
                    privacy.anonymize(customer)
                except privacy.PrivacyError as exc:
                    raise ValidationError({"detail": str(exc)}) from None
                req.customer_label = privacy.DELETED_NAME
                audit(
                    AuditLog.Action.CUSTOMER_ANONYMIZED,
                    request=request,
                    actor=request.user,
                    request_id=str(req.pk),
                )
            req.status = S.COMPLETED if decision == "complete" else S.DECLINED
            req.decided_by = request.user
            req.decided_at = timezone.now()
            req.decision_note = note
            req.save()
            audit(
                AuditLog.Action.DATA_REQUEST_DECIDED,
                request=request,
                actor=request.user,
                kind=req.kind,
                decision=decision,
                request_id=str(req.pk),
            )
        return Response(AdminRequestSerializer(req).data)
