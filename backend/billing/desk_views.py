"""POS, invoices, refunds and the cash close (receptionist and admin). Rules live in
billing.checkout, billing.refunds and billing.cashclose; these views check who may call."""

from datetime import date
from decimal import Decimal

from django.db.models import Q
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from billing import cashclose, checkout, refunds
from billing.models import Invoice, Refund
from billing.pos import CheckoutError
from inventory import stock
from inventory.models import Product
from scheduling.models import Appointment
from website.content import pos_settings


def error_response(exc: CheckoutError) -> Response:
    code = {
        "conflict": status.HTTP_409_CONFLICT,
        "stock": status.HTTP_409_CONFLICT,
        "not_found": status.HTTP_404_NOT_FOUND,
    }.get(exc.code, status.HTTP_400_BAD_REQUEST)
    body = {"detail": exc.message}
    if exc.code == "stock":
        body["code"] = "stock"
    return Response(body, status=code)


def money_str(value) -> str:
    return str(Decimal(value).quantize(Decimal("0.01")))


# --------------------------------------------------------------------------- serializers


def completion_data(appt: Appointment) -> dict | None:
    """What the stylist did, for the receptionist at checkout (including the stylist's note)."""
    completion = getattr(appt, "completion", None)
    if completion is None:
        return None
    return {
        "done": [line["label"] for line in completion.done_lines],
        "removed": [
            {"label": line["label"], "price": money_str(line["price"])}
            for line in completion.removed_lines
        ],
        "billed_amount": money_str(completion.done_price),
        "note": completion.note,
    }


def visit_card(appt: Appointment) -> dict:
    return {
        "completion": completion_data(appt),
        "id": str(appt.id),
        "status": appt.status,
        "status_label": appt.get_status_display(),
        "customer_id": str(appt.customer_id),
        "customer_name": appt.contact_name,
        "service_name": appt.service_name,
        "variant_label": appt.variant_label,
        "stylist_name": appt.stylist.display_name if appt.stylist_id else None,
        "room_name": appt.room.name if appt.room_id else None,
        "start": appt.start,
        "price_total": money_str(appt.price_total),
        "allergies": appt.allergies,
        "source": appt.source,
    }


def returnable_data(invoice: Invoice) -> list[dict]:
    return [
        {"product": str(pid), "name": name, "quantity": left}
        for pid, (name, left) in refunds.returnable(invoice).items()
        if left > 0
    ]


def invoice_data(invoice: Invoice, detail: bool = False) -> dict:
    data = {
        "id": str(invoice.id),
        "number": invoice.number,
        "customer_id": str(invoice.customer_id),
        "customer_name": invoice.customer_name,
        "service_name": invoice.appointment.service_name,
        "issued_at": invoice.issued_at,
        "total": money_str(invoice.total),
        "tip_amount": money_str(invoice.tip_amount),
        "refundable": money_str(refunds.refundable(invoice)),
        "service_changes": invoice.service_changes,
    }
    if not detail:
        return data
    return {
        **data,
        "subtotal": money_str(invoice.subtotal),
        "gst_amount": money_str(invoice.gst_amount),
        "prepaid_amount": money_str(invoice.prepaid_amount),
        "balance_paid": money_str(invoice.balance_paid),
        "discount_percent": money_str(invoice.discount_percent),
        "discount_amount": money_str(invoice.discount_amount),
        "discount_reason": invoice.discount_reason,
        "loyalty_redeemed": invoice.loyalty_redeemed,
        "loyalty_earned": invoice.loyalty_earned,
        "returnable": returnable_data(invoice),
        "stylist_name": (
            invoice.appointment.stylist.display_name if invoice.appointment.stylist_id else None
        ),
        "items": [
            {
                "kind": i.kind,
                "description": i.description,
                "quantity": i.quantity,
                "unit_price": money_str(i.unit_price),
                "amount": money_str(i.amount),
            }
            for i in invoice.items.all()
        ],
        "payments": [
            {"method": p.method, "amount": money_str(p.amount), "reference": p.reference}
            for p in invoice.payments.all()
        ],
        "refunds": [refund_data(r) for r in invoice.refunds.all()],
    }


def refund_data(refund: Refund) -> dict:
    appt = refund.payment.appointment
    return {
        "id": str(refund.id),
        "status": refund.status,
        "status_label": refund.get_status_display(),
        "amount": money_str(refund.amount),
        "reason": refund.reason,
        "method": refund.method,
        "decision_note": refund.decision_note,
        "created_at": refund.created_at,
        "processed_at": refund.processed_at,
        "customer_name": appt.contact_name,
        "service_name": appt.service_name,
        "invoice_number": refund.invoice.number if refund.invoice_id else None,
        "requested_by": refund.requested_by.full_name if refund.requested_by_id else None,
        "restocked": refund.restocked,
        "loyalty_adjusted": refund.loyalty_adjusted,
        "invoice_id": str(refund.invoice_id) if refund.invoice_id else None,
        "returnable": returnable_data(refund.invoice) if refund.invoice_id else [],
        "loyalty_earned": refund.invoice.loyalty_earned if refund.invoice_id else 0,
        "loyalty_redeemed": refund.invoice.loyalty_redeemed if refund.invoice_id else 0,
    }


def totals_data(result: dict) -> dict:
    t = result["totals"]
    tip = result["tip"]
    return {
        "lines": [
            {
                "kind": ln.kind,
                "description": ln.description,
                "quantity": ln.quantity,
                "unit_price": money_str(ln.unit_price),
                "amount": money_str(ln.amount),
                "discount": money_str(ln.discount),
                "after_discount": money_str(ln.after),
            }
            for ln in t.lines
        ],
        "gross": money_str(t.gross),
        "discount_amount": money_str(t.discount_amount),
        "subtotal": money_str(t.subtotal),
        "gst_amount": money_str(t.gst_amount),
        "total": money_str(t.total),
        "prepaid": money_str(t.prepaid_applied),
        "excess_prepaid": money_str(t.excess_prepaid),
        "loyalty_redeemed": t.loyalty_redeemed,
        "loyalty_value": money_str(t.loyalty_value),
        "max_redeemable": t.max_redeemable,
        "payable_now": money_str(t.payable_now),
        "tip": money_str(tip),
        "to_collect": money_str(t.payable_now + tip),
        "loyalty_earned": t.loyalty_earned,
        "points_balance": result["points"],
    }


class ProductLine(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=checkout.MAX_QUANTITY)


class PaymentLine(serializers.Serializer):
    method = serializers.ChoiceField(choices=["cash", "card", "upi"])
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))


class BillSerializer(serializers.Serializer):
    appointment = serializers.UUIDField()
    products = ProductLine(many=True, required=False, default=list)
    discount_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0, min_value=0, max_value=100
    )
    discount_reason = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )
    redeem_points = serializers.IntegerField(required=False, default=0, min_value=0)
    tip = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=0, min_value=0
    )
    payments = PaymentLine(many=True, required=False, default=list)


def bill_data(serializer: BillSerializer) -> dict:
    data = serializer.validated_data
    return {
        **data,
        "products": [
            {"product": str(row["product"]), "quantity": row["quantity"]}
            for row in data["products"]
        ],
        "payments": [
            {"method": row["method"], "amount": str(row["amount"])} for row in data["payments"]
        ],
    }


# --------------------------------------------------------------------------- POS


def product_rows():
    return stock.with_levels(Product.objects.filter(is_active=True))


def product_data(product) -> dict:
    return {
        "id": str(product.id),
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "unit_price": money_str(product.unit_price),
        "gst_percent": money_str(product.gst_percent),
        "stock": product.stock,
        "low_stock_level": product.low_stock_level,
        "low": product.stock <= product.low_stock_level,
    }


class PosQueueView(APIView):
    policy_action = "pos.read"

    @extend_schema(summary="Visits waiting at the counter and recent invoices")
    def get(self, request: Request) -> Response:
        recent = Invoice.objects.select_related("appointment").order_by("-issued_at")[:20]
        return Response(
            {
                "ready": [visit_card(a) for a in checkout.ready_visits()],
                "recent": [invoice_data(i) for i in recent],
            }
        )


class PosVisitView(APIView):
    """Everything the checkout screen needs for one visit."""

    policy_action = "pos.read"

    @extend_schema(summary="Checkout context for one visit")
    def get(self, request: Request, pk) -> Response:
        appt = checkout.ready_visits().filter(pk=pk).first()
        if appt is None:
            raise Http404
        rules = pos_settings()
        return Response(
            {
                "visit": visit_card(appt),
                "products": [product_data(p) for p in product_rows()],
                "max_discount_percent": money_str(checkout.max_discount_percent(request.user)),
                "points_balance": checkout.points_balance(appt.customer),
                "loyalty_point_value": money_str(rules["loyalty_point_value"]),
            }
        )


class PosQuoteView(APIView):
    policy_action = "pos.read"

    @extend_schema(summary="Preview a bill without saving it", request=BillSerializer)
    def post(self, request: Request) -> Response:
        body = BillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = bill_data(body)
        try:
            result = checkout.quote(data["appointment"], data, actor=request.user)
        except Appointment.DoesNotExist as exc:
            raise Http404 from exc
        except CheckoutError as exc:
            return error_response(exc)
        return Response(totals_data(result))


class PosCheckoutView(APIView):
    policy_action = "pos.checkout"

    @extend_schema(summary="Bill a visit (one atomic transaction)", request=BillSerializer)
    def post(self, request: Request) -> Response:
        body = BillSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = bill_data(body)
        try:
            invoice = checkout.checkout(data["appointment"], data, actor=request.user)
        except Appointment.DoesNotExist as exc:
            raise Http404 from exc
        except CheckoutError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.INVOICE_CREATED,
            request=request,
            actor=request.user,
            target=invoice.customer,
            invoice=invoice.number,
            appointment=str(invoice.appointment_id),
            total=str(invoice.total),
            discount_percent=str(invoice.discount_percent),
            tip=str(invoice.tip_amount),
            methods=sorted({p.method for p in invoice.payments.all()}),
        )
        return Response(invoice_data(invoice_queryset().get(pk=invoice.pk), True), status=201)


def invoice_queryset():
    return Invoice.objects.select_related("appointment__stylist").prefetch_related(
        "items", "payments", "refunds__payment__appointment", "refunds__requested_by"
    )


# --------------------------------------------------------------------------- invoices


class DeskInvoiceListView(APIView):
    policy_action = "pos.invoices"

    @extend_schema(summary="Invoices (search by number or customer name)")
    def get(self, request: Request) -> Response:
        qs = invoice_queryset()
        term = request.query_params.get("q", "").strip()
        if term:
            qs = qs.filter(Q(number__icontains=term) | Q(customer_name__icontains=term))
        return Response([invoice_data(i) for i in qs.order_by("-issued_at")[:50]])


class DeskInvoiceDetailView(APIView):
    policy_action = "pos.invoices"

    @extend_schema(summary="One invoice with payments and refunds")
    def get(self, request: Request, pk) -> Response:
        invoice = invoice_queryset().filter(pk=pk).first()
        if invoice is None:
            raise Http404
        return Response(invoice_data(invoice, True))


# --------------------------------------------------------------------------- refunds


class RestockLine(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=1000)


class RefundRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    reason = serializers.CharField(min_length=3, max_length=300)
    method = serializers.ChoiceField(choices=["cash", "card", "upi"], required=False, default="")
    restock = RestockLine(many=True, required=False, default=list)
    reverse_loyalty = serializers.BooleanField(required=False, default=False)


class InvoiceRefundView(APIView):
    policy_action = "pos.refunds.request"

    @extend_schema(summary="Ask for a refund (admin: refund now)", request=RefundRequestSerializer)
    def post(self, request: Request, pk) -> Response:
        body = RefundRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if not Invoice.objects.filter(pk=pk).exists():
            raise Http404
        if (data["restock"] or data["reverse_loyalty"]) and request.user.role != "admin":
            return Response(
                {"detail": "Only the admin can put stock or loyalty points back."}, status=400
            )
        try:
            refund = refunds.request_refund(
                pk,
                actor=request.user,
                amount=data["amount"],
                reason=data["reason"],
                method=data["method"],
                restock=[
                    {"product": str(r["product"]), "quantity": r["quantity"]}
                    for r in data["restock"]
                ],
                reverse_loyalty=data["reverse_loyalty"],
            )
        except CheckoutError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.REFUND_REQUESTED,
            request=request,
            actor=request.user,
            target=refund.payment.appointment.customer,
            refund=str(refund.id),
            amount=str(refund.amount),
            status=refund.status,
        )
        if refund.status == Refund.Status.PROCESSED:
            audit(
                AuditLog.Action.REFUND_APPROVED,
                request=request,
                actor=request.user,
                target=refund.payment.appointment.customer,
                refund=str(refund.id),
                amount=str(refund.amount),
                method=refund.method,
                reason=refund.reason,
                restocked=refund.restocked,
                loyalty_adjusted=refund.loyalty_adjusted,
            )
        refund = Refund.objects.select_related(
            "payment__appointment", "invoice", "requested_by"
        ).get(pk=refund.pk)
        return Response(refund_data(refund), status=201)


class RefundListView(APIView):
    policy_action = "pos.refunds.list"

    @extend_schema(summary="Refunds waiting for a decision (admin)")
    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status", "pending_approval")
        qs = Refund.objects.select_related("payment__appointment", "invoice", "requested_by")
        if wanted != "all":
            qs = qs.filter(status=wanted)
        return Response([refund_data(r) for r in qs[:100]])


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    method = serializers.ChoiceField(choices=["cash", "card", "upi"], required=False, default="")
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    restock = RestockLine(many=True, required=False, default=list)
    reverse_loyalty = serializers.BooleanField(required=False, default=False)


class RefundDecisionView(APIView):
    policy_action = "pos.refunds.decide"

    @extend_schema(summary="Approve or reject a refund (admin)", request=DecisionSerializer)
    def post(self, request: Request, pk) -> Response:
        body = DecisionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if not Refund.objects.filter(pk=pk).exists():
            raise Http404
        approve = data["decision"] == "approve"
        try:
            refund = refunds.decide(
                pk,
                actor=request.user,
                approve=approve,
                method=data["method"],
                note=data["note"],
                restock=[
                    {"product": str(r["product"]), "quantity": r["quantity"]}
                    for r in data["restock"]
                ],
                reverse_loyalty=data["reverse_loyalty"],
            )
        except CheckoutError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.REFUND_APPROVED if approve else AuditLog.Action.REFUND_REJECTED,
            request=request,
            actor=request.user,
            target=refund.payment.appointment.customer,
            refund=str(refund.id),
            amount=str(refund.amount),
            method=refund.method,
            reason=refund.reason,
            restocked=refund.restocked,
            loyalty_adjusted=refund.loyalty_adjusted,
        )
        refund = Refund.objects.select_related(
            "payment__appointment", "invoice", "requested_by"
        ).get(pk=refund.pk)
        return Response(refund_data(refund))


# --------------------------------------------------------------------------- cash close


def close_data(day: date) -> dict:
    data = cashclose.summary(day)
    closed = data["closed"]
    return {
        "date": day.isoformat(),
        "methods": {
            key: {k: money_str(v) for k, v in value.items()}
            for key, value in data["methods"].items()
        },
        "invoice_count": data["invoice_count"],
        "tips": money_str(data["tips"]),
        "unbilled_visits": data["unbilled_visits"],
        "closed": None
        if closed is None
        else {
            "expected_cash": money_str(closed.expected_cash),
            "counted_cash": money_str(closed.counted_cash),
            "difference": money_str(closed.difference),
            "note": closed.note,
            "closed_by": closed.closed_by.full_name if closed.closed_by_id else None,
            "closed_at": closed.closed_at,
        },
    }


def parse_day(value) -> date:
    try:
        return date.fromisoformat(value) if value else cashclose.today()
    except ValueError:
        return cashclose.today()


class SignOffSerializer(serializers.Serializer):
    date = serializers.DateField()
    counted_cash = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class CashCloseView(APIView):
    policy_actions = {"GET": "cash.close.read", "POST": "cash.close.sign"}

    @extend_schema(summary="Takings and cash-close record for a day")
    def get(self, request: Request) -> Response:
        return Response(close_data(parse_day(request.query_params.get("date"))))

    @extend_schema(summary="Sign off the day", request=SignOffSerializer)
    def post(self, request: Request) -> Response:
        body = SignOffSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            record = cashclose.sign_off(
                actor=request.user,
                day=data["date"],
                counted_cash=data["counted_cash"],
                note=data["note"],
            )
        except CheckoutError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.CASH_CLOSE_SIGNED,
            request=request,
            actor=request.user,
            date=record.business_date.isoformat(),
            expected_cash=str(record.expected_cash),
            counted_cash=str(record.counted_cash),
            difference=str(record.difference),
        )
        return Response(close_data(record.business_date), status=201)


# --------------------------------------------------------------------------- inventory view


class InventoryListView(APIView):
    policy_action = "inventory.view"

    @extend_schema(summary="Products with stock levels (view only)")
    def get(self, request: Request) -> Response:
        rows = [product_data(p) for p in product_rows()]
        return Response({"low_count": sum(1 for r in rows if r["low"]), "results": rows})
