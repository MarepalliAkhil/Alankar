from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("air", "0004_desk_cover")]

    operations = [
        migrations.AddField(
            model_name="slothold",
            name="any_stylist",
            field=models.BooleanField(default=False),
        ),
    ]
