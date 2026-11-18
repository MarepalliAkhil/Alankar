# ruff: noqa: F811  (fixtures imported from the chat and booking tests)
"""Free deployment (docs/DEPLOY_FREE.md): ping, jobs over HTTP, ws tickets, photo caps, settings,
render.yaml and vercel.json."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from chat import images, service, tickets
from chat.auth import socket_user
from chat.models import ChatImage
from chat.tests.test_chat import communicator, paired, recv_until, run  # noqa: F401
from chat.tests.test_photos import make_image, sent  # noqa: F401
from core import internal
from people.tests.test_stylist import asha, booked, catalogue, customer, desk, ravi  # noqa: F401

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
SECRET = "tick-secret-for-tests-only-7f3a"


# --------------------------------------------------------------------------- ping


@pytest.mark.django_db
def test_ping_makes_zero_database_queries(client):
    with CaptureQueriesContext(connection) as queries:
        response = client.get("/api/ping/")
    assert response.status_code == 200 and response.json() == {"status": "ok"}
    assert len(queries) == 0


# --------------------------------------------------------------------------- tick and nightly


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/internal/tick/", "/api/internal/nightly/"])
def test_jobs_endpoints_reject_missing_or_wrong_secrets(client, path):
    with override_settings(SALON_TICK_SECRET=""):
        assert client.post(path, HTTP_X_TICK_SECRET="anything").status_code == 403  # switched off
    with override_settings(SALON_TICK_SECRET=SECRET):
        assert client.post(path).status_code == 403
        assert client.post(path, HTTP_X_TICK_SECRET="wrong").status_code == 403
        assert client.post(path, HTTP_X_TICK_SECRET=SECRET[:-1]).status_code == 403
        assert client.get(path, HTTP_X_TICK_SECRET=SECRET).status_code == 405


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/internal/tick/", "/api/internal/nightly/"])
def test_jobs_work_like_cron_job_org_calls_them(path):
    """A plain POST with only the secret header: no cookie, no CSRF token, CSRF checks on."""
    from django.test import Client

    cron = Client(enforce_csrf_checks=True)
    with override_settings(SALON_TICK_SECRET=SECRET):
        ok = cron.post(path, HTTP_X_TICK_SECRET=SECRET)
        wrong = cron.post(path, HTTP_X_TICK_SECRET="wrong")
    assert ok.status_code == 200, ok.content
    assert ok.json()["status"] in ("nothing to do", "done")
    assert wrong.status_code == 403
    assert wrong.json()["detail"] == "Wrong or missing X-Tick-Secret."


@pytest.mark.django_db
def test_a_signed_in_session_alone_cannot_run_the_jobs(customer, desk):
    with override_settings(SALON_TICK_SECRET=SECRET):
        for client, _user in (customer, desk):
            assert client.post("/api/internal/tick/").status_code == 403


@pytest.mark.django_db
def test_tick_runs_the_jobs_and_is_quick_when_nothing_is_due(client):
    with override_settings(SALON_TICK_SECRET=SECRET):
        response = client.post("/api/internal/tick/", HTTP_X_TICK_SECRET=SECRET)
    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "nothing to do"
    assert set(body["results"]) == set(internal.TICK_JOBS) and not body["skipped"]
    assert body["seconds"] < 5


@pytest.mark.django_db
def test_tick_does_real_work_when_something_is_due(client, monkeypatch):
    from core import jobs

    monkeypatch.setattr(
        jobs, "JOBS", [(n, (lambda now: 2) if n == "waitlist" else f) for n, f in jobs.JOBS]
    )
    with override_settings(SALON_TICK_SECRET=SECRET):
        body = client.post("/api/internal/tick/", HTTP_X_TICK_SECRET=SECRET).json()
    assert body["status"] == "done" and body["results"]["waitlist"] == 2


def test_tick_stops_before_the_time_budget():
    body = internal.run_jobs(internal.TICK_JOBS, budget=-1)
    assert body["skipped"] == internal.TICK_JOBS


@pytest.mark.django_db
def test_nightly_builds_recommendations(client):
    with override_settings(SALON_TICK_SECRET=SECRET):
        body = client.post("/api/internal/nightly/", HTTP_X_TICK_SECRET=SECRET).json()
    assert body["results"]["build_recommendations"] == 1
    assert set(internal.NIGHTLY_JOBS) <= set(body["results"])


@pytest.mark.django_db
def test_jobs_endpoints_are_rate_limited(client):
    cache.clear()
    with override_settings(SALON_TICK_SECRET=SECRET):
        codes = [client.post("/api/internal/tick/").status_code for _ in range(22)]
    assert codes[-1] == 429
    cache.clear()


# --------------------------------------------------------------------------- ws tickets


@pytest.mark.django_db
def test_ws_ticket_is_for_chat_roles_only(customer, desk):
    response = customer[0].get("/api/ws-ticket/")
    assert response.status_code == 200 and response.json()["expires_in"] == 30
    assert response["Cache-Control"] == "no-store"
    assert desk[0].get("/api/ws-ticket/").status_code == 403


@pytest.mark.django_db
def test_ws_ticket_is_single_use_and_bound_to_its_user(customer):
    ticket = customer[0].get("/api/ws-ticket/").json()["ticket"]
    assert tickets.redeem(ticket) == str(customer[1].pk)
    assert tickets.redeem(ticket) is None  # burned
    assert tickets.redeem("guessed-" + ticket[8:]) is None
    assert tickets.redeem("") is None and tickets.redeem("x" * 200) is None


@pytest.mark.django_db
def test_ws_ticket_expires_after_30_seconds(customer, monkeypatch):
    seen = {}
    real_set = cache.set

    def spy(key, value, timeout=None, **kw):
        seen["timeout"] = timeout
        return real_set(key, value, timeout=timeout, **kw)

    monkeypatch.setattr(cache, "set", spy)
    ticket = tickets.issue(customer[1])
    assert seen["timeout"] == 30
    cache.delete(tickets._key(ticket))  # what the cache does when the 30 seconds are over
    assert tickets.redeem(ticket) is None


@pytest.mark.django_db(transaction=True)
def test_socket_opens_with_a_ticket_once_and_permissions_are_unchanged(
    paired, customer, asha, ravi
):
    from channels.testing import WebsocketCommunicator

    from config.asgi import application

    def socket(thread_id, ticket):
        headers = [(b"origin", b"http://localhost"), (b"host", b"localhost")]
        return WebsocketCommunicator(
            application, f"/api/ws/chat/{thread_id}/?ticket={ticket}", headers=headers
        )

    mine = customer[0].get("/api/ws-ticket/").json()["ticket"]
    stolen = customer[0].get("/api/ws-ticket/").json()["ticket"]
    outsider = ravi[0].get("/api/ws-ticket/").json()["ticket"]

    async def scenario():
        ok = socket(paired.id, mine)
        assert (await ok.connect())[0]
        assert (await ok.receive_json_from())["type"] == "ready"
        await ok.disconnect()
        again = socket(paired.id, mine)  # the same ticket a second time
        connected, _ = await again.connect()
        assert not connected
        # A ticket only says who you are: a stylist who is not in this thread is still refused.
        other = socket(paired.id, outsider)
        connected, _ = await other.connect()
        assert not connected
        # A stolen ticket works once for its own user only, and is then gone for the owner too.
        thief = socket(paired.id, stolen)
        assert (await thief.connect())[0]
        await thief.disconnect()
        assert tickets.redeem(stolen) is None

    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_cookie_sockets_still_work_without_a_ticket(paired, customer):
    async def scenario():
        c = communicator(paired.id, customer)
        assert (await c.connect())[0]
        assert (await c.receive_json_from())["type"] == "ready"
        await c.disconnect()

    run(scenario())


def test_socket_user_prefers_the_ticket_when_one_is_given():
    import asyncio

    scope = {"query_string": b"ticket=nope", "headers": []}
    assert asyncio.run(socket_user(scope)) is None


# --------------------------------------------------------------------------- photo storage


def test_compact_photos_are_small_webp_without_metadata():
    raw = make_image("PNG", size=(3000, 2000))
    with override_settings(SALON_PHOTO_COMPACT=True):
        out = images.process(raw)
    assert out["mime"] == "image/webp"
    assert max(out["width"], out["height"]) <= images.COMPACT_SIDE
    assert len(out["original"]) <= images.COMPACT_BYTES
    full = images.process(raw)  # Docker / Azure: unchanged
    assert full["mime"] == "image/png" and full["width"] == 3000


@pytest.mark.django_db
def test_photo_space_caps_per_user_and_in_total(paired, customer, asha):
    sent(customer[0], paired)
    used = sum(ChatImage.objects.values_list("size", flat=True))
    assert used > 0
    with override_settings(SALON_PHOTO_USER_MB=1):
        images.check_storage_caps(customer[1], 1000)  # well inside
        with pytest.raises(service.ChatError) as err:
            images.check_storage_caps(customer[1], 1024 * 1024)
        assert err.value.code == "storage_full"
        images.check_storage_caps(asha[1], 1024 * 1024 - 1)  # the other person has their own
    with override_settings(SALON_PHOTO_TOTAL_MB=1):
        with pytest.raises(service.ChatError):
            images.check_storage_caps(asha[1], 1024 * 1024)
    with override_settings(SALON_PHOTO_USER_MB=1):
        response = customer[0].post(
            f"/api/chat/threads/{paired.id}/images/",
            {"image": _big_upload()},
        )
    assert response.status_code in (400, 413, 429)


def _big_upload():
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    img = Image.effect_noise((1200, 1200), 100).convert("RGB")
    out = io.BytesIO()
    img.save(out, "PNG")
    return SimpleUploadedFile("big.png", out.getvalue(), content_type="image/png")


# --------------------------------------------------------------------------- settings and files

DOMAIN = "alankar.vercel.app"
FREE = {
    "DJANGO_SETTINGS_MODULE": "config.settings_free",
    "FRONTEND_DOMAIN": DOMAIN,
    "RENDER_EXTERNAL_HOSTNAME": "alankar-api.onrender.com",
    "SALON_SECRET_KEY": "Kq3v9ZrT1pWx8LmN4bYc7HdF2sJg6AeQ0uRiVo5XkPzCyBnMwE8tUa",
    "SALON_FIELD_KEY": "aDJ6c0x2OGJmUXc5Tm1ZcFQzVmM0WGtSN2pBNmVHMVU=",
    "DATABASE_URL": "postgresql://neondb_owner:Zr8kQ2pLm7vXc4d@ep-x.ap-southeast-1.aws.neon.tech/neondb",
    "TICK_SECRET": SECRET,
    "EMAIL_HOST": "smtp-relay.brevo.com",
    "EMAIL_PORT": "2525",
    "EMAIL_HOST_USER": "shop@example.org",
    "EMAIL_HOST_PASSWORD": "abcdefghijklmnop",
}


def run_free(code: str, env: dict) -> subprocess.CompletedProcess:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("SALON_", "DJANGO_"))}
    clean.update(env)
    clean["SALON_SKIP_ENV_FILE"] = "1"
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", code],
        cwd=BACKEND,
        env=clean,
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.mark.parametrize(
    "name", ["SALON_SECRET_KEY", "SALON_FIELD_KEY", "DATABASE_URL", "FRONTEND_DOMAIN"]
)
def test_free_settings_refuse_to_start_without_a_required_variable(name):
    result = run_free(
        "import django; django.setup(); print('started')",
        {k: v for k, v in FREE.items() if k != name},
    )
    assert result.returncode != 0 and name in result.stderr


def test_free_settings_values_and_deploy_check():
    result = run_free(
        "import django; django.setup(); from django.conf import settings as s; "
        "db = s.DATABASES['default']; "
        "print(s.DEBUG, sorted(s.ALLOWED_HOSTS), s.CSRF_TRUSTED_ORIGINS, db['CONN_MAX_AGE'], "
        "db['OPTIONS']['sslmode'], s.CACHES['default']['BACKEND'], "
        "s.CHANNEL_LAYERS['default']['BACKEND'], s.SESSION_COOKIE_SECURE, "
        "s.REST_FRAMEWORK['NUM_PROXIES'], s.SALON_PHOTO_COMPACT); "
        "from django.core.management import call_command; call_command('deploy_check')",
        FREE,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    out = result.stdout
    hosts = f"['alankar-api.onrender.com', '{DOMAIN}', 'localhost']"
    assert f"False {hosts} ['https://{DOMAIN}'] 0 " in out
    assert "require django.core.cache.backends.locmem.LocMemCache" in out
    assert "InMemoryChannelLayer True 2 True" in out
    # Only the two documented one-instance warnings.
    assert "deploy_check passed (2 warning(s))" in out


def test_render_blueprint_is_free_singapore_docker_with_ping():
    yaml = pytest.importorskip("yaml")
    blueprint = yaml.safe_load((ROOT / "render.yaml").read_text(encoding="utf-8"))
    web = blueprint["services"][0]
    assert (web["plan"], web["region"], web["runtime"]) == ("free", "singapore", "docker")
    assert web["healthCheckPath"] == "/api/ping/"
    assert web["dockerCommand"].endswith("entrypoint.sh free")
    keys = {e["key"]: e for e in web["envVars"]}
    assert keys["DJANGO_SETTINGS_MODULE"]["value"] == "config.settings_free"
    for secret in ("SALON_SECRET_KEY", "SALON_FIELD_KEY", "DATABASE_URL", "TICK_SECRET"):
        assert keys[secret].get("sync") is False and "value" not in keys[secret]


def test_vercel_config_has_the_rewrites_redirects_and_headers():
    config = json.loads((ROOT / "frontend/vercel.json").read_text(encoding="utf-8"))
    assert config["framework"] == "vite" and config["outputDirectory"] == "dist"
    api = config["rewrites"][0]
    assert api["source"] == "/api/:path(.*)" and api["destination"].endswith("/api/:path")
    assert api["destination"].startswith("https://")
    assert any(r["destination"] == "/app.html" for r in config["rewrites"][1:])
    assert {"source": "/zenotians", "destination": "/for-zenotians", "permanent": True} in config[
        "redirects"
    ]
    headers = {h["key"]: h["value"] for block in config["headers"] for h in block["headers"]}
    assert "max-age=" in headers["Strict-Transport-Security"]
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert "wss://*.onrender.com" in headers["Content-Security-Policy"]
    # The backend address is written in exactly one place.
    assert json.dumps(config).count(".onrender.com/") <= 1


# --------------------------------------------------------------------------- first_run_free


def _first_run(monkeypatch, env=None):
    from core.management.commands import first_run_free

    calls = []
    monkeypatch.setattr(first_run_free, "call_command", lambda *a, **kw: calls.append(a))
    for key, value in (env or {}).items():
        monkeypatch.setenv(key, value)
    first_run_free.Command().handle()
    return [c[0] for c in calls]


@pytest.mark.django_db
def test_first_run_loads_the_demo_only_into_an_empty_database(monkeypatch):
    from accounts.models import User
    from scheduling.models import Appointment

    if Appointment.objects.exists() or User.objects.filter(role=User.Role.CUSTOMER).exists():
        pytest.skip("test database is not empty")
    done = _first_run(monkeypatch)
    assert done[:2] == ["migrate", "reset_demo"]
    assert done[-3:] == ["seed_demo_extras", "seed_demo_coupons", "build_recommendations"]


@pytest.mark.django_db
def test_first_run_refuses_to_reset_a_database_with_data(monkeypatch, customer):
    done = _first_run(monkeypatch, {"ADMIN_EMAIL": customer[1].email, "ADMIN_PASSWORD": "x" * 12})
    assert "reset_demo" not in done
    assert "create_admin" not in done  # an existing account is never changed
    assert done[0] == "migrate" and done[-1] == "build_recommendations"
