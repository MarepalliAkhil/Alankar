from django.core.management.base import BaseCommand, CommandError

from accounts.audit import audit
from accounts.models import AuditLog, User
from people.linking import LinkError, link_existing
from people.models import StylistProfile


class Command(BaseCommand):
    help = (
        "Link a stylist login to an existing team profile, for example a demo profile. "
        "One account per profile and one profile per account."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Email of the stylist account.")
        parser.add_argument("--profile", required=True, help="Display name of the team profile.")

    def handle(self, *args, **options):
        user = User.objects.filter(
            email__iexact=options["email"], role=User.Role.STYLIST, is_active=True
        ).first()
        if user is None:
            raise CommandError("No active stylist account has that email.")
        matches = StylistProfile.objects.filter(display_name__iexact=options["profile"])
        if matches.count() != 1:
            raise CommandError("Name exactly one team profile (check the spelling).")
        try:
            profile = link_existing(user, matches.get())
        except LinkError as exc:
            raise CommandError(str(exc)) from exc
        audit(
            AuditLog.Action.STYLIST_LINKED,
            actor=None,
            target=user,
            profile=str(profile.id),
            profile_name=profile.display_name,
        )
        self.stdout.write(f"{user.email} is now linked to {profile.display_name}.")
