from django.db import migrations

NEW_SECTIONS = ("story", "quality", "security", "limitations", "questions")


def _upgrade(value):
    """Brings a stored For Zenotians page up to Task 16 without touching the admin's own edits.
    A section is replaced only while it is still exactly the old starting text."""
    from website.migrations import _zenotians_v1 as old
    from website.zenotians_seed import SEED as new

    if not isinstance(value, dict) or "overview" not in value:
        return value, False
    value = dict(value)
    changed = False
    if "vision" in value:  # the "Future vision" section is gone
        del value["vision"]
        changed = True
    for key in NEW_SECTIONS:
        if key not in value:
            value[key] = new[key]
            changed = True

    def swap(section, field, previous, current):
        nonlocal changed
        block = dict(value.get(section) or {})
        if previous != current and block.get(field) == previous:
            block[field] = current
            value[section] = block
            changed = True

    swap("overview", "intro", old.OVERVIEW["intro"], new["overview"]["intro"])
    swap("overview", "start_here", old.OVERVIEW["start_here"], new["overview"]["start_here"])
    for field in ("intro", "roles", "stack", "security"):
        swap("project", field, old.PROJECT[field], new["project"][field])
    if value.get("mapping") == old.MAPPING and old.MAPPING != new["mapping"]:
        value["mapping"] = new["mapping"]
        changed = True
    if value.get("decisions") == old.DECISIONS and old.DECISIONS != new["decisions"]:
        value["decisions"] = new["decisions"]
        changed = True
    return value, changed


def upgrade(apps, schema_editor):
    SiteContent = apps.get_model("website", "SiteContent")
    row = SiteContent.objects.filter(key="zenotians").first()
    if row is None:
        return
    value, changed = _upgrade(row.value)
    if changed:
        row.value = value
    draft, draft_changed = _upgrade(row.draft)
    if draft_changed:
        row.draft = draft
    if changed or draft_changed:
        row.save()


class Migration(migrations.Migration):
    dependencies = [("website", "0003_seed_zenotians")]
    operations = [migrations.RunPython(upgrade, migrations.RunPython.noop)]
