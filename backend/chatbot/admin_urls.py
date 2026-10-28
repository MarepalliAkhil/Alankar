from django.urls import path

from chatbot.admin_api import AddFaqView, DismissView, InsightsView, TestBoxView

urlpatterns = [
    path("insights/", InsightsView.as_view(), name="chatbot-insights"),
    path("unanswered/<int:pk>/faq/", AddFaqView.as_view(), name="chatbot-add-faq"),
    path("unanswered/<int:pk>/dismiss/", DismissView.as_view(), name="chatbot-dismiss"),
    path("test/", TestBoxView.as_view(), name="chatbot-test"),
]
