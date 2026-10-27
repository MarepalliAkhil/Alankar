"""Task 5d: audit log viewer, sign-in security and staff sessions."""

import json
from datetime import timedelta

import pytest
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from accounts import lockout
from accounts.models import AuditLog, LoginAttempt, LoginLock, WorkSession

A = "/api/admin"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    kwargs = {"content_type": "application/json"}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


# --- audit log --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_audit_log_filters_and_pages(admin, make_user):
    client, me = admin
    other = make_user(role="stylist", email="zed@example.com")
    for i in range(60):
        AuditLog.objects.create(action=AuditLog.Action.LOGIN_FAILED, email=f"x{i}@example.com")
    AuditLog.objects.create(action=AuditLog.Action.INVITE_SENT, actor=other, email="n@e.com")
    body = client.get(f"{A}/audit/").json()
    assert body["count"] >= 61 and len(body["results"]) == 50 and body["pages"] >= 2
    assert client.get(f"{A}/audit/?page=2").json()["page"] == 2
    only = client.get(f"{A}/audit/?action=invite_sent").json()
    assert only["count"] == 1
    assert client.get(f"{A}/audit/?actor=zed").json()["count"] == 1
    assert client.get(f"{A}/audit/?q=x7@").json()["count"] == 1
    today = timezone.localdate().isoformat()
    assert client.get(f"{A}/audit/?from={today}&to={today}").json()["count"] >= 61
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    assert client.get(f"{A}/audit/?from={tomorrow}").json()["count"] == 0
    assert client.get(f"{A}/audit/?from=garbage").status_code == 400
    assert any(a["value"] == "audit_exported" for a in body["actions"])


@pytest.mark.django_db
def test_audit_metadata_hides_secrets(admin):
    client, _ = admin
    AuditLog.objects.create(
        action=AuditLog.Action.LOGIN_FAILED,
        metadata={
            "password": "hunter2",
            "nested": {"refresh_token": "abc", "ok": "visible"},
            "otp_code": "123456",
            "note": "fine",
        },
    )
    text = client.get(f"{A}/audit/?action=login_failed").content.decode()
    assert "hunter2" not in text and "abc" not in text and "123456" not in text
    assert "visible" in text and "fine" in text
    old = client.get("/api/audit/").content.decode()
    assert "hunter2" not in old


@pytest.mark.django_db
def test_audit_csv_is_audited_and_safe(admin):
    client, _ = admin
    AuditLog.objects.create(action=AuditLog.Action.LOGIN_FAILED, email="=cmd@example.com")
    response = client.get(f"{A}/audit/export/")
    assert response.status_code == 200 and response["Content-Type"].startswith("text/csv")
    text = response.content.decode()
    assert "'=cmd@example.com" in text
    assert AuditLog.objects.filter(action=AuditLog.Action.AUDIT_EXPORTED).count() == 1


# --- failed sign-ins and locks ----------------------------------------------------------------


@pytest.mark.django_db
def test_security_overview_and_unlock(admin):
    client, me = admin
    for _ in range(5):
        lockout.record_failure("victim@example.com", "1.2.3.4")
    LoginAttempt.objects.create(email="old@example.com", succeeded=False)
    LoginAttempt.objects.filter(email="old@example.com").update(
        created_at=timezone.now() - timedelta(days=9)
    )
    body = client.get(f"{A}/security/").json()
    assert body["failed_7d"] == 5
    assert body["top_emails"][0] == {"email": "victim@example.com", "count": 5}
    assert [lk["email"] for lk in body["locks"]] == ["victim@example.com"]
    assert (
        call(client, "post", f"{A}/security/unlock/", {"email": "nobody@e.com"}).status_code == 400
    )
    response = call(client, "post", f"{A}/security/unlock/", {"email": "victim@example.com"})
    assert response.status_code == 200
    assert not LoginLock.objects.exists()
    assert AuditLog.objects.filter(
        action=AuditLog.Action.LOCK_CLEARED, actor=me, email="victim@example.com"
    ).exists()


# --- staff sessions ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_sessions_list_staff_only_and_mark_mine(admin, make_user, logged_in):
    client, me = admin
    desk_client, desk = logged_in("receptionist")
    logged_in("customer")
    rows = client.get(f"{A}/security/sessions/").json()
    assert {r["role"] for r in rows} == {"admin", "receptionist"}
    assert [r["email"] for r in rows if r["current"]] == [me.email]
    assert "token" not in json.dumps(rows).lower().replace("signed_in_at", "")


@pytest.mark.django_db
def test_revoking_a_session_stops_refresh_and_closes_the_work_session(admin, logged_in):
    client, me = admin
    desk_client, desk = logged_in("receptionist")
    assert WorkSession.objects.filter(user=desk, ended_at__isnull=True).exists()
    rows = client.get(f"{A}/security/sessions/").json()
    target = next(r for r in rows if r["email"] == desk.email)
    response = call(client, "post", f"{A}/security/sessions/{target['id']}/revoke/")
    assert response.status_code == 200
    assert BlacklistedToken.objects.filter(token__jti=target["id"]).exists()
    assert not WorkSession.objects.filter(user=desk, ended_at__isnull=True).exists()
    assert desk_client.get("/api/auth/me/").status_code in (401, 403)
    assert desk_client.post("/api/auth/refresh/").status_code == 401
    assert AuditLog.objects.filter(action=AuditLog.Action.SESSION_REVOKED, target=desk).exists()
    again = call(client, "post", f"{A}/security/sessions/{target['id']}/revoke/")
    assert again.status_code == 404


@pytest.mark.django_db
def test_admin_cannot_revoke_their_own_session(admin):
    client, me = admin
    mine = next(r for r in client.get(f"{A}/security/sessions/").json() if r["current"])
    assert call(client, "post", f"{A}/security/sessions/{mine['id']}/revoke/").status_code == 400
    assert not BlacklistedToken.objects.exists()
    assert client.get("/api/auth/me/").status_code == 200


# --- every admin endpoint refuses everyone else -----------------------------------------------

SAMPLES = {"uuid": "11111111-1111-1111-1111-111111111111", "int": "1", "slug": "x", "str": "x"}


def _admin_routes():
    out = []

    def walk(patterns, prefix):
        for p in patterns:
            text = prefix + str(p.pattern)
            if isinstance(p, URLResolver):
                walk(p.url_patterns, text)
            elif isinstance(p, URLPattern) and text.startswith("api/admin/"):
                out.append((text, p))

    walk(get_resolver().url_patterns, "")
    return out


def _fill(text: str) -> str:
    import re

    return "/" + re.sub(r"<(?:(\w+):)?\w+>", lambda m: SAMPLES.get(m.group(1) or "str", "x"), text)


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist", None])
def test_every_admin_endpoint_refuses_every_other_role(logged_in, role):
    routes = _admin_routes()
    assert len(routes) > 30
    client = logged_in(role)[0] if role else Client()
    expected = 403 if role else 401
    for text, _ in routes:
        url = _fill(text)
        for method in ("get", "post", "patch", "put", "delete"):
            response = call(client, method, url, {})
            assert response.status_code in (expected, 405), (method, url, response.status_code)
