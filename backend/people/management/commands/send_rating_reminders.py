from django.core.management.base import BaseCommand

from people.ratings import send_due_reminders


class Command(BaseCommand):
    help = (
        "Email customers whose stylist rating has been waiting for 24 hours (once per rating). "
        "Run it every hour or so in production."
    )

    def handle(self, *args, **options):
        count = send_due_reminders()
        self.stdout.write(self.style.SUCCESS(f"{count} rating reminder(s) sent."))
