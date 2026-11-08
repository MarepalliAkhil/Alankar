"""python manage.py expire_holds

Ends overdue AIR slot holds, expired stylist requests and expired payment links, tells the
customers, and hands unfinished work to the desk when a receptionist is in. Safe to run as often
as you like (every minute is fine). `python manage.py run_jobs` also runs it.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from air import cover, holds


class Command(BaseCommand):
    help = "End overdue AIR holds and requests (safe to run often)."

    def handle(self, *args, **options):
        now = timezone.now()
        active = cover.is_active(now)
        count = holds.expire_due(now)
        self.stdout.write(f"AIR cover active: {active}. Items ended: {count}.")
