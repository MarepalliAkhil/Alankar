#!/usr/bin/env bash
# Backend container entrypoint (docs/DEPLOY.md).
#   server     wait for the database and Redis, migrate, collect static files, start Daphne
#   scheduler  wait, then run the timed jobs loop (no migrate: the server container does that)
#   anything else is run as a command, e.g. "python manage.py createsuperuser"
set -euo pipefail
cd /app/backend

wait_for_services() {
  python - <<'PY'
import os, sys, time
import django
django.setup()
from django.db import connection
from django.core.cache import cache

deadline = time.time() + 120
last = ""
while time.time() < deadline:
    try:
        connection.ensure_connection()
        cache.set("startup:ping", "1", 5)
        if cache.get("startup:ping") == "1":
            print("Database and Redis are reachable.", flush=True)
            sys.exit(0)
        last = "Redis did not answer"
    except Exception as exc:  # report the kind of problem only, never the connection string
        last = type(exc).__name__
    connection.close()
    time.sleep(3)
print(f"Gave up waiting for the database and Redis ({last}). Check DATABASE_URL, REDIS_URL, "
      "the Azure firewall rule for this VM's IP, and that the database exists.", flush=True)
sys.exit(1)
PY
}

case "${1:-server}" in
  server)
    wait_for_services
    if ! python manage.py migrate --noinput; then
      echo "migrate failed. If the message mentions btree_gist: in the Azure portal open the" \
           "PostgreSQL server > Server parameters > azure.extensions, tick BTREE_GIST, Save," \
           "then restart this container (docs/DEPLOY.md)." >&2
      exit 1
    fi
    python manage.py collectstatic --noinput --verbosity 0
    # No access log here: Caddy logs each request (with the tokens in links removed).
    exec daphne --bind 0.0.0.0 --port 8000 --proxy-headers config.asgi:application
    ;;
  scheduler)
    wait_for_services
    exec python manage.py run_scheduler
    ;;
  *)
    exec "$@"
    ;;
esac
