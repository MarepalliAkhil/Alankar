import getpass
import os

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from accounts.models import User
from accounts.serializers import normalize_email


class Command(BaseCommand):
    help = (
        "Create the first admin account. The password is asked interactively, or read from "
        "the SALON_ADMIN_PASSWORD environment variable for non-interactive use."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True, help='Full name, e.g. "Akhil Marepalli"')

    def handle(self, *args, **options):
        email = normalize_email(options["email"])
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("Enter a valid email address.") from exc
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("An account with this email already exists.")

        password = os.environ.get("SALON_ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Password (again): "):
                raise CommandError("Passwords do not match.")

        user = User(
            username=email,
            email=email,
            full_name=options["name"].strip(),
            role=User.Role.ADMIN,
            is_staff=True,  # allows the developer-only Django admin when SALON_DEBUG=true
            is_superuser=True,
        )
        try:
            password_validation.validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Admin account created for {email}."))
