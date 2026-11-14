from django.core.management.base import BaseCommand, CommandError

from core import demo_coupons


class Command(BaseCommand):
    help = (
        "ADD-ONLY: creates the demo coupons (WELCOME10, FLAT100, SPA15, GLOW200, HAIR50, CARE10, "
        "VIP25) as the owner's admin account. Existing codes are skipped, never changed. Safe to "
        "run twice."
    )

    def handle(self, *args, **options):
        try:
            result = demo_coupons.seed(self.stdout.write)
        except demo_coupons.NoOwnerAdmin as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(result['created'])}, skipped {len(result['skipped'])}."
            )
        )
