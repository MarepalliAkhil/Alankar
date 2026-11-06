from django.urls import path

from people import stylist_views as v

stylist_patterns = [
    path("appointments/", v.AppointmentListView.as_view(), name="stylist-appointments"),
    path("appointments/<uuid:pk>/", v.AppointmentDetailView.as_view(), name="stylist-appointment"),
    path("appointments/<uuid:pk>/start/", v.StartView.as_view(), name="stylist-start"),
    path("appointments/<uuid:pk>/complete/", v.CompleteView.as_view(), name="stylist-complete"),
    path("requests/", v.RequestListView.as_view(), name="stylist-requests"),
    path(
        "requests/<uuid:pk>/accept/", v.RequestAcceptView.as_view(), name="stylist-request-accept"
    ),
    path(
        "requests/<uuid:pk>/decline/",
        v.RequestDeclineView.as_view(),
        name="stylist-request-decline",
    ),
    path("calendar/", v.CalendarView.as_view(), name="stylist-calendar"),
    path("appointments/<uuid:pk>/cancel/", v.StylistCancelView.as_view(), name="stylist-cancel"),
    path("appointments/<uuid:pk>/move/", v.StylistMoveView.as_view(), name="stylist-move"),
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
