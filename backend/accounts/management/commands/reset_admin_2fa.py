from django.core.management.base import BaseCommand, CommandError

from accounts import twofactor
from accounts.audit import audit
from accounts.models import AuditLog, User
from accounts.tokens import revoke_all_refresh_tokens


class Command(BaseCommand):
    help = "Switch off two-step sign-in for an admin who lost their phone and backup codes."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        user = User.objects.filter(email__iexact=email, role=User.Role.ADMIN).first()
        if user is None:
            raise CommandError("No admin has that email.")
        if not twofactor.is_enabled(user):
            self.stdout.write("Two-step sign-in was not on for that admin.")
            return
        twofactor.disable(user)
        revoke_all_refresh_tokens(user)
        audit(
            AuditLog.Action.TWO_FACTOR_RESET,
            target=user,
            reason="Reset from the server command line",
        )
        self.stdout.write("Two-step sign-in is off. They can sign in with the password only.")
