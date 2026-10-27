from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.staff_views import AuditLogListView, PosSettingsView
from accounts.urls import auth_patterns, staff_patterns
from scheduling.urls import booking_patterns, desk_patterns, my_patterns

urlpatterns = [
    path("api/", include("core.urls")),
    path("api/auth/", include(auth_patterns)),
    path("api/staff/", include(staff_patterns)),
    path("api/audit/", AuditLogListView.as_view(), name="audit-list"),
    path("api/settings/pos/", PosSettingsView.as_view(), name="settings-pos"),
    path("api/public/", include("website.urls")),
    path("api/booking/", include(booking_patterns)),
    path("api/my/", include(my_patterns)),
    path("api/desk/", include(desk_patterns)),
]

if settings.SALON_API_DOCS:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
        path(
            "api/docs/",
            SpectacularSwaggerView.as_view(url_name="api-schema"),
            name="api-docs",
        ),
    ]

# Django's own admin is a developer tool only (the product has its own Admin role).
if settings.DEBUG:
    urlpatterns += [path("django-admin/", admin.site.urls)]
