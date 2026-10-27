from django.urls import path

from people import admin_views as v
from scheduling import catalogue_admin as c

admin_patterns = [
    path("staff/<uuid:pk>/details/", v.StaffDetailsView.as_view(), name="admin-staff-details"),
    path(
        "staff/<uuid:pk>/link-profile/", v.StaffLinkProfileView.as_view(), name="admin-staff-link"
    ),
    path("days-off/", v.DayOffListView.as_view(), name="admin-days-off"),
    path("days-off/<uuid:pk>/decide/", v.DayOffDecideView.as_view(), name="admin-days-off-decide"),
    path("catalogue/options/", c.OptionsView.as_view(), name="admin-catalogue-options"),
    path("catalogue/categories/", c.CategoryListView.as_view(), name="admin-categories"),
    path("catalogue/categories/<uuid:pk>/", c.CategoryDetailView.as_view(), name="admin-category"),
    path("catalogue/rooms/", c.RoomListView.as_view(), name="admin-rooms"),
    path("catalogue/rooms/<uuid:pk>/", c.RoomDetailView.as_view(), name="admin-room"),
    path("catalogue/services/", c.ServiceListView.as_view(), name="admin-services"),
    path("catalogue/services/<uuid:pk>/", c.ServiceDetailView.as_view(), name="admin-service"),
]
