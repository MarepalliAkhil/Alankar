from rest_framework import serializers

from people.models import StylistProfile
from scheduling.models import Service, ServiceAddon, ServiceCategory, ServiceVariant
from website.models import Achievement, KnowledgeEntry, Offer


class CategorySerializer(serializers.ModelSerializer):
    service_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ServiceCategory
        fields = ["id", "division", "name", "slug", "service_count"]


class VariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceVariant
        fields = ["id", "label", "price", "duration_minutes"]


class AddonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceAddon
        fields = ["id", "label", "price", "duration_minutes"]


class ServiceSerializer(serializers.ModelSerializer):
    """Public, customer-safe service card + detail (prices include GST)."""

    division = serializers.CharField(source="category.division")
    category = serializers.SerializerMethodField()
    from_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    min_duration = serializers.IntegerField(read_only=True)
    max_duration = serializers.IntegerField(read_only=True)
    variants = serializers.SerializerMethodField()
    addons = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "slug",
            "name",
            "summary",
            "description",
            "division",
            "category",
            "audience",
            "from_price",
            "min_duration",
            "max_duration",
            "image_url",
            "tags",
            "variants",
            "addons",
        ]

    def get_category(self, obj: Service) -> dict:
        return {"name": obj.category.name, "slug": obj.category.slug}

    def get_variants(self, obj: Service) -> list:
        return VariantSerializer(obj.active_variants(), many=True).data

    def get_addons(self, obj: Service) -> list:
        return AddonSerializer([a for a in obj.addons.all() if a.is_active], many=True).data


class TeamMemberSerializer(serializers.ModelSerializer):
    """Customer-safe: no phone, no pay, no schedule. Ratings arrive with Task 6."""

    rating = serializers.SerializerMethodField()

    class Meta:
        model = StylistProfile
        fields = [
            "id",
            "display_name",
            "title",
            "specialization",
            "bio",
            "photo_url",
            "divisions",
            "rating",
        ]

    def get_rating(self, obj: StylistProfile) -> None:
        return None  # no ratings yet; never shown as a made-up number


class AchievementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = ["id", "label", "value", "suffix"]


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = ["id", "title", "description", "badge", "valid_until"]


class FaqSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeEntry
        fields = ["id", "question", "answer"]
