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


# --------------------------------------------------------------------------- Task 16


def _strings(node, path=""):
    """Every text in the seed, with where it sits, leaving out the owner's resume."""
    if isinstance(node, dict):
        for key, value in node.items():
            if path == "" and key in ("resume", "zenoti", "demo"):
                continue
            yield from _strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _strings(value, f"{path}[{index}]")
    elif isinstance(node, str):
        yield path, node


def _pointers(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "where" and isinstance(value, list):
                yield from value
            else:
                yield from _pointers(value)
    elif isinstance(node, list):
        for value in node:
            yield from _pointers(value)


def test_the_future_vision_section_is_gone(client, db):
    from website.models import SiteContent
    from website.zenotians import ZenotiansSerializer

    assert "vision" not in SEED
    assert "vision" not in ZenotiansSerializer().fields
    # Content stored before Task 16 still has it; the public never receives it.
    SiteContent.objects.filter(key="zenotians").update(value={**SEED, "vision": {"intro": "x"}})
    assert "vision" not in client.get(PUBLIC).json()


def test_no_planned_or_future_wording_and_ai_only_as_a_denial():
    import re

    banned = re.compile(r"\b(planned|future|roadmap|coming soon|to be built|will be added)\b", re.I)
    for where, text in _strings(SEED):
        assert not banned.search(text), (where, text)
        for _hit in re.finditer(r"\bAI\b", text):
            assert re.search(r"\bno AI\b", text, re.I), (where, text)


def test_every_code_pointer_is_a_real_file():
    from pathlib import Path

    from django.conf import settings

    root = Path(settings.BASE_DIR).parent
    pointers = set(_pointers(SEED))
    assert len(pointers) > 40
    missing = sorted(p for p in pointers if not (root / p.strip()).exists())
    assert missing == []


def test_every_mapping_row_points_at_real_limitations():
    ids = {item["id"] for item in SEED["limitations"]["items"]}
    assert len(ids) == len(SEED["limitations"]["items"])
    for row in SEED["mapping"]:
        assert set(row["limits"]) <= ids, row["workflow"]
        # A row says something in its third column, from a limitation or from its own text.
        assert row["limits"] or row["not_built"], row["workflow"]


def test_the_server_refuses_a_mapping_row_that_points_nowhere(admin):
    bad = [{"workflow": "Online booking", "built": "x", "limits": ["no-such-limit"]}]
    response = draft(admin, mapping=bad)
    assert response.status_code == 400
    assert "no-such-limit" in json.dumps(response.json())


def test_limitation_ids_must_be_unique_and_a_hit_count_cannot_exceed_its_total(admin):
    items = SEED["limitations"]["items"]
    twice = {**SEED["limitations"], "items": [items[0], items[0]]}
    assert draft(admin, limitations=twice, mapping=[]).status_code == 400
    quality = copy.deepcopy(SEED["quality"])
    quality["accuracy"][0]["hits"] = quality["accuracy"][0]["total"] + 1
    assert draft(admin, quality=quality).status_code == 400


def test_the_seed_page_is_valid_and_every_new_section_is_public(client, db):
    data = client.get(PUBLIC).json()
    for key in ("story", "quality", "security", "limitations", "questions"):
        assert data[key], key
    assert len(data["story"]["chapters"]) == 7
    assert [c["name"] for c in data["story"]["characters"]] == [
        "Priya",
        "Rahul",
        "Meera",
        "Suresh",
    ]
    assert 10 <= len(data["questions"]["items"]) <= 12
    assert 5 <= len(data["decisions"]) <= 7
    assert all(d["where"] for d in data["decisions"])
    assert all(c["behind"] and c["where"] for c in data["story"]["chapters"])


def _migration():
    import importlib

    return importlib.import_module("website.migrations.0004_zenotians_task16")


def test_the_upgrade_keeps_the_admins_edits_and_replaces_untouched_text():
    from website.migrations import _zenotians_v1 as old

    migration = _migration()
    stored = {
        "overview": {**old.OVERVIEW, "headline": "My own headline"},
        "project": dict(old.PROJECT),
        "mapping": copy.deepcopy(old.MAPPING),
        "decisions": copy.deepcopy(old.DECISIONS),
        "vision": {"intro": "old"},
    }
    stored["decisions"][0]["title"] = "Edited by the admin"
    value, changed = migration._upgrade(stored)
    assert changed
    assert "vision" not in value
    assert value["overview"]["headline"] == "My own headline"
    assert value["overview"]["start_here"] == SEED["overview"]["start_here"]
    assert value["mapping"] == SEED["mapping"]
    assert value["decisions"][0]["title"] == "Edited by the admin"  # edited: left alone
    for key in ("story", "quality", "security", "limitations", "questions"):
        assert value[key] == SEED[key]
    again, changed_again = migration._upgrade(value)
    assert again == value and not changed_again


def test_the_upgrade_leaves_an_edited_mapping_alone():
    from website.migrations import _zenotians_v1 as old

    migration = _migration()
    mapping = copy.deepcopy(old.MAPPING)
    mapping[0]["built"] = "My words"
    value, _ = migration._upgrade({"overview": dict(old.OVERVIEW), "mapping": mapping})
    assert value["mapping"] == mapping
