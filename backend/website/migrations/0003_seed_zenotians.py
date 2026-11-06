from django.db import migrations
from django.utils import timezone


def seed(apps, schema_editor):
    """Write the starting For Zenotians content once. A page the admin already filled in with the
    new structure is left alone; the old empty shell (a list of sections) is replaced."""
    from website.zenotians_seed import SEED

    SiteContent = apps.get_model("website", "SiteContent")
    row = SiteContent.objects.filter(key="zenotians").first()
    if row is not None and isinstance(row.value, dict) and "overview" in row.value:
        return
    if row is None:
        row = SiteContent(key="zenotians")
    row.value = SEED
    row.draft = None
    row.is_published = True
    row.published_at = timezone.now()
    row.save()


class Migration(migrations.Migration):
    dependencies = [("website", "0002_sitecontent_draft_sitecontent_is_published_and_more")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
