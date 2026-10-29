"""Admin-only public content editor: hero, about, announcements and the Zenotians page sections
are saved as a DRAFT, previewed, then published (or discarded). Announcements and the Zenotians
page can also be unpublished. FAQs (the chatbot's knowledge source) and achievements are edited
row by row: an inactive row is a draft and is hidden from the public site."""

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
from accounts.models import AuditLog
from website.models import Achievement, KnowledgeEntry, SiteContent

IMAGE = {"allow_blank": True, "required": False}


class ImageUrl(serializers.CharField):
    """An http(s) link or a site path such as /media/hero.jpg (nothing else)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 300)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        text = super().to_internal_value(data).strip()
        if not text:
            return ""
        if text.startswith("/") and not text.startswith("//"):
            return text
        if text.startswith(("https://", "http://")):
            serializers.URLField().run_validation(text)
            return text
        raise ValidationError("Use a full https:// link or a path that starts with /.")


class SafeLink(ImageUrl):
    """A link for a banner or button: a site path or http(s) address, never javascript: or data:."""


class HeroSerializer(serializers.Serializer):
    headline = serializers.CharField(max_length=120)
    subtitle = serializers.CharField(max_length=300, allow_blank=True)
    image_url = ImageUrl(**IMAGE)
    cta_label = serializers.CharField(max_length=40, allow_blank=True, required=False)


class AboutSerializer(serializers.Serializer):
    heading = serializers.CharField(max_length=120)
    body = serializers.CharField(max_length=3000)
    image_url = ImageUrl(**IMAGE)


class AnnouncementItem(serializers.Serializer):
    text = serializers.CharField(max_length=200)
    link = SafeLink(max_length=200, allow_blank=True, required=False)
    starts = serializers.DateField(required=False, allow_null=True)
    ends = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("starts") and attrs.get("ends") and attrs["ends"] < attrs["starts"]:
            raise ValidationError({"ends": "The end date is before the start date."})
        return attrs


class AnnouncementsSerializer(serializers.Serializer):
    items = AnnouncementItem(many=True, max_length=5)


class ZenotianSection(serializers.Serializer):
    key = serializers.SlugField(max_length=40)
    title = serializers.CharField(max_length=120)
    body = serializers.CharField(max_length=6000, allow_blank=True)
    image_url = ImageUrl(**IMAGE)


class ZenotiansSerializer(serializers.Serializer):
    sections = ZenotianSection(many=True, max_length=12)


# key -> (serializer, label, can be unpublished, how it looks before anything is written)
BLOCKS = {
    "hero": (HeroSerializer, "Home page banner", False, {}),
    "about": (AboutSerializer, "About us", False, {}),
    "announcements": (AnnouncementsSerializer, "Announcement banner", True, {"items": []}),
    "zenotians": (ZenotiansSerializer, "For Zenotians page", True, {"sections": []}),
}


def jsonable(data):
    """Validated data (dates, ordered dicts) as plain JSON."""
    import json

    from rest_framework.utils.encoders import JSONEncoder

    return json.loads(json.dumps(data, cls=JSONEncoder))


def block_row(key: str, row: SiteContent | None) -> dict:
    _, label, can_unpublish, empty = BLOCKS[key]
    return {
        "key": key,
        "label": label,
        "can_unpublish": can_unpublish,
        "published": row.value if row else empty,
        "draft": row.draft if row else None,
        "has_draft": bool(row and row.draft is not None),
        "is_published": bool(row and row.is_published and row.value),
        "published_at": row.published_at.isoformat() if row and row.published_at else None,
    }


def block_or_404(key: str) -> str:
    if key not in BLOCKS:
        raise ValidationError({"key": "Unknown content block."})
    return key


class ContentListView(APIView):
    policy_action = "content.read"

    @extend_schema(summary="Editable public content blocks", responses={200: None})
    def get(self, request: Request) -> Response:
        rows = {r.key: r for r in SiteContent.objects.filter(key__in=BLOCKS)}
        return Response({"blocks": [block_row(k, rows.get(k)) for k in BLOCKS]})


class ContentPreviewView(APIView):
    policy_action = "content.read"

    @extend_schema(summary="The public site as it would look with all drafts published")
    def get(self, request: Request) -> Response:
        rows = {r.key: r for r in SiteContent.objects.filter(key__in=BLOCKS)}
        out = {}
        for key, (_, _, _, empty) in BLOCKS.items():
            row = rows.get(key)
            out[key] = row.draft if row and row.draft is not None else (row.value if row else empty)
        out["faqs"] = [faq_row(f) for f in KnowledgeEntry.objects.all() if f.show_in_faq]
        out["achievements"] = [ach_row(a) for a in Achievement.objects.all()]
        return Response(out)


class ContentDraftView(APIView):
    policy_actions = {
        "PUT": "content.edit",
        "DELETE": "content.edit",
        "POST": "content.publish",
    }

    @extend_schema(summary="Save a draft (nothing changes on the public site)")
    def put(self, request: Request, key: str) -> Response:
        serializer_class = BLOCKS[block_or_404(key)][0]
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            row, _ = SiteContent.objects.select_for_update().get_or_create(key=key)
            row.draft = jsonable(serializer.validated_data)
            row.save(update_fields=["draft", "updated_at"])
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block=key,
                step="draft saved",
            )
        return Response(block_row(key, row))

    @extend_schema(summary="Throw the draft away")
    def delete(self, request: Request, key: str) -> Response:
        block_or_404(key)
        with transaction.atomic():
            row = SiteContent.objects.select_for_update().filter(key=key).first()
            if row is None or row.draft is None:
                raise ValidationError({"detail": "There is no draft to discard."})
            row.draft = None
            row.save(update_fields=["draft", "updated_at"])
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block=key,
                step="draft discarded",
            )
        return Response(block_row(key, row))

    @extend_schema(summary="Publish the draft (or re-publish an unpublished block)")
    def post(self, request: Request, key: str) -> Response:
        block_or_404(key)
        with transaction.atomic():
            row, _ = SiteContent.objects.select_for_update().get_or_create(key=key)
            if row.draft is None and row.is_published and row.value:
                raise ValidationError({"detail": "There is nothing new to publish."})
            if row.draft is not None:
                row.value = row.draft
                row.draft = None
            row.is_published = True
            row.published_at = timezone.now()
            row.save()
            audit(
                AuditLog.Action.CONTENT_PUBLISHED,
                request=request,
                actor=request.user,
                block=key,
                published=True,
            )
        return Response(block_row(key, row))


class ContentUnpublishView(APIView):
    policy_action = "content.publish"

    @extend_schema(summary="Hide an announcement banner or the Zenotians page")
    def post(self, request: Request, key: str) -> Response:
        block_or_404(key)
        if not BLOCKS[key][2]:
            raise ValidationError({"detail": "This block must always be visible."})
        with transaction.atomic():
            row = SiteContent.objects.select_for_update().filter(key=key).first()
            if row is None or not row.is_published:
                raise ValidationError({"detail": "It is not published."})
            row.is_published = False
            row.save(update_fields=["is_published", "updated_at"])
            audit(
                AuditLog.Action.CONTENT_PUBLISHED,
                request=request,
                actor=request.user,
                block=key,
                published=False,
            )
        return Response(block_row(key, row))


# --------------------------------------------------------------------------- FAQs


class FaqSerializer(serializers.ModelSerializer):
    tags = serializers.ListField(
        child=serializers.CharField(max_length=30), required=False, max_length=10
    )

    class Meta:
        model = KnowledgeEntry
        fields = ["question", "answer", "tags", "show_in_faq", "is_active", "sort_order"]


def faq_row(faq: KnowledgeEntry) -> dict:
    return {
        "id": faq.pk,
        "question": faq.question,
        "answer": faq.answer,
        "tags": faq.tags,
        "show_in_faq": faq.show_in_faq,
        "published": faq.is_active,
        "is_active": faq.is_active,
        "sort_order": faq.sort_order,
    }


class FaqListView(APIView):
    policy_actions = {"GET": "content.read", "POST": "content.edit"}

    @extend_schema(summary="All FAQ entries, drafts included", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response([faq_row(f) for f in KnowledgeEntry.objects.all()])

    @extend_schema(summary="Add an FAQ entry", request=FaqSerializer)
    def post(self, request: Request) -> Response:
        serializer = FaqSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            faq = serializer.save()
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block="faq",
                step="added",
                faq=faq.question[:80],
                published=faq.is_active,
            )
        return Response(faq_row(faq), status=status.HTTP_201_CREATED)


class FaqDetailView(APIView):
    policy_actions = {"PATCH": "content.edit", "DELETE": "content.edit"}

    @extend_schema(summary="Edit, publish or unpublish an FAQ entry", request=FaqSerializer)
    def patch(self, request: Request, pk: int) -> Response:
        faq = get_object_or_404(KnowledgeEntry, pk=pk)
        before = faq_row(faq)
        serializer = FaqSerializer(faq, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            faq = serializer.save()
            after = faq_row(faq)
            diff = {
                k: [before[k], after[k]]
                for k in ("question", "answer", "tags", "show_in_faq", "is_active", "sort_order")
                if before[k] != after[k]
            }
            if diff:
                published = before["is_active"] != after["is_active"]
                audit(
                    AuditLog.Action.CONTENT_PUBLISHED
                    if published
                    else AuditLog.Action.CONTENT_CHANGED,
                    request=request,
                    actor=request.user,
                    block="faq",
                    faq=faq.question[:80],
                    changes=diff,
                )
        return Response(faq_row(faq))

    @extend_schema(summary="Delete an FAQ entry")
    def delete(self, request: Request, pk: int) -> Response:
        faq = get_object_or_404(KnowledgeEntry, pk=pk)
        with transaction.atomic():
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block="faq",
                step="deleted",
                faq=faq.question[:80],
            )
            faq.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- achievements


class AchievementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = ["label", "value", "suffix", "sort_order", "is_active"]


def ach_row(a: Achievement) -> dict:
    return {
        "id": a.pk,
        "label": a.label,
        "value": a.value,
        "suffix": a.suffix,
        "sort_order": a.sort_order,
        "is_active": a.is_active,
    }


class AchievementListView(APIView):
    policy_actions = {"GET": "content.read", "POST": "content.edit"}

    @extend_schema(summary="Achievements shown on the home page", responses={200: None})
    def get(self, request: Request) -> Response:
        return Response([ach_row(a) for a in Achievement.objects.all()])

    @extend_schema(summary="Add an achievement", request=AchievementSerializer)
    def post(self, request: Request) -> Response:
        serializer = AchievementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = serializer.save()
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block="achievement",
                step="added",
                label=item.label,
            )
        return Response(ach_row(item), status=status.HTTP_201_CREATED)


class AchievementDetailView(APIView):
    policy_actions = {"PATCH": "content.edit", "DELETE": "content.edit"}

    @extend_schema(summary="Edit an achievement", request=AchievementSerializer)
    def patch(self, request: Request, pk: int) -> Response:
        item = get_object_or_404(Achievement, pk=pk)
        before = ach_row(item)
        serializer = AchievementSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = serializer.save()
            after = ach_row(item)
            diff = {k: [before[k], after[k]] for k in after if before[k] != after[k]}
            if diff:
                audit(
                    AuditLog.Action.CONTENT_CHANGED,
                    request=request,
                    actor=request.user,
                    block="achievement",
                    label=item.label,
                    changes=diff,
                )
        return Response(ach_row(item))

    @extend_schema(summary="Delete an achievement")
    def delete(self, request: Request, pk: int) -> Response:
        item = get_object_or_404(Achievement, pk=pk)
        with transaction.atomic():
            audit(
                AuditLog.Action.CONTENT_CHANGED,
                request=request,
                actor=request.user,
                block="achievement",
                step="deleted",
                label=item.label,
            )
            item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
