from django.urls import path

from accounts import security_views as sec
from accounts import twofactor_views as tf
from billing import admin_views as b
from billing import report_views as r
from inventory import admin_views as i
from inventory import purchase_views as po
from marketing import private_views as pc
from marketing import views as m
from people import admin_views as v
from people import pay_admin_views as pay
from people import privacy_views as pv
from people import rating_admin_views as ra
from scheduling import catalogue_admin as c
from wallet.urls import admin_wallet_patterns
from website import content_admin as ca
from website import settings_admin as w

admin_patterns = [
    path("ratings/", ra.RatingsOverviewView.as_view(), name="admin-ratings"),
    path(
        "ratings/stylists/<uuid:pk>/", ra.StylistRatingsView.as_view(), name="admin-stylist-ratings"
    ),
    path(
        "ratings/<uuid:pk>/moderate/", ra.ModerateRatingView.as_view(), name="admin-rating-moderate"
    ),
    path("pay/stylists/", pay.StylistPayListView.as_view(), name="admin-pay-stylists"),
    path("pay/stylists/<uuid:pk>/", pay.StylistPayDetailView.as_view(), name="admin-pay-stylist"),
    path("audit/export/", sec.AuditExportView.as_view(), name="admin-audit-export"),
    path("audit/", sec.AuditLogView.as_view(), name="admin-audit"),
    path("security/", sec.SecurityOverviewView.as_view(), name="admin-security"),
    path("security/two-factor/", tf.TwoFactorStatusView.as_view(), name="admin-two-factor"),
    path(
        "security/two-factor/setup/", tf.TwoFactorSetupView.as_view(), name="admin-two-factor-setup"
    ),
    path(
        "security/two-factor/confirm/",
        tf.TwoFactorConfirmView.as_view(),
        name="admin-two-factor-confirm",
    ),
    path(
        "security/two-factor/disable/",
        tf.TwoFactorDisableView.as_view(),
        name="admin-two-factor-disable",
    ),
    path(
        "security/two-factor/backup-codes/",
        tf.TwoFactorCodesView.as_view(),
        name="admin-two-factor-codes",
    ),
    path(
        "security/two-factor/<uuid:pk>/reset/",
        tf.TwoFactorResetView.as_view(),
        name="admin-two-factor-reset",
    ),
    path("security/unlock/", sec.UnlockView.as_view(), name="admin-security-unlock"),
    path("security/sessions/", sec.StaffSessionListView.as_view(), name="admin-sessions"),
    path(
        "security/sessions/<str:jti>/revoke/",
        sec.StaffSessionRevokeView.as_view(),
        name="admin-session-revoke",
    ),
    path("data-requests/", pv.AdminDataRequestListView.as_view(), name="admin-data-requests"),
    path(
        "data-requests/<uuid:pk>/decide/",
        pv.AdminDataRequestDecideView.as_view(),
        name="admin-data-request-decide",
    ),
    path("staff/<uuid:pk>/details/", v.StaffDetailsView.as_view(), name="admin-staff-details"),
    path(
        "staff/<uuid:pk>/link-profile/", v.StaffLinkProfileView.as_view(), name="admin-staff-link"
    ),
    path("days-off/", v.DayOffListView.as_view(), name="admin-days-off"),
    path("days-off/<uuid:pk>/decide/", v.DayOffDecideView.as_view(), name="admin-days-off-decide"),
    path("catalogue/options/", c.OptionsView.as_view(), name="admin-catalogue-options"),
    path("catalogue/categories/", c.CategoryListView.as_view(), name="admin-categories"),
    path("catalogue/categories/<uuid:pk>/", c.CategoryDetailView.as_view(), name="admin-category"),
    path("catalogue/rooms/", c.RoomListView.as_view(), name="admin-rooms"),
    path("catalogue/rooms/<uuid:pk>/", c.RoomDetailView.as_view(), name="admin-room"),
    path("catalogue/services/", c.ServiceListView.as_view(), name="admin-services"),
    path("catalogue/services/<uuid:pk>/", c.ServiceDetailView.as_view(), name="admin-service"),
    path("inventory/products/", i.ProductListView.as_view(), name="admin-products"),
    path("inventory/products/<uuid:pk>/", i.ProductDetailView.as_view(), name="admin-product"),
    path("inventory/products/<uuid:pk>/stock/", i.MoveStockView.as_view(), name="admin-stock"),
    path("inventory/ledger/", i.LedgerView.as_view(), name="admin-ledger"),
    path("inventory/suppliers/", i.SupplierListView.as_view(), name="admin-suppliers"),
    path("inventory/suppliers/<uuid:pk>/", i.SupplierDetailView.as_view(), name="admin-supplier"),
    path(
        "inventory/suppliers/<uuid:pk>/history/",
        po.SupplierHistoryView.as_view(),
        name="admin-supplier-history",
    ),
    path("inventory/purchase-orders/", po.OrderListView.as_view(), name="admin-pos"),
    path("inventory/purchase-orders/<uuid:pk>/", po.OrderDetailView.as_view(), name="admin-po"),
    path(
        "inventory/purchase-orders/<uuid:pk>/send/",
        po.OrderSendView.as_view(),
        name="admin-po-send",
    ),
    path(
        "inventory/purchase-orders/<uuid:pk>/receive/",
        po.OrderReceiveView.as_view(),
        name="admin-po-receive",
    ),
    path(
        "inventory/purchase-orders/<uuid:pk>/close/",
        po.OrderCloseView.as_view(),
        name="admin-po-close",
    ),
    path("cash-closes/", b.CashCloseListView.as_view(), name="admin-cash-closes"),
    path(
        "cash-closes/<uuid:pk>/review/", b.CashCloseReviewView.as_view(), name="admin-cash-review"
    ),
    path("settings/", w.SettingsView.as_view(), name="admin-settings"),
    path("content/", ca.ContentListView.as_view(), name="admin-content"),
    path("content/preview/", ca.ContentPreviewView.as_view(), name="admin-content-preview"),
    path("content/faqs/", ca.FaqListView.as_view(), name="admin-faqs"),
    path("content/faqs/<int:pk>/", ca.FaqDetailView.as_view(), name="admin-faq"),
    path("content/achievements/", ca.AchievementListView.as_view(), name="admin-achievements"),
    path(
        "content/achievements/<int:pk>/",
        ca.AchievementDetailView.as_view(),
        name="admin-achievement",
    ),
    path("content/<slug:key>/", ca.ContentDraftView.as_view(), name="admin-content-block"),
    path(
        "content/<slug:key>/unpublish/",
        ca.ContentUnpublishView.as_view(),
        name="admin-content-unpublish",
    ),
    path("marketing/offers/", m.OfferListView.as_view(), name="admin-offers"),
    path("marketing/offers/<int:pk>/", m.OfferDetailView.as_view(), name="admin-offer"),
    path("marketing/coupons/", m.CouponListView.as_view(), name="admin-coupons"),
    path("marketing/coupons/<uuid:pk>/", m.CouponDetailView.as_view(), name="admin-coupon"),
    path("marketing/loyalty/", m.LoyaltyView.as_view(), name="admin-loyalty"),
    path("marketing/campaigns/", m.CampaignListView.as_view(), name="admin-campaigns"),
    path("marketing/campaigns/<uuid:pk>/", m.CampaignDetailView.as_view(), name="admin-campaign"),
    path(
        "marketing/campaigns/<uuid:pk>/send/",
        m.CampaignSendView.as_view(),
        name="admin-campaign-send",
    ),
    path(
        "marketing/campaigns/<uuid:pk>/schedule/",
        m.CampaignScheduleView.as_view(),
        name="admin-campaign-schedule",
    ),
    path(
        "marketing/campaigns/<uuid:pk>/unschedule/",
        m.CampaignUnscheduleView.as_view(),
        name="admin-campaign-unschedule",
    ),
    path("marketing/campaigns/run-due/", m.CampaignRunDueView.as_view(), name="admin-campaign-run"),
    path("marketing/private-coupons/", pc.PrivateCouponListView.as_view(), name="admin-private"),
    path(
        "marketing/private-coupons/<uuid:pk>/withdraw/",
        pc.PrivateCouponWithdrawView.as_view(),
        name="admin-private-withdraw",
    ),
    path("reports/", r.ReportListView.as_view(), name="admin-reports"),
    path("reports/<slug:name>/", r.ReportView.as_view(), name="admin-report"),
] + admin_wallet_patterns
