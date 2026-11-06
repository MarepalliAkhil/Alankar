"""Admin-only catalogue management: categories, services (with options and add-ons) and rooms.

The public site reads the same tables, so a change shows there at once. Nothing is deleted when
visits refer to it: those can only be hidden (is_active = false). Every change is audited."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, ProtectedError
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import audit
from accounts.models import AuditLog
from inventory.models import Product
from scheduling.models import (
    Audience,
    Division,
    Room,
    Service,
    ServiceAddon,
    ServiceCategory,
    ServiceVariant,
)

POLICY = {
    "GET": "catalogue.read",
    "POST": "catalogue.write",
    "PATCH": "catalogue.write",
    "DELETE": "catalogue.write",
}
MONEY = {
    "max_digits": 10,
    "decimal_places": 2,
    "min_value": Decimal("0"),
    "max_value": Decimal("1000000"),
}


def unique_slug(model, base: str, exclude_pk=None) -> str:
    root = slugify(base)[:80] or "item"
    slug, n = root, 2
    while model.objects.filter(slug=slug).exclude(pk=exclude_pk).exists():
        slug = f"{root}-{n}"
        n += 1
    return slug


def log_change(request, entity: str, action: str, name: str, changes: dict | None = None):
    audit(
        AuditLog.Action.CATALOGUE_CHANGED,
        request=request,
        actor=request.user,
        entity=entity,
        change=action,
        name=name,
        changes=changes or {},
    )


def diff(instance, data: dict, fields) -> dict:
    """Applies `data` to the instance and returns {field: [old, new]} for what really changed."""
    changes = {}
    for field in fields:
        if field in data:
            old, new = getattr(instance, field), data[field]
            if old != new:
                changes[field] = [str(old), str(new)]
                setattr(instance, field, new)
    return changes


# --------------------------------------------------------------------------- categories


class CategorySerializer(serializers.ModelSerializer):
    service_count = serializers.IntegerField(read_only=True)
    # Task 8.5 part 4: products offered in the booking sheet for this category's services.
    recommended_products = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Product.objects.filter(is_active=True)
    )

    class Meta:
        model = ServiceCategory
        fields = [
            "id",
            "division",
            "name",
            "slug",
            "sort_order",
            "is_active",
            "service_count",
            "recommended_products",
        ]
        read_only_fields = ["id", "slug", "service_count"]
        extra_kwargs = {"name": {"max_length": 80}}


class CategoryListView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="All service categories (also hidden ones)")
    def get(self, request: Request) -> Response:
        rows = ServiceCategory.objects.annotate(service_count=Count("services")).prefetch_related(
            "recommended_products"
        )
        return Response(CategorySerializer(rows, many=True).data)

    @extend_schema(summary="Add a category", request=CategorySerializer)
    def post(self, request: Request) -> Response:
        body = CategorySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        recommended = data.pop("recommended_products", [])
        slug = unique_slug(ServiceCategory, f"{data['division']}-{data['name']}")
        row = ServiceCategory.objects.create(slug=slug, **data)
        row.recommended_products.set(recommended)
        log_change(request, "category", "created", row.name, {"division": row.division})
        row.service_count = 0
        return Response(CategorySerializer(row).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="Edit a category", request=CategorySerializer)
    def patch(self, request: Request, pk) -> Response:
        row = get_object_or_404(ServiceCategory, pk=pk)
        body = CategorySerializer(row, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        changes = diff(row, body.validated_data, ("division", "name", "sort_order", "is_active"))
        if "recommended_products" in body.validated_data:
            before = sorted(p.name for p in row.recommended_products.all())
            row.recommended_products.set(body.validated_data["recommended_products"])
            after = sorted(p.name for p in row.recommended_products.all())
            if before != after:
                changes["recommended_products"] = [", ".join(before), ", ".join(after)]
        if changes:
            row.save()
            log_change(request, "category", "updated", row.name, changes)
        row.service_count = row.services.count()
        return Response(CategorySerializer(row).data)

    @extend_schema(summary="Delete an empty category", request=None)
    def delete(self, request: Request, pk) -> Response:
        row = get_object_or_404(ServiceCategory, pk=pk)
        if row.services.exists():
            return Response(
                {"detail": "This category still has services. Move them, or hide the category."},
                status=status.HTTP_409_CONFLICT,
            )
        name = row.name
        row.delete()
        log_change(request, "category", "deleted", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- rooms


class RoomAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "division", "is_active", "sort_order"]
        read_only_fields = ["id"]
        extra_kwargs = {"name": {"max_length": 60}}

    def validate_name(self, value):
        qs = Room.objects.filter(name__iexact=value.strip())
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A room with this name already exists.")
        return value.strip()


class RoomListView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="All rooms (also inactive ones)")
    def get(self, request: Request) -> Response:
        return Response(RoomAdminSerializer(Room.objects.all(), many=True).data)

    @extend_schema(summary="Add a room", request=RoomAdminSerializer)
    def post(self, request: Request) -> Response:
        body = RoomAdminSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        row = Room.objects.create(**body.validated_data)
        log_change(request, "room", "created", row.name, {"division": row.division})
        return Response(RoomAdminSerializer(row).data, status=status.HTTP_201_CREATED)


class RoomDetailView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="Edit a room", request=RoomAdminSerializer)
    def patch(self, request: Request, pk) -> Response:
        row = get_object_or_404(Room, pk=pk)
        body = RoomAdminSerializer(row, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        changes = diff(row, body.validated_data, ("name", "division", "is_active", "sort_order"))
        if changes:
            row.save()
            log_change(request, "room", "updated", row.name, changes)
        return Response(RoomAdminSerializer(row).data)

    @extend_schema(summary="Delete a room that was never used", request=None)
    def delete(self, request: Request, pk) -> Response:
        row = get_object_or_404(Room, pk=pk)
        name = row.name
        try:
            row.delete()
        except ProtectedError:
            return Response(
                {"detail": "Visits used this room. Mark it inactive instead of deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        log_change(request, "room", "deleted", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- services


class OptionSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    label = serializers.CharField(max_length=80)
    price = serializers.DecimalField(**MONEY)
    duration_minutes = serializers.IntegerField(min_value=0, max_value=600)
    sort_order = serializers.IntegerField(min_value=0, max_value=1000, required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)


class ServiceAdminSerializer(serializers.Serializer):
    category = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    summary = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    audience = serializers.ChoiceField(choices=Audience.choices, required=False)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=600)
    price = serializers.DecimalField(**MONEY)
    gst_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("40"),
        allow_null=True,
        required=False,
    )
    task_payout = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("100000"),
        allow_null=True,
        required=False,
    )
    image_url = serializers.URLField(required=False, allow_blank=True, max_length=200)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=30), required=False, max_length=12
    )
    is_active = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=1000, required=False)
    variants = OptionSerializer(many=True, required=False)
    addons = OptionSerializer(many=True, required=False)

    def validate_category(self, value):
        category = ServiceCategory.objects.filter(pk=value).first()
        if category is None:
            raise serializers.ValidationError("That category does not exist.")
        return category


def option_data(row) -> dict:
    return {
        "id": str(row.id),
        "label": row.label,
        "price": str(row.price),
        "duration_minutes": row.duration_minutes,
        "sort_order": row.sort_order,
        "is_active": row.is_active,
    }


def service_data(service: Service) -> dict:
    return {
        "id": str(service.id),
        "category": str(service.category_id),
        "category_name": service.category.name,
        "division": service.category.division,
        "name": service.name,
        "slug": service.slug,
        "summary": service.summary,
        "description": service.description,
        "audience": service.audience,
        "duration_minutes": service.duration_minutes,
        "price": str(service.price),
        "gst_percent": None if service.gst_percent is None else str(service.gst_percent),
        "task_payout": None if service.task_payout is None else str(service.task_payout),
        "image_url": service.image_url,
        "tags": service.tags,
        "is_active": service.is_active,
        "sort_order": service.sort_order,
        "variants": [option_data(v) for v in service.variants.all()],
        "addons": [option_data(a) for a in service.addons.all()],
        "visits": service.appointments.count(),
    }


def sync_options(service: Service, rows: list[dict], model, relation: str) -> dict:
    """Replaces the options with `rows`: rows with an id update, others are added, missing go."""
    existing = {str(o.id): o for o in getattr(service, relation).all()}
    keep, changes = set(), {}
    for order, row in enumerate(rows):
        fields = {
            "label": row["label"],
            "price": row["price"],
            "duration_minutes": row["duration_minutes"],
            "sort_order": row.get("sort_order", order),
            "is_active": row.get("is_active", True),
        }
        rid = str(row["id"]) if row.get("id") else None
        if rid and rid in existing:
            obj = existing[rid]
            delta = diff(obj, fields, fields.keys())
            if delta:
                obj.save()
                changes[f"{relation}:{obj.label}"] = delta
            keep.add(rid)
        else:
            obj = model.objects.create(service=service, **fields)
            changes[f"{relation}:{obj.label}"] = "added"
            keep.add(str(obj.id))
    for rid, obj in existing.items():
        if rid not in keep:
            changes[f"{relation}:{obj.label}"] = "removed"
            obj.delete()
    return changes


def services_queryset():
    return Service.objects.select_related("category").prefetch_related("variants", "addons")


class ServiceListView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="All services (also hidden ones) with options and add-ons")
    def get(self, request: Request) -> Response:
        return Response([service_data(s) for s in services_queryset()])

    @extend_schema(summary="Add a service", request=ServiceAdminSerializer)
    def post(self, request: Request) -> Response:
        body = ServiceAdminSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        variants, addons = data.pop("variants", []), data.pop("addons", [])
        with transaction.atomic():
            service = Service.objects.create(slug=unique_slug(Service, data["name"]), **data)
            sync_options(service, variants, ServiceVariant, "variants")
            sync_options(service, addons, ServiceAddon, "addons")
        log_change(
            request,
            "service",
            "created",
            service.name,
            {"price": str(service.price), "category": service.category.name},
        )
        return Response(service_data(services_queryset().get(pk=service.pk)), status=201)


class ServiceDetailView(APIView):
    policy_actions = POLICY

    @extend_schema(summary="Read one service for editing")
    def get(self, request: Request, pk) -> Response:
        return Response(service_data(get_object_or_404(services_queryset(), pk=pk)))

    @extend_schema(summary="Edit a service", request=ServiceAdminSerializer)
    def patch(self, request: Request, pk) -> Response:
        service = get_object_or_404(services_queryset(), pk=pk)
        body = ServiceAdminSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        variants, addons = data.pop("variants", None), data.pop("addons", None)
        with transaction.atomic():
            changes = diff(
                service,
                data,
                (
                    "category",
                    "name",
                    "summary",
                    "description",
                    "audience",
                    "duration_minutes",
                    "price",
                    "gst_percent",
                    "task_payout",
                    "image_url",
                    "tags",
                    "is_active",
                    "sort_order",
                ),
            )
            if variants is not None:
                changes.update(sync_options(service, variants, ServiceVariant, "variants"))
            if addons is not None:
                changes.update(sync_options(service, addons, ServiceAddon, "addons"))
            if changes:
                service.save()
        if changes:
            log_change(request, "service", "updated", service.name, changes)
        return Response(service_data(services_queryset().get(pk=service.pk)))

    @extend_schema(summary="Delete a service that has no visits", request=None)
    def delete(self, request: Request, pk) -> Response:
        service = get_object_or_404(Service, pk=pk)
        name = service.name
        try:
            service.delete()
        except ProtectedError:
            return Response(
                {"detail": "Visits used this service. Hide it instead of deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        log_change(request, "service", "deleted", name)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OptionsView(APIView):
    """Fixed lists for the forms (divisions and audiences)."""

    policy_actions = {"GET": "catalogue.read"}

    @extend_schema(summary="Divisions and audiences for the catalogue forms")
    def get(self, request: Request) -> Response:
        return Response(
            {
                "divisions": [{"value": v, "label": label} for v, label in Division.choices],
                "audiences": [{"value": v, "label": label} for v, label in Audience.choices],
            }
        )
