"""Admin Chatbot insights: anonymous data only, admin only, every change audited."""

import json
import logging

import pytest
from django.test import Client

from accounts.models import AuditLog
from chatbot import registry
from chatbot.models import IntentUsage, UnansweredQuestion
from website.models import KnowledgeEntry

BASE = "/api/admin/chatbot"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    kwargs = {"content_type": "application/json"}
    if body is not None:
        kwargs["data"] = json.dumps(body)
    return getattr(client, method)(url, **kwargs, **headers)


@pytest.fixture
def admin(logged_in, demo):
    return logged_in("admin")[0]


@pytest.fixture
def question(db):
    return UnansweredQuestion.objects.create(key="lip tint price", count=4)


def test_admin_sees_unanswered_questions_and_usage(admin, question):
    from datetime import timedelta

    from django.utils import timezone

    IntentUsage.objects.create(
        day=timezone.localdate() - timedelta(days=60), intent="hours", count=3
    )
    IntentUsage.objects.create(day=timezone.localdate(), intent="unknown", count=4)
    IntentUsage.objects.create(day=timezone.localdate(), intent="hours", count=6)
    body = call(admin, "get", f"{BASE}/insights/").json()
    assert body["unanswered"][0]["key"] == "lip tint price" and body["unanswered"][0]["count"] == 4
    usage = {u["intent"]: u["count"] for u in body["usage"]}
    assert usage == {"hours": 6, "unknown": 4}  # the old day is outside the 30-day window
    assert body["total_questions"] == 10 and body["unanswered_questions"] == 4
    # nothing but anonymous keys: no user, session, address or message fields anywhere
    assert set(body["unanswered"][0]) == {"id", "key", "count", "first_seen", "last_seen", "status"}


def test_status_filter(admin, question):
    UnansweredQuestion.objects.create(key="old thing", status="dismissed")
    keys = [
        q["key"]
        for q in call(admin, "get", f"{BASE}/insights/?status=dismissed").json()["unanswered"]
    ]
    assert keys == ["old thing"]


def test_add_as_faq_creates_the_entry_closes_the_row_audits_and_the_bot_learns(admin, question):
    r = call(
        admin,
        "post",
        f"{BASE}/unanswered/{question.pk}/faq/",
        {"question": "Do you sell lip tint?", "answer": "Yes, ask at the front desk."},
    )
    assert r.status_code == 201
    question.refresh_from_db()
    assert question.status == "answered"
    assert KnowledgeEntry.objects.filter(question="Do you sell lip tint?", is_active=True).exists()
    entry = AuditLog.objects.filter(action="chatbot_question_handled").get()
    assert entry.metadata["step"] == "added_as_faq" and entry.metadata["key"] == "lip tint price"
    registry.rebuild()
    reply = registry.get_engine().answer("do you sell lip tint")
    assert "front desk" in reply.text


def test_add_as_faq_validates_and_rejects_unknown_rows(admin, question):
    assert (
        call(
            admin, "post", f"{BASE}/unanswered/{question.pk}/faq/", {"question": "", "answer": ""}
        ).status_code
        == 400
    )
    assert (
        call(
            admin, "post", f"{BASE}/unanswered/99999/faq/", {"question": "q", "answer": "a"}
        ).status_code
        == 404
    )
    assert not KnowledgeEntry.objects.filter(question="q").exists()


def test_dismiss_is_audited(admin, question):
    assert call(admin, "post", f"{BASE}/unanswered/{question.pk}/dismiss/").status_code == 200
    question.refresh_from_db()
    assert question.status == "dismissed"
    assert AuditLog.objects.filter(
        action="chatbot_question_handled", metadata__step="dismissed"
    ).exists()


def test_test_box_answers_as_a_guest_and_logs_nothing(admin, caplog):
    caplog.set_level(logging.DEBUG)
    before = (UnansweredQuestion.objects.count(), IntentUsage.objects.count())
    r = call(admin, "post", f"{BASE}/test/", {"message": "when is my next appointment"})
    assert r.status_code == 200 and r.json()["needs_login"] is True  # no user data, ever
    call(admin, "post", f"{BASE}/test/", {"message": "zzqx flurb wibble"})
    assert (UnansweredQuestion.objects.count(), IntentUsage.objects.count()) == before
    assert "flurb" not in caplog.text
    assert "unanswered_key" not in r.json()


def test_test_box_caps_the_input(admin):
    assert call(admin, "post", f"{BASE}/test/", {"message": "x" * 501}).status_code == 400


@pytest.mark.parametrize("role", ["receptionist", "stylist", "customer"])
def test_other_roles_are_denied_everything(logged_in, question, role):
    client = logged_in(role)[0]
    for method, url, body in [
        ("get", f"{BASE}/insights/", None),
        ("post", f"{BASE}/unanswered/{question.pk}/faq/", {"question": "q", "answer": "a"}),
        ("post", f"{BASE}/unanswered/{question.pk}/dismiss/", None),
        ("post", f"{BASE}/test/", {"message": "hello"}),
    ]:
        assert call(client, method, url, body).status_code == 403, (role, url)
    question.refresh_from_db()
    assert question.status == "open" and not KnowledgeEntry.objects.filter(question="q").exists()


def test_guests_are_denied_everything(question):
    client = Client()
    for method, url, body in [
        ("get", f"{BASE}/insights/", None),
        ("post", f"{BASE}/unanswered/{question.pk}/dismiss/", None),
        ("post", f"{BASE}/test/", {"message": "hello"}),
    ]:
        assert call(client, method, url, body).status_code in (401, 403)


def test_changes_need_csrf(logged_in, question):
    client, _ = logged_in("admin")
    strict = Client(enforce_csrf_checks=True)
    strict.cookies = client.cookies
    r = strict.post(f"{BASE}/unanswered/{question.pk}/dismiss/", content_type="application/json")
    assert r.status_code == 403


def test_services_without_description_are_listed_for_the_admin(admin):
    from scheduling.models import Service

    sv = Service.objects.get(name="Hair Spa")
    sv.description = ""
    sv.save()
    rows = call(admin, "get", f"{BASE}/insights/").json()["services_without_description"]
    assert [r["name"] for r in rows] == ["Hair Spa"]  # the seed describes all the others
    assert set(rows[0]) == {"id", "name", "division"}
    sv.description = "Now described."
    sv.save()
    assert call(admin, "get", f"{BASE}/insights/").json()["services_without_description"] == []
