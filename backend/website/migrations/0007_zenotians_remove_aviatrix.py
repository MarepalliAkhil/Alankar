from django.db import migrations

OLD_WORD = "Aviatrix"
NEW_SUMMARY = (
    "B.Tech CSE undergraduate (CGPA 8.7) with hands-on experience in Python/ML projects, "
    "full-stack development, and Linux and networking coursework (Red Hat RH134, Cisco). "
    "Looking for a software or infrastructure role where I can build, deploy, and "
    "troubleshoot reliable systems."
)


def _upgrade(value):
    """Removes the Aviatrix certificate and the word "Aviatrix" from the About me summary.
    Anything the admin wrote that does not mention it is left alone."""
    if not isinstance(value, dict):
        return value, False
    resume = value.get("resume")
    if not isinstance(resume, dict):
        return value, False
    changed = False
    resume = dict(resume)
    certs = resume.get("certifications") or []
    kept = [c for c in certs if OLD_WORD.lower() not in str(c.get("title", "")).lower()]
    if len(kept) != len(certs):
        resume["certifications"] = kept
        changed = True
    if OLD_WORD.lower() in str(resume.get("summary", "")).lower():
        resume["summary"] = NEW_SUMMARY
        changed = True
    if not changed:
        return value, False
    return {**value, "resume": resume}, True


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
    dependencies = [("website", "0006_zenotians_five_leaders")]
    operations = [migrations.RunPython(upgrade, migrations.RunPython.noop)]
