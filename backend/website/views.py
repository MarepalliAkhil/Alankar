"""Public, read-only website API. Every endpoint is a public action in shared/policy.json."""

from django.db.models import Count, Prefetch, Q
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from people.models import StylistProfile
from scheduling.models import (
    Audience,
    Division,
    Service,
    ServiceAddon,
    ServiceCategory,
    ServiceVariant,
)
from website.content import POLICY_PAGES, PUBLIC_KEYS, content
from website.models import Achievement, KnowledgeEntry, Offer
from website.serializers import (
    AchievementSerializer,
    CategorySerializer,
    FaqSerializer,
    OfferSerializer,
    ServiceSerializer,
    TeamMemberSerializer,
)


def active_services():
    return (
        Service.objects.filter(is_active=True, category__is_active=True)
        .select_related("category")
        .prefetch_related(
            Prefetch("variants", queryset=ServiceVariant.objects.order_by("sort_order", "price")),
            Prefetch("addons", queryset=ServiceAddon.objects.order_by("sort_order", "label")),
        )
    )


def live_announcements(block, today) -> list[dict]:
    """Published announcements whose start/end dates include today."""
    items = (block or {}).get("items") or []
    out = []
    for item in items:
        if item.get("starts") and item["starts"] > today.isoformat():
            continue
        if item.get("ends") and item["ends"] < today.isoformat():
            continue
        out.append({"text": item["text"], "link": item.get("link", "")})
    return out


class PublicView(APIView):
    authentication_classes: list = []


class SiteView(PublicView):
    policy_action = "public.site"

    @extend_schema(summary="Website content for the home page and footer", responses={200: None})
    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        offers = Offer.objects.filter(is_active=True).filter(
            Q(valid_until__isnull=True) | Q(valid_until__gte=today)
        )
        services = active_services()
        division_counts = {d.value: 0 for d in Division}
        for row in services.values("category__division").annotate(n=Count("id")):
            division_counts[row["category__division"]] = row["n"]
        body = {key: content(key) for key in PUBLIC_KEYS}
        body["announcements"] = live_announcements(body.get("announcements"), today)
        body.update(
            {
                "achievements": AchievementSerializer(
                    Achievement.objects.filter(is_active=True), many=True
                ).data,
                "offers": OfferSerializer(offers, many=True).data,
                "faqs": FaqSerializer(
                    KnowledgeEntry.objects.filter(is_active=True, show_in_faq=True), many=True
                ).data,
                "stats": {
                    "services": services.count(),
                    "team": StylistProfile.objects.filter(is_public=True).count(),
                    "divisions": division_counts,
                },
                "policies": [{"key": k, "title": v} for k, v in POLICY_PAGES.items()],
            }
        )
        return Response(body)


class CategoryListView(PublicView):
    policy_action = "public.categories"

    @extend_schema(
        summary="Service categories with active service counts",
        parameters=[OpenApiParameter("division", str)],
        responses=CategorySerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        categories = ServiceCategory.objects.filter(is_active=True).annotate(
            service_count=Count("services", filter=Q(services__is_active=True))
        )
        division = request.query_params.get("division")
        if division:
            categories = categories.filter(division=division)
        categories = [c for c in categories if c.service_count > 0]
        return Response(CategorySerializer(categories, many=True).data)


class ServiceListView(PublicView):
    policy_action = "public.services"

    @extend_schema(
        summary="Active services (filter by division, audience, category, search)",
        parameters=[
            OpenApiParameter("division", str),
            OpenApiParameter("audience", str, description="men | women | kids | unisex"),
            OpenApiParameter("category", str, description="category slug"),
            OpenApiParameter("q", str, description="search text"),
        ],
        responses=ServiceSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        services = active_services()
        params = request.query_params
        if params.get("division"):
            services = services.filter(category__division=params["division"])
        audience = params.get("audience")
        if audience in {Audience.MEN, Audience.WOMEN, Audience.KIDS}:
            services = services.filter(audience__in=[audience, Audience.UNISEX])
        elif audience == Audience.UNISEX:
            services = services.filter(audience=Audience.UNISEX)
        if params.get("category"):
            services = services.filter(category__slug=params["category"])
        query = (params.get("q") or "").strip()
        if query:
            services = services.filter(
                Q(name__icontains=query)
                | Q(summary__icontains=query)
                | Q(category__name__icontains=query)
                | Q(tags__icontains=query)
            )
        return Response(ServiceSerializer(services[:200], many=True).data)


class ServiceDetailView(PublicView):
    policy_action = "public.service"

    @extend_schema(summary="One active service", responses=ServiceSerializer)
    def get(self, request: Request, slug: str) -> Response:
        service = active_services().filter(slug=slug).first()
        if service is None:
            raise Http404
        return Response(ServiceSerializer(service).data)


class TeamView(PublicView):
    policy_action = "public.team"

    @extend_schema(
        summary="Public team profiles",
        parameters=[OpenApiParameter("division", str)],
        responses=TeamMemberSerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        team = StylistProfile.objects.filter(is_public=True).filter(
            Q(user__isnull=True) | Q(user__is_active=True)
        )
        division = request.query_params.get("division")
        if division:
            team = [member for member in team if division in (member.divisions or [])]
        return Response(TeamMemberSerializer(team, many=True).data)


class PolicyPageView(PublicView):
    policy_action = "public.page"

    @extend_schema(summary="Privacy, terms or cancellation policy", responses={200: None})
    def get(self, request: Request, key: str) -> Response:
        if key not in POLICY_PAGES:
            raise Http404
        policies = content("policies", {}) or {}
        body = policies.get(key) or ""
        return Response({"key": key, "title": POLICY_PAGES[key], "body": body})
