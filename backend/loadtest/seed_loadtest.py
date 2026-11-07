r"""Builds the throw-away database the load test runs against, using the app's own commands.

    cd backend
    set SALON_DB_NAME=alankar_load
    python loadtest\seed_loadtest.py

It refuses to touch any database whose name does not end in "_load", so it can never wipe real data.
Steps (all existing commands and helpers): create the database if missing, `migrate`, `flush`,
`seed_demo` (services, team, content), then the load-test accounts through `core.demo`:

  * 1 admin, 3 receptionists, 1 stylist linked to a team profile (the weights in locustfile.py
    use these), and 300 customers, all email-verified so the normal sign-in works;
  * the same password for all of them (LOAD_PASSWORD below), which exists only in this
    throw-away database.

Customers sign in with their password only because the sign-in code step (customer email code)
is not active when no email is configured and DEBUG is false: that is the app's own setting
(SALON_CUSTOMER_OTP / SMTP), nothing here skips it. See docs/LOAD_TEST.md.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

import psycopg  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from psycopg import sql  # noqa: E402

from core import demo  # noqa: E402

LOAD_PASSWORD = "Load-Test-2026!"
CUSTOMERS = int(os.environ.get("LOAD_CUSTOMERS", "300"))
DOMAIN = "load.example.com"

STAFF = [
    ("admin", f"admin@{DOMAIN}", "Load Admin", None, ""),
    ("receptionist", f"desk1@{DOMAIN}", "Load Desk One", None, ""),
    ("receptionist", f"desk2@{DOMAIN}", "Load Desk Two", None, ""),
    ("receptionist", f"desk3@{DOMAIN}", "Load Desk Three", None, ""),
    ("stylist", f"stylist@{DOMAIN}", "Load Stylist", "Rahul", ""),
]


def customer_rows(count: int):
    # Valid Indian mobile numbers (start with 9): 9300000001, 9300000002, ...
    return [
        (f"customer{n:03d}@{DOMAIN}", f"Load Customer {n:03d}", str(9300000000 + n))
        for n in range(1, count + 1)
    ]


def main() -> None:
    db = connection.settings_dict
    name = db["NAME"]
    if not name.endswith("_load"):
        sys.exit(
            f"Refusing to run: database '{name}' does not end in _load. "
            "Set SALON_DB_NAME=alankar_load first."
        )
    admin = psycopg.connect(
        host=db.get("HOST") or "localhost",
        port=db.get("PORT") or 5432,
        user=db.get("USER") or None,
        password=db.get("PASSWORD") or None,
        dbname="postgres",
        autocommit=True,
    )
    try:
        exists = admin.execute("SELECT 1 FROM pg_database WHERE datname = %s", [name])
        if exists.fetchone() is None:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
            print(f"Created database {name}.")
    finally:
        admin.close()
    connection.close()
    call_command("migrate", interactive=False, verbosity=0)
    call_command("flush", interactive=False, verbosity=0)
    call_command("seed_demo", verbosity=0)
    demo.ensure_staff(STAFF, LOAD_PASSWORD)
    print("Staff accounts ready. Creating customers (passwords are hashed slowly on purpose)...")
    demo.ensure_customers(customer_rows(CUSTOMERS), LOAD_PASSWORD)
    print(f"Load-test database '{name}' is ready: {len(STAFF)} staff and {CUSTOMERS} customers.")


if __name__ == "__main__":
    main()
