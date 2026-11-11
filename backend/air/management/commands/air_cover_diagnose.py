"""python manage.py air_cover_diagnose [request_uuid]

Explains, without changing anything, why AIR did or did not accept a request.

  no argument   the AIR desk-cover setting, whether cover is active now and exactly why, the last
                sweep, the last 10 AIR log rows and every waiting request with its reason
  request id    every check for that request with its value and pass / fail
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from air import config, cover, desk
from air.models import AIActionLog
from scheduling.models import Appointment


class Command(BaseCommand):
    help = "Explain why AIR did or did not accept booking requests (read only)."

    def add_arguments(self, parser):
        parser.add_argument("request_id", nargs="?", help="A booking request id (uuid).")

    def handle(self, *args, **options):
        now = timezone.now()
        say = self.stdout.write
        if options.get("request_id"):
            return self.one(options["request_id"], now, say)
        cfg = config.get_settings()
        st = desk.status(now)
        say("AIR DESK COVER")
        say(f"  desk cover setting (AIR desk cover enabled): {'ON' if cfg.air_enabled else 'OFF'}")
        if not cfg.air_enabled:
            say("  >>> AIR desk cover is OFF, AIR will not act. Turn it on in the AIR settings.")
        say(
            f"  cover active now: {'YES' if st['cover_active'] else 'NO'} "
            f"({st['cover_reason_text']})"
        )
        say(f"  admin override: {st['force']}")
        say(f"  receptionist on shift (Asia/Kolkata): {cover.receptionist_on_shift(now)}")
        present = list(cover.present_receptionists(now).select_related("user"))
        say(
            f"  receptionists present (active in the last {cfg.presence_minutes} min): "
            f"{len(present)}"
        )
        for session in present:
            say(f"    - last seen {session.last_seen_at:%Y-%m-%d %H:%M:%S} UTC")
        last = st["last_sweep_at"]
        say(f"  last sweep: {last:%Y-%m-%d %H:%M:%S} UTC" if last else "  last sweep: never")
        if st["scheduler_stale"]:
            say("  >>> the scheduler has not run for more than 5 minutes (run air_cover_sweep).")
        if st["last_error"]:
            say(f"  last sweep error: {st['last_error']}")
        say("")
        say("LAST 10 AIR LOG ROWS")
        for row in AIActionLog.objects.order_by("-created_at")[:10]:
            say(
                f"  {row.created_at:%m-%d %H:%M:%S} {row.action_type:<26} {row.status:<10} "
                f"{row.reason_code or '-'}  booking {row.booking_ref or '-'}"
            )
        say("")
        say("WAITING REQUESTS")
        rows = list(desk.waiting_requests(now))
        if not rows:
            say("  none")
        for appt in rows:
            say(f"  {appt.pk}  {appt.service_name}  ->  {desk.why_not(appt, now)}")

    def one(self, raw, now, say):
        try:
            appt = Appointment.objects.select_related("customer", "service", "hold_stylist").get(
                pk=raw
            )
        except (Appointment.DoesNotExist, ValueError, Exception) as exc:
            raise CommandError(f"No booking request {raw}.") from exc
        say(f"REQUEST {appt.pk}: {appt.service_name}, status {appt.status}")
        say(f"  front desk: {appt.reception_status}, stylist: {appt.stylist_status}")
        cfg = config.get_settings()
        active, why = cover.evaluate(now)
        say(
            f"  [{'PASS' if cfg.air_enabled else 'FAIL'}] switch_on: "
            f"AIR desk cover enabled = {cfg.air_enabled}"
        )
        say(f"  [{'PASS' if active else 'FAIL'}] cover_active: {desk.REASON_TEXT.get(why, why)}")
        for check in desk.run_checks(appt, now):
            say(f"  [{'PASS' if check.passed else 'FAIL'}] {check.name}: {check.detail}")
        say(f"  verdict: {desk.why_not(appt, now)}")
        say("  log rows for this request:")
        for row in AIActionLog.objects.filter(booking_ref=appt.pk).order_by("created_at"):
            say(
                f"    {row.created_at:%H:%M:%S} {row.action_type} {row.status} "
                f"{row.reason_code or '-'}"
            )
