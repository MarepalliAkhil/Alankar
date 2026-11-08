import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("air", "0003_needs_you_state")]

    operations = [
        migrations.AddField(
            model_name="airsettings",
            name="presence_minutes",
            field=models.PositiveSmallIntegerField(
                default=10,
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(120),
                ],
            ),
        ),
        migrations.AddField(
            model_name="coverstate",
            name="last_sweep_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="coverstate",
            name="last_sweep_error",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="coverstate",
            name="last_sweep_counts",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="airrequeststate",
            name="source",
            field=models.CharField(default="chat", max_length=8),
        ),
        migrations.AddField(
            model_name="airrequeststate",
            name="accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="airrequeststate",
            name="session_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AlterField(
            model_name="aiactionlog",
            name="status",
            field=models.CharField(
                choices=[
                    ("done", "Done"),
                    ("failed", "Failed"),
                    ("handed_off", "Handed to the desk"),
                    ("skipped", "Looked at, nothing done"),
                    ("undone", "Undone"),
                ],
                default="done",
                max_length=12,
            ),
        ),
    ]
