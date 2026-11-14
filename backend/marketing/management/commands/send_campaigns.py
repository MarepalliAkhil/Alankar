from django.core.management.base import BaseCommand

from marketing.campaigns import BATCH, send_all


class Command(BaseCommand):
    help = (
        "Start every scheduled campaign that is due and send waiting emails in batches of "
        f"{BATCH}. Nothing is sent in quiet hours (21:00 to 09:00 shop time); the next run after "
        "them continues. Running it twice never emails anyone twice."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--batches", type=int, default=None, help="Stop after this many batches per campaign."
        )

    def handle(self, *args, **options):
        result = send_all(batches=options["batches"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{result['started']} campaign(s) started, {result['emails']} email(s) sent."
            )
        )
