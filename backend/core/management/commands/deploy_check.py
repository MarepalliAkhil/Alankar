"""Fails (exit status 1) when the settings are unsafe for production.

Run it with the production environment loaded:   python manage.py deploy_check
It runs this project's own checks and then Django's `check --deploy` (security checks).
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from core.deploycheck import ERROR, WARNING, run_checks


class Command(BaseCommand):
    help = "Check that the production settings are safe (exit 1 on any error)."

    def add_arguments(self, parser):
        parser.add_argument("--strict", action="store_true", help="Treat warnings as errors too.")

    def handle(self, *args, **options):
        findings = run_checks()
        for f in findings:
            line = f"[{f.level}] {f.code}: {f.message}"
            self.stdout.write(self.style.ERROR(line) if f.level == ERROR else line)
        django_ok = True
        try:
            call_command("check", tags=["security"], deploy=True, fail_level="WARNING")
        except CommandError as exc:
            django_ok = False
            self.stdout.write(self.style.ERROR(f"[ERROR] django_check_deploy: {exc}"))
        errors = [f for f in findings if f.level == ERROR]
        warnings = [f for f in findings if f.level == WARNING]
        if errors or not django_ok or (options["strict"] and warnings):
            raise CommandError(
                f"deploy_check failed: {len(errors)} error(s), {len(warnings)} warning(s)."
            )
        self.stdout.write(self.style.SUCCESS(f"deploy_check passed ({len(warnings)} warning(s))."))
