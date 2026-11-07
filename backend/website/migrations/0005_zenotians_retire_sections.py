from django.db import migrations

# The start-here lines as the previous version seeded them. Replaced only while unedited.
OLD_START_HERE = [
    "Read A day at Alankar for the whole visit as a short story, or press play for a 90-second tour.",
    "Read The project for the four roles, the booking lifecycle and the tech stack.",
    "Read How it maps to Zenoti for what is built, and what is simplified or left out.",
    "Read Engineering decisions, Quality evidence and Security and privacy for how it was built and checked.",
    "Read Limitations and Questions you might ask me for the honest answers.",
]
NEW_START_HERE = [
    "Read A day at Alankar for the whole visit as a short story, or press play for a 90-second tour.",
    "Read The project for the four roles, the booking lifecycle and the tech stack.",
    "Read How it maps to Zenoti for what is built, and what is simplified or left out.",
    "Read Quality evidence and Security and privacy for how it was built and checked.",
    "Read Limitations for the honest answers.",
]


def _retire(value):
    """Removes the Engineering decisions and Questions sections from a stored page. The text lives
    on in docs/ENGINEERING_DECISIONS.md and docs/QA_PREP.md. Other edits are left alone."""
    if not isinstance(value, dict):
        return value, False
    value = dict(value)
    changed = False
    for key in ("decisions", "questions"):
        if key in value:
            del value[key]
            changed = True
    overview = dict(value.get("overview") or {})
    if overview.get("start_here") == OLD_START_HERE:
        overview["start_here"] = NEW_START_HERE
        value["overview"] = overview
        changed = True
    return value, changed


def retire(apps, schema_editor):
    SiteContent = apps.get_model("website", "SiteContent")
    row = SiteContent.objects.filter(key="zenotians").first()
    if row is None:
        return
    value, changed = _retire(row.value)
    draft, draft_changed = _retire(row.draft)
    if changed:
        row.value = value
    if draft_changed:
        row.draft = draft
    if changed or draft_changed:
        row.save()


class Migration(migrations.Migration):
    dependencies = [("website", "0004_zenotians_task16")]
    operations = [migrations.RunPython(retire, migrations.RunPython.noop)]
