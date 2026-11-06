"""The "For Zenotians" page content (Task 9): validation, the public view of it, and the helpers the
admin editor shares. The data lives in the SiteContent block "zenotians" (draft, preview, publish,
audit: see content_admin.py); nothing on the page is hard-coded in the front end.

Rules enforced here, on the server:
- plain text only (no HTML is ever rendered), links are http(s) only (or a site path for files);
- a contact field is shown publicly only when its "public" switch is on; the public endpoint
  removes every other field before sending (the phone number is off by default);
- demo logins must use a reserved example domain, so a real credential cannot be published;
- the "Public information from Zenoti" facts each carry a source link and a last-checked date;
- every row of "How it maps to Zenoti" points at Limitations items by id, and the ids must exist, so
  the two lists can never disagree or dangle (Task 16).
"""

from __future__ import annotations

import re

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from website.content import content

BLOCK_KEY = "zenotians"
CONTACT_KEYS = ("email", "linkedin", "github", "portfolio", "phone")
DEMO_ROLES = ("customer", "receptionist", "stylist", "admin")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}$")


class Link(serializers.CharField):
    """An http(s) address, or a site path such as /files/resume.pdf. Blank hides the item."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 300)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        text = super().to_internal_value(data).strip()
        if not text:
            return ""
        if text.startswith("/") and not text.startswith("//"):
            return text
        if text.startswith(("https://", "http://")):
            serializers.URLField().run_validation(text)
            return text
        raise ValidationError("Use a full https:// link or a path that starts with /.")


def text(max_length=400, **kwargs):
    kwargs.setdefault("allow_blank", True)
    kwargs.setdefault("required", False)
    return serializers.CharField(max_length=max_length, trim_whitespace=True, **kwargs)


def lines(max_items=12, max_length=500):
    return serializers.ListField(
        child=serializers.CharField(max_length=max_length),
        max_length=max_items,
        required=False,
        default=list,
    )


class Overview(serializers.Serializer):
    headline = text(160)
    intro = text(1500)
    start_here = lines(8, 300)
    demo_url = Link()
    github_url = Link()
    resume_pdf_url = Link()


class Contact(serializers.Serializer):
    key = serializers.ChoiceField(choices=CONTACT_KEYS)
    label = text(40)
    value = serializers.CharField(max_length=200)
    public = serializers.BooleanField(default=False)

    def validate(self, attrs):
        key, value = attrs["key"], attrs["value"].strip()
        attrs["value"] = value
        if key == "email" and not _EMAIL.match(value):
            raise ValidationError({"value": "Enter a valid email address."})
        if key == "phone" and not _PHONE.match(value):
            raise ValidationError({"value": "Enter a valid phone number."})
        if key in ("linkedin", "github", "portfolio"):
            Link(allow_blank=False).run_validation(value)
            if value.startswith("/"):
                raise ValidationError({"value": "Use a full https:// link."})
        return attrs


class Education(serializers.Serializer):
    school = text(160)
    place = text(120)
    period = text(60)
    program = text(160)
    result = text(120)


class Project(serializers.Serializer):
    title = text(160)
    url = Link()
    tech = text(240)
    note = text(120)
    bullets = lines(8, 400)
    outcome = text(400)


class Experience(serializers.Serializer):
    role = text(160)
    org = text(160)
    period = text(60)
    bullets = lines(8, 400)


class SkillGroup(serializers.Serializer):
    group = text(80)
    items = lines(24, 60)


class Certification(serializers.Serializer):
    title = text(160)
    detail = text(160)
    url = Link()


class Achievement(serializers.Serializer):
    title = text(160)
    detail = text(300)


class Resume(serializers.Serializer):
    name = text(80)
    location = text(80)
    contacts = Contact(many=True, max_length=8, required=False, default=list)
    summary = text(1500)
    education = Education(many=True, max_length=8, required=False, default=list)
    projects = Project(many=True, max_length=12, required=False, default=list)
    experience = Experience(many=True, max_length=12, required=False, default=list)
    skills = SkillGroup(many=True, max_length=12, required=False, default=list)
    certifications = Certification(many=True, max_length=16, required=False, default=list)
    achievements = Achievement(many=True, max_length=12, required=False, default=list)
    pdf_url = Link()


class Person(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=120)


class Zenoti(serializers.Serializer):
    label = text(120)
    last_checked = serializers.DateField(required=False, allow_null=True, default=None)
    founded_year = serializers.IntegerField(
        min_value=1900, max_value=2100, required=False, allow_null=True, default=None
    )
    founded_text = text(400)
    founded_source = Link()
    customers_text = text(300)
    customers_note = text(300)
    customers_source = Link()
    leadership = Person(many=True, max_length=20, required=False, default=list)
    leadership_source = Link()
    offices = lines(20, 80)
    offices_source = Link()
    investors = lines(20, 80)
    investors_source = Link()


class Role(serializers.Serializer):
    role = text(60)
    does = lines(10, 300)


class StackRow(serializers.Serializer):
    layer = text(60)
    items = lines(14, 80)


class ProjectInfo(serializers.Serializer):
    intro = text(1500)
    roles = Role(many=True, max_length=6, required=False, default=list)
    stack = StackRow(many=True, max_length=10, required=False, default=list)
    security = lines(12, 300)


SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


class MappingRow(serializers.Serializer):
    workflow = text(120)
    built = text(600)
    # Ids of Limitations items. The page shows their "out of scope" text in the third column, so
    # the mapping table and the Limitations page are one source. `not_built` is only a fallback
    # for a row with no limitation behind it.
    limits = lines(6, 40)
    not_built = text(600)


class Decision(serializers.Serializer):
    title = text(120)
    body = text(700)
    where = lines(6, 160)


STORY_VISUALS = ("request", "approval", "twist", "pay", "visit", "rating", "dashboard")


class Character(serializers.Serializer):
    name = text(40)
    role = text(60)
    line = text(200)


class Chapter(serializers.Serializer):
    visual = serializers.ChoiceField(choices=STORY_VISUALS)
    title = text(120)
    body = text(900)
    behind = text(600)
    where = lines(6, 160)


class Story(serializers.Serializer):
    """ "A day at Alankar": made-up characters, seven short chapters, each with a code pointer."""

    intro = text(600)
    note = text(300)
    characters = Character(many=True, max_length=6, required=False, default=list)
    chapters = Chapter(many=True, max_length=10, required=False, default=list)


class Measure(serializers.Serializer):
    """One measured number. The page shows hits out of total, the date and how it was measured."""

    name = text(120)
    hits = serializers.IntegerField(min_value=0)
    total = serializers.IntegerField(min_value=1)
    measured_on = serializers.DateField(required=False, allow_null=True, default=None)
    how = text(400)
    caveat = text(500)
    where = lines(6, 160)

    def validate(self, attrs):
        if attrs["hits"] > attrs["total"]:
            raise ValidationError({"hits": "Cannot be more than the total."})
        return attrs


class Check(serializers.Serializer):
    title = text(120)
    detail = text(600)
    where = lines(6, 160)


class Quality(serializers.Serializer):
    intro = text(600)
    accuracy = Measure(many=True, max_length=6, required=False, default=list)
    checks = Check(many=True, max_length=12, required=False, default=list)
    verify_note = text(400)


class Notes(serializers.Serializer):
    """A titled list of notes with code pointers (Security and privacy)."""

    intro = text(600)
    items = Decision(many=True, max_length=14, required=False, default=list)


class Limit(serializers.Serializer):
    id = serializers.RegexField(SLUG, max_length=40)
    area = text(120)
    today = text(900)
    out_of_scope = text(900)
    where = lines(6, 160)


class Limitations(serializers.Serializer):
    intro = text(600)
    items = Limit(many=True, max_length=30, required=False, default=list)


class Question(serializers.Serializer):
    q = text(200)
    a = text(1200)
    where = lines(6, 160)


class Questions(serializers.Serializer):
    intro = text(600)
    items = Question(many=True, max_length=20, required=False, default=list)


class DemoLogin(serializers.Serializer):
    role = serializers.ChoiceField(choices=DEMO_ROLES)
    email = serializers.EmailField(max_length=120)
    password = serializers.CharField(max_length=80)

    def validate_email(self, value):
        domain = value.rsplit("@", 1)[-1].lower()
        if not (domain == "example.com" or domain.endswith(".example.com")):
            raise ValidationError(
                "Demo logins must use an example.com address, never a real account."
            )
        return value


class Demo(serializers.Serializer):
    logins = DemoLogin(many=True, max_length=8, required=False, default=list)
    guide = lines(10, 300)


class ZenotiansSerializer(serializers.Serializer):
    overview = Overview(required=False, default=dict)
    resume = Resume(required=False, default=dict)
    zenoti = Zenoti(required=False, default=dict)
    project = ProjectInfo(required=False, default=dict)
    mapping = MappingRow(many=True, max_length=20, required=False, default=list)
    decisions = Decision(many=True, max_length=10, required=False, default=list)
    story = Story(required=False, default=dict)
    quality = Quality(required=False, default=dict)
    security = Notes(required=False, default=dict)
    limitations = Limitations(required=False, default=dict)
    questions = Questions(required=False, default=dict)
    demo = Demo(required=False, default=dict)

    def validate(self, attrs):
        items = (attrs.get("limitations") or {}).get("items") or []
        ids = [item["id"] for item in items]
        if len(ids) != len(set(ids)):
            raise ValidationError({"limitations": "Each limitation needs its own id."})
        for index, row in enumerate(attrs.get("mapping") or []):
            unknown = [i for i in row.get("limits") or [] if i not in ids]
            if unknown:
                raise ValidationError(
                    {"mapping": f"Row {index + 1} points at unknown limitation: {unknown[0]}."}
                )
        return attrs


def public_view(value: dict | None) -> dict:
    """What the public may see: contact fields whose switch is off are removed here, so a hidden
    phone number never reaches the browser."""
    if not value:
        return {}
    shown = {k: v for k, v in value.items() if k != "vision"}  # retired in Task 16
    resume = dict(shown.get("resume") or {})
    resume["contacts"] = [c for c in resume.get("contacts") or [] if c.get("public")]
    shown["resume"] = resume
    return shown


def published() -> dict:
    return public_view(content(BLOCK_KEY, {}))
