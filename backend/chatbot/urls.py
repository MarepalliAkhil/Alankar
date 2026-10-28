from django.urls import path

from chatbot import api

urlpatterns = [
    path("ask/", api.AskView.as_view(), name="chatbot-ask"),
]
