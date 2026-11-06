from django.urls import path

from chat import views

urlpatterns = [
    path("threads/", views.ThreadListView.as_view(), name="chat-threads"),
    path("threads/<uuid:pk>/messages/", views.MessagesView.as_view(), name="chat-messages"),
    path("threads/<uuid:pk>/images/", views.ImageSendView.as_view(), name="chat-image-send"),
    path(
        "threads/<uuid:pk>/images/<uuid:image_id>/",
        views.ImageView.as_view(),
        name="chat-image",
    ),
    path(
        "threads/<uuid:pk>/images/<uuid:image_id>/thumbnail/",
        views.ImageThumbView.as_view(),
        name="chat-image-thumb",
    ),
    path("threads/<uuid:pk>/read/", views.ReadView.as_view(), name="chat-read"),
]
