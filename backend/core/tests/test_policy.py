"""The role policy is the single source of truth, and every API endpoint obeys it."""

import json
import uuid

import pytest
from django.conf import settings
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.views import APIView

from core import policy
from core.permissions import view_action

ROLES = ["customer", "receptionist", "stylist", "admin"]
DOCS_VIEWS = (SpectacularAPIView, SpectacularSwaggerView)


def iter_api_views(patterns=None, prefix=""):
    for entry in patterns if patterns is not None else get_resolver().url_patterns:
        if isinstance(entry, URLResolver):
            yield from iter_api_views(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            cls = getattr(entry.callback, "cls", None)
            if cls and issubclass(cls, APIView) and not issubclass(cls, DOCS_VIEWS):
                yield prefix + str(entry.pattern), cls


def test_policy_file_is_consistent():
    data = json.loads(settings.SALON_POLICY_PATH.read_text(encoding="utf-8"))
    actions = set(data["actions"])
    assert set(data["roles"]) == set(ROLES)
    assert set(data["public"]["api"]) <= actions
    for role, spec in data["roles"].items():
        assert set(spec["api"]) <= actions, role
        paths = [item["path"] for item in spec["menu"]]
        assert len(paths) == len(set(paths)), f"duplicate menu path for {role}"
        assert spec["home"] in paths, f"{role} home must be in its menu"
        for item in spec["menu"]:
            assert item["status"] in {"available", "planned"}
            assert item["description"] and item["task"].startswith("Task ")
        assert not set(paths) & set(data["public"]["routes"]), role


def test_every_api_view_declares_a_known_policy_action():
    known = policy.known_actions()
    found = list(iter_api_views())
    assert found, "no API views discovered"
    for route, cls in found:
        methods = [m.upper() for m in cls.http_method_names if hasattr(cls, m) and m != "options"]
        for method in methods:
            action = view_action(cls, method)
            assert action in known, f"{route} {method} has no known policy action"


def test_every_policy_action_is_used_by_a_view():
    used = set()
    for _, cls in iter_api_views():
        for method in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            if hasattr(cls, method.lower()):
                used.add(view_action(cls, method))
    assert policy.known_actions() == used


class _NoAction(APIView):
    def get(self, request):  # pragma: no cover - never reached
        raise AssertionError


def test_views_without_an_action_are_denied(rf):
    from rest_framework.test import force_authenticate

    from accounts.models import User

    request = rf.get("/x")
    force_authenticate(request, user=User(role="admin", is_active=True))
    assert _NoAction.as_view()(request).status_code == 403


# --- Allowed / denied matrix for every role -------------------------------------------------

ADMIN_ONLY = [
    ("get", "/api/staff/"),
    ("get", "/api/staff/invites/"),
    ("post", "/api/staff/invites/"),
    ("get", "/api/audit/"),
    ("post", "/api/staff/{staff}/deactivate/"),
    ("post", "/api/staff/{staff}/reactivate/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
@pytest.mark.parametrize("method,url", ADMIN_ONLY)
def test_admin_endpoints_denied_for_other_roles(logged_in, make_user, role, method, url):
    client, _ = logged_in(role)
    target = make_user(role="stylist")
    response = getattr(client, method)(
        url.format(staff=target.pk), {}, content_type="application/json"
    )
    assert response.status_code == 403
    target.refresh_from_db()
    assert target.is_active


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", ADMIN_ONLY)
def test_admin_endpoints_need_a_session(make_user, method, url):
    target = make_user(role="stylist")
    response = getattr(Client(), method)(
        url.format(staff=target.pk), {}, content_type="application/json"
    )
    assert response.status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", [m for m in ADMIN_ONLY if m[0] == "get"])
def test_admin_endpoints_allowed_for_admin(logged_in, method, url):
    client, _ = logged_in("admin")
    assert getattr(client, method)(url).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("role", ROLES)
def test_me_allowed_for_every_role_and_returns_own_record(logged_in, make_user, role):
    client, user = logged_in(role)
    make_user(role="customer", email="someone-else@example.com")
    body = client.get("/api/auth/me/").json()
    assert body["id"] == str(user.pk) and body["role"] == role
    assert body["home"] == policy.role_home(role)


@pytest.mark.django_db
def test_admin_actions_with_unknown_ids_are_404(logged_in):
    client, _ = logged_in("admin")
    response = client.post(f"/api/staff/{uuid.uuid4()}/deactivate/")
    assert response.status_code == 404


def test_role_can_matrix_matches_policy_file():
    for role in ROLES:
        assert policy.role_can(role, "auth.me")
        assert policy.role_can(role, "staff.invites.create") is (role == "admin")
    assert not policy.role_can("superuser", "auth.me")
    assert not policy.role_can(None, "auth.me")


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_invite_resend_denied_for_other_roles(logged_in, role):
    client, _ = logged_in(role)
    response = client.post(f"/api/staff/invites/{uuid.uuid4()}/resend/")
    assert response.status_code == 403
