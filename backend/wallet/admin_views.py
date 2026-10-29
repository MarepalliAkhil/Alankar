"""Admin: define packages and plans, see what was sold, and handle refunds and corrections."""

from __future__ import annotations

from django.db import transaction
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from scheduling.models import Service
from waitlist import engine
from waitlist.models import WaitlistEntry
from wallet import cancellation, data, giftcards, selling
from wallet.errors import WalletError
from wallet.models import (
    GiftCard,
    Membership,
    MembershipPlan,
    Package,
    PackageCancelRequest,
    PackageItem,
    PackagePurchase,
    Sale,
)
from wallet.views import STATUS, entry_data, error_response

PAGE = 200


# --------------------------------------------------------------------------- packages


class ItemSerializer(serializers.Serializer):
    service = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=50)


class PackageSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    description = serializers.CharField(max_length=300, required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    validity_days = serializers.IntegerField(min_value=7, max_value=1095)
    is_active = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=999, required=False)
    items = ItemSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("Add at least one service.")
        ids = [i["service"] for i in items]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("List each service once.")
        found = set(Service.objects.filter(pk__in=ids).values_list("pk", flat=True))
        if found != set(ids):
            raise serializers.ValidationError("One of the services does not exist.")
        return items


def _package_row(p: Package) -> dict:
    return data.package_data(p, sold=PackagePurchase.objects.filter(package=p).count())


def _save_package(package: Package, v: dict) -> None:
    for field in ("name", "description", "price", "validity_days", "is_active", "sort_order"):
        if field in v:
            setattr(package, field, v[field])
    package.save()
    package.items.all().delete()
    PackageItem.objects.bulk_create(
        [
            PackageItem(package=package, service_id=i["service"], quantity=i["quantity"])
            for i in v["items"]
        ]
    )


class AdminPackageListView(APIView):
    policy_actions = {"GET": "packages.read", "POST": "packages.edit"}

    @extend_schema(summary="Packages", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = Package.objects.prefetch_related("items__service")
        return Response([_package_row(p) for p in rows])

    @extend_schema(summary="Create a package", request=PackageSerializer)
    def post(self, request: Request) -> Response:
        body = PackageSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            package = Package()
            _save_package(package, body.validated_data)
        audit(
            AuditLog.Action.PACKAGE_EDITED,
            request=request,
            actor=request.user,
            package=package.name,
            change="created",
            price=str(package.price),
        )
        return Response(_package_row(package), status=status.HTTP_201_CREATED)


class AdminPackageDetailView(APIView):
    policy_action = "packages.edit"

    @extend_schema(
        summary="Change a package (people who bought it keep their terms)",
        request=PackageSerializer,
    )
    def patch(self, request: Request, pk) -> Response:
        package = Package.objects.filter(pk=pk).first()
        if package is None:
            raise Http404
        body = PackageSerializer(data={**_current(package), **request.data})
        body.is_valid(raise_exception=True)
        before = {"price": str(package.price), "active": package.is_active}
        with transaction.atomic():
            _save_package(package, body.validated_data)
        audit(
            AuditLog.Action.PACKAGE_EDITED,
            request=request,
            actor=request.user,
            package=package.name,
            change="updated",
            old=before,
            new={"price": str(package.price), "active": package.is_active},
        )
        return Response(_package_row(Package.objects.get(pk=pk)))


def _current(p: Package) -> dict:
    return {
        "name": p.name,
        "description": p.description,
        "price": str(p.price),
        "validity_days": p.validity_days,
        "is_active": p.is_active,
        "sort_order": p.sort_order,
        "items": [{"service": str(i.service_id), "quantity": i.quantity} for i in p.items.all()],
    }


class AdminPurchaseListView(APIView):
    policy_action = "packages.read"

    @extend_schema(
        summary="Packages that customers bought, with their usage ledger", responses={200: None}
    )
    def get(self, request: Request) -> Response:
        rows = PackagePurchase.objects.select_related("sale", "customer").prefetch_related(
            "credits__entries", "sale__refunds"
        )[:PAGE]
        return Response([data.purchase_data(p, ledger=True) for p in rows])


class RefundSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["cash", "card", "upi"])
    reason = serializers.CharField(max_length=300)


class AdminPackageRefundView(APIView):
    policy_action = "wallet.refund"

    @extend_schema(summary="Refund the unused sessions of a package", request=RefundSerializer)
    def post(self, request: Request, pk) -> Response:
        body = RefundSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            refund = selling.refund_package(
                pk,
                actor=request.user,
                method=body.validated_data["method"],
                reason=body.validated_data["reason"],
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.PACKAGE_REFUNDED,
            request=request,
            actor=request.user,
            target=refund.sale.customer,
            sale=refund.sale.number,
            amount=str(refund.amount),
            method=refund.method,
        )
        purchase = PackagePurchase.objects.select_related("sale", "customer").get(sale=refund.sale)
        return Response(data.purchase_data(purchase, ledger=True))


class RestoreSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class AdminRestorePackageUseView(APIView):
    policy_action = "wallet.refund"

    @extend_schema(summary="Put a used package session back", request=RestoreSerializer)
    def post(self, request: Request, pk) -> Response:
        body = RestoreSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            entry = selling.restore_package_use(
                pk, actor=request.user, reason=body.validated_data["reason"]
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.PACKAGE_SESSION_RESTORED,
            request=request,
            actor=request.user,
            target=entry.credit.purchase.customer,
            package=entry.credit.purchase.name,
            service=entry.credit.service_name,
            reason=body.validated_data["reason"],
        )
        purchase = PackagePurchase.objects.select_related("sale", "customer").get(
            pk=entry.credit.purchase_id
        )
        return Response(data.purchase_data(purchase, ledger=True))


# ----------------------------------------------------------- package cancellation requests


def _cancel_request_row(req: PackageCancelRequest) -> dict:
    return {
        "id": str(req.id),
        "purchase_id": str(req.purchase_id),
        "package_name": req.purchase.name,
        "customer_name": req.customer.full_name,
        "customer_id": str(req.customer_id),
        "reason": req.reason,
        "remaining_sessions": req.remaining_sessions,
        "total_sessions": req.total_sessions,
        "amount_paid": str(req.amount_paid),
        "estimated_refund": str(req.estimated_refund),
        "status": req.status,
        "decided_amount": str(req.decided_amount) if req.decided_amount is not None else None,
        "decision_reason": req.decision_reason,
        "decided_by": req.decided_by.full_name if req.decided_by_id else None,
        "decided_at": req.decided_at,
        "created_at": req.created_at,
    }


class AdminPackageCancelRequestListView(APIView):
    policy_action = "packages.cancel_requests.read"

    @extend_schema(summary="Package cancellation requests", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = PackageCancelRequest.objects.select_related("purchase", "customer", "decided_by")[
            :PAGE
        ]
        return Response([_cancel_request_row(r) for r in rows])


class ApproveCancelRequestSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["cash", "card", "upi"])
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AdminPackageCancelApproveView(APIView):
    policy_action = "packages.cancel_requests.decide"

    @extend_schema(
        summary="Approve a package cancellation (optionally at a different amount)",
        request=ApproveCancelRequestSerializer,
    )
    def post(self, request: Request, pk) -> Response:
        body = ApproveCancelRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            req = cancellation.approve_cancellation(
                pk,
                actor=request.user,
                method=body.validated_data["method"],
                amount=body.validated_data.get("amount"),
                reason=body.validated_data["reason"],
                request=request,
            )
        except WalletError as exc:
            return error_response(exc)
        return Response(_cancel_request_row(PackageCancelRequest.objects.get(pk=req.pk)))


class RejectCancelRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300, trim_whitespace=True)


class AdminPackageCancelRejectView(APIView):
    policy_action = "packages.cancel_requests.decide"

    @extend_schema(summary="Reject a package cancellation", request=RejectCancelRequestSerializer)
    def post(self, request: Request, pk) -> Response:
        body = RejectCancelRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            req = cancellation.reject_cancellation(
                pk, actor=request.user, reason=body.validated_data["reason"], request=request
            )
        except WalletError as exc:
            return error_response(exc)
        return Response(_cancel_request_row(PackageCancelRequest.objects.get(pk=req.pk)))


# --------------------------------------------------------------------------- memberships


class PlanSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    description = serializers.CharField(max_length=300, required=False, allow_blank=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    period_months = serializers.ChoiceField(choices=[1, 3, 12])
    discount_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    applies_to_products = serializers.BooleanField(required=False)
    included_sessions = serializers.IntegerField(min_value=0, max_value=50, required=False)
    included_services = serializers.ListField(child=serializers.UUIDField(), required=False)
    rules = serializers.CharField(max_length=500, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=999, required=False)

    def validate(self, attrs):
        sessions = attrs.get("included_sessions", 0)
        services = attrs.get("included_services", [])
        if sessions > 0 and not services:
            raise serializers.ValidationError(
                {"included_services": "Choose which services the included sessions cover."}
            )
        if services:
            found = set(Service.objects.filter(pk__in=services).values_list("pk", flat=True))
            if found != set(services):
                raise serializers.ValidationError(
                    {"included_services": "One of the services does not exist."}
                )
        if attrs.get("discount_percent", 0) <= 0 and sessions == 0:
            raise serializers.ValidationError(
                {"discount_percent": "A plan needs a discount, included sessions, or both."}
            )
        return attrs


def _save_plan(plan: MembershipPlan, v: dict) -> None:
    for field in (
        "name", "description", "price", "period_months", "discount_percent",
        "applies_to_products", "included_sessions", "rules", "is_active", "sort_order",
    ):  # fmt: skip
        if field in v:
            setattr(plan, field, v[field])
    plan.save()
    plan.included_services.set(v.get("included_services", []))


def _plan_row(p: MembershipPlan) -> dict:
    return data.plan_data(
        p, members=Membership.objects.filter(plan=p, status__in=["active", "cancelled"]).count()
    )


def _plan_current(p: MembershipPlan) -> dict:
    return {
        "name": p.name,
        "description": p.description,
        "price": str(p.price),
        "period_months": p.period_months,
        "discount_percent": str(p.discount_percent),
        "applies_to_products": p.applies_to_products,
        "included_sessions": p.included_sessions,
        "included_services": [str(s.pk) for s in p.included_services.all()],
        "rules": p.rules,
        "is_active": p.is_active,
        "sort_order": p.sort_order,
    }


class AdminPlanListView(APIView):
    policy_actions = {"GET": "memberships.read", "POST": "memberships.edit"}

    @extend_schema(summary="Membership plans", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(
            [_plan_row(p) for p in MembershipPlan.objects.prefetch_related("included_services")]
        )

    @extend_schema(summary="Create a membership plan", request=PlanSerializer)
    def post(self, request: Request) -> Response:
        body = PlanSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            plan = MembershipPlan()
            _save_plan(plan, body.validated_data)
        audit(
            AuditLog.Action.MEMBERSHIP_PLAN_EDITED,
            request=request,
            actor=request.user,
            plan=plan.name,
            change="created",
            price=str(plan.price),
        )
        return Response(_plan_row(plan), status=status.HTTP_201_CREATED)


class AdminPlanDetailView(APIView):
    policy_action = "memberships.edit"

    @extend_schema(
        summary="Change a plan (current members keep their terms)", request=PlanSerializer
    )
    def patch(self, request: Request, pk) -> Response:
        plan = MembershipPlan.objects.filter(pk=pk).first()
        if plan is None:
            raise Http404
        body = PlanSerializer(data={**_plan_current(plan), **request.data})
        body.is_valid(raise_exception=True)
        before = {
            "price": str(plan.price),
            "discount": str(plan.discount_percent),
            "active": plan.is_active,
        }
        with transaction.atomic():
            _save_plan(plan, body.validated_data)
        audit(
            AuditLog.Action.MEMBERSHIP_PLAN_EDITED,
            request=request,
            actor=request.user,
            plan=plan.name,
            change="updated",
            old=before,
            new={
                "price": str(plan.price),
                "discount": str(plan.discount_percent),
                "active": plan.is_active,
            },
        )
        return Response(_plan_row(MembershipPlan.objects.get(pk=pk)))


class AdminMemberListView(APIView):
    policy_action = "memberships.read"

    @extend_schema(summary="Members, with their session ledger", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = Membership.objects.select_related("customer").prefetch_related("entries__invoice")[
            :PAGE
        ]
        return Response([data.membership_data(m, ledger=True, admin=True) for m in rows])


class AdminRestoreMembershipUseView(APIView):
    policy_action = "wallet.refund"

    @extend_schema(summary="Put a used membership session back", request=RestoreSerializer)
    def post(self, request: Request, pk) -> Response:
        body = RestoreSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            entry = selling.restore_membership_use(
                pk, actor=request.user, reason=body.validated_data["reason"]
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.MEMBERSHIP_SESSION_RESTORED,
            request=request,
            actor=request.user,
            target=entry.membership.customer,
            reason=body.validated_data["reason"],
        )
        m = Membership.objects.select_related("customer").get(pk=entry.membership_id)
        return Response(data.membership_data(m, ledger=True, admin=True))


# --------------------------------------------------------------------------- gift cards and sales


class AdminGiftCardListView(APIView):
    policy_action = "giftcards.read"

    @extend_schema(summary="Gift cards (last four characters only)", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = GiftCard.objects.select_related("sale").prefetch_related("entries")[:PAGE]
        return Response([data.card_data(c, admin=True) for c in rows])


class AdminGiftCardDetailView(APIView):
    policy_action = "giftcards.read"

    @extend_schema(summary="One gift card with its ledger", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        card = GiftCard.objects.select_related("sale").filter(pk=pk).first()
        if card is None:
            raise Http404
        return Response(data.card_data(card, admin=True, ledger=True))


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class AdminGiftCardRevealView(APIView):
    """Task 8.5: the admin list/detail only ever show the masked code. This decrypts the full
    code on demand and writes an audit entry every time (who, when, which card)."""

    policy_action = "giftcards.reveal"

    @extend_schema(summary="Reveal a gift card's full code (audited)", responses={200: None})
    def post(self, request: Request, pk) -> Response:
        card = GiftCard.objects.filter(pk=pk).first()
        if card is None:
            raise Http404
        code = giftcards.reveal(card)
        audit(
            AuditLog.Action.GIFT_CARD_CODE_REVEALED,
            request=request,
            actor=request.user,
            card=giftcards.mask(card.last4),
            found=code is not None,
        )
        if code is None:
            return Response(
                {"detail": "This card's code was only shown once, when it was issued."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"code": code})


class AdminGiftCardVoidView(APIView):
    policy_action = "giftcards.manage"

    @extend_schema(summary="Cancel a gift card (for example a lost one)", request=VoidSerializer)
    def post(self, request: Request, pk) -> Response:
        body = VoidSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reason = body.validated_data["reason"].strip()
        if len(reason) < 3:
            return Response({"detail": "Give a reason."}, status=400)
        card = GiftCard.objects.filter(pk=pk).first()
        if card is None:
            raise Http404
        try:
            left = card.balance
            giftcards.void(card, actor=request.user, reason=reason)
        except WalletError as exc:
            return Response({"detail": exc.message}, status=STATUS.get(exc.code, 400))
        audit(
            AuditLog.Action.GIFT_CARD_VOIDED,
            request=request,
            actor=request.user,
            card=giftcards.mask(card.last4),
            balance_lost=str(left),
            reason=reason,
        )
        card = GiftCard.objects.select_related("sale").get(pk=pk)
        return Response(data.card_data(card, admin=True, ledger=True))


class AdminSaleListView(APIView):
    policy_action = "sales.read"

    @extend_schema(summary="Package, membership and gift-card sales", responses={200: None})
    def get(self, request: Request) -> Response:
        qs = Sale.objects.prefetch_related("refunds")
        kind = request.query_params.get("kind")
        if kind in Sale.Kind.values:
            qs = qs.filter(kind=kind)
        return Response([data.sale_data(s) for s in qs[:PAGE]])


# --------------------------------------------------------------------------- waitlist


class AdminWaitlistView(APIView):
    policy_action = "waitlist.read"

    @extend_schema(summary="Everyone on the waitlist", responses={200: None})
    def get(self, request: Request) -> Response:
        engine.expire_offers()
        qs = WaitlistEntry.objects.select_related(
            "service", "variant", "stylist", "customer"
        ).prefetch_related("offers__stylist")
        state = request.query_params.get("status")
        if state in WaitlistEntry.Status.values:
            qs = qs.filter(status=state)
        return Response(
            [{**entry_data(e), "customer_name": e.customer.full_name} for e in qs[:PAGE]]
        )


class AdminWaitlistCancelView(APIView):
    policy_action = "waitlist.manage"

    @extend_schema(summary="Remove someone from the waitlist", request=VoidSerializer)
    def post(self, request: Request, pk) -> Response:
        body = VoidSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        entry = WaitlistEntry.objects.filter(pk=pk).first()
        if entry is None:
            raise Http404
        try:
            engine.cancel(pk, customer=entry.customer, request=request)
        except WalletError as exc:
            return Response({"detail": exc.message}, status=STATUS.get(exc.code, 400))
        audit(
            AuditLog.Action.WAITLIST_CANCELLED,
            request=request,
            actor=request.user,
            target=entry.customer,
            entry=str(entry.pk),
            by="admin",
            reason=body.validated_data["reason"],
        )
        entry.refresh_from_db()
        return Response({**entry_data(entry), "customer_name": entry.customer.full_name})
