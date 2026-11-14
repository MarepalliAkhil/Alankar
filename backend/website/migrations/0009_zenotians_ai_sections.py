"""For Zenotians: the chatbot limitation now says the admin assistant is planned future work.

Only text that still matches the old seed word for word is replaced; anything the admin wrote is
left alone. (The AIR and AI Alankar Intelligence sections themselves are part of the page, not of
the stored content.)
"""

from django.db import migrations

OLD = (
    "There is no admin assistant: the admin side has shop statistics, the AIR Activity page and a "
    "list of questions the bot could not answer."
)
NEW = (
    'The admin assistant, "Alankar Intelligence", is planned future work and is not built: the '
    "admin side has shop statistics, the AIR Activity page and a list of questions the bot could "
    "not answer."
)


def _upgrade(value):
    if not isinstance(value, dict):
        return value, False
    limitations = value.get("limitations")
    if not isinstance(limitations, dict):
        return value, False
    changed = False
    items = []
    for item in limitations.get("items") or []:
        if (
            isinstance(item, dict)
            and item.get("id") == "chatbot"
            and isinstance(item.get("out_of_scope"), str)
            and OLD in item["out_of_scope"]
        ):
            item = {**item, "out_of_scope": item["out_of_scope"].replace(OLD, NEW)}
            changed = True
        items.append(item)
    if not changed:
        return value, False
    return {**value, "limitations": {**limitations, "items": items}}, True


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
    dependencies = [("website", "0008_zenotians_air")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
