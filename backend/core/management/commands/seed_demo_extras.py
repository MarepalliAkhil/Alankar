from django.core.management.base import BaseCommand, CommandError

from core import demo_extras


class Command(BaseCommand):
    help = (
        "ADD-ONLY demo data for every feature (docs/START_HERE.md, 'Demo extras'). Never changes "
        "or deletes existing rows and never runs reset_demo. Safe to run twice: the second run "
        "adds nothing. --dry-run shows what would be added and writes nothing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Show, then roll everything back."
        )
        parser.add_argument("--report", action="store_true", help="Show what was added before.")

    def handle(self, *args, **options):
        if options["report"]:
            data = demo_extras.report()
            self.stdout.write("Steps done: " + (", ".join(data["steps"]) or "none"))
            for label, n in sorted(data["rows"].items()):
                self.stdout.write(f"  {label}: {n}")
            return
        problem = demo_extras.requirements_missing()
        if problem:
            raise CommandError(problem)
        dry = options["dry_run"]
        self.stdout.write("Dry run: nothing will be saved." if dry else "Adding demo extras...")
        added = demo_extras.seed(self.stdout.write, dry_run=dry)
        total = sum(added.values())
        if dry:
            self.stdout.write(self.style.SUCCESS(f"Would add {total} rows. Nothing was saved."))
        elif total:
            self.stdout.write(self.style.SUCCESS(f"Added {total} rows."))
            from django.core.management import call_command

            call_command("build_recommendations", stdout=self.stdout)
        else:
            self.stdout.write(self.style.SUCCESS("Nothing to add: the demo extras are already in."))
