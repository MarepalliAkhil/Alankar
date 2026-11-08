from django.urls import path

from air import desk_api, views

urlpatterns = [
    path("settings/", views.SettingsView.as_view(), name="air-settings"),
    path("cover/", views.CoverView.as_view(), name="air-cover"),
    path("status/", views.StatusView.as_view(), name="air-status"),
    path("log/", views.LogListView.as_view(), name="air-log"),
    path("usage/", desk_api.UsageView.as_view(), name="air-usage"),
]
