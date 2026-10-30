"""Task 9: the For Zenotians page content. Public read, admin-only edit, server-side validation,
a hidden phone number never leaves the server, and every change is audited."""

import copy
import json

import pytest
from django.core.management import call_command

from accounts.models import AuditLog
from website.zenotians_seed import SEED

BASE = "/api/admin/content/zenotians/"
PUBLIC = "/api/public/zenotians/"


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
    return logged_in("admin")[0]


def draft(admin, **changes):
    body = copy.deepcopy(SEED)
    for key, value in changes.items():
        body[key] = value
    return call(admin, "put", BASE, body)


def test_the_page_is_seeded_and_public(client, db):
    data = client.get(PUBLIC).json()
    assert data["overview"]["headline"].startswith("Built for Zenotians")
    assert data["resume"]["name"] == "AKHIL MAREPALLI"
    assert len(data["resume"]["projects"]) == 3
    assert [e["school"] for e in data["resume"]["education"]][0] == "KL University"


def test_the_phone_number_is_hidden_by_default_and_never_sent(client, db):
    data = client.get(PUBLIC).json()
    keys = [c["key"] for c in data["resume"]["contacts"]]
    assert keys == ["email", "linkedin", "github", "portfolio"]
    assert "9063946939" not in json.dumps(data)


def test_a_phone_switched_on_is_shown(admin, client):
    body = copy.deepcopy(SEED["resume"])
    for contact in body["contacts"]:
        if contact["key"] == "phone":
            contact["public"] = True
    assert draft(admin, resume=body).status_code == 200
    call(admin, "post", BASE)
    keys = [c["key"] for c in client.get(PUBLIC).json()["resume"]["contacts"]]
    assert "phone" in keys


def test_the_todo_items_from_the_resume_are_not_published(client, db):
    resume = client.get(PUBLIC).json()["resume"]
    wand, fraud, _ = resume["projects"]
    assert wand["tech"] == "" and wand["outcome"] == ""
    assert fraud["tech"] == "Python" and fraud["outcome"] == ""
    assert next(e for e in resume["education"] if "Junior" in e["school"])["result"] == "Marks 944"


def test_a_draft_is_private_until_published_and_audited(admin, client):
    changed = copy.deepcopy(SEED["overview"])
    changed["github_url"] = "https://github.com/example/repo"
    assert draft(admin, overview=changed).status_code == 200
    assert client.get(PUBLIC).json()["overview"]["github_url"] == ""
    preview = call(admin, "get", "/api/admin/content/preview/").json()
    assert preview["zenotians"]["overview"]["github_url"].endswith("/example/repo")
    assert call(admin, "post", BASE).status_code == 200
    assert client.get(PUBLIC).json()["overview"]["github_url"].endswith("/example/repo")
    steps = AuditLog.objects.filter(metadata__block="zenotians").count()
    assert steps >= 2


def test_an_unpublished_page_returns_nothing(admin, client):
    assert call(admin, "post", "/api/admin/content/zenotians/unpublish/").status_code == 200
    assert client.get(PUBLIC).json() == {}


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
def test_only_the_admin_can_edit(logged_in, db, role):
    other = logged_in(role)[0]
    assert call(other, "get", "/api/admin/content/").status_code == 403
    assert call(other, "put", BASE, SEED).status_code == 403
    assert call(other, "post", BASE).status_code == 403
    assert call(other, "post", BASE + "unpublish/").status_code == 403


def test_a_guest_cannot_edit(client, db):
    assert call(client, "put", BASE, SEED).status_code in (401, 403)


@pytest.mark.parametrize(
    "link", ["javascript:alert(1)", "data:text/html,x", "//evil.example", "ftp://x.example"]
)
def test_links_must_be_http_or_a_site_path(admin, link):
    overview = {**SEED["overview"], "demo_url": link}
    assert draft(admin, overview=overview).status_code == 400


def test_demo_logins_must_use_an_example_domain(admin):
    real = {"logins": [{"role": "admin", "email": "me@gmail.com", "password": "x"}], "guide": []}
    assert draft(admin, demo=real).status_code == 400
    fine = {
        "logins": [{"role": "admin", "email": "owner@demo.example.com", "password": "x"}],
        "guide": ["Book as the customer."],
    }
    assert draft(admin, demo=fine).status_code == 200
    bad_role = {"logins": [{"role": "root", "email": "a@example.com", "password": "x"}]}
    assert draft(admin, demo=bad_role).status_code == 400


def test_contact_values_are_checked(admin):
    resume = copy.deepcopy(SEED["resume"])
    resume["contacts"][0]["value"] = "not-an-email"
    assert draft(admin, resume=resume).status_code == 400
    resume = copy.deepcopy(SEED["resume"])
    resume["contacts"][1]["value"] = "javascript:1"
    assert draft(admin, resume=resume).status_code == 400


def test_html_is_stored_as_plain_text(admin, client):
    overview = {**SEED["overview"], "intro": "<script>alert(1)</script> Hello"}
    assert draft(admin, overview=overview).status_code == 200
    call(admin, "post", BASE)
    assert "<script>" in client.get(PUBLIC).json()["overview"]["intro"]  # the page renders text


def test_zenoti_facts_carry_sources_and_a_date(client, db):
    zenoti = client.get(PUBLIC).json()["zenoti"]
    assert zenoti["last_checked"] == "2026-10-30"
    for key in (
        "founded_source",
        "customers_source",
        "leadership_source",
        "offices_source",
        "investors_source",
    ):
        assert zenoti[key].startswith("https://")
    assert zenoti["founded_year"] == 2010
    assert len(zenoti["leadership"]) == 9


def test_seed_demo_restores_the_page_but_never_overwrites_edits(client, db):
    from website.models import SiteContent

    SiteContent.objects.filter(key="zenotians").delete()
    assert client.get(PUBLIC).json() == {}
    call_command("seed_demo")
    assert client.get(PUBLIC).json()["resume"]["name"] == "AKHIL MAREPALLI"
    SiteContent.objects.filter(key="zenotians").update(value={"overview": {"headline": "Mine"}})
    call_command("seed_demo")
    assert client.get(PUBLIC).json()["overview"]["headline"] == "Mine"
