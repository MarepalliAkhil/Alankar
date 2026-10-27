from django.core.management.base import BaseCommand

from scheduling.booking import expire_due


class Command(BaseCommand):
    help = (
        "Release held slots whose payment link has expired (status -> payment_expired). "
        "The API also does this on every booking read, so running it is optional; schedule "
        "it every few minutes in production."
    )

    def handle(self, *args, **options):
        count = expire_due()
        self.stdout.write(self.style.SUCCESS(f"{count} unpaid booking(s) expired."))
