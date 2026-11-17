from django.core.management.base import BaseCommand
from django.utils import timezone

from core import jobs


class Command(BaseCommand):
    help = (
        "Wipes the stored bytes of chat photos past the retention period (the same step as "
        "run_jobs chat_photo_retention and the nightly endpoint). Safe to run any time."
    )

    def handle(self, *args, **options):
        done = dict(jobs.JOBS)["chat_photo_retention"](timezone.now())
        self.stdout.write(self.style.SUCCESS(f"Chat photos cleaned up: {done}."))
