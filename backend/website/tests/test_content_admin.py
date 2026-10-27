"""Task 5c: the public content editor. Drafts stay private until published; unpublished blocks
and FAQs disappear from the public site; every step is audited."""

import json
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from accounts.models import AuditLog
from website.models import KnowledgeEntry

BASE = "/api/admin/content"
HERO = {"headline": "New headline", "subtitle": "Fresh sub", "image_url": "/media/hero.jpg"}


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in, db):
    call_command("seed_demo")
    return logged_in("admin")


def site(client):
    return client.get("/api/public/site/").json()


def audits(*actions):
    return list(AuditLog.objects.filter(action__in=actions).order_by("-created_at"))


def test_a_draft_is_private_until_it_is_published(admin, client):
    old = site(client)["hero"]["headline"]
    saved = call(admin[0], "put", f"{BASE}/hero/", HERO)
    assert saved.status_code == 200 and saved.json()["has_draft"] is True
    assert site(client)["hero"]["headline"] == old
    preview = call(admin[0], "get", f"{BASE}/preview/").json()
    assert preview["hero"]["headline"] == "New headline"
    done = call(admin[0], "post", f"{BASE}/hero/")
    assert done.status_code == 200 and done.json()["has_draft"] is False
    assert site(client)["hero"]["headline"] == "New headline"
    assert [a.metadata["block"] for a in audits("content_changed", "content_published")] == [
        "hero",
        "hero",
    ]
    nothing = call(admin[0], "post", f"{BASE}/hero/")
    assert nothing.status_code == 400


def test_discarding_a_draft_keeps_the_published_version(admin, client):
    old = site(client)["hero"]["headline"]
    call(admin[0], "put", f"{BASE}/hero/", HERO)
    assert call(admin[0], "delete", f"{BASE}/hero/").status_code == 200
    assert call(admin[0], "get", f"{BASE}/preview/").json()["hero"]["headline"] == old
    assert call(admin[0], "delete", f"{BASE}/hero/").status_code == 400


def test_drafts_are_validated(admin):
    assert call(admin[0], "put", f"{BASE}/hero/", {**HERO, "headline": ""}).status_code == 400
    bad_image = {**HERO, "image_url": "javascript:alert(1)"}
    assert call(admin[0], "put", f"{BASE}/hero/", bad_image).status_code == 400
    assert (
        call(
            admin[0], "put", f"{BASE}/hero/", {**HERO, "image_url": "//evil.example/x"}
        ).status_code
        == 400
    )
    assert call(admin[0], "put", f"{BASE}/contact/", HERO).status_code == 400
    too_many = {"items": [{"text": f"n{i}"} for i in range(6)]}
    assert call(admin[0], "put", f"{BASE}/announcements/", too_many).status_code == 400
    backwards = {"items": [{"text": "x", "starts": "2026-02-02", "ends": "2026-02-01"}]}
    assert call(admin[0], "put", f"{BASE}/announcements/", backwards).status_code == 400


def test_announcements_publish_unpublish_and_dates(admin, client):
    assert site(client)["announcements"] == []
    today = timezone.localdate()
    items = {
        "items": [
            {"text": "Open on Diwali", "link": "/salon"},
            {"text": "Later", "starts": (today + timedelta(days=2)).isoformat()},
            {"text": "Past", "ends": (today - timedelta(days=2)).isoformat()},
        ]
    }
    call(admin[0], "put", f"{BASE}/announcements/", items)
    assert site(client)["announcements"] == []  # still a draft
    call(admin[0], "post", f"{BASE}/announcements/")
    assert [a["text"] for a in site(client)["announcements"]] == ["Open on Diwali"]
    off = call(admin[0], "post", f"{BASE}/announcements/unpublish/")
    assert off.status_code == 200 and off.json()["is_published"] is False
    assert site(client)["announcements"] == []
    assert call(admin[0], "post", f"{BASE}/announcements/unpublish/").status_code == 400
    back = call(admin[0], "post", f"{BASE}/announcements/")
    assert back.status_code == 200 and back.json()["is_published"] is True
    assert [a.metadata["published"] for a in audits("content_published")][:2] == [True, False]


def test_hero_and_about_cannot_be_hidden(admin):
    assert call(admin[0], "post", f"{BASE}/hero/unpublish/").status_code == 400
    assert call(admin[0], "post", f"{BASE}/nothing/unpublish/").status_code == 400


def test_zenotians_sections_are_stored_as_a_draft_first(admin, client):
    sections = {"sections": [{"key": "overview", "title": "Overview", "body": "Hello"}]}
    call(admin[0], "put", f"{BASE}/zenotians/", sections)
    assert not site(client).get("zenotians")
    call(admin[0], "post", f"{BASE}/zenotians/")
    assert site(client)["zenotians"]["sections"][0]["title"] == "Overview"


def test_faqs_are_drafts_until_published_and_feed_the_site(admin, client):
    made = call(
        admin[0],
        "post",
        f"{BASE}/faqs/",
        {"question": "Parking?", "answer": "Yes.", "is_active": False},
    )
    assert made.status_code == 201
    faq_id = made.json()["id"]
    assert "Parking?" not in [f["question"] for f in site(client)["faqs"]]
    assert "Parking?" in [
        f["question"] for f in call(admin[0], "get", f"{BASE}/faqs/").json() for f in [f]
    ]
    live = call(
        admin[0], "patch", f"{BASE}/faqs/{faq_id}/", {"is_active": True, "tags": ["parking"]}
    )
    assert live.status_code == 200
    assert "Parking?" in [f["question"] for f in site(client)["faqs"]]
    call(admin[0], "patch", f"{BASE}/faqs/{faq_id}/", {"is_active": False})
    assert "Parking?" not in [f["question"] for f in site(client)["faqs"]]
    assert call(admin[0], "delete", f"{BASE}/faqs/{faq_id}/").status_code == 204
    assert not KnowledgeEntry.objects.filter(pk=faq_id).exists()
    assert len(audits("content_changed", "content_published")) == 4


def test_achievements_are_edited_in_place(admin, client):
    made = call(
        admin[0],
        "post",
        f"{BASE}/achievements/",
        {"label": "Happy clients", "value": 5000, "suffix": "+"},
    )
    assert made.status_code == 201
    assert site(client)["achievements"][0]["label"] == "Happy clients"
    ach = made.json()["id"]
    assert (
        call(admin[0], "patch", f"{BASE}/achievements/{ach}/", {"is_active": False}).status_code
        == 200
    )
    assert site(client)["achievements"] == []
    assert call(admin[0], "delete", f"{BASE}/achievements/{ach}/").status_code == 204
    assert call(admin[0], "patch", f"{BASE}/achievements/{ach}/", {"value": 1}).status_code == 404


def test_the_list_shows_published_and_draft_side_by_side(admin):
    call(admin[0], "put", f"{BASE}/about/", {"heading": "Our story", "body": "Long ago"})
    rows = {b["key"]: b for b in call(admin[0], "get", f"{BASE}/").json()["blocks"]}
    assert set(rows) == {"hero", "about", "announcements", "zenotians"}
    assert rows["about"]["has_draft"] and rows["about"]["draft"]["heading"] == "Our story"
    assert rows["about"]["published"]["heading"] != "Our story"
    assert rows["announcements"]["can_unpublish"] and not rows["hero"]["can_unpublish"]
