import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("people", "0013_stats_indexes"),
        ("scheduling", "0010_reception_acceptance"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="any_stylist",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="StylistOffer",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("seq", models.PositiveSmallIntegerField()),
                (
                    "by",
                    models.CharField(
                        choices=[("air", "AIR"), ("staff", "Staff")], default="air", max_length=8
                    ),
                ),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("pending", "Waiting for the stylist"),
                            ("accepted", "Accepted"),
                            ("declined", "Declined"),
                            ("timed_out", "Did not answer in time"),
                            ("moved", "Moved to another stylist by staff"),
                            ("ended", "Request ended"),
                        ],
                        default="pending",
                        max_length=10,
                    ),
                ),
                ("offered_at", models.DateTimeField()),
                ("answer_by", models.DateTimeField(blank=True, null=True)),
                ("answered_at", models.DateTimeField(blank=True, null=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "appointment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="offers",
                        to="scheduling.appointment",
                    ),
                ),
                (
                    "stylist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="people.stylistprofile",
                    ),
                ),
            ],
            options={
                "ordering": ["appointment", "seq"],
                "indexes": [
                    models.Index(
                        fields=["outcome", "answer_by"], name="scheduling__outcome_d83ef7_idx"
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("appointment", "seq"), name="stylist_offer_once"
                    )
                ],
            },
        ),
    ]
