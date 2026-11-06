import os
import uuid

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model

from core import brand
from core.env import env_bool, env_list, load_env_file


def test_database_is_postgresql():
    assert settings.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"


def test_passwords_use_argon2_first():
    assert settings.PASSWORD_HASHERS[0].endswith("Argon2PasswordHasher")


def test_api_denies_by_default():
    permissions = settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]
    assert permissions == ["core.permissions.PolicyPermission"]


def test_brand_values():
    assert brand.SHOP_NAME and brand.PLATFORM_NAME
    assert brand.PLATFORM_NAME in brand.POWERED_BY
    # The word "AI" is never part of the shop or platform name.
    for name in (brand.SHOP_NAME, brand.PLATFORM_NAME):
        assert "AI" not in name.split()


def test_env_file_loader(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        '# comment\nSALON_T_A=one\nSALON_T_B="two words"\nSALON_T_C=keep\nnot a pair\n',
        encoding="utf-8",
    )
    monkeypatch.delenv("SALON_T_A", raising=False)
    monkeypatch.delenv("SALON_T_B", raising=False)
    monkeypatch.setenv("SALON_T_C", "real-env-wins")
    load_env_file(env_file)

    assert os.environ["SALON_T_A"] == "one"
    assert os.environ["SALON_T_B"] == "two words"
    assert os.environ["SALON_T_C"] == "real-env-wins"


def test_env_helpers(monkeypatch):
    monkeypatch.setenv("SALON_T_BOOL", "Yes")
    monkeypatch.setenv("SALON_T_LIST", "a, b,,c ")
    assert env_bool("SALON_T_BOOL") is True
    assert env_bool("SALON_T_MISSING", default=False) is False
    assert env_list("SALON_T_LIST") == ["a", "b", "c"]


@pytest.mark.django_db
def test_user_defaults_to_customer_with_uuid_and_argon2():
    user = get_user_model().objects.create_user(
        username="guest1", email="guest1@example.com", password="a-strong-pass-123"
    )
    assert isinstance(user.pk, uuid.UUID)
    assert user.role == "customer"
    assert user.password.startswith("argon2")
    assert user.check_password("a-strong-pass-123")
