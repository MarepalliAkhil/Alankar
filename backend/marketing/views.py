"""Admin marketing: offers (shown on the public site), coupons, loyalty rules and campaigns.
Campaigns are simulated emails to customers who ticked the marketing box; every message carries
an unsubscribe link. Customers can unsubscribe from the link without signing in."""

from datetime import timedelta
from decimal import Decimal

from django.core import signing
from django.db import transaction
from django.db.models import Count
from django.http import HttpResponseRedirect
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
from core.throttles import PUBLIC_WRITE_THROTTLES
from inventory.models import Product
from marketing import campaigns, consent, content, coupon_report, coupons, limits
from marketing.campaigns import audience, message_body, unsubscribe_token  # noqa: F401
from marketing.models import Campaign, CampaignRecipient, ConsentRecord, Coupon, CouponRedemption
from people.models import CustomerProfile
from scheduling.models import Appointment, Division, Service
from website.content import POS_DEFAULTS, pos_settings
from website.models import Offer, SiteContent

UNSUB_SALT = "marketing-unsubscribe"
RECENT_DAYS = 90
BOOKED_DAYS = 7


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
    "description",
    "first_visit_only",
    "divisions",
    "listed",
]


class CouponSerializer(serializers.ModelSerializer):
    code = serializers.RegexField(r"^[A-Za-z0-9_-]{3,24}$", max_length=24)
    divisions = serializers.ListField(
        child=serializers.ChoiceField(choices=Division.choices), required=False
    )
    services = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Service.objects.all()
    )
    products = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Product.objects.all()
    )

    class Meta:
        model = Coupon
        fields = [*COUPON_FIELDS, "services", "products"]

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
        if self.instance is None and "per_customer_limit" not in attrs:
            data["per_customer_limit"] = 1  # the model's default
        if (data["per_customer_limit"] or 0) < 1:
            raise ValidationError({"per_customer_limit": "Allow at least one use per customer."})
        if data["total_limit"] is not None and data["total_limit"] < 1:
            raise ValidationError({"total_limit": "Leave empty for no limit, or use 1 or more."})
        if data["applies_to"] == Coupon.AppliesTo.CHOSEN:
            chosen = [
                attrs.get("divisions", data.get("divisions") or []),
                attrs.get("services", self.instance and list(self.instance.services.all())),
                attrs.get("products", self.instance and list(self.instance.products.all())),
            ]
            if not any(chosen):
                raise ValidationError(
                    {"applies_to": "Choose at least one division, service or product."}
                )
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
    row["services"] = [str(pk) for pk in coupon.services.values_list("pk", flat=True)]
    row["products"] = [str(pk) for pk in coupon.products.values_list("pk", flat=True)]
    return {
        "id": str(coupon.id),
        **row,
        "terms": coupons.terms(coupon),
        "created_by": coupon.created_by.email if coupon.created_by_id else "",
        "used": used,
        "state": state,
    }


class CouponListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Coupons", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = list(Coupon.objects.filter(customer__isnull=True))
        used = coupons.usage(rows)
        return Response([coupon_row(c, used.get(str(c.id), 0)) for c in rows])

    @extend_schema(summary="Add a coupon", request=CouponSerializer)
    def post(self, request: Request) -> Response:
        serializer = CouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            coupon = serializer.save(created_by=request.user)
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
        coupon = get_object_or_404(Coupon, pk=pk, customer__isnull=True)
        before = coupon_row(coupon, 0)
        serializer = CouponSerializer(coupon, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            coupon = serializer.save()
            used = CouponRedemption.objects.filter(coupon=coupon, released_at__isnull=True).count()
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


class CouponReportView(APIView):
    """Coupon results for a date range: uses and discount per coupon, and paid bookings and online
    revenue with and without a coupon (docs/COUPONS.md)."""

    policy_actions = {"GET": "marketing.manage"}

    @extend_schema(summary="Coupon report", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(coupon_report.build(request.query_params))


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


def read_token(token: str) -> User:
    try:
        data = signing.loads(token, salt=UNSUB_SALT)
        return User.objects.get(pk=data["u"])
    except (signing.BadSignature, User.DoesNotExist, KeyError, ValueError) as exc:
        raise ValidationError({"detail": "This unsubscribe link is not valid."}) from exc


class CampaignSerializer(serializers.ModelSerializer):
    coupon = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Coupon.objects.filter(customer__isnull=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Campaign
        fields = ["name", "subject", "body", "audience", "coupon", "kind"]


def results(c: Campaign) -> dict | None:
    """Sent, skipped, clicked and booked (a booking request within 7 days of the email). No
    tracking pixels: opens are not measured."""
    if c.status not in (Campaign.Status.SENT, Campaign.Status.SENDING):
        return None
    rows = CampaignRecipient.objects.filter(campaign=c)
    sent = rows.filter(status=CampaignRecipient.Status.SENT)
    booked = 0
    for user_id, at in sent.values_list("user_id", "sent_at"):
        if Appointment.objects.filter(
            customer_id=user_id,
            created_at__gte=at,
            created_at__lte=at + timedelta(days=BOOKED_DAYS),
        ).exists():
            booked += 1
    skipped = (
        rows.filter(status=CampaignRecipient.Status.SKIPPED)
        .values("reason")
        .annotate(n=Count("id"))
        .order_by("-n")
    )
    return {
        "sent": sent.count(),
        "waiting": rows.filter(status=CampaignRecipient.Status.PENDING).count(),
        "skipped": sum(r["n"] for r in skipped),
        "skipped_reasons": [{"reason": r["reason"], "count": r["n"]} for r in skipped],
        "clicked": sent.filter(clicked_at__isnull=False).count(),
        "booked": booked,
        "booked_within_days": BOOKED_DAYS,
    }


def campaign_row(c: Campaign) -> dict:
    done = c.status in (Campaign.Status.SENT, Campaign.Status.SENDING)
    return {
        "id": str(c.id),
        "name": c.name,
        "subject": c.subject,
        "body": c.body,
        "kind": c.kind,
        "kind_label": Campaign.Kind(c.kind).label,
        "audience": c.audience,
        "audience_label": Campaign.Audience(c.audience).label,
        "coupon": c.coupon.code if c.coupon_id else None,
        "status": c.status,
        "scheduled_for": c.scheduled_for.isoformat() if c.scheduled_for else None,
        "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        "approved_at": c.approved_at.isoformat() if c.approved_at else None,
        "approved_by": c.approved_by.full_name if c.approved_by_id else None,
        "recipients": c.recipient_count if c.status == Campaign.Status.SENT else None,
        "would_reach": (None if done else audience(c.audience, c.kind).count()),
        "problem": None if done else content.can_create(c.kind),
        "results": results(c),
        "created_at": c.created_at.isoformat(),
    }


class CampaignListView(APIView):
    policy_actions = {"GET": "marketing.manage", "POST": "marketing.manage"}

    @extend_schema(summary="Campaigns", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = Campaign.objects.select_related("coupon", "approved_by")
        return Response(
            {
                "opted_in": audience(Campaign.Audience.ALL).count(),
                "audiences": [
                    {"value": v, "label": label} for v, label in Campaign.Audience.choices
                ],
                "kinds": [{"value": v, "label": label} for v, label in Campaign.Kind.choices],
                "limits": {
                    "quiet_hours": list(limits.quiet_hours() or []),
                    "min_days": limits.min_days(),
                    "quiet_now": limits.in_quiet_hours(),
                },
                "consent_version": consent.VERSION,
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
            raise ValidationError(
                {"detail": "Only a draft can be changed. Remove the schedule first."}
                if campaign.status == Campaign.Status.SCHEDULED
                else {"detail": "A sent campaign cannot be changed."}
            )
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


class CampaignSendView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Approve and send a draft to opted-in customers (simulated email)")
    def post(self, request: Request, pk) -> Response:
        get_object_or_404(Campaign, pk=pk)
        try:
            campaign = campaigns.send(pk, actor=request.user, request=request)
        except campaigns.CampaignError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(campaign_row(campaign))


class CampaignPreviewView(APIView):
    policy_action = "marketing.manage"

    @extend_schema(summary="Preview one customer's email (nothing is sent)", responses={200: None})
    def get(self, request: Request, pk) -> Response:
        campaign = get_object_or_404(Campaign.objects.select_related("coupon"), pk=pk)
        problem = content.can_create(campaign.kind)
        if problem:
            return Response({"problem": problem, "customer": None})
        person = None
        wanted = request.query_params.get("customer")
        if wanted:
            person = campaigns.audience(campaign.audience, campaign.kind).filter(pk=wanted).first()
            if person is None:
                raise ValidationError({"customer": "That customer is not in this audience."})
        try:
            data = campaigns.preview(campaign, person)
        except content.Skip as exc:
            return Response(
                {"problem": f"This customer would be skipped: {exc}.", "customer": None}
            )
        data["problem"] = None
        return Response(data)


class CampaignTestView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Send the preview to my own email (marked [Test])", request=None)
    def post(self, request: Request, pk) -> Response:
        get_object_or_404(Campaign, pk=pk)
        try:
            to = campaigns.send_test(pk, actor=request.user, request=request)
        except campaigns.CampaignError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"detail": f"Test email sent to {to}."})


class ScheduleSerializer(serializers.Serializer):
    send_at = serializers.DateTimeField()


class CampaignScheduleView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Send a campaign later", request=ScheduleSerializer)
    def post(self, request: Request, pk) -> Response:
        get_object_or_404(Campaign, pk=pk)
        body = ScheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            campaign = campaigns.schedule(
                pk, body.validated_data["send_at"], actor=request.user, request=request
            )
        except campaigns.CampaignError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(campaign_row(campaign))


class CampaignUnscheduleView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Cancel the scheduled send (back to a draft)", request=None)
    def post(self, request: Request, pk) -> Response:
        get_object_or_404(Campaign, pk=pk)
        try:
            campaign = campaigns.unschedule(pk, actor=request.user, request=request)
        except campaigns.CampaignError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(campaign_row(campaign))


class CampaignRunDueView(APIView):
    policy_action = "marketing.send"

    @extend_schema(summary="Send every scheduled campaign that is due now", request=None)
    def post(self, request: Request) -> Response:
        count = campaigns.run_due(actor=request.user, request=request)
        return Response({"sent": count})


# --------------------------------------------------------------------------- unsubscribe


class UnsubscribeView(APIView):
    """Public: the link in every campaign email. Needs only the signed token."""

    throttle_classes = PUBLIC_WRITE_THROTTLES
    policy_action = "public.unsubscribe"
    authentication_classes: list = []

    @extend_schema(summary="Stop marketing messages", request=None, responses={200: None})
    def post(self, request: Request) -> Response:
        # Mail apps send a one-click POST to the URL in the List-Unsubscribe header (RFC 8058):
        # the token is in the address and the body is a form, which is not read.
        one_click = "token" in request.query_params
        token = request.query_params.get("token") if one_click else request.data.get("token", "")
        user = read_token(str(token or ""))
        with transaction.atomic():
            profile = CustomerProfile.objects.select_for_update().filter(user=user).first()
            source = (
                ConsentRecord.Source.ONE_CLICK if one_click else ConsentRecord.Source.UNSUBSCRIBE
            )
            if profile is not None and consent.change(profile, False, source):
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


# --------------------------------------------------------------------------- click counter


def safe_path(value: str) -> str:
    """Only paths inside the app (never another site)."""
    if (
        not value.startswith("/")
        or value.startswith("//")
        or "\\" in value
        or ":" in value.split("?")[0]
    ):
        return "/"
    return value[:300]


class CampaignClickView(APIView):
    """Public: every link in a marketing email. Counts the click (no pixels), then opens the app.
    An unknown token still goes to the page, it is just not counted."""

    policy_action = "public.campaign_click"
    authentication_classes: list = []
    throttle_classes = PUBLIC_WRITE_THROTTLES

    @extend_schema(summary="Count an email click and open the app", responses={302: None})
    def get(self, request: Request, token) -> HttpResponseRedirect:
        path = safe_path(str(request.query_params.get("to", "/")))
        with transaction.atomic():
            row = CampaignRecipient.objects.select_for_update().filter(pk=token).first()
            if row is not None and row.status == CampaignRecipient.Status.SENT:
                row.clicks += 1
                if row.clicked_at is None:
                    row.clicked_at = timezone.now()
                row.save(update_fields=["clicks", "clicked_at"])
        from core.mail import frontend_link

        return HttpResponseRedirect(frontend_link(path))
