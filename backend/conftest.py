"""Shared pytest fixtures."""

import pytest
from django.core.cache import cache
from django.test import Client

from accounts.models import User

PASSWORD = "Strong-Pass-2026!"


@pytest.fixture(autouse=True)
def _no_real_smtp(settings):
    """Tests never depend on the developer's .env email settings; email tests opt in."""
    settings.SALON_SMTP_CONFIGURED = False
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


@pytest.fixture(autouse=True)
def _clear_cache():
    """Rate-limit counters live in the cache; start every test clean."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def make_user(db):
    def _make(role="customer", email=None, password=PASSWORD, active=True, full_name="Test User"):
        email = email or f"{role}-{User.objects.count() + 1}@example.com"
        user = User(username=email, email=email, role=role, is_active=active, full_name=full_name)
        user.set_password(password)
        user.save()
        return user

    return _make


def login(client: Client, user: User, role: str | None = None, password: str = PASSWORD):
    return client.post(
        "/api/auth/login/",
        {"role": role or user.role, "email": user.email, "password": password},
        content_type="application/json",
    )


@pytest.fixture
def logged_in(make_user):
    """Returns a function role -> (client, user) with an authenticated session cookie."""

    def _logged_in(role: str):
        user = make_user(role=role)
        client = Client()
        response = login(client, user)
        assert response.status_code == 200, response.content
        return client, user

    return _logged_in
