"""Production settings (config/settings_production.py) and the deployment files (docs/DEPLOY.md).

The settings are loaded in a separate Python process, with a clean environment, exactly as the
containers load them.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
DOMAIN = "alankar-akhil.centralindia.cloudapp.azure.com"
SAMPLE = {
    "DJANGO_SETTINGS_MODULE": "config.settings_production",
    "DOMAIN": DOMAIN,
    "SITE_URL": f"https://{DOMAIN}",
    # Sample values, never used anywhere real.
    "SALON_SECRET_KEY": "Kq3v9ZrT1pWx8LmN4bYc7HdF2sJg6AeQ0uRiVo5XkPzCyBnMwE8tUa",
    "SALON_FIELD_KEY": "aDJ6c0x2OGJmUXc5Tm1ZcFQzVmM0WGtSN2pBNmVHMVU=",  # 32 bytes, sample
    "DATABASE_URL": "postgresql://alankar:Zr8%40kQ2pLm7vXc4d@db.postgres.database.azure.com:5432/alankar",
    "REDIS_URL": "redis://redis:6379/0",
    "EMAIL_HOST": "smtp.gmail.com",
    "EMAIL_HOST_USER": "shop@gmail.com",
    "EMAIL_HOST_PASSWORD": "abcdefghijklmnop",
}


def run(code: str, env: dict) -> subprocess.CompletedProcess:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("SALON_", "DJANGO_"))}
    clean.update(env)
    # No backend/.env: the production settings must not depend on a developer's local file.
    clean["SALON_SKIP_ENV_FILE"] = "1"
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", code],
        cwd=BACKEND,
        env=clean,
        capture_output=True,
        text=True,
        timeout=120,
    )


SETUP = "import django; django.setup(); from django.conf import settings as s; "


@pytest.mark.parametrize(
    "name", ["DOMAIN", "SALON_SECRET_KEY", "SALON_FIELD_KEY", "DATABASE_URL", "REDIS_URL"]
)
def test_refuses_to_start_without_a_required_variable(name):
    env = {k: v for k, v in SAMPLE.items() if k != name}
    result = run(SETUP + "print('started')", env)
    assert result.returncode != 0
    assert name in result.stderr
    assert "started" not in result.stdout


def test_production_values_come_from_domain_database_url_and_redis():
    result = run(
        SETUP + "db = s.DATABASES['default']; "
        "print(s.DEBUG, s.ALLOWED_HOSTS[0], s.CSRF_TRUSTED_ORIGINS, db['HOST'], db['PASSWORD'], "
        "db['OPTIONS']['sslmode'], db['CONN_HEALTH_CHECKS'], s.CACHES['default']['BACKEND'], "
        "s.CHANNEL_LAYERS['default']['BACKEND'], s.SECURE_PROXY_SSL_HEADER, "
        "s.SESSION_COOKIE_SECURE, "
        "s.SALON_AUTH['COOKIE_SAMESITE'], s.SECURE_HSTS_SECONDS, s.MEDIA_ROOT)",
        SAMPLE,
    )
    assert result.returncode == 0, result.stderr
    out = result.stdout
    assert out.startswith(f"False {DOMAIN} ['https://{DOMAIN}'] db.postgres.database.azure.com")
    assert "Zr8@kQ2pLm7vXc4d" in out  # the password is percent-decoded
    assert " require True " in out
    assert "django.core.cache.backends.redis.RedisCache" in out
    assert "channels_redis.core.RedisChannelLayer" in out
    assert "('HTTP_X_FORWARDED_PROTO', 'https') True Lax 31536000 /app/media" in out


def test_deploy_check_passes_with_sample_values_and_no_warnings():
    result = run(
        "import sys, django; django.setup(); from django.core.management import call_command; "
        "call_command('deploy_check', '--strict')",
        SAMPLE,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "deploy_check passed (0 warning(s))" in result.stdout


def test_domain_must_be_a_host_name():
    result = run(SETUP + "print('started')", {**SAMPLE, "DOMAIN": f"https://{DOMAIN}"})
    assert result.returncode != 0 and "host name only" in result.stderr


def test_the_workflows_have_the_stated_permissions():
    yaml = pytest.importorskip("yaml")
    ci = yaml.safe_load((ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    images = yaml.safe_load((ROOT / ".github/workflows/images.yml").read_text(encoding="utf-8"))
    assert ci["permissions"] == {"contents": "read"}
    assert images["permissions"] == {"contents": "read", "packages": "write"}
    assert "secrets." not in (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    text = (ROOT / ".github/workflows/images.yml").read_text(encoding="utf-8")
    assert "secrets.GITHUB_TOKEN" in text and "vars.SITE_URL" in text
    assert "deploy" not in [job.lower() for job in images["jobs"]]


def test_the_example_env_files_hold_no_secrets():
    for name in (".env.production.example", ".env.production.local.example"):
        for line in (ROOT / name).read_text(encoding="utf-8").splitlines():
            if line.startswith(
                (
                    "SALON_SECRET_KEY=",
                    "SALON_FIELD_KEY=",
                    "SALON_JWT_SIGNING_KEY=",
                    "ADMIN_PASSWORD=",
                    "EMAIL_HOST_PASSWORD=",
                    "AI_TEXT_API_KEY=",
                )
            ):
                assert line.split("=", 1)[1] == "", (name, line)
