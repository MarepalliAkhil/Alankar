from django.core.management.base import BaseCommand, CommandError

from core import backup


class Command(BaseCommand):
    help = (
        "Restore a backup file into a NEW database (never into the one the app is using). "
        "Then set SALON_DB_NAME in backend/.env to the new name and restart the app."
    )

    def add_arguments(self, parser):
        parser.add_argument("file", help="Backup file made by backup_db.")
        parser.add_argument("--into", required=True, help="Name of the new database to create.")

    def handle(self, *args, **options):
        try:
            name = backup.restore(options["file"], options["into"])
        except backup.BackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Restored into database '{name}'. To use it, set SALON_DB_NAME={name} in .env."
            )
        )
