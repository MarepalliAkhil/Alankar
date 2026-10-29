from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.staff_views import AuditLogListView, PosSettingsView
from accounts.urls import auth_patterns, staff_patterns
from marketing.private_views import MyCouponsView
from people.admin_urls import admin_patterns, payslip_patterns
from people.stylist_urls import stylist_patterns
from scheduling.urls import booking_patterns, desk_patterns, my_patterns
from shop.urls import my_order_patterns, my_shop_patterns, order_patterns
from wallet.urls import (
    desk_wallet_patterns,
    member_patterns,
    my_waitlist_patterns,
    my_wallet_patterns,
)

urlpatterns = [
    path("api/", include("core.urls")),
    path("api/auth/", include(auth_patterns)),
    path("api/staff/", include(staff_patterns)),
    path("api/audit/", AuditLogListView.as_view(), name="audit-list"),
    path("api/settings/pos/", PosSettingsView.as_view(), name="settings-pos"),
    path("api/public/", include("website.urls")),
    path("api/booking/", include(booking_patterns)),
    path("api/my/coupons/", MyCouponsView.as_view(), name="my-coupons"),
    path("api/my/wallet/", include(my_wallet_patterns)),
    path("api/my/waitlist/", include(my_waitlist_patterns)),
    path("api/my/shop/", include(my_shop_patterns)),
    path("api/my/orders/", include(my_order_patterns)),
    path("api/orders/", include(order_patterns)),
    path("api/memberships/", include(member_patterns)),
    path("api/my/", include(my_patterns)),
    path("api/desk/wallet/", include(desk_wallet_patterns)),
    path("api/desk/", include(desk_patterns)),
    path("api/payslips/", include(payslip_patterns)),
    path("api/stylist/", include(stylist_patterns)),
    path("api/chat/", include("chat.urls")),
    path("api/chatbot/", include("chatbot.urls")),
    path("api/admin/chatbot/", include("chatbot.admin_urls")),
    path("api/admin/", include(admin_patterns)),
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
