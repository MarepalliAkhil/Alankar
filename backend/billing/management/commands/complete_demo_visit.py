from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from billing import checkout
from scheduling.models import Appointment, AppointmentStatus


class Command(BaseCommand):
    help = (
        "DEVELOPMENT ONLY. Completes a scheduled visit and bills it (invoice + pending rating), "
        "so you can try invoices and ratings before the receptionist checkout (Task 3) exists."
    )

    def add_arguments(self, parser):
        parser.add_argument("--appointment", help="Appointment id. Default: the oldest scheduled.")
        parser.add_argument("--method", default="cash", choices=["cash", "upi", "card"])

    def handle(self, *args, **options):
        if not settings.SALON_DEV_TOOLS:
            raise CommandError("This command only runs when SALON_DEBUG=true.")
        appt_id = options["appointment"]
        if not appt_id:
            appt = (
                Appointment.objects.filter(status=AppointmentStatus.SCHEDULED)
                .order_by("start")
                .first()
            )
            if appt is None:
                raise CommandError("There is no scheduled appointment. Book and pay for one first.")
            appt_id = appt.pk
        try:
            invoice = checkout.complete_and_invoice(appt_id, method=options["method"])
        except (checkout.CheckoutError, Appointment.DoesNotExist) as exc:
            raise CommandError(str(exc) or "Appointment not found.") from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Visit completed and billed: {invoice.number} (Rs. {invoice.total}). "
                "The customer now has a rating waiting."
            )
        )
