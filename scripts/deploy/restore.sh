#!/usr/bin/env bash
# Restore a backup into the database in DATABASE_URL (docs/DEPLOY.md):
#   scripts/deploy/restore.sh /var/backups/alankar/alankar-<time>.dump [media-<time>.tar.gz]
# THIS REPLACES THE CURRENT DATA. It asks you to type the database name first, stops the backend
# and the scheduler while it works, and starts them again afterwards.
source "$(dirname "$0")/common.sh"
DUMP="${1:?Give the .dump file to restore}"
MEDIA="${2:-}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }
DBNAME="$(env_value DATABASE_URL | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')"
echo "This will REPLACE all data in the database '$DBNAME' with $(basename "$DUMP")."
read -r -p "Type the database name ($DBNAME) to continue: " ANSWER
[ "$ANSWER" = "$DBNAME" ] || { echo "Cancelled. Nothing was changed."; exit 1; }

"${COMPOSE[@]}" stop backend scheduler
"${COMPOSE[@]}" run --rm --no-deps -v "$(cd "$(dirname "$DUMP")" && pwd)":/restore:ro \
  --entrypoint /usr/lib/postgresql/16/bin/pg_restore scheduler \
  --clean --if-exists --no-owner --single-transaction \
  --dbname "$(env_value DATABASE_URL)" "/restore/$(basename "$DUMP")"
if [ -n "$MEDIA" ]; then
  "${COMPOSE[@]}" run --rm --no-deps -u 0 -v "$(cd "$(dirname "$MEDIA")" && pwd)":/restore:ro \
    -v alankar_media:/app/media --entrypoint tar scheduler -xzf "/restore/$(basename "$MEDIA")" -C /app
fi
"${COMPOSE[@]}" up -d backend scheduler
wait_healthy
echo "Restored $(basename "$DUMP")."
