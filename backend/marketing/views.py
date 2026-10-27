"""Admin marketing: offers (shown on the public site), coupons, loyalty rules and campaigns.
Campaigns are simulated emails to customers who ticked the marketing box; every message carries
an unsubscribe link. Customers can unsubscribe from the link without signing in."""

from datetime import timedelta
from decimal import Decimal

from django.core import signing
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog, User
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from marketing import coupons
from marketing.models import Campaign, Coupon, CouponRedemption
from people.models import CustomerProfile
from scheduling.models import Appointment, AppointmentStatus
from website.content import POS_DEFAULTS, pos_settings
from website.models import Offer, SiteContent

UNSUB_SALT = "marketing-unsubscribe"
RECENT_DAYS = 90


# --------------------------------------------------------------------------- offers


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = ["title", "description", "badge", "valid_until", "is_active", "sort_order"]


def offer_row(offer: Offer) -> dict:
    return {
        "id": offer.pk,
        "title": offer.title,
        "description": offer.description,
        "badge": offer.badge,
        "valid_until": offer.valid_until.isoformat() if offer.valid_until else None,
        "is_active": offer.is_active,
        "sort_order": offer.sort_order,
    }


class OfferListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Offers", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response([offer_row(o) for o in Offer.objects.all()])

    @extend_schema(summary="Add an offer", request=OfferSerializer)
    def post(self, request: Request) -> Response:
        serializer = OfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            offer = serializer.save()
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="offer added",
                offer=offer.title,
            )
        return Response(offer_row(offer), status=status.HTTP_201_CREATED)


class OfferDetailView(APIView):
    policy_actions = {"PATCH": "marketing.manage", "DELETE": "marketing.manage"}

    @extend_schema(summary="Edit an offer", request=OfferSerializer)
    def patch(self, request: Request, pk: int) -> Response:
        offer = get_object_or_404(Offer, pk=pk)
        before = offer_row(offer)
        serializer = OfferSerializer(offer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            offer = serializer.save()
            after = offer_row(offer)
            diff = {k: [before[k], after[k]] for k in after if before[k] != after[k]}
            if diff:
                audit(
                    AuditLog.Action.MARKETING_CHANGED,
                    request=request,
                    actor=request.user,
                    what="offer changed",
                    offer=offer.title,
                    changes=diff,
                )
        return Response(offer_row(offer))

    @extend_schema(summary="Delete an offer")
    def delete(self, request: Request, pk: int) -> Response:
        offer = get_object_or_404(Offer, pk=pk)
        with transaction.atomic():
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="offer deleted",
                offer=offer.title,
            )
            offer.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- coupons

COUPON_FIELDS = [
    "code",
    "name",
    "kind",
    "value",
    "min_bill",
    "max_discount",
    "starts_on",
    "ends_on",
    "total_limit",
    "per_customer_limit",
    "applies_to",
    "stackable",
    "is_active",
]


class CouponSerializer(serializers.ModelSerializer):
    code = serializers.RegexField(r"^[A-Za-z0-9_-]{3,24}$", max_length=24)

    class Meta:
        model = Coupon
        fields = COUPON_FIELDS

    def validate_code(self, value: str) -> str:
        code = coupons.normalize(value)
        clash = Coupon.objects.filter(code=code)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise ValidationError("A coupon with this code already exists.")
        return code

    def validate(self, attrs):
        data = {**{f: getattr(self.instance, f, None) for f in COUPON_FIELDS}, **attrs}
        if data["kind"] == Coupon.Kind.PERCENT and not (0 < Decimal(data["value"]) <= 100):
            raise ValidationError({"value": "A percent coupon must be between 1 and 100."})
        if data["kind"] == Coupon.Kind.FLAT and Decimal(data["value"]) <= 0:
            raise ValidationError({"value": "The amount must be more than zero."})
        if data["starts_on"] and data["ends_on"] and data["ends_on"] < data["starts_on"]:
            raise ValidationError({"ends_on": "The end date is before the start date."})
        if (data["per_customer_limit"] or 0) < 1:
            raise ValidationError({"per_customer_limit": "Allow at least one use per customer."})
        if data["total_limit"] is not None and data["total_limit"] < 1:
            raise ValidationError({"total_limit": "Leave empty for no limit, or use 1 or more."})
        return attrs


def coupon_row(coupon: Coupon, used: int) -> dict:
    today = timezone.localdate()
    if not coupon.is_active:
        state = "off"
    elif coupon.starts_on and today < coupon.starts_on:
        state = "scheduled"
    elif coupon.ends_on and today > coupon.ends_on:
        state = "expired"
    elif coupon.total_limit is not None and used >= coupon.total_limit:
        state = "used_up"
    else:
        state = "live"
    row = {f: getattr(coupon, f) for f in COUPON_FIELDS}
    for f in ("value", "min_bill", "max_discount"):
        row[f] = None if row[f] is None else str(row[f])
    for f in ("starts_on", "ends_on"):
        row[f] = row[f].isoformat() if row[f] else None
    return {"id": str(coupon.id), **row, "used": used, "state": state}


class CouponListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Coupons", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = list(Coupon.objects.all())
        used = coupons.usage(rows)
        return Response([coupon_row(c, used.get(str(c.id), 0)) for c in rows])

    @extend_schema(summary="Add a coupon", request=CouponSerializer)
    def post(self, request: Request) -> Response:
        serializer = CouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            coupon = serializer.save()
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="coupon added",
                coupon=coupon.code,
            )
        return Response(coupon_row(coupon, 0), status=status.HTTP_201_CREATED)


class CouponDetailView(APIView):
    policy_actions = {"PATCH": "marketing.manage"}

    @extend_schema(summary="Edit or switch a coupon on or off", request=CouponSerializer)
    def patch(self, request: Request, pk) -> Response:
        coupon = get_object_or_404(Coupon, pk=pk)
        before = coupon_row(coupon, 0)
        serializer = CouponSerializer(coupon, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            coupon = serializer.save()
            used = CouponRedemption.objects.filter(coupon=coupon).count()
            after = coupon_row(coupon, used)
            diff = {k: [before[k], after[k]] for k in COUPON_FIELDS if before[k] != after[k]}
            if diff:
                audit(
                    AuditLog.Action.MARKETING_CHANGED,
                    request=request,
                    actor=request.user,
                    what="coupon changed",
                    coupon=coupon.code,
                    changes=diff,
                )
        return Response(after)


# --------------------------------------------------------------------------- loyalty

LOYALTY_KEYS = ("loyalty_points_per_100", "loyalty_point_value", "loyalty_max_redeem_percent")


class LoyaltySerializer(serializers.Serializer):
    loyalty_points_per_100 = serializers.IntegerField(min_value=0, max_value=100, required=False)
    loyalty_point_value = serializers.IntegerField(min_value=1, max_value=100, required=False)
    loyalty_max_redeem_percent = serializers.IntegerField(
        min_value=0, max_value=100, required=False
    )


def loyalty_data() -> dict:
    rules = pos_settings()
    return {k: rules.get(k, POS_DEFAULTS[k]) for k in LOYALTY_KEYS}


class LoyaltyView(APIView):
    policy_actions = {"GET": "marketing.manage", "PATCH": "marketing.manage"}

    @extend_schema(summary="Loyalty rules", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(loyalty_data())

    @extend_schema(summary="Change loyalty rules", request=LoyaltySerializer)
    def patch(self, request: Request) -> Response:
        serializer = LoyaltySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            row, _ = SiteContent.objects.select_for_update().get_or_create(key="pos")
            old = loyalty_data()
            row.value = {**(row.value or {}), **serializer.validated_data}
            row.save()
            new = loyalty_data()
            diff = {k: [old[k], new[k]] for k in LOYALTY_KEYS if old[k] != new[k]}
            if diff:
                audit(
                    AuditLog.Action.MARKETING_CHANGED,
                    request=request,
                    actor=request.user,
                    what="loyalty rules changed",
                    changes=diff,
                )
        return Response(new)


# --------------------------------------------------------------------------- campaigns


def audience(kind: str):
    """Customers who opted in (and are active), narrowed by recent visits."""
    base = User.objects.filter(
        role=User.Role.CUSTOMER,
        is_active=True,
        customer_profile__marketing_opt_in=True,
    )
    cutoff = timezone.now() - timedelta(days=RECENT_DAYS)
    visited = Appointment.objects.filter(
        status=AppointmentStatus.COMPLETED, start__gte=cutoff
    ).values("customer")
    if kind == Campaign.Audience.RECENT:
        base = base.filter(pk__in=visited)
    elif kind == Campaign.Audience.LAPSED:
        base = base.exclude(pk__in=visited)
    return base.order_by("email")


def unsubscribe_token(user: User) -> str:
    return signing.dumps({"u": str(user.pk)}, salt=UNSUB_SALT)


def read_token(token: str) -> User:
    try:
        data = signing.loads(token, salt=UNSUB_SALT)
        return User.objects.get(pk=data["u"])
    except (signing.BadSignature, User.DoesNotExist, KeyError, ValueError) as exc:
        raise ValidationError({"detail": "This unsubscribe link is not valid."}) from exc


class CampaignSerializer(serializers.ModelSerializer):
    coupon = serializers.SlugRelatedField(
        slug_field="code", queryset=Coupon.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Campaign
        fields = ["name", "subject", "body", "audience", "coupon"]


def campaign_row(c: Campaign) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "subject": c.subject,
        "body": c.body,
        "audience": c.audience,
        "audience_label": Campaign.Audience(c.audience).label,
        "coupon": c.coupon.code if c.coupon_id else None,
        "status": c.status,
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "recipients": c.recipient_count if c.status == Campaign.Status.SENT else None,
        "would_reach": audience(c.audience).count() if c.status == Campaign.Status.DRAFT else None,
        "created_at": c.created_at.isoformat(),
    }


class CampaignListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Campaigns", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = Campaign.objects.select_related("coupon")
        return Response(
            {
                "opted_in": audience(Campaign.Audience.ALL).count(),
                "audiences": [
                    {"value": v, "label": label} for v, label in Campaign.Audience.choices
                ],
                "results": [campaign_row(c) for c in rows],
            }
        )

    @extend_schema(summary="Write a campaign draft", request=CampaignSerializer)
    def post(self, request: Request) -> Response:
        serializer = CampaignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            campaign = serializer.save(created_by=request.user)
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="campaign drafted",
                campaign=campaign.name,
            )
        return Response(campaign_row(campaign), status=status.HTTP_201_CREATED)


class CampaignDetailView(APIView):
    policy_actions = {"PATCH": "marketing.manage", "DELETE": "marketing.manage"}

    def draft(self, pk) -> Campaign:
        campaign = get_object_or_404(Campaign.objects.select_for_update(), pk=pk)
        if campaign.status != Campaign.Status.DRAFT:
            raise ValidationError({"detail": "A sent campaign cannot be changed."})
        return campaign

    @extend_schema(summary="Edit a draft", request=CampaignSerializer)
    def patch(self, request: Request, pk) -> Response:
        with transaction.atomic():
            campaign = self.draft(pk)
            serializer = CampaignSerializer(campaign, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            campaign = serializer.save()
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="campaign edited",
                campaign=campaign.name,
            )
        return Response(campaign_row(campaign))

    @extend_schema(summary="Delete a draft")
    def delete(self, request: Request, pk) -> Response:
        with transaction.atomic():
            campaign = self.draft(pk)
            audit(
                AuditLog.Action.MARKETING_CHANGED,
                request=request,
                actor=request.user,
                what="campaign deleted",
                campaign=campaign.name,
            )
            campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def message_body(campaign: Campaign, user: User) -> tuple[str, str]:
    name = user.full_name.split(" ")[0] if user.full_name else "there"
    lines = [f"Hello {name},", "", campaign.body.strip()]
    if campaign.coupon_id:
        lines += ["", f"Use coupon {campaign.coupon.code} at the counter."]
    link = frontend_link(f"/unsubscribe?token={unsubscribe_token(user)}")
    lines += [
        "",
        "You are getting this because you agreed to receive offers from "
        f"{brand.SHOP_NAME}. To stop these messages, unsubscribe here: {link}",
    ]
    return "\n".join(lines), link


class CampaignSendView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Send a draft to opted-in customers (simulated email)")
    def post(self, request: Request, pk) -> Response:
        with transaction.atomic():
            campaign = get_object_or_404(Campaign.objects.select_for_update(), pk=pk)
            if campaign.status != Campaign.Status.DRAFT:
                raise ValidationError({"detail": "This campaign has already been sent."})
            recipients = list(audience(campaign.audience))
            if not recipients:
                raise ValidationError({"detail": "No opted-in customers match this audience."})
            for user in recipients:
                body, link = message_body(campaign, user)
                queue_mail(
                    kind=MailOutbox.Kind.MARKETING,
                    to=user.email,
                    subject=campaign.subject,
                    body=body,
                    link=link,
                )
            campaign.status = Campaign.Status.SENT
            campaign.sent_at = timezone.now()
            campaign.recipient_count = len(recipients)
            campaign.save()
            audit(
                AuditLog.Action.CAMPAIGN_SENT,
                request=request,
                actor=request.user,
                campaign=campaign.name,
                recipients=len(recipients),
                audience=campaign.audience,
            )
        return Response(campaign_row(campaign))


# --------------------------------------------------------------------------- unsubscribe


class UnsubscribeView(APIView):
    """Public: the link in every campaign email. Needs only the signed token."""

    policy_action = "public.unsubscribe"
    authentication_classes: list = []

    @extend_schema(summary="Stop marketing messages", request=None, responses={200: None})
    def post(self, request: Request) -> Response:
        user = read_token(str(request.data.get("token", "")))
        with transaction.atomic():
            profile = CustomerProfile.objects.select_for_update().filter(user=user).first()
            if profile is not None and profile.set_marketing(False):
                profile.save(update_fields=["marketing_opt_in", "marketing_opt_changed_at"])
                audit(
                    AuditLog.Action.MARKETING_CONSENT,
                    request=request,
                    actor=user,
                    target=user,
                    opted_in=False,
                    where="unsubscribe link",
                )
        return Response({"detail": "You are unsubscribed. We will not send you offers."})
