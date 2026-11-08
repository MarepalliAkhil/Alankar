"""python manage.py air_cover_sweep [--verbose]

Looks at every booking request that still waits for the front desk and, while AIR covers the desk,
accepts the receptionist side (or says why not: every request gets an AIR action-log row with a
reason code). Safe to run as often as you like, and from several places at once. Run it every
minute (Windows Task Scheduler or cron); `python manage.py run_jobs` includes it, and the app also
runs it lazily when a receptionist loads the requests list.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from air import desk


class Command(BaseCommand):
    help = "AIR desk cover: look at every waiting booking request (safe to run often)."

    def add_arguments(self, parser):
        parser.add_argument("--verbose", action="store_true", help="One line per request.")

    def handle(self, *args, **options):
        say = self.stdout.write if options["verbose"] else None
        now = timezone.now()
        counts = desk.sweep(now, verbose=say)
        if options["verbose"]:
            for appt in desk.waiting_requests(timezone.now()):
                say(f"still waiting {appt.pk}: {desk.why_not(appt, timezone.now())}")
        self.stdout.write(
            "AIR desk cover sweep: "
            + ", ".join(f"{key} {value}" for key, value in counts.items())
            + "."
        )
