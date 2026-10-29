"""Wipes the database and fills it with a clearly fictional salon with seven weeks of history.

This DELETES EVERYTHING in the configured database. To make that hard to do by accident:
  * you must pass --yes, and
  * the database name must contain "demo" or end in "_e2e", unless you pass
    --really-wipe <database name> and the name matches exactly.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from core import demo, demo_story


class Command(BaseCommand):
    help = "Reset the database to the fictional demo salon (deletes all data in it)."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Confirm that you want this.")
        parser.add_argument(
            "--really-wipe",
            metavar="DB_NAME",
            default="",
            help="Needed when the database name does not contain 'demo'. Must equal the name.",
        )
        parser.add_argument(
            "--no-history",
            action="store_true",
            help="Only the catalogue and the demo accounts, without the seven weeks of visits.",
        )

    def handle(self, *args, **options):
        name = connection.settings_dict["NAME"]
        safe_name = "demo" in name.lower() or name.endswith("_e2e")
        if not options["yes"]:
            raise CommandError(
                f"This would delete ALL data in database '{name}'. Run again with --yes to confirm."
            )
        if not safe_name and options["really_wipe"] != name:
            raise CommandError(
                f"Database '{name}' does not look like a demo database. If you really want to "
                f"wipe it, add:  --really-wipe {name}"
            )
        self.stdout.write(f"Resetting database '{name}'...")
        call_command("migrate", interactive=False, verbosity=0)
        call_command("flush", interactive=False, verbosity=0)
        call_command("seed_demo", verbosity=0)
        if options["no_history"]:
            demo.ensure_staff(demo.DEMO_STAFF)
            demo.ensure_customers(demo.DEMO_CUSTOMERS)
        else:
            demo_story.build(write=self.stdout.write)
        self.stdout.write(self.style.SUCCESS("Demo ready. Everything in it is fictional."))
        self.stdout.write(f"Password for every demo login: {demo.DEMO_PASSWORD}")
        for _role, email, name_, _profile, _phone in demo.DEMO_STAFF:
            self.stdout.write(f"  {email}  ({name_})")
        for email, name_, _phone in demo.DEMO_CUSTOMERS:
            self.stdout.write(f"  {email}  ({name_})")
