from django.urls import path

from air import chat_api

# /api/desk/callbacks/
urlpatterns = [
    path("", chat_api.DeskCallbackListView.as_view(), name="desk-callbacks"),
    path("<uuid:pk>/done/", chat_api.DeskCallbackDoneView.as_view(), name="desk-callback-done"),
]
