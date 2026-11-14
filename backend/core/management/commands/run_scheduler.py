from django.core.management.base import BaseCommand

from core import scheduler


class Command(BaseCommand):
    help = (
        "Production scheduler (docs/DEPLOY.md): runs the timed jobs on their schedule in shop "
        "time and logs every run. Start exactly one (the 'scheduler' container)."
    )

    def handle(self, *args, **options):
        scheduler.loop()
