from django.urls import path

from chat import views

urlpatterns = [
    path("threads/", views.ThreadListView.as_view(), name="chat-threads"),
    path("threads/<uuid:pk>/messages/", views.MessagesView.as_view(), name="chat-messages"),
    path("threads/<uuid:pk>/read/", views.ReadView.as_view(), name="chat-read"),
]
