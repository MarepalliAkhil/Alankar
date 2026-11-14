"""Customer and admin endpoints for personal recommendations."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from recommendations import build, engine
from recommendations.models import (
    CustomerPrefs,
    NotInterested,
    RecEvent,
    RecSettings,
    Snapshot,
)
from scheduling.models import Appointment, Service, ServiceCategory
from website.models import Offer

P = RecEvent.Placement


def service_row(info: engine.Info) -> dict:
    return {
        "id": str(info.id),
        "name": info.name,
        "slug": info.slug,
        "category": info.category,
        "division": info.division,
        "duration_minutes": info.duration,
        "from_price": info.price,
    }


def log(user, kind: str, placement: str, services=(), products=()) -> None:
    RecEvent.objects.bulk_create(
        [RecEvent(user=user, kind=kind, placement=placement, service_id=s) for s in services]
        + [RecEvent(user=user, kind=kind, placement=placement, product_id=p) for p in products]
    )


def offer_row(offer: Offer | None) -> dict | None:
    if offer is None or not offer.is_active:
        return None
    if offer.valid_until and offer.valid_until < timezone.localdate():
        return None
    return {"id": offer.pk, "title": offer.title, "description": offer.description}


def prefs_row(prefs: CustomerPrefs) -> dict:
    return {
        "enabled": prefs.enabled,
        "notice_seen": prefs.notice_seen_at is not None,
        "interests": [str(pk) for pk in prefs.interests.values_list("pk", flat=True)],
        "categories": [
            {"id": str(c.pk), "name": c.name, "division": c.division}
            for c in ServiceCategory.objects.filter(is_active=True)
        ],
        "not_interested": [
            {"id": str(n.service_id), "name": n.service.name}
            for n in NotInterested.objects.filter(user=prefs.user).select_related("service")
        ],
    }


class MyRecommendationsView(APIView):
    """The dashboard's "For you" block: rate-first, rebook, suggestions, aftercare, quiet times."""

    policy_action = "my.recommendations.read"

    @extend_schema(summary="My recommendations", responses={200: None})
    def get(self, request: Request) -> Response:
        user = request.user
        settings_ = RecSettings.load()
        prefs = engine.prefs_of(user)
        data = {
            "available": settings_.enabled,
            "enabled": prefs.enabled,
            "notice_seen": prefs.notice_seen_at is not None,
            "rate_first": engine.rate_first(user),
            "pinned_offer": offer_row(settings_.pinned_offer) if settings_.enabled else None,
            "for_you": [],
            "rebook": [],
            "aftercare": None,
            "quiet_times": engine.quiet_times() if settings_.enabled else [],
        }
        if not (settings_.enabled and prefs.enabled):
            return Response(data)
        model = engine.stored_model()
        catalogue = engine.bookable(settings_.excluded_services.values_list("pk", flat=True))
        rebook = engine.rebook(user, model=model, catalogue=catalogue)
        items = engine.for_you(user, model=model, catalogue=catalogue)
        after = engine.aftercare(user)
        data["rebook"] = [
            {
                "service": service_row(e["service"]),
                "reason": e["reason"],
                "last_visit": e["last_visit"],
                "slots": e["slots"],
                "stylist": e["stylist"],
            }
            for e in rebook
        ]
        data["for_you"] = [
            {"service": service_row(i.info), "reasons": i.reasons, "score": i.score} for i in items
        ]
        data["aftercare"] = after
        log(user, RecEvent.Kind.IMPRESSION, P.DASHBOARD, [i.info.id for i in items])
        log(user, RecEvent.Kind.IMPRESSION, P.REBOOK, [e["service"].id for e in rebook])
        if after:
            log(
                user,
                RecEvent.Kind.IMPRESSION,
                P.AFTERCARE,
                products=[p["id"] for p in after["products"]],
            )
        return Response(data)


class PrefsSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)
    notice_seen = serializers.BooleanField(required=False)
    interests = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=20)


class MyRecommendationPrefsView(APIView):
    policy_actions = {"GET": "my.recommendations.read", "PATCH": "my.recommendations.prefs"}

    @extend_schema(summary="My recommendation settings", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(prefs_row(engine.prefs_of(request.user)))

    @extend_schema(summary="Change my recommendation settings", request=PrefsSerializer)
    def patch(self, request: Request) -> Response:
        body = PrefsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with transaction.atomic():
            prefs = engine.prefs_of(request.user)
            prefs = CustomerPrefs.objects.select_for_update().get(pk=prefs.pk)
            if "enabled" in data and data["enabled"] != prefs.enabled:
                prefs.enabled = data["enabled"]
                audit(
                    AuditLog.Action.RECOMMENDATIONS_CONSENT,
                    request=request,
                    actor=request.user,
                    target=request.user,
                    enabled=prefs.enabled,
                )
            if data.get("notice_seen") and prefs.notice_seen_at is None:
                prefs.notice_seen_at = timezone.now()
            prefs.save()
            if "interests" in data:
                chosen = ServiceCategory.objects.filter(pk__in=data["interests"], is_active=True)
                prefs.interests.set(chosen)
        return Response(prefs_row(prefs))


class FeedbackSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["click", "not_interested", "undo"])
    placement = serializers.ChoiceField(choices=P.values, required=False, default=P.DASHBOARD)
    service = serializers.UUIDField(required=False)
    product = serializers.UUIDField(required=False)


class MyRecommendationFeedbackView(APIView):
    policy_action = "my.recommendations.feedback"

    @extend_schema(
        summary="Click or 'not interested' on a recommendation", request=FeedbackSerializer
    )
    def post(self, request: Request) -> Response:
        body = FeedbackSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        user = request.user
        service = None
        if data.get("service"):
            service = get_object_or_404(Service, pk=data["service"], is_active=True)
        action = data["action"]
        if action in ("not_interested", "undo") and service is None:
            raise ValidationError({"service": "Choose a service."})
        if action == "not_interested":
            try:
                with transaction.atomic():
                    NotInterested.objects.create(user=user, service=service)
            except IntegrityError:
                pass
            log(user, RecEvent.Kind.DISMISS, data["placement"], [service.pk])
        elif action == "undo":
            NotInterested.objects.filter(user=user, service=service).delete()
        else:
            if not engine.personal_on(user):
                return Response({"ok": True})
            products = [data["product"]] if data.get("product") else []
            if products:
                from inventory.models import Product

                get_object_or_404(Product, pk=products[0], is_active=True)
            log(
                user,
                RecEvent.Kind.CLICK,
                data["placement"],
                [service.pk] if service else [],
                products,
            )
        return Response({"ok": True})


class MyAddonView(APIView):
    """While booking: a service the same stylist can do right after (only when really free)."""

    policy_action = "my.recommendations.read"

    @extend_schema(summary="Suggested add-on for a booking", responses={200: None})
    def get(self, request: Request) -> Response:
        params = request.query_params
        service = get_object_or_404(Service, slug=params.get("service", ""), is_active=True)
        try:
            start = datetime.fromisoformat(params.get("start", ""))
        except ValueError as exc:
            raise ValidationError({"start": "Give the start time."}) from exc
        if timezone.is_naive(start):
            raise ValidationError({"start": "Give the start time with its time zone."})
        stylist = params.get("stylist", "")
        if not stylist or not engine.personal_on(request.user):
            return Response({"addon": None})
        try:
            found = engine.addon(request.user, service, stylist, start)
        except (ValueError, ValidationError):
            found = None
        if found is None:
            return Response({"addon": None})
        log(request.user, RecEvent.Kind.IMPRESSION, P.ADDON, [found["service"].id])
        return Response(
            {
                "addon": {
                    "service": service_row(found["service"]),
                    "start": found["start"],
                    "stylist": found["stylist"],
                    "reason": found["reason"],
                }
            }
        )


# --------------------------------------------------------------------------- admin

WINDOW_DAYS = 30
BOOKED_WITHIN_DAYS = 7


def metrics(now) -> list[dict]:
    """Per placement over the last 30 days: shown, clicked, booked within 7 days of a click."""
    since = now - timedelta(days=WINDOW_DAYS)
    counts = (
        RecEvent.objects.filter(created_at__gte=since)
        .values("placement", "kind")
        .annotate(n=Count("id"))
    )
    table = {p: {"impressions": 0, "clicks": 0, "dismissed": 0, "bookings": 0} for p in P.values}
    for row in counts:
        key = {"impression": "impressions", "click": "clicks", "dismiss": "dismissed"}[row["kind"]]
        table[row["placement"]][key] = row["n"]
    clicks = RecEvent.objects.filter(
        created_at__gte=since, kind=RecEvent.Kind.CLICK, service__isnull=False
    ).values_list("placement", "user_id", "service_id", "created_at")
    for placement, user_id, service_id, at in clicks:
        if Appointment.objects.filter(
            customer_id=user_id,
            service_id=service_id,
            created_at__gte=at,
            created_at__lte=at + timedelta(days=BOOKED_WITHIN_DAYS),
        ).exists():
            table[placement]["bookings"] += 1
    out = []
    for placement, label in P.choices:
        row = table[placement]
        row["placement"] = placement
        row["label"] = label
        row["click_rate"] = (
            round(row["clicks"] / row["impressions"], 3) if row["impressions"] else None
        )
        row["conversion"] = round(row["bookings"] / row["clicks"], 3) if row["clicks"] else None
        out.append(row)
    return out


def admin_payload() -> dict:
    settings_ = RecSettings.load()
    snap = Snapshot.load()
    now = timezone.now()
    return {
        "settings": {
            "enabled": settings_.enabled,
            "rebook_reminders": settings_.rebook_reminders,
            "excluded_services": [
                str(pk) for pk in settings_.excluded_services.values_list("pk", flat=True)
            ],
            "pinned_offer": settings_.pinned_offer_id,
        },
        "services": [
            {"id": str(s.pk), "name": s.name, "category": s.category.name}
            for s in Service.objects.filter(is_active=True).select_related("category")
        ],
        "offers": [{"id": o.pk, "title": o.title} for o in Offer.objects.filter(is_active=True)],
        "built_at": snap.built_at.isoformat() if snap.built_at else None,
        "visits_used": snap.visits_used,
        "pairs": snap.pairs,
        "quiet_times": snap.quiet_times,
        "evaluation": snap.evaluation,
        "window_days": WINDOW_DAYS,
        "booked_within_days": BOOKED_WITHIN_DAYS,
        "metrics": metrics(now),
        "customers_off": CustomerPrefs.objects.filter(enabled=False).count(),
    }


class AdminRecommendationsView(APIView):
    policy_action = "admin.recommendations.read"

    @extend_schema(summary="Recommendation results and settings", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response(admin_payload())


class AdminSettingsSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)
    rebook_reminders = serializers.BooleanField(required=False)
    excluded_services = serializers.ListField(
        child=serializers.UUIDField(), required=False, max_length=200
    )
    pinned_offer = serializers.IntegerField(required=False, allow_null=True)


class AdminRecommendationSettingsView(APIView):
    policy_action = "admin.recommendations.manage"

    @extend_schema(summary="Change recommendation settings", request=AdminSettingsSerializer)
    def patch(self, request: Request) -> Response:
        body = AdminSettingsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        with transaction.atomic():
            settings_ = RecSettings.load()
            settings_ = RecSettings.objects.select_for_update().get(pk=settings_.pk)
            for key in ("enabled", "rebook_reminders"):
                if key in data:
                    setattr(settings_, key, data[key])
            if "pinned_offer" in data:
                if data["pinned_offer"] is None:
                    settings_.pinned_offer = None
                else:
                    settings_.pinned_offer = get_object_or_404(
                        Offer, pk=data["pinned_offer"], is_active=True
                    )
            settings_.updated_by = request.user
            settings_.save()
            if "excluded_services" in data:
                settings_.excluded_services.set(
                    Service.objects.filter(pk__in=data["excluded_services"])
                )
            audit(
                AuditLog.Action.RECOMMENDATIONS_CHANGED,
                request=request,
                actor=request.user,
                changed=sorted(data.keys()),
            )
        return Response(admin_payload())


class AdminRecommendationRebuildView(APIView):
    policy_action = "admin.recommendations.manage"

    @extend_schema(summary="Rebuild the recommendation tables now", request=None)
    def post(self, request: Request) -> Response:
        build.build()
        audit(
            AuditLog.Action.RECOMMENDATIONS_CHANGED,
            request=request,
            actor=request.user,
            changed=["rebuilt"],
        )
        return Response(admin_payload())
