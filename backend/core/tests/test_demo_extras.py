"""seed_demo_extras is ADD-ONLY: proof on a database that already holds the demo data.

Every existing row of every table is fingerprinted before the command runs twice. Afterwards no
existing row changed or disappeared (except the invoice numbering counter, which must move forward,
and the derived recommendation tables, which build_recommendations rebuilds from history), the
second run added nothing, and remove_demo_extras deletes only the rows the command added.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from io import StringIO
from unittest import mock

import pytest
from django.apps import apps
from django.core.management import call_command

from core import demo, demo_extras, demo_story
from core.models import DemoExtra
from marketing.models import Coupon

# Rows that are allowed to change: a numbering counter, and the derived recommendation tables.
MAY_CHANGE = {
    "billing.invoicesequence",
    "recommendations.servicepair",
    "recommendations.servicestat",
    "recommendations.snapshot",
}


def fingerprint() -> dict[str, dict[str, str]]:
    out = {}
    for model in apps.get_models():
        if not model._meta.managed or model._meta.proxy:
            continue
        rows = {}
        for row in model._default_manager.all().values():
            pk = str(row[model._meta.pk.attname])
            text = json.dumps(row, default=str, sort_keys=True)
            rows[pk] = hashlib.sha1(text.encode()).hexdigest()
        out[model._meta.label_lower] = rows
    return out


def changed_or_gone(before, after) -> dict:
    bad = {}
    for label, rows in before.items():
        if label in MAY_CHANGE:
            continue
        now = after.get(label, {})
        diff = [pk for pk, h in rows.items() if now.get(pk) != h]
        if diff:
            bad[label] = diff[:5]
    return bad


@pytest.fixture
def demo_db(db):
    call_command("seed_demo", verbosity=0)
    with mock.patch.object(demo_story, "HISTORY_DAYS", 4):
        demo_story.build(write=lambda *_: None)
    demo.ensure_air_cover()
    demo.ensure_demo_coupons()


def run(*args) -> str:
    out = StringIO()
    call_command("seed_demo_extras", *args, stdout=out)
    return out.getvalue()


def test_add_only_idempotent_and_removable(demo_db):
    before = fingerprint()

    text = run("--dry-run")
    assert "Nothing was saved" in text
    assert fingerprint() == before  # a dry run writes nothing at all

    run()
    first = fingerprint()
    assert changed_or_gone(before, first) == {}
    added = sum(len(set(rows) - set(before.get(label, {}))) for label, rows in first.items())
    assert added > 300
    assert Coupon.objects.filter(code__startswith="XTRA").count() == 6
    for short, *_ in demo_extras.CUSTOMERS:
        assert DemoExtra.objects.filter(
            label="accounts.user",
            object_pk__in=[
                str(pk)
                for pk in apps.get_model("accounts.user")
                .objects.filter(email=demo_extras.email(short))
                .values_list("pk", flat=True)
            ],
        ).exists()

    assert "Nothing to add" in run()
    assert fingerprint() == first  # the second run changes nothing

    report = StringIO()
    call_command("seed_demo_extras", "--report", stdout=report)
    assert "customers" in report.getvalue()

    call_command("remove_demo_extras", "--yes", stdout=StringIO())
    after = fingerprint()
    assert changed_or_gone(before, after) == {}
    assert not DemoExtra.objects.exists()
    for label, rows in after.items():
        if label in MAY_CHANGE or label in {"accounts.auditlog"}:
            continue  # the add and remove steps are themselves audited
        extra = set(rows) - set(before.get(label, {}))
        assert not extra, (label, len(extra))


def test_it_refuses_without_the_demo_data(db):
    with pytest.raises(Exception, match="demo"):
        run()


def test_the_command_never_resets_deletes_or_updates_on_its_own():
    source = inspect.getsource(demo_extras).replace(demo_extras.__doc__ or "", "")
    seeding = source.split("def remove(")[0]  # everything except the remove command
    assert "reset_demo" not in seeding
    assert ".delete(" not in seeding
    assert ".update(" not in seeding
    assert "raw(" not in seeding and "cursor(" not in seeding
    # The customers use the reserved test domain; demo phone numbers start with 90000.
    for short, _name, phone, _story in demo_extras.CUSTOMERS:
        assert demo_extras.email(short).endswith("@alankar.test")
        assert phone.startswith("90000")
