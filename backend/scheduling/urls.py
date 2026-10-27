from django.urls import path

from billing import desk_views as pos
from billing.views import MyInvoiceDetailView, MyInvoiceListView
from people.desk_views import CustomerDetailView, CustomerListView, CustomerNoteView
from people.views import PendingRatingsView, ProfileView, RatingSubmitView
from scheduling import views

booking_patterns = [
    path("options/", views.BookingOptionsView.as_view(), name="booking-options"),
    path("slots/", views.SlotsView.as_view(), name="booking-slots"),
    path("requests/", views.BookingRequestView.as_view(), name="booking-requests"),
]

my_patterns = [
    path("profile/", ProfileView.as_view(), name="my-profile"),
    path("invoices/", MyInvoiceListView.as_view(), name="my-invoices"),
    path("invoices/<uuid:pk>/", MyInvoiceDetailView.as_view(), name="my-invoice"),
    path("ratings/pending/", PendingRatingsView.as_view(), name="my-ratings-pending"),
    path("ratings/<uuid:pk>/", RatingSubmitView.as_view(), name="my-rating-submit"),
    path("appointments/", views.MyAppointmentListView.as_view(), name="my-appointments"),
    path(
        "appointments/<uuid:pk>/",
        views.MyAppointmentDetailView.as_view(),
        name="my-appointment",
    ),
    path(
        "appointments/<uuid:pk>/payment/",
        views.PaymentView.as_view(),
        name="my-appointment-payment",
    ),
    path(
        "appointments/<uuid:pk>/<slug:action>/",
        views.MyAppointmentActionView.as_view(),
        name="my-appointment-action",
    ),
]

desk_patterns = [
    path("pos/queue/", pos.PosQueueView.as_view(), name="pos-queue"),
    path("pos/visits/<uuid:pk>/", pos.PosVisitView.as_view(), name="pos-visit"),
    path("pos/quote/", pos.PosQuoteView.as_view(), name="pos-quote"),
    path("pos/checkout/", pos.PosCheckoutView.as_view(), name="pos-checkout"),
    path("invoices/", pos.DeskInvoiceListView.as_view(), name="desk-invoices"),
    path("invoices/<uuid:pk>/", pos.DeskInvoiceDetailView.as_view(), name="desk-invoice"),
    path(
        "invoices/<uuid:pk>/refunds/", pos.InvoiceRefundView.as_view(), name="desk-invoice-refund"
    ),
    path("refunds/", pos.RefundListView.as_view(), name="desk-refunds"),
    path(
        "refunds/<uuid:pk>/decision/", pos.RefundDecisionView.as_view(), name="desk-refund-decide"
    ),
    path("cash-close/", pos.CashCloseView.as_view(), name="desk-cash-close"),
    path("inventory/", pos.InventoryListView.as_view(), name="desk-inventory"),
    path("appointments/", views.DeskAppointmentListView.as_view(), name="desk-appointments"),
    path(
        "appointments/<uuid:pk>/",
        views.DeskAppointmentDetailView.as_view(),
        name="desk-appointment",
    ),
    path(
        "appointments/<uuid:pk>/options/",
        views.DeskOptionsView.as_view(),
        name="desk-appointment-options",
    ),
    path(
        "appointments/<uuid:pk>/confirm/",
        views.DeskConfirmView.as_view(),
        name="desk-appointment-confirm",
    ),
    path(
        "appointments/<uuid:pk>/reject/",
        views.DeskRejectView.as_view(),
        name="desk-appointment-reject",
    ),
    path("schedule/", views.DeskScheduleView.as_view(), name="desk-schedule"),
    path(
        "appointments/<uuid:pk>/move/",
        views.DeskMoveView.as_view(),
        name="desk-appointment-move",
    ),
    path(
        "appointments/<uuid:pk>/cancel/",
        views.DeskCancelView.as_view(),
        name="desk-appointment-cancel",
    ),
    path(
        "appointments/<uuid:pk>/no-show/",
        views.DeskNoShowView.as_view(),
        name="desk-appointment-no-show",
    ),
    path("slots/", views.DeskSlotsView.as_view(), name="desk-slots"),
    path("bookings/", views.DeskBookingCreateView.as_view(), name="desk-bookings"),
    path(
        "appointments/<uuid:pk>/check-in/",
        views.DeskCheckInView.as_view(),
        name="desk-appointment-check-in",
    ),
    path("customers/", CustomerListView.as_view(), name="desk-customers"),
    path("customers/<uuid:pk>/", CustomerDetailView.as_view(), name="desk-customer"),
    path("customers/<uuid:pk>/notes/", CustomerNoteView.as_view(), name="desk-customer-notes"),
    path(
        "appointments/<uuid:pk>/dismiss/",
        views.DeskDismissView.as_view(),
        name="desk-appointment-dismiss",
    ),
    path(
        "appointments/<uuid:pk>/resend-link/",
        views.DeskResendLinkView.as_view(),
        name="desk-appointment-resend",
    ),
]
