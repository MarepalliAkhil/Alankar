"""Admin: purchase orders and the order history of a supplier."""

from decimal import Decimal

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory import purchasing
from inventory.models import PurchaseOrder, PurchaseReceiptLine, Supplier

POLICY = {"GET": "purchasing.manage", "POST": "purchasing.manage", "PATCH": "purchasing.manage"}
ONE = {"POST": "purchasing.manage"}
money = purchasing.money


class LineSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=100000)
    unit_cost = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))


class OrderSerializer(serializers.Serializer):
    supplier = serializers.UUIDField()
    lines = LineSerializer(many=True, allow_empty=False)
    expected_on = serializers.DateField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class OrderEditSerializer(serializers.Serializer):
    supplier = serializers.UUIDField(required=False)
    lines = LineSerializer(many=True, allow_empty=False, required=False)
    expected_on = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True)


class ReceiveSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False, max_length=200)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_items(self, items):
        out = []
        for item in items:
            line = serializers.UUIDField().run_validation(item.get("line"))
            qty = serializers.IntegerField(min_value=0, max_value=100000).run_validation(
                item.get("quantity", 0)
            )
            out.append({"line": line, "quantity": qty})
        return out


class CloseSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


def row(order: PurchaseOrder, *, detail: bool = False) -> dict:
    t = purchasing.totals(order)
    data = {
        "id": str(order.id),
        "number": order.number,
        "supplier": str(order.supplier_id),
        "supplier_name": order.supplier.name,
        "status": order.status,
        "status_label": order.get_status_display(),
        "expected_on": order.expected_on.isoformat() if order.expected_on else None,
        "notes": order.notes,
        "created_at": order.created_at,
        "sent_at": order.sent_at,
        "closed_at": order.closed_at,
        "close_reason": order.close_reason,
        "ordered_value": money(t["ordered_value"]),
        "received_value": money(t["received_value"]),
        "units_ordered": t["units_ordered"],
        "units_received": t["units_received"],
    }
    if detail:
        got = purchasing.received_map(order)
        data["lines"] = [
            {
                "id": str(ln.id),
                "product": str(ln.product_id),
                "product_name": ln.product.name,
                "sku": ln.product.sku,
                "quantity": ln.quantity,
                "unit_cost": money(ln.unit_cost),
                "line_total": money(ln.quantity * ln.unit_cost),
                "received": got.get(ln.id, 0),
                "outstanding": ln.quantity - got.get(ln.id, 0),
            }
            for ln in order.lines.select_related("product")
        ]
        data["receipts"] = [
            {
                "id": str(r.id),
                "created_at": r.created_at,
                "received_by": r.received_by.full_name if r.received_by_id else "",
                "note": r.note,
                "lines": [
                    {"product_name": rl.line.product.name, "quantity": rl.quantity}
                    for rl in PurchaseReceiptLine.objects.filter(receipt=r).select_related(
                        "line__product"
                    )
                ],
            }
            for r in order.receipts.select_related("received_by")
        ]
    return data


def _supplier(pk):
    return Supplier.objects.filter(pk=pk).first()


def _fail(exc: Exception, code: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({"detail": str(exc)}, status=code)


class OrderListView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="Purchase orders, newest first", responses={200: None})
    def get(self, request: Request) -> Response:
        qs = PurchaseOrder.objects.select_related("supplier")
        if request.query_params.get("supplier"):
            qs = qs.filter(supplier_id=request.query_params["supplier"])
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return Response({"results": [row(o) for o in qs[:200]]})

    @extend_schema(summary="Create a draft purchase order", request=OrderSerializer)
    def post(self, request: Request) -> Response:
        body = OrderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        supplier = _supplier(data["supplier"])
        if supplier is None:
            return _fail(ValueError("That supplier does not exist."))
        try:
            order = purchasing.create(
                supplier=supplier,
                lines=data["lines"],
                expected_on=data["expected_on"],
                notes=data["notes"].strip(),
                actor=request.user,
                request=request,
            )
        except purchasing.PurchaseError as exc:
            return _fail(exc)
        return Response(row(order, detail=True), status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="One purchase order with its lines and deliveries")
    def get(self, request: Request, pk) -> Response:
        order = get_object_or_404(PurchaseOrder.objects.select_related("supplier"), pk=pk)
        return Response(row(order, detail=True))

    @extend_schema(summary="Change a draft", request=OrderEditSerializer)
    def patch(self, request: Request, pk) -> Response:
        body = OrderEditSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        get_object_or_404(PurchaseOrder, pk=pk)
        supplier = None
        if "supplier" in data:
            supplier = _supplier(data["supplier"])
            if supplier is None:
                return _fail(ValueError("That supplier does not exist."))
        try:
            order = purchasing.edit(
                pk,
                lines=data.get("lines"),
                expected_on=data.get("expected_on", False),
                notes=data["notes"].strip() if "notes" in data else None,
                supplier=supplier,
                actor=request.user,
                request=request,
            )
        except purchasing.PurchaseError as exc:
            return _fail(exc, status.HTTP_409_CONFLICT)
        order = PurchaseOrder.objects.select_related("supplier").get(pk=order.pk)
        return Response(row(order, detail=True))


class OrderSendView(APIView):
    policy_actions = ONE

    @extend_schema(summary="Send the order to the supplier (simulated email)")
    def post(self, request: Request, pk) -> Response:
        get_object_or_404(PurchaseOrder, pk=pk)
        try:
            order, mailed = purchasing.send(pk, actor=request.user, request=request)
        except purchasing.PurchaseError as exc:
            return _fail(exc, status.HTTP_409_CONFLICT)
        order = PurchaseOrder.objects.select_related("supplier").get(pk=order.pk)
        return Response({**row(order, detail=True), "emailed": mailed})


class OrderReceiveView(APIView):
    policy_actions = ONE

    @extend_schema(summary="Book goods that arrived into stock", request=ReceiveSerializer)
    def post(self, request: Request, pk) -> Response:
        body = ReceiveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        get_object_or_404(PurchaseOrder, pk=pk)
        try:
            order = purchasing.receive(
                pk,
                body.validated_data["items"],
                note=body.validated_data["note"].strip(),
                actor=request.user,
                request=request,
            )
        except purchasing.PurchaseError as exc:
            return _fail(exc, status.HTTP_409_CONFLICT)
        order = PurchaseOrder.objects.select_related("supplier").get(pk=order.pk)
        return Response(row(order, detail=True))


class OrderCloseView(APIView):
    policy_actions = ONE

    @extend_schema(
        summary="Cancel an order, or close a part-delivered one", request=CloseSerializer
    )
    def post(self, request: Request, pk) -> Response:
        body = CloseSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        get_object_or_404(PurchaseOrder, pk=pk)
        try:
            order = purchasing.close(
                pk, body.validated_data["reason"], actor=request.user, request=request
            )
        except purchasing.PurchaseError as exc:
            return _fail(exc, status.HTTP_409_CONFLICT)
        order = PurchaseOrder.objects.select_related("supplier").get(pk=order.pk)
        return Response(row(order, detail=True))


class SupplierHistoryView(APIView):
    policy_actions = {"GET": "purchasing.manage"}

    @extend_schema(summary="What was ordered from, and delivered by, one supplier")
    def get(self, request: Request, pk) -> Response:
        supplier = get_object_or_404(Supplier, pk=pk)
        orders = list(supplier.purchase_orders.select_related("supplier"))
        rows = [row(o) for o in orders]
        live = [o for o in rows if o["status"] not in ("draft", "cancelled")]
        return Response(
            {
                "supplier": {"id": str(supplier.id), "name": supplier.name},
                "orders": rows,
                "summary": {
                    "orders": len(live),
                    "ordered_value": money(sum((Decimal(o["ordered_value"]) for o in live), 0)),
                    "received_value": money(sum((Decimal(o["received_value"]) for o in live), 0)),
                    "open": sum(1 for o in rows if o["status"] in ("sent", "partly_received")),
                    "last_order": max((o["created_at"] for o in live), default=None),
                },
            }
        )
