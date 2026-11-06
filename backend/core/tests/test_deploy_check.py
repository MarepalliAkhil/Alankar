"""`manage.py deploy_check` fails on unsafe production settings and passes on safe ones."""

import base64
import secrets

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from core.deploycheck import ERROR, WARNING, run_checks

GOOD_SECRET = "q3Xv9-Lm2Zk8Rt5Wb7Yc1Nd4Hf6Jg0PsAeUoIiKxMyBnTvCzDwEqGrFhJlOpSa"
GOOD_FIELD = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


@pytest.fixture
def production(settings):
    """Settings as a correctly configured production server would have them."""
    settings.DEBUG = False
    settings.SECRET_KEY = GOOD_SECRET
    settings.SALON_FIELD_KEY = GOOD_FIELD
    settings.ALLOWED_HOSTS = ["salon.example.org"]
    settings.CORS_ALLOWED_ORIGINS = ["https://salon.example.org"]
    settings.CSRF_TRUSTED_ORIGINS = ["https://salon.example.org"]
    settings.SALON_FRONTEND_URL = "https://salon.example.org"
    settings.SALON_AUTH = {**settings.SALON_AUTH, "COOKIE_SECURE": True}
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    settings.SECURE_SSL_REDIRECT = True
    settings.SECURE_HSTS_SECONDS = 31_536_000
    settings.SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    settings.SALON_DEV_TOOLS = False
    settings.SALON_API_DOCS = False
    settings.SALON_CUSTOMER_OTP = True
    settings.SALON_SMTP_CONFIGURED = True
    settings.DATABASES["default"]["PASSWORD"] = "Zx8-long-random-database-secret-91"
    return settings


def codes(level=ERROR):
    return {f.code for f in run_checks() if f.level == level}


def test_a_correct_production_setup_has_no_errors(production):
    assert codes() == set()
    call_command("deploy_check")  # also runs Django's own `check --deploy`


def test_the_development_setup_fails():
    with pytest.raises(CommandError):
        call_command("deploy_check")


@pytest.mark.parametrize(
    ("change", "value", "code"),
    [
        ("DEBUG", True, "debug"),
        ("SECRET_KEY", "replace-with-a-long-random-string", "secret_key"),
        ("SECRET_KEY", "short", "secret_key"),
        ("SALON_FIELD_KEY", "replace-with-a-generated-key", "field_key"),
        ("SALON_FIELD_KEY", GOOD_SECRET, "field_key"),
        ("ALLOWED_HOSTS", ["*"], "allowed_hosts"),
        ("ALLOWED_HOSTS", [], "allowed_hosts"),
        ("ALLOWED_HOSTS", ["localhost", "127.0.0.1"], "allowed_hosts_local"),
        ("CORS_ALLOWED_ORIGINS", ["http://salon.example.org"], "cors_origin"),
        ("CORS_ALLOWED_ORIGINS", ["http://localhost:5173"], "cors_origin"),
        ("CORS_ALLOWED_ORIGINS", ["*"], "cors_origin"),
        ("CORS_ALLOW_ALL_ORIGINS", True, "cors_all"),
        ("SALON_FRONTEND_URL", "http://salon.example.org", "frontend_url"),
        ("SESSION_COOKIE_SECURE", False, "cookie_secure"),
        ("CSRF_COOKIE_SECURE", False, "cookie_secure"),
        ("SECURE_SSL_REDIRECT", False, "ssl_redirect"),
        ("SECURE_HSTS_SECONDS", 0, "hsts"),
        ("SECURE_HSTS_INCLUDE_SUBDOMAINS", False, "hsts_subdomains"),
        ("X_FRAME_OPTIONS", "SAMEORIGIN", "frame_options"),
        ("SECURE_CONTENT_TYPE_NOSNIFF", False, "nosniff"),
        ("SALON_DEV_TOOLS", True, "dev_tools"),
        ("SALON_API_DOCS", True, "api_docs"),
        ("SALON_CUSTOMER_OTP", False, "customer_otp"),
        ("SALON_SMTP_CONFIGURED", False, "email"),
    ],
)
def test_each_unsafe_setting_is_reported(production, change, value, code):
    setattr(production, change, value)
    assert code in codes(), (change, value)
    with pytest.raises(CommandError):
        call_command("deploy_check")


def test_insecure_auth_cookies_and_a_blank_database_password_are_reported(production):
    production.SALON_AUTH = {**production.SALON_AUTH, "COOKIE_SECURE": False}
    production.DATABASES["default"]["PASSWORD"] = ""
    assert {"auth_cookie_secure", "db_password"} <= codes()


def test_single_process_limits_are_warnings_not_errors(production):
    assert {"cache", "channel_layer"} <= codes(WARNING)
    with pytest.raises(CommandError):
        call_command("deploy_check", strict=True)
