from django.urls import path

from recommendations import views

urlpatterns = [
    path("", views.AdminRecommendationsView.as_view(), name="admin-recommendations"),
    path(
        "settings/",
        views.AdminRecommendationSettingsView.as_view(),
        name="admin-recommendation-settings",
    ),
    path(
        "rebuild/",
        views.AdminRecommendationRebuildView.as_view(),
        name="admin-recommendation-rebuild",
    ),
]
