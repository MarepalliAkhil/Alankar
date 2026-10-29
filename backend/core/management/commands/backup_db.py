from django.core.management.base import BaseCommand, CommandError

from core import backup


class Command(BaseCommand):
    help = (
        "Save the whole database to one file (default folder: backend/backups). "
        "Needs pg_dump (PostgreSQL client tools). Copy the file somewhere safe: a backup on the "
        "same disk does not survive a disk failure."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dir", default=None, help="Folder for the backup file.")

    def handle(self, *args, **options):
        folder = options["dir"] or backup.configured_backup_dir()
        try:
            path = backup.backup(folder)
        except backup.BackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Backup saved: {path} ({path.stat().st_size} bytes)"))
