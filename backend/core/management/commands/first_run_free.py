"""First run for the free deployment, from your PC against Neon (docs/DEPLOY_FREE.md).

migrate; load the demo ONLY if the database has no bookings and no customers (it refuses to
reset a database that has data); create the admin from ADMIN_EMAIL / ADMIN_NAME /
ADMIN_PASSWORD when no account with that email exists (an existing account is never changed;
this comes after the demo load because that load empties the database); then the demo extras,
the owner's demo coupons and the recommendations.
"""

import os

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "First run for the free deployment (Neon): migrate, demo (empty database only), admin."

    def handle(self, *args, **options):
        from accounts.models import User
        from scheduling.models import Appointment

        write = self.stdout.write
        write("Migrating...")
        call_command("migrate", interactive=False, verbosity=1)

        bookings = Appointment.objects.count()
        customers = User.objects.filter(role=User.Role.CUSTOMER).count()
        name = settings.DATABASES["default"]["NAME"]
        if bookings == 0 and customers == 0:
            write(f"'{name}' has no bookings and no customers: loading the demo (a few minutes).")
            call_command("reset_demo", "--yes", "--really-wipe", name, stdout=self.stdout)
        else:
            write(
                self.style.WARNING(
                    f"'{name}' already has data ({bookings} bookings, {customers} customers): "
                    "NOT resetting it."
                )
            )

        email = (os.environ.get("ADMIN_EMAIL") or "").strip()
        if email:
            if User.objects.filter(email__iexact=email).exists():
                write(f"An account for {email} already exists: left unchanged.")
            elif not os.environ.get("ADMIN_PASSWORD"):
                write(self.style.WARNING("ADMIN_PASSWORD is empty: no admin created."))
            else:
                os.environ["SALON_ADMIN_PASSWORD"] = os.environ["ADMIN_PASSWORD"]
                try:
                    call_command(
                        "create_admin",
                        "--email",
                        email,
                        "--name",
                        os.environ.get("ADMIN_NAME") or "Admin",
                        stdout=self.stdout,
                    )
                finally:
                    os.environ.pop("SALON_ADMIN_PASSWORD", None)

        for command in ("seed_demo_extras", "seed_demo_coupons"):
            try:
                call_command(command, stdout=self.stdout)
            except Exception as exc:  # e.g. the owner admin is missing: report and go on
                write(self.style.WARNING(f"{command} skipped: {exc}"))
        call_command("build_recommendations", stdout=self.stdout)
        write(self.style.SUCCESS("First run finished."))
