from django.contrib import admin

from scheduling.models import Service, ServiceAddon, ServiceCategory, ServiceVariant


class VariantInline(admin.TabularInline):
    model = ServiceVariant
    extra = 0


class AddonInline(admin.TabularInline):
    model = ServiceAddon
    extra = 0


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "audience", "price", "is_active")
    list_filter = ("category__division", "audience", "is_active")
    search_fields = ("name", "summary")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [VariantInline, AddonInline]


@admin.register(ServiceCategory)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "division", "sort_order", "is_active")
    prepopulated_fields = {"slug": ("name",)}
