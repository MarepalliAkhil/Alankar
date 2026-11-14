from django.urls import path

from recommendations import views

urlpatterns = [
    path("", views.MyRecommendationsView.as_view(), name="my-recommendations"),
    path("prefs/", views.MyRecommendationPrefsView.as_view(), name="my-recommendation-prefs"),
    path(
        "feedback/", views.MyRecommendationFeedbackView.as_view(), name="my-recommendation-feedback"
    ),
    path("addon/", views.MyAddonView.as_view(), name="my-recommendation-addon"),
]
