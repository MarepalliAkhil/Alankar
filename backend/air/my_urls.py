from django.urls import path

from air import chat_api

# /api/my/air/
urlpatterns = [
    path("send-request/", chat_api.SendRequestView.as_view(), name="air-send-request"),
    path("confirm/", chat_api.ConfirmView.as_view(), name="air-confirm"),
    path("consent/", chat_api.ConsentView.as_view(), name="air-consent"),
]
