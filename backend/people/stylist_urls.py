from django.urls import path

from people import stylist_views as v

stylist_patterns = [
    path("appointments/", v.AppointmentListView.as_view(), name="stylist-appointments"),
    path("appointments/<uuid:pk>/", v.AppointmentDetailView.as_view(), name="stylist-appointment"),
    path("appointments/<uuid:pk>/start/", v.StartView.as_view(), name="stylist-start"),
    path("appointments/<uuid:pk>/complete/", v.CompleteView.as_view(), name="stylist-complete"),
    path("ratings/", v.RatingsView.as_view(), name="stylist-ratings"),
    path("earnings/", v.EarningsView.as_view(), name="stylist-earnings"),
    path("schedule/", v.ScheduleView.as_view(), name="stylist-schedule"),
    path("days-off/", v.DayOffCreateView.as_view(), name="stylist-days-off"),
    path(
        "days-off/<uuid:pk>/withdraw/",
        v.DayOffWithdrawView.as_view(),
        name="stylist-days-off-withdraw",
    ),
]
