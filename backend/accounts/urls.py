from django.urls import path

from accounts import staff_views, views

auth_patterns = [
    path("csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("register/", views.RegisterView.as_view(), name="auth-register"),
    path("login/", views.LoginView.as_view(), name="auth-login"),
    path("refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("session/", views.SessionView.as_view(), name="auth-session"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("invite/", views.InviteCheckView.as_view(), name="auth-invite-check"),
    path("invite/accept/", views.InviteAcceptView.as_view(), name="auth-invite-accept"),
]

staff_patterns = [
    path("", staff_views.StaffListView.as_view(), name="staff-list"),
    path("invites/", staff_views.InviteListCreateView.as_view(), name="staff-invites"),
    path(
        "invites/<uuid:pk>/resend/",
        staff_views.InviteResendView.as_view(),
        name="staff-invite-resend",
    ),
    path(
        "<uuid:pk>/deactivate/", staff_views.StaffDeactivateView.as_view(), name="staff-deactivate"
    ),
    path(
        "<uuid:pk>/reactivate/", staff_views.StaffReactivateView.as_view(), name="staff-reactivate"
    ),
]
