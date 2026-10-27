from django.urls import path

from people.views import ProfileView
from scheduling import views

booking_patterns = [
    path("options/", views.BookingOptionsView.as_view(), name="booking-options"),
    path("slots/", views.SlotsView.as_view(), name="booking-slots"),
    path("requests/", views.BookingRequestView.as_view(), name="booking-requests"),
]

my_patterns = [
    path("profile/", ProfileView.as_view(), name="my-profile"),
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
    path(
        "appointments/<uuid:pk>/resend-link/",
        views.DeskResendLinkView.as_view(),
        name="desk-appointment-resend",
    ),
]
