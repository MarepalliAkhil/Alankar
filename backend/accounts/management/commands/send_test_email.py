from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from core import brand
from core.mail import deliver
from core.models import MailOutbox


class Command(BaseCommand):
    help = "Send one test email through the configured SMTP server (checks backend/.env)."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Address to send the test email to")

    def handle(self, *args, **options):
        to = options["to"].strip()
        try:
            validate_email(to)
        except ValidationError as exc:
            raise CommandError("Enter a valid email address after --to.") from exc
        if not settings.SALON_SMTP_CONFIGURED:
            raise CommandError(
                "Real email is not configured. Set EMAIL_HOST, EMAIL_HOST_USER and "
                "EMAIL_HOST_PASSWORD (the app password) in backend/.env, then try again."
            )
        message = MailOutbox.objects.create(
            kind=MailOutbox.Kind.TEST,
            to_email=to,
            subject=f"{brand.SHOP_NAME}: test email",
            body="This is a test email. If you can read it, real email sending works.",
            status=MailOutbox.Status.QUEUED,
        )
        if not deliver(message.pk):
            message.refresh_from_db()
            raise CommandError(
                f"Sending failed ({message.error}). Check EMAIL_HOST, EMAIL_PORT, EMAIL_USE_TLS, "
                "EMAIL_HOST_USER and the app password in backend/.env."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Test email sent to {to} from {settings.DEFAULT_FROM_EMAIL}. "
                "Check the inbox and the spam folder."
            )
        )
