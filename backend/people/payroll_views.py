"""Admin: payroll runs, adjustments and payslips. Staff read their own payslips."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from people import payroll
from people.models import PayrollItem, PayrollRun

CODE = {"invalid": 400, "conflict": 409, "not_found": 404}


def fail(exc: payroll.PayrollError) -> Response:
    return Response({"detail": str(exc)}, status=CODE.get(exc.code, 400))


class RunCreateSerializer(serializers.Serializer):
    month = serializers.CharField(max_length=7)


class RunListView(APIView):
    policy_actions = {"GET": "payroll.read", "POST": "payroll.manage"}

    @extend_schema(summary="Payroll runs", responses=None)
    def get(self, request: Request) -> Response:
        return Response([payroll.run_row(r) for r in PayrollRun.objects.all()[:36]])

    @extend_schema(summary="Draft a payroll run for a month", request=RunCreateSerializer)
    def post(self, request: Request) -> Response:
        body = RunCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            run = payroll.create(body.validated_data["month"], actor=request.user, request=request)
        except payroll.PayrollError as exc:
            return fail(exc)
        return Response(payroll.run_view(run), status=status.HTTP_201_CREATED)


class RunDetailView(APIView):
    policy_action = "payroll.read"

    @extend_schema(summary="A payroll run with every line", responses=None)
    def get(self, request: Request, pk) -> Response:
        run = PayrollRun.objects.filter(pk=pk).first()
        if run is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(payroll.run_view(run))


class RunActionView(APIView):
    """Base for the run steps; subclasses set `step`."""

    policy_action = "payroll.manage"
    step = ""

    @extend_schema(summary="Payroll run step", request=None, responses=None)
    def post(self, request: Request, pk) -> Response:
        try:
            if self.step == "refresh":
                run = payroll.refresh(pk, actor=request.user, request=request)
            elif self.step == "approve":
                run = payroll.approve(pk, actor=request.user, request=request)
            else:
                reference = str(request.data.get("reference", ""))
                run = payroll.mark_paid(pk, reference, actor=request.user, request=request)
        except payroll.PayrollError as exc:
            return fail(exc)
        return Response(payroll.run_view(run))


class RunRefreshView(RunActionView):
    step = "refresh"


class RunApproveView(RunActionView):
    step = "approve"


class RunPayView(RunActionView):
    step = "pay"


class ItemDetailView(APIView):
    policy_action = "payroll.read"

    @extend_schema(summary="One staff member's payslip (admin)", responses=None)
    def get(self, request: Request, pk) -> Response:
        item = PayrollItem.objects.select_related("run").filter(pk=pk).first()
        if item is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(payroll.payslip(item))


class AdjustmentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["bonus", "deduction"])
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    reason = serializers.CharField(max_length=200)


class AdjustmentCreateView(APIView):
    policy_action = "payroll.manage"

    @extend_schema(summary="Add a bonus or deduction", request=AdjustmentSerializer)
    def post(self, request: Request, pk) -> Response:
        body = AdjustmentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            payroll.add_adjustment(
                pk,
                data["kind"],
                data["amount"],
                data["reason"],
                actor=request.user,
                request=request,
            )
        except payroll.PayrollError as exc:
            return fail(exc)
        item = PayrollItem.objects.select_related("run").get(pk=pk)
        return Response(payroll.payslip(item), status=status.HTTP_201_CREATED)


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200)


class AdjustmentVoidView(APIView):
    policy_action = "payroll.manage"

    @extend_schema(summary="Void an adjustment in a draft run", request=VoidSerializer)
    def post(self, request: Request, pk) -> Response:
        body = VoidSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            adj = payroll.void_adjustment(
                pk, body.validated_data["reason"], actor=request.user, request=request
            )
        except payroll.PayrollError as exc:
            return fail(exc)
        return Response(
            payroll.payslip(PayrollItem.objects.select_related("run").get(pk=adj.item_id))
        )


# --------------------------------------------------------------------------- the staff member's own


def own_items(user):
    """Only the signed-in person's own lines, and only once the run is approved."""
    return PayrollItem.objects.select_related("run").filter(
        user=user, run__status__in=[PayrollRun.Status.APPROVED, PayrollRun.Status.PAID]
    )


class MyPayslipsView(APIView):
    policy_action = "payslips.own"

    @extend_schema(summary="My payslips", responses=None)
    def get(self, request: Request) -> Response:
        rows = own_items(request.user).order_by("-run__month")[:36]
        return Response(
            [
                {
                    "id": str(i.id),
                    "month": i.run.month,
                    "status": i.run.status,
                    "status_label": i.run.get_status_display(),
                    "net": str(payroll.net(i)),
                }
                for i in rows
            ]
        )


class MyPayslipView(APIView):
    policy_action = "payslips.own"

    @extend_schema(summary="One of my payslips", responses=None)
    def get(self, request: Request, pk) -> Response:
        item = own_items(request.user).filter(pk=pk).first()
        if item is None:
            return Response({"detail": "Not found."}, status=404)
        return Response(payroll.payslip(item))
