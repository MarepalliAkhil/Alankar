"""The "For Zenotians" page content (Task 9): validation, the public view of it, and the helpers the
admin editor shares. The data lives in the SiteContent block "zenotians" (draft, preview, publish,
audit: see content_admin.py); nothing on the page is hard-coded in the front end.

Rules enforced here, on the server:
- plain text only (no HTML is ever rendered), links are http(s) only (or a site path for files);
- a contact field is shown publicly only when its "public" switch is on; the public endpoint
  removes every other field before sending (the phone number is off by default);
- demo logins must use a reserved example domain, so a real credential cannot be published;
- the "Public information from Zenoti" facts each carry a source link and a last-checked date.
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


class MappingRow(serializers.Serializer):
    workflow = text(120)
    built = text(600)
    not_built = text(600)


class Decision(serializers.Serializer):
    title = text(120)
    body = text(700)
    where = lines(6, 160)


class FlowRole(serializers.Serializer):
    role = text(60)
    data_in = lines(8, 160)
    today = lines(8, 200)
    future = lines(8, 200)
    guardrails = lines(8, 200)


class Vision(serializers.Serializer):
    intro = text(800)
    roles = FlowRole(many=True, max_length=6, required=False, default=list)
    overview_note = text(400)


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
    vision = Vision(required=False, default=dict)
    demo = Demo(required=False, default=dict)


def public_view(value: dict | None) -> dict:
    """What the public may see: contact fields whose switch is off are removed here, so a hidden
    phone number never reaches the browser."""
    if not value:
        return {}
    shown = dict(value)
    resume = dict(shown.get("resume") or {})
    resume["contacts"] = [c for c in resume.get("contacts") or [] if c.get("public")]
    shown["resume"] = resume
    return shown


def published() -> dict:
    return public_view(content(BLOCK_KEY, {}))
