"""Admin-only inventory: products, suppliers and the stock ledger.

Stock is never typed in. A level changes only through a ledger row: stock received, a counted
adjustment (with a reason) or wastage (with a reason). Rows are never edited or deleted.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, ProtectedError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from inventory import stock
from inventory.models import Product, StockMovement, Supplier

PRODUCTS = {
    "GET": "inventory.manage",
    "POST": "inventory.manage",
    "PATCH": "inventory.manage",
    "DELETE": "inventory.manage",
}
MONEY = {"max_digits": 10, "decimal_places": 2, "min_value": Decimal("0")}


def product_row(product: Product) -> dict:
    level = getattr(product, "stock", None)
    if level is None:
        level = stock.level(product)
    return {
        "id": str(product.id),
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "unit_price": str(product.unit_price),
        "gst_percent": str(product.gst_percent),
        "low_stock_level": product.low_stock_level,
        "is_active": product.is_active,
        "stock": level,
        "low": level <= product.low_stock_level,
    }


def changed(instance, data: dict, fields) -> dict:
    out = {}
    for field in fields:
        if field in data and getattr(instance, field) != data[field]:
            out[field] = [str(getattr(instance, field)), str(data[field])]
            setattr(instance, field, data[field])
    return out


# --------------------------------------------------------------------------- products


class ProductSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=30)
    name = serializers.CharField(max_length=120)
    category = serializers.CharField(max_length=60)
    unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01")
    )
    gst_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("40")
    )
    low_stock_level = serializers.IntegerField(min_value=0, max_value=100000)
    is_active = serializers.BooleanField()
    opening_stock = serializers.IntegerField(min_value=0, max_value=100000, required=False)

    def validate_sku(self, value):
        value = value.strip().upper()
        qs = Product.objects.filter(sku__iexact=value)
        pk = self.context.get("pk")
        if pk:
            qs = qs.exclude(pk=pk)
        if qs.exists():
            raise serializers.ValidationError("Another product already uses this SKU.")
        return value


class ProductListView(APIView):
    policy_actions = PRODUCTS

    @extend_schema(summary="All products with stock levels (also hidden ones)")
    def get(self, request: Request) -> Response:
        rows = [product_row(p) for p in stock.with_levels()]
        active_low = sum(1 for r in rows if r["low"] and r["is_active"])
        return Response({"low_count": active_low, "results": rows})

    @extend_schema(summary="Add a product", request=ProductSerializer)
    def post(self, request: Request) -> Response:
        body = ProductSerializer(data=request.data, context={"pk": None})
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        opening = data.pop("opening_stock", 0)
        with transaction.atomic():
            product = Product.objects.create(**data)
            if opening:
                stock.move(
                    product,
                    opening,
                    StockMovement.Reason.OPENING,
                    actor=request.user,
                    note="Opening stock",
                )
        audit(
            AuditLog.Action.PRODUCT_CHANGED,
            request=request,
            actor=request.user,
            change="created",
            name=product.name,
            sku=product.sku,
            opening_stock=opening,
        )
        return Response(product_row(product), status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):
    policy_actions = PRODUCTS

    @extend_schema(summary="Edit a product (not its stock)", request=ProductSerializer)
    def patch(self, request: Request, pk) -> Response:
        product = get_object_or_404(Product, pk=pk)
        if "stock" in request.data or "opening_stock" in request.data:
            return Response(
                {"detail": "Stock cannot be edited. Receive, adjust or write off stock instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = ProductSerializer(data=request.data, partial=True, context={"pk": product.pk})
        body.is_valid(raise_exception=True)
        changes = changed(
            product,
            body.validated_data,
            (
                "sku",
                "name",
                "category",
                "unit_price",
                "gst_percent",
                "low_stock_level",
                "is_active",
            ),
        )
        if changes:
            product.save()
            audit(
                AuditLog.Action.PRODUCT_CHANGED,
                request=request,
                actor=request.user,
                change="updated",
                name=product.name,
                sku=product.sku,
                changes=changes,
            )
        return Response(product_row(product))

    @extend_schema(summary="Delete a product that never had stock", request=None)
    def delete(self, request: Request, pk) -> Response:
        product = get_object_or_404(Product, pk=pk)
        name, sku = product.name, product.sku
        if product.movements.exists():
            return Response(
                {"detail": "This product has stock history. Hide it instead of deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            product.delete()
        except ProtectedError:
            return Response(
                {"detail": "This product is on invoices. Hide it instead."},
                status=status.HTTP_409_CONFLICT,
            )
        audit(
            AuditLog.Action.PRODUCT_CHANGED,
            request=request,
            actor=request.user,
            change="deleted",
            name=name,
            sku=sku,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- suppliers


class SupplierSerializer(serializers.ModelSerializer):
    movement_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_person",
            "phone",
            "email",
            "notes",
            "is_active",
            "movement_count",
        ]
        read_only_fields = ["id", "movement_count"]

    def validate_name(self, value):
        value = value.strip()
        qs = Supplier.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A supplier with this name already exists.")
        return value


class SupplierListView(APIView):
    policy_actions = PRODUCTS

    @extend_schema(summary="Suppliers")
    def get(self, request: Request) -> Response:
        rows = Supplier.objects.annotate(movement_count=Count("movements"))
        return Response(SupplierSerializer(rows, many=True).data)

    @extend_schema(summary="Add a supplier", request=SupplierSerializer)
    def post(self, request: Request) -> Response:
        body = SupplierSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        row = body.save()
        audit(
            AuditLog.Action.SUPPLIER_CHANGED,
            request=request,
            actor=request.user,
            change="created",
            name=row.name,
        )
        row.movement_count = 0
        return Response(SupplierSerializer(row).data, status=status.HTTP_201_CREATED)


class SupplierDetailView(APIView):
    policy_actions = PRODUCTS

    @extend_schema(summary="Edit a supplier", request=SupplierSerializer)
    def patch(self, request: Request, pk) -> Response:
        row = get_object_or_404(Supplier, pk=pk)
        body = SupplierSerializer(row, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        changes = changed(
            row,
            body.validated_data,
            ("name", "contact_person", "phone", "email", "notes", "is_active"),
        )
        if changes:
            row.save()
            audit(
                AuditLog.Action.SUPPLIER_CHANGED,
                request=request,
                actor=request.user,
                change="updated",
                name=row.name,
                changes=changes,
            )
        row.movement_count = row.movements.count()
        return Response(SupplierSerializer(row).data)

    @extend_schema(summary="Delete a supplier that was never used", request=None)
    def delete(self, request: Request, pk) -> Response:
        row = get_object_or_404(Supplier, pk=pk)
        if row.movements.exists():
            return Response(
                {"detail": "Stock was received from this supplier. Hide it instead."},
                status=status.HTTP_409_CONFLICT,
            )
        name = row.name
        row.delete()
        audit(
            AuditLog.Action.SUPPLIER_CHANGED,
            request=request,
            actor=request.user,
            change="deleted",
            name=name,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- ledger


class MovementSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["receive", "adjust", "wastage"])
    quantity = serializers.IntegerField(min_value=-100000, max_value=100000)
    supplier = serializers.UUIDField(required=False, allow_null=True, default=None)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


def movement_row(m: StockMovement) -> dict:
    return {
        "id": str(m.id),
        "product": str(m.product_id),
        "product_name": m.product.name,
        "sku": m.product.sku,
        "delta": m.delta,
        "reason": m.reason,
        "reason_label": m.get_reason_display(),
        "note": m.note,
        "supplier": m.supplier.name if m.supplier_id else "",
        "actor": m.actor.full_name if m.actor_id else "",
        "invoice": m.invoice.number if m.invoice_id else "",
        "created_at": m.created_at,
    }


class LedgerView(APIView):
    policy_actions = {"GET": "inventory.stock"}

    @extend_schema(summary="Stock ledger, newest first")
    def get(self, request: Request) -> Response:
        rows = StockMovement.objects.select_related("product", "supplier", "actor", "invoice")
        product = request.query_params.get("product")
        if product:
            rows = rows.filter(product_id=product)
        rows = rows.order_by("-created_at", "-id")[:200]
        return Response({"results": [movement_row(m) for m in rows]})


class MoveStockView(APIView):
    policy_actions = {"POST": "inventory.stock"}

    @extend_schema(summary="Receive, adjust or write off stock", request=MovementSerializer)
    def post(self, request: Request, pk) -> Response:
        body = MovementSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        kind, qty, note = data["kind"], data["quantity"], data["note"].strip()
        supplier = None
        if data["supplier"]:
            supplier = Supplier.objects.filter(pk=data["supplier"]).first()
            if supplier is None:
                return Response({"detail": "That supplier does not exist."}, status=400)
        if kind == "receive":
            if qty <= 0:
                return Response({"detail": "Enter how many units arrived."}, status=400)
            delta, reason = qty, StockMovement.Reason.PURCHASE
        elif kind == "wastage":
            if qty <= 0:
                return Response({"detail": "Enter how many units were lost."}, status=400)
            if len(note) < 3:
                return Response({"detail": "Say what happened (a short reason)."}, status=400)
            delta, reason = -qty, StockMovement.Reason.WASTAGE
        else:
            if qty == 0:
                return Response({"detail": "An adjustment cannot be zero."}, status=400)
            if len(note) < 3:
                return Response({"detail": "Give the reason for the adjustment."}, status=400)
            delta, reason = qty, StockMovement.Reason.ADJUSTMENT
        try:
            with transaction.atomic():
                product = get_object_or_404(Product.objects.select_for_update(), pk=pk)
                row = stock.move(
                    product,
                    delta,
                    reason,
                    actor=request.user,
                    note=note,
                    supplier=supplier if kind == "receive" else None,
                )
                after = stock.level(product)
        except stock.StockError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        audit(
            AuditLog.Action.STOCK_MOVED,
            request=request,
            actor=request.user,
            product=product.name,
            kind=kind,
            delta=delta,
            level_after=after,
            note=note,
            supplier=supplier.name if supplier else "",
        )
        row = StockMovement.objects.select_related("product", "supplier", "actor", "invoice").get(
            pk=row.pk
        )
        return Response(
            {"movement": movement_row(row), "product": product_row(product)},
            status=status.HTTP_201_CREATED,
        )
