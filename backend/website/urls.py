from django.urls import path

from marketing.views import CampaignClickView, UnsubscribeView
from website import views

urlpatterns = [
    path("site/", views.SiteView.as_view(), name="public-site"),
    path("zenotians/", views.ZenotiansView.as_view(), name="public-zenotians"),
    path("categories/", views.CategoryListView.as_view(), name="public-categories"),
    path("services/", views.ServiceListView.as_view(), name="public-services"),
    path("services/<slug:slug>/", views.ServiceDetailView.as_view(), name="public-service"),
    path("team/", views.TeamView.as_view(), name="public-team"),
    path("unsubscribe/", UnsubscribeView.as_view(), name="public-unsubscribe"),
    path("c/<uuid:token>/", CampaignClickView.as_view(), name="public-campaign-click"),
    path("pages/<slug:key>/", views.PolicyPageView.as_view(), name="public-page"),
]
