from django.db import migrations


def _upgrade(value):
    """Replaces the old name-and-title leadership list (nine people, no biographies) with the five
    leaders and their short public biographies. A list the admin already rewrote (cards that have
    biographies) is left alone."""
    from website.zenotians_seed import LEADERS

    if not isinstance(value, dict):
        return value, False
    zenoti = value.get("zenoti")
    if not isinstance(zenoti, dict):
        return value, False
    people = zenoti.get("leadership") or []
    if people and all(p.get("bio") for p in people):
        return value, False
    value = dict(value)
    value["zenoti"] = {**zenoti, "leadership": LEADERS}
    return value, True


def upgrade(apps, schema_editor):
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
    dependencies = [("website", "0005_zenotians_retire_sections")]
    operations = [migrations.RunPython(upgrade, migrations.RunPython.noop)]
