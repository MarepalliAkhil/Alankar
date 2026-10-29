from django.core.management.base import BaseCommand, CommandError

from core import integrity


class Command(BaseCommand):
    help = (
        "Read-only consistency check: negative stock, gift-card or package balances, refunds "
        "above the amount paid, overlapping bookings. Changes nothing. Exits with an error "
        "if it finds any."
    )

    def handle(self, *args, **options):
        problems = integrity.run_checks()
        if not problems:
            self.stdout.write(self.style.SUCCESS("Integrity check passed: nothing wrong found."))
            return
        for line in problems:
            self.stdout.write(self.style.ERROR(line))
        raise CommandError(f"{len(problems)} problem(s) found.")
