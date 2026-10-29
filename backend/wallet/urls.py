from django.urls import path

from wallet import admin_views as a
from wallet import views as v

# /api/my/wallet/ and /api/my/waitlist/
my_wallet_patterns = [
    path("", v.MyWalletView.as_view(), name="my-wallet"),
    path("packages/<uuid:pk>/buy/", v.MyBuyPackageView.as_view(), name="my-package-buy"),
    path("memberships/join/", v.MyJoinMembershipView.as_view(), name="my-membership-join"),
    path("memberships/renew/", v.MyRenewMembershipView.as_view(), name="my-membership-renew"),
    path("memberships/cancel/", v.MyCancelMembershipView.as_view(), name="my-membership-cancel"),
    path("gift-cards/buy/", v.MyBuyGiftCardView.as_view(), name="my-giftcard-buy"),
    path("gift-cards/check/", v.MyCheckGiftCardView.as_view(), name="my-giftcard-check"),
    path(
        "gift-cards/<uuid:pk>/reveal/", v.MyGiftCardRevealView.as_view(), name="my-giftcard-reveal"
    ),
    path("packages/", v.MyPackagesView.as_view(), name="my-packages"),
    path(
        "packages/<uuid:pk>/reveal/", v.MyPackageRevealCodeView.as_view(), name="my-package-reveal"
    ),
    path(
        "packages/<uuid:pk>/cancel-estimate/",
        v.MyPackageCancelEstimateView.as_view(),
        name="my-package-cancel-estimate",
    ),
    path(
        "packages/<uuid:pk>/cancel-request/",
        v.MyPackageCancelRequestView.as_view(),
        name="my-package-cancel-request",
    ),
]
my_waitlist_patterns = [
    path("", v.MyWaitlistView.as_view(), name="my-waitlist"),
    path("<uuid:pk>/cancel/", v.MyWaitlistCancelView.as_view(), name="my-waitlist-cancel"),
    path("offers/<uuid:pk>/accept/", v.MyWaitlistAcceptView.as_view(), name="my-offer-accept"),
    path("offers/<uuid:pk>/decline/", v.MyWaitlistDeclineView.as_view(), name="my-offer-decline"),
]

# /api/desk/wallet/
desk_wallet_patterns = [
    path("catalogue/", v.DeskCatalogueView.as_view(), name="desk-wallet-catalogue"),
    path("customers/<uuid:pk>/", v.DeskCustomerWalletView.as_view(), name="desk-wallet-customer"),
    path("sell/", v.DeskSellView.as_view(), name="desk-wallet-sell"),
    path("gift-cards/check/", v.DeskCheckGiftCardView.as_view(), name="desk-giftcard-check"),
]

# /api/admin/
admin_wallet_patterns = [
    path("packages/", a.AdminPackageListView.as_view(), name="admin-packages"),
    path("packages/purchases/", a.AdminPurchaseListView.as_view(), name="admin-package-purchases"),
    path(
        "packages/purchases/<uuid:pk>/refund/",
        a.AdminPackageRefundView.as_view(),
        name="admin-package-refund",
    ),
    path(
        "packages/uses/<uuid:pk>/restore/",
        a.AdminRestorePackageUseView.as_view(),
        name="admin-package-restore",
    ),
    path("packages/<uuid:pk>/", a.AdminPackageDetailView.as_view(), name="admin-package"),
    path("membership-plans/", a.AdminPlanListView.as_view(), name="admin-plans"),
    path("membership-plans/<uuid:pk>/", a.AdminPlanDetailView.as_view(), name="admin-plan"),
    path("memberships/", a.AdminMemberListView.as_view(), name="admin-members"),
    path(
        "memberships/uses/<uuid:pk>/restore/",
        a.AdminRestoreMembershipUseView.as_view(),
        name="admin-membership-restore",
    ),
    path("gift-cards/", a.AdminGiftCardListView.as_view(), name="admin-giftcards"),
    path("gift-cards/<uuid:pk>/", a.AdminGiftCardDetailView.as_view(), name="admin-giftcard"),
    path(
        "gift-cards/<uuid:pk>/void/", a.AdminGiftCardVoidView.as_view(), name="admin-giftcard-void"
    ),
    path(
        "gift-cards/<uuid:pk>/reveal/",
        a.AdminGiftCardRevealView.as_view(),
        name="admin-giftcard-reveal",
    ),
    path(
        "package-cancel-requests/",
        a.AdminPackageCancelRequestListView.as_view(),
        name="admin-package-cancel-requests",
    ),
    path(
        "package-cancel-requests/<uuid:pk>/approve/",
        a.AdminPackageCancelApproveView.as_view(),
        name="admin-package-cancel-approve",
    ),
    path(
        "package-cancel-requests/<uuid:pk>/reject/",
        a.AdminPackageCancelRejectView.as_view(),
        name="admin-package-cancel-reject",
    ),
    path("sales/", a.AdminSaleListView.as_view(), name="admin-sales"),
    path("waitlist/", a.AdminWaitlistView.as_view(), name="admin-waitlist"),
    path(
        "waitlist/<uuid:pk>/cancel/",
        a.AdminWaitlistCancelView.as_view(),
        name="admin-waitlist-cancel",
    ),
]
