"""Private coupons: the admin issues them to chosen customers; each customer sees only their own."""

from decimal import Decimal

from django.db.models import Count
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from marketing import campaigns, private
from marketing.models import Coupon, CouponRedemption


def row(coupon: Coupon, used: int, *, admin: bool) -> dict:
    data = {
        "id": str(coupon.id),
        "code": coupon.code,
        "name": coupon.name,
        "description": private.describe(coupon),
        "kind": coupon.kind,
        "value": str(coupon.value),
        "min_bill": str(coupon.min_bill),
        "max_discount": None if coupon.max_discount is None else str(coupon.max_discount),
        "applies_to": coupon.applies_to,
        "ends_on": coupon.ends_on.isoformat() if coupon.ends_on else None,
        "state": private.state_of(coupon, used),
    }
    if admin:
        data["customer_id"] = str(coupon.customer_id)
        data["customer_name"] = coupon.customer.full_name
        data["customer_email"] = coupon.customer.email
        data["issued_at"] = coupon.created_at.isoformat()
    return data


def usage(coupons) -> dict:
    counted = (
        CouponRedemption.objects.filter(coupon__in=coupons, released_at__isnull=True)
        .values("coupon")
        .annotate(n=Count("id"))
    )
    return {r["coupon"]: r["n"] for r in counted}


class IssueSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    prefix = serializers.RegexField(r"^[A-Za-z0-9]{2,8}$", required=False, default="VIP")
    kind = serializers.ChoiceField(choices=Coupon.Kind.values)
    value = serializers.DecimalField(max_digits=8, decimal_places=2)
    min_bill = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=0, min_value=0
    )
    max_discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=1
    )
    applies_to = serializers.ChoiceField(choices=Coupon.AppliesTo.values, default="all")
    ends_on = serializers.DateField()
    customers = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    segment = serializers.ChoiceField(choices=["all", "recent", "lapsed"], required=False)

    def validate(self, attrs):
        value = Decimal(attrs["value"])
        if attrs["kind"] == "percent" and not (0 < value <= 100):
            raise ValidationError({"value": "A percent coupon must be between 1 and 100."})
        if attrs["kind"] == "flat" and value <= 0:
            raise ValidationError({"value": "The amount must be more than zero."})
        if attrs["ends_on"] < timezone.localdate():
            raise ValidationError({"ends_on": "The last day cannot be in the past."})
        if bool(attrs.get("customers")) == bool(attrs.get("segment")):
            raise ValidationError({"detail": "Choose customers, or one group, not both."})
        return attrs


class PrivateCouponListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Private coupons issued to customers", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = list(
            Coupon.objects.filter(customer__isnull=False)
            .select_related("customer")
            .order_by("-created_at")[:300]
        )
        used = usage(rows)
        return Response([row(c, used.get(c.id, 0), admin=True) for c in rows])

    @extend_schema(summary="Issue private coupons", request=IssueSerializer)
    def post(self, request: Request) -> Response:
        body = IssueSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if data.get("customers"):
            people = User.objects.filter(
                pk__in=data["customers"], role=User.Role.CUSTOMER, is_active=True
            ).select_related("customer_profile")
            if people.count() != len(set(data["customers"])):
                raise ValidationError({"detail": "One of the customers was not found."})
        else:
            people = campaigns.audience(data["segment"]).select_related("customer_profile")
        template = {
            "name": data["name"],
            "kind": data["kind"],
            "value": data["value"],
            "min_bill": data["min_bill"],
            "max_discount": data.get("max_discount"),
            "applies_to": data["applies_to"],
            "ends_on": data["ends_on"],
        }
        try:
            made = private.issue(
                customers=people,
                template=template,
                prefix=data["prefix"].upper(),
                actor=request.user,
                request=request,
            )
        except private.PrivateCouponError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(
            {
                "issued": len(made),
                "emailed": sum(1 for _, e in made if e),
                "coupons": [row(c, 0, admin=True) for c, _ in made],
            },
            status=status.HTTP_201_CREATED,
        )


class PrivateCouponWithdrawView(APIView):
    policy_action = "marketing.manage"

    @extend_schema(summary="Withdraw an unused private coupon", request=None)
    def post(self, request: Request, pk) -> Response:
        try:
            coupon = private.revoke(pk, actor=request.user, request=request)
        except Coupon.DoesNotExist as exc:
            raise Http404 from exc
        except private.PrivateCouponError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(row(coupon, 0, admin=True))


class MyCouponsView(APIView):
    policy_action = "my.coupons.read"

    @extend_schema(summary="My private coupons", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = list(Coupon.objects.filter(customer=request.user).order_by("-created_at")[:50])
        used = usage(rows)
        out = [row(c, used.get(c.id, 0), admin=False) for c in rows]
        # Withdrawn coupons are not shown to the customer.
        return Response([r for r in out if r["state"] != "withdrawn"])
