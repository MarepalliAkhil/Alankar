"""Builds the throw-away database the browser test runs against.

Refuses to touch any database whose name does not end in "_e2e", so it can never wipe real data.
"""

import psycopg
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from psycopg import sql

from core import demo
from website.models import SiteContent

E2E_PASSWORD = "E2e-Pass-2026!"

E2E_STAFF = [
    ("admin", "admin@e2e.example.com", "Ela Admin", None, ""),
    ("receptionist", "desk@e2e.example.com", "Dev Desk", None, ""),
    ("stylist", "stylist@e2e.example.com", "Sana Stylist", "Rahul", ""),
]
E2E_CUSTOMERS = [
    ("customer@e2e.example.com", "Chitra Customer", "9100000001"),
    ("other@e2e.example.com", "Omar Other", "9100000002"),
]


class Command(BaseCommand):
    help = "Create (if needed), migrate and fill the *_e2e database used by the browser test."

    def handle(self, *args, **options):
        db = connection.settings_dict
        name = db["NAME"]
        if not name.endswith("_e2e"):
            raise CommandError(
                f"Refusing to run: database '{name}' does not end in _e2e. "
                "Set SALON_DB_NAME=alankar_e2e for the browser test."
            )
        admin = psycopg.connect(
            host=db.get("HOST") or "localhost",
            port=db.get("PORT") or 5432,
            user=db.get("USER") or None,
            password=db.get("PASSWORD") or None,
            dbname="postgres",
            autocommit=True,
        )
        try:
            exists = admin.execute("SELECT 1 FROM pg_database WHERE datname = %s", [name])
            if exists.fetchone() is None:
                admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
                self.stdout.write(f"Created database {name}.")
        finally:
            admin.close()
        connection.close()
        call_command("migrate", interactive=False, verbosity=0)
        call_command("flush", interactive=False, verbosity=0)
        call_command("seed_demo", verbosity=0)
        # Open all day, no lead time: a "today" walk-in works at any hour except the last
        # half hour of the day, so the test does not depend on the time it is run.
        days = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        SiteContent.objects.update_or_create(
            key="booking",
            defaults={
                "value": {
                    "min_lead_minutes": 0,
                    "weekly_hours": {day: ["00:00", "23:59"] for day in days},
                },
                "is_published": True,
            },
        )
        demo.ensure_staff(E2E_STAFF, E2E_PASSWORD)
        demo.ensure_customers(E2E_CUSTOMERS, E2E_PASSWORD)
        self.stdout.write(self.style.SUCCESS("E2E database ready."))
