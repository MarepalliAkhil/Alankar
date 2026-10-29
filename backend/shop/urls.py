from django.urls import path

from shop import views as v

# /api/my/shop/
my_shop_patterns = [
    path("products/", v.MyShopProductsView.as_view(), name="my-shop-products"),
    path("quote/", v.MyShopQuoteView.as_view(), name="my-shop-quote"),
    path("addresses/", v.MyAddressesView.as_view(), name="my-addresses"),
    path("addresses/<uuid:pk>/", v.MyAddressView.as_view(), name="my-address"),
]

# /api/my/orders/
my_order_patterns = [
    path("", v.MyOrdersView.as_view(), name="my-orders"),
    path("<uuid:pk>/", v.MyOrderView.as_view(), name="my-order"),
    path("<uuid:pk>/pay/", v.MyOrderPayView.as_view(), name="my-order-pay"),
    path("<uuid:pk>/cancel/", v.MyOrderCancelView.as_view(), name="my-order-cancel"),
]

# /api/orders/ (receptionist and admin)
order_patterns = [
    path("", v.OrdersView.as_view(), name="orders"),
    path("<uuid:pk>/", v.OrderView.as_view(), name="order"),
    path("<uuid:pk>/advance/", v.OrderAdvanceView.as_view(), name="order-advance"),
    path("<uuid:pk>/cancel/", v.OrderCancelView.as_view(), name="order-cancel"),
]
