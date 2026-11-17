from django.urls import path

from chat.views import WsTicketView
from core import internal, views

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("ping/", internal.PingView.as_view(), name="ping"),
    path("internal/tick/", internal.TickView.as_view(), name="internal-tick"),
    path("internal/nightly/", internal.NightlyView.as_view(), name="internal-nightly"),
    path("ws-ticket/", WsTicketView.as_view(), name="ws-ticket"),
    path("dev/mailbox/", views.DevMailboxView.as_view(), name="dev-mailbox"),
]
