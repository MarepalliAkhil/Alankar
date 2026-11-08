"""Who gave the front desk's yes (Task: who accepted my request).

Adds the actor type, the receptionist (staff views only) and the time. Existing rows are filled:
a request AIR accepted (the append-only AIR action log says so) is "air"; any other accepted
request is "receptionist".
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill(apps, schema_editor):
    Appointment = apps.get_model("scheduling", "Appointment")
    Event = apps.get_model("scheduling", "AppointmentEvent")
    Log = apps.get_model("air", "AIActionLog")
    air_done = {
        ref: when
        for ref, when in Log.objects.filter(
            action_type="accept_reception", status="done", booking_ref__isnull=False
        )
        .order_by("created_at")
        .values_list("booking_ref", "created_at")
    }
    for appt in Appointment.objects.filter(reception_status="accepted").iterator():
        event = (
            Event.objects.filter(appointment_id=appt.pk, action="reception_accepted")
            .order_by("created_at")
            .first()
        )
        if appt.pk in air_done:
            appt.reception_actor = "air"
            appt.reception_accepted_at = air_done[appt.pk]
        else:
            appt.reception_actor = "receptionist"
            appt.reception_user_id = (event.actor_id if event else None) or appt.confirmed_by_id
            appt.reception_accepted_at = event.created_at if event else appt.created_at
        appt.save(
            update_fields=["reception_actor", "reception_user", "reception_accepted_at"]
        )


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("scheduling", "0009_dual_approval_and_slot_changes"),
        ("air", "0004_desk_cover"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="reception_actor",
            field=models.CharField(blank=True, default="", max_length=12),
        ),
        migrations.AddField(
            model_name="appointment",
            name="reception_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="appointment",
            name="reception_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
