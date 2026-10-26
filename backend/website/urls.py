from django.urls import path

from website import views

urlpatterns = [
    path("site/", views.SiteView.as_view(), name="public-site"),
    path("categories/", views.CategoryListView.as_view(), name="public-categories"),
    path("services/", views.ServiceListView.as_view(), name="public-services"),
    path("services/<slug:slug>/", views.ServiceDetailView.as_view(), name="public-service"),
    path("team/", views.TeamView.as_view(), name="public-team"),
    path("pages/<slug:key>/", views.PolicyPageView.as_view(), name="public-page"),
]
