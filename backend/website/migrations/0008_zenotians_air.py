"""AIR Task 3: describe AIR on the For Zenotians page in content that is already stored.

Only text that still matches the old seed word for word is replaced; anything the admin wrote is
left alone. New items (the AIR role, the mapping row and the limitation) are added once.
"""

from django.db import migrations

OLD_INTRO_END = "stylist, and the admin reviews payroll, reports and staff performance."
AIR_SENTENCE = (
    " AIR, an optional virtual receptionist that is off by default, can cover the front desk "
    "when no receptionist is on shift or signed in; the stylist still has to accept every request."
)
OLD_CHAT_TODAY = (
    "A rule engine with no language model. It answers from the shop's own data and, for a "
    "signed-in customer, their own bookings, invoices and points."
)


def _seed():
    from website.zenotians_seed import LIMITATIONS, MAPPING, PROJECT

    return PROJECT, MAPPING, LIMITATIONS


def _upgrade(value):
    if not isinstance(value, dict):
        return value, False
    project_seed, mapping_seed, limitations_seed = _seed()
    changed = False
    value = dict(value)

    project = value.get("project")
    if isinstance(project, dict):
        project = dict(project)
        intro = project.get("intro", "")
        if isinstance(intro, str) and intro.endswith(OLD_INTRO_END) and "AIR" not in intro:
            project["intro"] = intro + AIR_SENTENCE
            changed = True
        roles = list(project.get("roles") or [])
        air_role = next(r for r in project_seed["roles"] if r["role"].startswith("AIR"))
        if not any(str(r.get("role", "")).startswith("AIR") for r in roles):
            roles.append(air_role)
            project["roles"] = roles
            changed = True
        value["project"] = project

    mapping = value.get("mapping")
    if isinstance(mapping, list):
        air_row = next(r for r in mapping_seed if r["workflow"] == "Virtual receptionist (AIR)")
        if not any(
            r.get("workflow") == air_row["workflow"] for r in mapping if isinstance(r, dict)
        ):
            value["mapping"] = [*mapping, air_row]
            changed = True

    limitations = value.get("limitations")
    if isinstance(limitations, dict):
        limitations = dict(limitations)
        items = [dict(i) if isinstance(i, dict) else i for i in limitations.get("items") or []]
        seeded = {i["id"]: i for i in limitations_seed["items"]}
        for item in items:
            if (
                isinstance(item, dict)
                and item.get("id") == "chatbot"
                and str(item.get("today", "")).startswith(OLD_CHAT_TODAY)
            ):
                item["today"] = seeded["chatbot"]["today"]
                item["out_of_scope"] = seeded["chatbot"]["out_of_scope"]
                changed = True
        if not any(isinstance(i, dict) and i.get("id") == "air" for i in items):
            items.append(seeded["air"])
            changed = True
        limitations["items"] = items
        value["limitations"] = limitations
    return value, changed


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
    dependencies = [("website", "0007_zenotians_remove_aviatrix")]
    operations = [migrations.RunPython(upgrade, migrations.RunPython.noop)]
