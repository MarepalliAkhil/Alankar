"""Shop endpoints: customer browsing, cart pricing, addresses and orders; the counter's Orders
screen. Every view declares its policy action; the policy file decides who may call it."""

from __future__ import annotations

from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import client_ip
from core.throttles import BOOKING_THROTTLES
from shop import orders
from shop.models import Address, Order, OrderStatus

STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "conflict": status.HTTP_409_CONFLICT,
}


def error_response(exc: orders.ShopError) -> Response:
    body = {"detail": exc.message}
    if exc.field:
        body["field"] = exc.field
    return Response(body, status=STATUS.get(exc.code, status.HTTP_400_BAD_REQUEST))


class CartSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=True)
    coupon = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")


class PlaceSerializer(CartSerializer):
    address_id = serializers.UUIDField(required=False, allow_null=True)
    address = serializers.DictField(required=False)
    save_address = serializers.BooleanField(default=False)


class OutcomeSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["success", "fail"], default="success")
    gift_card_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    gift_card_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=0
    )


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AdvanceSerializer(serializers.Serializer):
    to = serializers.ChoiceField(
        choices=[OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
    )
    note = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------- customer


class MyShopProductsView(APIView):
    policy_action = "my.shop.browse"

    @extend_schema(summary="Products sold online", responses={200: None})
    def get(self, request: Request) -> Response:
        products = orders.listed_products().order_by("category", "sort_order", "name")
        return Response(
            {
                "products": [orders.product_data(p) for p in products],
                "delivery": orders.shop_settings_public(),
            }
        )


class MyShopQuoteView(APIView):
    policy_action = "my.shop.quote"

    @extend_schema(summary="Price a cart (server-side prices)", request=CartSerializer)
    def post(self, request: Request) -> Response:
        body = CartSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            quote = orders.price(
                body.validated_data["items"],
                customer=request.user,
                coupon_code=body.validated_data["coupon"],
            )
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(quote.data())


class MyAddressesView(APIView):
    policy_actions = {"GET": "my.addresses.list", "POST": "my.addresses.create"}

    @extend_schema(summary="My saved delivery addresses", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = Address.objects.filter(customer=request.user)
        return Response({"addresses": [orders.address_data(a) for a in rows]})

    @extend_schema(summary="Save a delivery address", request=None)
    def post(self, request: Request) -> Response:
        try:
            address = orders.save_address(request.user, request.data)
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(orders.address_data(address), status=status.HTTP_201_CREATED)


class MyAddressView(APIView):
    policy_actions = {"PATCH": "my.addresses.update", "DELETE": "my.addresses.delete"}

    def _mine(self, request, pk) -> Address | None:
        return Address.objects.filter(pk=pk, customer=request.user).first()

    @extend_schema(summary="Change a saved address", request=None)
    def patch(self, request: Request, pk) -> Response:
        address = self._mine(request, pk)
        if address is None:
            return Response({"detail": "Address not found."}, status=status.HTTP_404_NOT_FOUND)
        if not isinstance(request.data, dict):
            return Response({"detail": "Send the address fields."}, status=400)
        merged = {**orders.address_data(address), **request.data}
        try:
            address = orders.save_address(request.user, merged, address=address)
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(orders.address_data(address))

    @extend_schema(summary="Remove a saved address", request=None)
    def delete(self, request: Request, pk) -> Response:
        address = self._mine(request, pk)
        if address is None:
            return Response({"detail": "Address not found."}, status=status.HTTP_404_NOT_FOUND)
        was_default = address.is_default
        address.delete()
        if was_default:
            first = Address.objects.filter(customer=request.user).first()
            if first is not None:
                Address.objects.filter(pk=first.pk).update(is_default=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyOrdersView(APIView):
    policy_actions = {"GET": "my.orders.list", "POST": "my.orders.place"}

    def get_throttles(self):
        if self.request.method == "POST":
            return [t() for t in BOOKING_THROTTLES]
        return super().get_throttles()

    @extend_schema(summary="My orders", responses={200: None})
    def get(self, request: Request) -> Response:
        orders.expire_due()
        qs = orders.with_details(Order.objects.filter(customer=request.user))
        return Response({"orders": [orders.order_data(o) for o in qs]})

    @extend_schema(summary="Place an order (holds the stock until paid)", request=PlaceSerializer)
    def post(self, request: Request) -> Response:
        body = PlaceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        try:
            if data.get("address_id"):
                order = orders.place(
                    request.user,
                    data["items"],
                    address_id=data["address_id"],
                    coupon_code=data["coupon"],
                    request=request,
                )
            else:
                address = data.get("address") or {}
                orders.clean_address(address)
                order = orders.place(
                    request.user,
                    data["items"],
                    address=address,
                    coupon_code=data["coupon"],
                    request=request,
                )
                if data.get("save_address"):
                    try:
                        orders.save_address(request.user, address)
                    except orders.ShopError:
                        pass  # the order is placed; saving a copy is a convenience only
        except orders.ShopError as exc:
            return error_response(exc)
        order = orders.with_details(Order.objects.filter(pk=order.pk)).get()
        return Response(orders.order_data(order), status=status.HTTP_201_CREATED)


def _my_order(request, pk) -> Order | None:
    return orders.with_details(Order.objects.filter(pk=pk, customer=request.user)).first()


class MyOrderView(APIView):
    policy_action = "my.orders.read"

    @extend_schema(summary="One of my orders, with its tracking timeline", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        orders.expire_due()
        order = _my_order(request, pk)
        if order is None:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(orders.order_data(order))


class MyOrderPayView(APIView):
    policy_action = "my.orders.pay"

    @extend_schema(summary="Pay for my order (simulated gateway)", request=OutcomeSerializer)
    def post(self, request: Request, pk) -> Response:
        body = OutcomeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            order, paid = orders.pay(
                pk,
                customer=request.user,
                succeed=body.validated_data["outcome"] == "success",
                gift_code=body.validated_data.get("gift_card_code") or "",
                gift_amount=body.validated_data.get("gift_card_amount"),
                ip=client_ip(request),
                request=request,
            )
        except orders.ShopError as exc:
            return error_response(exc)
        data = orders.order_data(_my_order(request, order.pk))
        if not paid:
            return Response(
                {**data, "detail": "The payment did not go through. Nothing was taken."},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        return Response(data)


class MyOrderCancelView(APIView):
    policy_action = "my.orders.cancel"

    @extend_schema(summary="Cancel my order before it is packed", request=ReasonSerializer)
    def post(self, request: Request, pk) -> Response:
        body = ReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            order = orders.customer_cancel(
                pk, customer=request.user, reason=body.validated_data["reason"], request=request
            )
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(orders.order_data(_my_order(request, order.pk)))


# --------------------------------------------------------------------------- counter / admin


def _filtered(request) -> tuple:
    qs = Order.objects.all()
    wanted = request.query_params.get("status", "")
    if wanted == "open":
        qs = qs.filter(status__in=orders.OPEN)
    elif wanted in OrderStatus.values:
        qs = qs.filter(status=wanted)
    q = " ".join(request.query_params.get("q", "").split())[:60]
    if q:
        qs = qs.filter(
            Q(number__icontains=q)
            | Q(customer__full_name__icontains=q)
            | Q(customer__email__icontains=q)
            | Q(ship_pincode=q)
        )
    tz = timezone.get_current_timezone()
    start = parse_date(request.query_params.get("from", "") or "")
    end = parse_date(request.query_params.get("to", "") or "")
    if start:
        qs = qs.filter(created_at__gte=datetime.combine(start, time.min, tzinfo=tz))
    if end:
        qs = qs.filter(created_at__lt=datetime.combine(end, time.max, tzinfo=tz))
    return qs, wanted


class OrdersView(APIView):
    policy_action = "orders.list"

    @extend_schema(summary="Online orders, with filters", responses={200: None})
    def get(self, request: Request) -> Response:
        orders.expire_due()
        qs, _ = _filtered(request)
        rows = list(orders.with_details(qs)[:200])
        counts = {
            s: Order.objects.filter(status=s).count()
            for s in (OrderStatus.PLACED, OrderStatus.PACKED, OrderStatus.SHIPPED)
        }
        return Response(
            {
                "orders": [orders.order_data(o, viewer=request.user, staff=True) for o in rows],
                "counts": counts,
            }
        )


def _order(pk) -> Order | None:
    return orders.with_details(Order.objects.filter(pk=pk)).first()


class OrderView(APIView):
    policy_action = "orders.read"

    @extend_schema(summary="One online order", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        orders.expire_due()
        order = _order(pk)
        if order is None:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(orders.order_data(order, viewer=request.user, staff=True))


class OrderAdvanceView(APIView):
    policy_action = "orders.advance"

    @extend_schema(summary="Mark an order packed, shipped or delivered", request=AdvanceSerializer)
    def post(self, request: Request, pk) -> Response:
        body = AdvanceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            order = orders.advance(
                pk,
                actor=request.user,
                to=body.validated_data["to"],
                note=body.validated_data["note"],
                request=request,
            )
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(orders.order_data(_order(order.pk), viewer=request.user, staff=True))


class OrderCancelView(APIView):
    policy_action = "orders.cancel"

    @extend_schema(summary="Cancel an order with a reason (refunds what was paid)", request=None)
    def post(self, request: Request, pk) -> Response:
        body = ReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            order = orders.staff_cancel(
                pk, actor=request.user, reason=body.validated_data["reason"], request=request
            )
        except orders.ShopError as exc:
            return error_response(exc)
        return Response(orders.order_data(_order(order.pk), viewer=request.user, staff=True))
