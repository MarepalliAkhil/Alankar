#!/usr/bin/env bash
# First launch (docs/DEPLOY.md). Run on the VM after the stack is up:
#   docker compose --env-file .env.production -f docker-compose.prod.yml exec backend /app/deploy/first_run.sh
# 1. Only when the database has NO bookings and NO customers: load the demo (reset_demo).
#    It refuses to reset a database that has data.
# 2. Create the admin from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD when no account with that
#    email exists (an existing account is never changed). This runs after step 1 because the demo
#    reset empties the database.
# 3. Demo extras, the owner's demo coupons, recommendations (all add-only and safe to re-run).
set -euo pipefail
cd /app/backend

COUNTS="$(python manage.py shell -c "
from scheduling.models import Appointment
from accounts.models import User
print(Appointment.objects.count(), User.objects.filter(role='customer').count())
" | tail -n1)"
BOOKINGS="${COUNTS% *}"
CUSTOMERS="${COUNTS#* }"
DBNAME="$(python manage.py shell -c "from django.conf import settings; print(settings.DATABASES['default']['NAME'])" | tail -n1)"

if [ "$BOOKINGS" = "0" ] && [ "$CUSTOMERS" = "0" ]; then
  echo "The database '$DBNAME' has no bookings and no customers: loading the demo."
  python manage.py reset_demo --yes --really-wipe "$DBNAME"
else
  echo "The database '$DBNAME' already has data ($BOOKINGS bookings, $CUSTOMERS customers): NOT resetting it."
fi

if [ -n "${ADMIN_EMAIL:-}" ]; then
  EXISTS="$(python manage.py shell -c "
import os
from accounts.models import User
print(User.objects.filter(email__iexact=os.environ['ADMIN_EMAIL']).exists())
" | tail -n1)"
  if [ "$EXISTS" = "True" ]; then
    echo "An account for $ADMIN_EMAIL already exists: left unchanged."
  elif [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "ADMIN_PASSWORD is empty: no admin created." >&2
  else
    SALON_ADMIN_PASSWORD="$ADMIN_PASSWORD" python manage.py create_admin \
      --email "$ADMIN_EMAIL" --name "${ADMIN_NAME:-Admin}"
  fi
fi

python manage.py seed_demo_extras || echo "seed_demo_extras skipped (see the message above)."
python manage.py seed_demo_coupons || echo "seed_demo_coupons skipped (see the message above)."
python manage.py build_recommendations
echo "First run finished."
