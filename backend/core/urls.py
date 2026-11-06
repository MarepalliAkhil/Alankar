from django.urls import path

from core import views

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("dev/mailbox/", views.DevMailboxView.as_view(), name="dev-mailbox"),
]
