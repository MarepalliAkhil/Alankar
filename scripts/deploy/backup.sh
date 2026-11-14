#!/usr/bin/env bash
# Nightly backup (docs/DEPLOY.md). The scheduler container runs it at 03:00 shop time; you can run
# it on the VM too:  scripts/deploy/backup.sh
# Writes /var/backups/alankar/alankar-<time>.dump (pg_dump custom format, compressed) and
# media-<time>.tar.gz, and keeps 14 days. The backups do NOT contain SALON_FIELD_KEY: keep that
# key backed up offline, or the encrypted fields in a restored database cannot be read.
set -euo pipefail
if [ -z "${DATABASE_URL:-}" ] && command -v docker >/dev/null 2>&1; then
  # On the VM: run this same script inside the scheduler container (it has pg_dump 16).
  cd "$(dirname "$0")/../.."
  exec docker compose --env-file "${ENV_FILE:-.env.production}" -f docker-compose.prod.yml \
    exec -T scheduler /app/deploy/backup.sh
fi
DIR="${BACKUP_DIR:-/var/backups/alankar}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
PG_DUMP="${SALON_PG_BIN:-/usr/lib/postgresql/16/bin}/pg_dump"
mkdir -p "$DIR"
"$PG_DUMP" --format=custom --compress=6 --no-owner --file "$DIR/alankar-$STAMP.dump" "$DATABASE_URL"
if [ -d /app/media ]; then
  tar -czf "$DIR/media-$STAMP.tar.gz" -C /app media
fi
find "$DIR" -maxdepth 1 -type f \( -name 'alankar-*.dump' -o -name 'media-*.tar.gz' \) \
  -mtime "+$KEEP_DAYS" -delete
echo "Backup written: $DIR/alankar-$STAMP.dump ($(du -h "$DIR/alankar-$STAMP.dump" | cut -f1))"
