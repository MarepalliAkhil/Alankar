"""For Zenotians: add the "Personal recommendations" and "Personal emails" mapping rows once.

Rows the admin already has (same workflow name) are left alone.
"""

from django.db import migrations

NEW_ROWS = ("Personal recommendations", "Personal emails")


def _upgrade(value):
    from website.zenotians_seed import MAPPING

    if not isinstance(value, dict) or not isinstance(value.get("mapping"), list):
        return value, False
    mapping = list(value["mapping"])
    have = {r.get("workflow") for r in mapping if isinstance(r, dict)}
    added = [r for r in MAPPING if r["workflow"] in NEW_ROWS and r["workflow"] not in have]
    if not added:
        return value, False
    return {**value, "mapping": [*mapping, *added]}, True


def forwards(apps, schema_editor):
    SiteContent = apps.get_model("website", "SiteContent")
    row = SiteContent.objects.filter(key="zenotians").first()
    if row is None:
        return
    value, changed = _upgrade(row.value)
    draft, draft_changed = _upgrade(row.draft)
    if changed:
        row.value = value
    if draft_changed:
        row.draft = draft
    if changed or draft_changed:
        row.save()


class Migration(migrations.Migration):
    dependencies = [("website", "0009_zenotians_ai_sections")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
