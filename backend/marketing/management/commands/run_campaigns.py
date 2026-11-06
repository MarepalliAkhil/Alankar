from django.core.management.base import BaseCommand

from marketing.campaigns import run_due


class Command(BaseCommand):
    help = (
        "Send every scheduled campaign whose time has come. Run it every minute or so "
        "(Windows Task Scheduler, cron or a loop). Running it twice never sends a campaign twice."
    )

    def handle(self, *args, **options):
        count = run_due()
        self.stdout.write(self.style.SUCCESS(f"{count} campaign(s) sent."))
