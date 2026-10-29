"""Customer and counter endpoints for packages, memberships, gift cards and the waitlist."""

from __future__ import annotations

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit, client_ip
from accounts.models import AuditLog, User
from core.throttles import BOOKING_THROTTLES
from scheduling import booking
from scheduling.models import Service, ServiceVariant
from waitlist import engine
from waitlist.models import WaitlistEntry, WaitlistOffer
from wallet import cancellation, data, giftcards, packagecodes, selling
from wallet.errors import WalletError
from wallet.models import MembershipPlan, Package, PackagePurchase
from website.content import package_settings

STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "conflict": status.HTTP_409_CONFLICT,
    "payment_declined": status.HTTP_402_PAYMENT_REQUIRED,
    "throttled": status.HTTP_429_TOO_MANY_REQUESTS,
}


def error_response(exc: WalletError) -> Response:
    return Response({"detail": exc.message}, status=STATUS.get(exc.code, 400))


def catalogue() -> dict:
    return {
        "packages": [
            data.package_data(p)
            for p in Package.objects.filter(is_active=True).prefetch_related("items__service")
        ],
        "plans": [
            data.plan_data(p)
            for p in MembershipPlan.objects.filter(is_active=True).prefetch_related(
                "included_services"
            )
        ],
    }


# --------------------------------------------------------------------------- customer


class OutcomeSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["success", "fail"], default="success")


class MyWalletView(APIView):
    policy_action = "my.wallet.read"

    @extend_schema(summary="My packages, membership and gift cards", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response({**data.customer_wallet(request.user), "catalogue": catalogue()})


class MyBuyPackageView(APIView):
    policy_action = "my.packages.buy"

    @extend_schema(summary="Buy a package online (simulated payment)", request=OutcomeSerializer)
    def post(self, request: Request, pk) -> Response:
        body = OutcomeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            purchase = selling.sell_package(
                pk,
                request.user,
                channel="online",
                succeed=body.validated_data["outcome"] == "success",
                actor=request.user,
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.PACKAGE_SOLD,
            request=request,
            actor=request.user,
            target=request.user,
            package=purchase.name,
            amount=str(purchase.price_paid),
            sale=purchase.sale.number,
            channel="online",
        )
        return Response(data.purchase_data(purchase), status=status.HTTP_201_CREATED)


class JoinSerializer(OutcomeSerializer):
    plan = serializers.UUIDField()


class MyJoinMembershipView(APIView):
    policy_action = "my.memberships.join"

    @extend_schema(summary="Join a membership (simulated payment)", request=JoinSerializer)
    def post(self, request: Request) -> Response:
        body = JoinSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            m = selling.join_membership(
                body.validated_data["plan"],
                request.user,
                channel="online",
                succeed=body.validated_data["outcome"] == "success",
                actor=request.user,
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.MEMBERSHIP_JOINED,
            request=request,
            actor=request.user,
            target=request.user,
            plan=m.plan_name,
            amount=str(m.price),
            channel="online",
        )
        return Response(data.membership_data(m), status=status.HTTP_201_CREATED)


class MyRenewMembershipView(APIView):
    policy_action = "my.memberships.renew"

    @extend_schema(summary="Renew my membership (simulated payment)", request=OutcomeSerializer)
    def post(self, request: Request) -> Response:
        body = OutcomeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            m = selling.renew_membership(
                request.user,
                channel="online",
                succeed=body.validated_data["outcome"] == "success",
                actor=request.user,
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.MEMBERSHIP_RENEWED,
            request=request,
            actor=request.user,
            target=request.user,
            plan=m.plan_name,
            amount=str(m.price),
            channel="online",
        )
        return Response(data.membership_data(m))


class MyCancelMembershipView(APIView):
    policy_action = "my.memberships.cancel"

    @extend_schema(summary="Cancel my membership at the end of the period", request=None)
    def post(self, request: Request) -> Response:
        try:
            m = selling.cancel_membership(request.user, actor=request.user)
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.MEMBERSHIP_CANCELLED,
            request=request,
            actor=request.user,
            target=request.user,
            plan=m.plan_name,
        )
        return Response(data.membership_data(m))


class GiftCardBuySerializer(OutcomeSerializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    recipient_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    recipient_email = serializers.EmailField(required=False, allow_blank=True)
    message = serializers.CharField(max_length=300, required=False, allow_blank=True)


class MyBuyGiftCardView(APIView):
    policy_action = "my.giftcards.buy"

    @extend_schema(
        summary="Buy a gift card online (simulated payment)", request=GiftCardBuySerializer
    )
    def post(self, request: Request) -> Response:
        body = GiftCardBuySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        v = body.validated_data
        try:
            card, code = selling.sell_gift_card(
                amount=v["amount"],
                channel="online",
                succeed=v["outcome"] == "success",
                actor=request.user,
                buyer=request.user,
                recipient_name=v.get("recipient_name", ""),
                recipient_email=v.get("recipient_email", ""),
                message=v.get("message", ""),
            )
        except WalletError as exc:
            return error_response(exc)
        audit(
            AuditLog.Action.GIFT_CARD_SOLD,
            request=request,
            actor=request.user,
            card=giftcards.mask(card.last4),
            amount=str(card.initial_amount),
            sale=card.sale.number,
            channel="online",
        )
        # The code is shown once, here, to the buyer. It is never stored or listed again.
        return Response(
            {"card": data.card_data(card, viewer=request.user), "code": code},
            status=status.HTTP_201_CREATED,
        )


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=60)


def _check_card(request: Request) -> Response:
    body = CodeSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    try:
        card = giftcards.find(
            body.validated_data["code"], user=request.user, ip=client_ip(request), request=request
        )
        giftcards.check_usable(card)
    except WalletError as exc:
        return error_response(exc)
    return Response(
        {
            "last4": card.last4,
            "masked": giftcards.mask(card.last4),
            "balance": data.money_str(card.balance),
            "expires_at": card.expires_at,
        }
    )


class MyCheckGiftCardView(APIView):
    policy_action = "my.giftcards.check"

    @extend_schema(
        summary="Check a gift card code (wrong guesses are limited)", request=CodeSerializer
    )
    def post(self, request: Request) -> Response:
        return _check_card(request)


def _my_giftcard_or_404(request: Request, pk):
    card = giftcards.visible_to(request.user).select_related("sale").filter(pk=pk).first()
    if card is None:
        raise Http404
    if not request.user.email_verified_at and card.buyer_id != request.user.pk:
        raise Http404
    return card


class MyGiftCardRevealView(APIView):
    """Task 8.5: show the full code again (not just the masked last 4) to its owner or the
    recipient it was sent to. Never audited -- it is the customer's own card -- but cards issued
    before this existed never kept a plaintext to show (`code_available` says so up front)."""

    policy_action = "my.giftcards.reveal"

    @extend_schema(summary="Reveal a gift card's full code", responses={200: None})
    def post(self, request: Request, pk) -> Response:
        card = _my_giftcard_or_404(request, pk)
        code = giftcards.reveal(card)
        if code is None:
            return Response(
                {"detail": "This card's code was only shown once, when it was issued."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"code": code})


# --------------------------------------------------------------------------- packages (customer)


def _my_package_or_404(request: Request, pk):
    purchase = (
        PackagePurchase.objects.filter(pk=pk, customer=request.user)
        .select_related("sale", "customer")
        .prefetch_related("credits__entries", "sale__refunds")
        .first()
    )
    if purchase is None:
        raise Http404
    return purchase


class MyPackagesView(APIView):
    """A standalone Packages page: every package the customer has bought, each with its own
    Show/Hide code, ledger and (if eligible) a cancellation request."""

    policy_action = "my.packages.list"

    @extend_schema(summary="My packages", responses={200: None})
    def get(self, request: Request) -> Response:
        purchases = (
            PackagePurchase.objects.filter(customer=request.user)
            .select_related("sale", "customer")
            .prefetch_related("credits__entries", "sale__refunds", "cancel_requests")
        )
        rows = []
        for p in purchases:
            row = data.purchase_data(p, ledger=True)
            pending = next(
                (r for r in p.cancel_requests.all() if r.status == "pending"),
                None,
            )
            row["pending_cancel_request"] = (
                {"id": str(pending.id), "estimated_refund": str(pending.estimated_refund)}
                if pending
                else None
            )
            rows.append(row)
        return Response(rows)


class MyPackageRevealCodeView(APIView):
    policy_action = "my.packages.reveal"

    @extend_schema(summary="Reveal a package's full code", responses={200: None})
    def post(self, request: Request, pk) -> Response:
        purchase = _my_package_or_404(request, pk)
        code = packagecodes.reveal(purchase)
        if code is None:
            return Response(
                {"detail": "This package's code was only shown once, when it was bought."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"code": code})


class MyPackageCancelEstimateView(APIView):
    """What a cancellation would refund right now, shown before the customer confirms."""

    policy_action = "my.packages.cancel_estimate"

    @extend_schema(summary="Estimate a package cancellation refund", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        purchase = _my_package_or_404(request, pk)
        settings_ = package_settings()
        return Response(
            {
                "estimated_refund": str(cancellation.estimate_refund(purchase)),
                "cancellation_fee_percent": str(settings_["cancellation_fee_percent"]),
                "refund_window_days": settings_["refund_window_days"],
                "already_pending": purchase.cancel_status != PackagePurchase.CancelStatus.NONE,
            }
        )


class CancelRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=300, trim_whitespace=True)


class MyPackageCancelRequestView(APIView):
    policy_action = "my.packages.cancel_request"

    @extend_schema(summary="Ask to cancel a package for a refund", request=CancelRequestSerializer)
    def post(self, request: Request, pk) -> Response:
        body = CancelRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            req = cancellation.request_cancellation(
                pk, customer=request.user, reason=body.validated_data["reason"], request=request
            )
        except WalletError as exc:
            return error_response(exc)
        return Response(
            {
                "id": str(req.id),
                "status": req.status,
                "estimated_refund": str(req.estimated_refund),
            },
            status=status.HTTP_201_CREATED,
        )


# --------------------------------------------------------------------------- waitlist (customer)


def entry_data(entry: WaitlistEntry) -> dict:
    offer = next((o for o in entry.offers.all() if o.status == WaitlistOffer.Status.PENDING), None)
    return {
        "id": str(entry.id),
        "service": str(entry.service_id),
        "service_name": entry.service.name,
        "variant": str(entry.variant_id) if entry.variant_id else None,
        "variant_label": entry.variant.label if entry.variant_id else "",
        "stylist": str(entry.stylist_id) if entry.stylist_id else None,
        "stylist_name": entry.stylist.display_name if entry.stylist_id else "Any stylist",
        "window_start": entry.window_start,
        "window_end": entry.window_end,
        "note": entry.note,
        "status": entry.status,
        "status_label": entry.get_status_display(),
        "created_at": entry.created_at,
        "appointment": str(entry.appointment_id) if entry.appointment_id else None,
        "offer": (
            {
                "id": str(offer.id),
                "start": offer.start,
                "end": offer.end,
                "expires_at": offer.expires_at,
                "stylist_name": offer.stylist.display_name,
            }
            if offer
            else None
        ),
    }


def my_entries(user):
    return (
        WaitlistEntry.objects.filter(customer=user)
        .select_related("service", "variant", "stylist")
        .prefetch_related("offers__stylist")
    )


class WaitlistJoinSerializer(serializers.Serializer):
    service = serializers.UUIDField()
    variant = serializers.UUIDField(required=False, allow_null=True)
    stylist = serializers.UUIDField(required=False, allow_null=True)
    window_start = serializers.DateTimeField()
    window_end = serializers.DateTimeField()
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class MyWaitlistView(APIView):
    throttle_classes = BOOKING_THROTTLES
    policy_actions = {"GET": "my.waitlist.list", "POST": "my.waitlist.create"}

    @extend_schema(summary="My waitlist entries", responses={200: None})
    def get(self, request: Request) -> Response:
        engine.expire_offers()
        return Response([entry_data(e) for e in my_entries(request.user)[:50]])

    @extend_schema(summary="Join the waitlist", request=WaitlistJoinSerializer)
    def post(self, request: Request) -> Response:
        body = WaitlistJoinSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        v = body.validated_data
        service = Service.objects.filter(pk=v["service"], is_active=True).first()
        if service is None:
            raise Http404
        variant_id = v.get("variant")
        if (
            variant_id
            and not ServiceVariant.objects.filter(
                pk=variant_id, service=service, is_active=True
            ).exists()
        ):
            return Response({"detail": "Choose one of the options of this service."}, status=400)
        stylist = None
        if v.get("stylist"):
            stylist = (
                booking.qualified_stylists(service, public_only=True)
                .filter(pk=v["stylist"])
                .first()
            )
            if stylist is None:
                raise Http404
        from people import ratings

        if ratings.pending_count(request.user):
            return Response(
                {"detail": "Please rate your recent visit before joining the waitlist."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            entry = engine.join(
                request.user,
                service=service,
                variant_id=variant_id,
                stylist=stylist,
                window_start=v["window_start"],
                window_end=v["window_end"],
                note=v["note"],
                request=request,
            )
        except WalletError as exc:
            return error_response(exc)
        return Response(entry_data(my_entries(request.user).get(pk=entry.pk)), status=201)


class MyWaitlistCancelView(APIView):
    policy_action = "my.waitlist.cancel"

    @extend_schema(summary="Leave the waitlist", request=None)
    def post(self, request: Request, pk) -> Response:
        try:
            engine.cancel(pk, customer=request.user, request=request)
        except WalletError as exc:
            return error_response(exc)
        return Response(entry_data(my_entries(request.user).get(pk=pk)))


class MyWaitlistAcceptView(APIView):
    policy_action = "my.waitlist.respond"

    @extend_schema(summary="Take the offered slot", request=None)
    def post(self, request: Request, pk) -> Response:
        try:
            appt = engine.accept(pk, customer=request.user, request=request)
        except WalletError as exc:
            return error_response(exc)
        return Response({"appointment": str(appt.pk), "status": appt.status})


class MyWaitlistDeclineView(APIView):
    policy_action = "my.waitlist.respond"

    @extend_schema(summary="Decline the offered slot", request=None)
    def post(self, request: Request, pk) -> Response:
        try:
            engine.decline(pk, customer=request.user, request=request)
        except WalletError as exc:
            return error_response(exc)
        return Response({"detail": "Declined."})


# --------------------------------------------------------------------------- counter (desk)


class DeskCatalogueView(APIView):
    policy_action = "wallet.catalogue"

    @extend_schema(summary="Packages and plans on sale", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(catalogue())


class DeskCustomerWalletView(APIView):
    policy_action = "wallet.customer"

    @extend_schema(summary="What one customer holds (no gift-card codes)", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        user = User.objects.filter(pk=pk, role=User.Role.CUSTOMER, is_active=True).first()
        if user is None:
            raise Http404
        wallet = data.customer_wallet(user)
        wallet.pop("gift_cards", None)  # a gift card belongs to whoever holds its code
        return Response(wallet)


class DeskSellSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=["package", "membership", "membership_renewal", "gift_card"]
    )
    method = serializers.ChoiceField(choices=["cash", "card", "upi"])
    customer = serializers.UUIDField(required=False, allow_null=True)
    package = serializers.UUIDField(required=False, allow_null=True)
    plan = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True
    )
    buyer_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    recipient_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    recipient_email = serializers.EmailField(required=False, allow_blank=True)
    message = serializers.CharField(max_length=300, required=False, allow_blank=True)


class DeskSellView(APIView):
    policy_action = "wallet.sell"

    @extend_schema(
        summary="Sell a package, membership or gift card at the counter", request=DeskSellSerializer
    )
    def post(self, request: Request) -> Response:
        body = DeskSellSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        v = body.validated_data
        kind, method = v["kind"], v["method"]
        try:
            if kind == "gift_card":
                buyer = None
                if v.get("customer"):
                    buyer = User.objects.filter(
                        pk=v["customer"], role=User.Role.CUSTOMER, is_active=True
                    ).first()
                    if buyer is None:
                        raise Http404
                if v.get("amount") is None:
                    raise WalletError("Enter the amount.")
                card, code = selling.sell_gift_card(
                    amount=v["amount"],
                    channel="pos",
                    method=method,
                    actor=request.user,
                    buyer=buyer,
                    buyer_name=v.get("buyer_name", ""),
                    recipient_name=v.get("recipient_name", ""),
                    recipient_email=v.get("recipient_email", ""),
                    message=v.get("message", ""),
                )
                audit(
                    AuditLog.Action.GIFT_CARD_SOLD,
                    request=request,
                    actor=request.user,
                    card=giftcards.mask(card.last4),
                    amount=str(card.initial_amount),
                    sale=card.sale.number,
                    channel="pos",
                    method=method,
                )
                return Response(
                    {
                        "sale": data.sale_data(card.sale),
                        "card": data.card_data(card),
                        "code": code,
                    },
                    status=status.HTTP_201_CREATED,
                )
            if not v.get("customer"):
                raise WalletError("Choose the customer.")
            if kind == "package":
                if not v.get("package"):
                    raise WalletError("Choose the package.")
                purchase = selling.sell_package(
                    v["package"], v["customer"], channel="pos", method=method, actor=request.user
                )
                audit(
                    AuditLog.Action.PACKAGE_SOLD,
                    request=request,
                    actor=request.user,
                    target=purchase.customer,
                    package=purchase.name,
                    amount=str(purchase.price_paid),
                    sale=purchase.sale.number,
                    channel="pos",
                    method=method,
                )
                return Response(
                    {
                        "sale": data.sale_data(purchase.sale),
                        "purchase": data.purchase_data(purchase),
                    },
                    status=status.HTTP_201_CREATED,
                )
            if kind == "membership":
                if not v.get("plan"):
                    raise WalletError("Choose the plan.")
                m = selling.join_membership(
                    v["plan"], v["customer"], channel="pos", method=method, actor=request.user
                )
                action = AuditLog.Action.MEMBERSHIP_JOINED
            else:
                m = selling.renew_membership(
                    v["customer"], channel="pos", method=method, actor=request.user
                )
                action = AuditLog.Action.MEMBERSHIP_RENEWED
            audit(
                action,
                request=request,
                actor=request.user,
                target=m.customer,
                plan=m.plan_name,
                amount=str(m.price),
                channel="pos",
                method=method,
            )
            sale = m.entries.exclude(sale__isnull=True).latest("created_at").sale
            return Response(
                {"sale": data.sale_data(sale), "membership": data.membership_data(m)},
                status=status.HTTP_201_CREATED,
            )
        except WalletError as exc:
            return error_response(exc)


class DeskCheckGiftCardView(APIView):
    policy_action = "wallet.giftcheck"

    @extend_schema(
        summary="Check a gift card at the counter (wrong guesses are limited)",
        request=CodeSerializer,
    )
    def post(self, request: Request) -> Response:
        return _check_card(request)
