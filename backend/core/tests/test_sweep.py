"""Task 5e-4: every API endpoint is tried as every identity and must obey the policy file."""

import re
import uuid

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from core import policy
from core.permissions import view_action
from core.tests.test_policy import ROLES, iter_api_views

METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")


def concrete(route: str) -> str:
    route = re.sub(r"<uuid:\w+>", str(uuid.uuid4()), route)
    route = re.sub(r"<int:\w+>", "999999", route)
    route = re.sub(r"<(?:str|slug):\w+>", "x", route)
    route = re.sub(r"<\w+>", "x", route)
    return "/" + route.lstrip("^").rstrip("$")


def endpoints():
    for route, cls in iter_api_views():
        for method in METHODS:
            if hasattr(cls, method.lower()):
                yield concrete(route), method, view_action(cls, method)


ALL = sorted(set(endpoints()))


@pytest.fixture
def people(make_user):
    return {role: make_user(role=role) for role in ROLES}


def call(client, method, url):
    return getattr(client, method.lower())(url, {}, format="json")


def test_sweep_found_the_endpoints():
    assert len(ALL) > 150
    assert all(url.startswith("/api/") for url, _, _ in ALL)


@pytest.mark.django_db
def test_guests_are_stopped_everywhere_except_public_actions():
    client = APIClient()
    bad = []
    for url, method, action in ALL:
        status = call(client, method, url).status_code
        if policy.is_public_action(action):
            if status >= 500:
                bad.append((method, url, status))
        elif status not in (401, 403):
            bad.append((method, url, status))
    assert not bad, bad


@pytest.mark.django_db
@pytest.mark.parametrize("role", ROLES)
def test_each_role_is_denied_what_the_policy_denies(people, role):
    client = APIClient()
    client.force_authenticate(people[role])
    bad = []
    for url, method, action in ALL:
        if policy.is_public_action(action) or policy.role_can(role, action):
            continue
        status = call(client, method, url).status_code
        if status != 403:
            bad.append((method, url, status))
    assert not bad, bad


@pytest.mark.django_db
@pytest.mark.parametrize("role", ROLES)
def test_allowed_calls_never_crash(people, role):
    client = APIClient()
    client.force_authenticate(people[role])
    crashed = []
    for url, method, action in ALL:
        if not policy.role_can(role, action):
            continue
        if "logout" in url:
            continue
        response = call(client, method, url)
        if response.status_code >= 500:
            crashed.append((method, url, response.status_code))
    assert not crashed, crashed


def test_a_user_model_role_list_matches_the_policy():
    assert set(ROLES) == {value for value, _ in User.Role.choices}
