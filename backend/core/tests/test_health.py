import pytest
from django.conf import settings

from core import brand, views


@pytest.mark.django_db
def test_health_ok(client):
    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "service": brand.PLATFORM_NAME}


@pytest.mark.django_db
def test_health_reports_database_outage(client, monkeypatch):
    monkeypatch.setattr(views, "database_ok", lambda: False)
    response = client.get("/api/health/")
    assert response.status_code == 503
    assert response.json()["status"] == "degraded"


@pytest.mark.django_db
def test_health_is_read_only(client):
    assert client.post("/api/health/").status_code == 405


@pytest.mark.django_db
def test_unknown_api_route_is_404(client):
    assert client.get("/api/does-not-exist/").status_code == 404


@pytest.mark.django_db
def test_api_docs_follow_setting(client):
    schema = client.get("/api/schema/")
    docs = client.get("/api/docs/")
    if settings.SALON_API_DOCS:
        assert schema.status_code == 200
        assert b"/api/health/" in schema.content
        assert docs.status_code == 200
    else:
        assert schema.status_code == 404
        assert docs.status_code == 404
