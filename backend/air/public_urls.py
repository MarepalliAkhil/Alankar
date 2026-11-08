from django.urls import path

from air import chat_api

# /api/air/
urlpatterns = [
    path("chat/", chat_api.ChatView.as_view(), name="air-chat"),
    path("status/", chat_api.StatusView.as_view(), name="air-status"),
]
