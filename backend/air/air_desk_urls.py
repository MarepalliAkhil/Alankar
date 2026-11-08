from django.urls import path

from air import desk_api

urlpatterns = [
    path("stats/", desk_api.StatsView.as_view(), name="air-desk-stats"),
    path("activity/", desk_api.ActivityView.as_view(), name="air-desk-activity"),
    path("activity/<uuid:pk>/undo/", desk_api.UndoView.as_view(), name="air-desk-undo"),
    path("needs/claim/", desk_api.NeedsClaimView.as_view(), name="air-desk-needs-claim"),
    path("needs/resolve/", desk_api.NeedsResolveView.as_view(), name="air-desk-needs-resolve"),
    path("customers/<uuid:pk>/phone/", desk_api.PhoneView.as_view(), name="air-desk-phone"),
    path("briefing/", desk_api.BriefingView.as_view(), name="air-desk-briefing"),
]
