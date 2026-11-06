from django.core.management.base import BaseCommand, CommandError

from core import jobs


class Command(BaseCommand):
    help = (
        "Run every timed background task once: release unpaid slot holds, expire waitlist offers "
        "and windows, end lapsed memberships, send due campaigns and rating reminders, and remove "
        "old one-time tokens. Safe to run twice or from two places at once. Schedule it every "
        "5 minutes (Windows Task Scheduler or cron): python manage.py run_jobs"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--only", nargs="*", choices=[n for n, _ in jobs.JOBS], help="Run just these steps."
        )

    def handle(self, *args, **options):
        results = jobs.run_all(only=options["only"])
        failed = False
        for name, outcome in results.items():
            failed = failed or isinstance(outcome, str)
            style = self.style.ERROR if isinstance(outcome, str) else self.style.SUCCESS
            self.stdout.write(style(f"{name}: {outcome}"))
        if failed:
            raise CommandError("One or more background steps failed. See the log.")
