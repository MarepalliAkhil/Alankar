from django.core.management.base import BaseCommand

from core import demo_extras


class Command(BaseCommand):
    help = "Deletes ONLY the rows that seed_demo_extras added (asks first; --yes to skip)."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation.")

    def handle(self, *args, **options):
        data = demo_extras.report()
        total = sum(data["rows"].values())
        if not total:
            self.stdout.write("There are no demo extras to remove.")
            return
        if not options["yes"]:
            answer = input(f"Delete the {total} rows added by seed_demo_extras? Type yes: ")
            if answer.strip().lower() != "yes":
                self.stdout.write("Nothing was deleted.")
                return
        removed = demo_extras.remove(self.stdout.write)
        self.stdout.write(self.style.SUCCESS(f"Removed {removed} demo-extra rows."))
