"""Database backup and restore with PostgreSQL's own tools (pg_dump / pg_restore).

Backups are single files (custom format). Restoring always goes into a NEW database so it can
never overwrite live data by accident; to switch the app to it, change SALON_DB_NAME in .env.
The database password is passed to the tools through the environment, never on the command line,
and is never printed.
"""

import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

import psycopg
from django.conf import settings
from django.db import connection
from psycopg import sql


class BackupError(Exception):
    pass


NAME_OK = re.compile(r"^[A-Za-z0-9_]{1,60}$")


def _tool(name: str) -> str:
    folder = os.environ.get("SALON_PG_BIN", "")
    candidates = [Path(folder) / name, Path(folder) / f"{name}.exe"] if folder else []
    for path in candidates:
        if path.exists():
            return str(path)
    found = shutil.which(name)
    if not found:
        raise BackupError(
            f"{name} was not found. Install PostgreSQL client tools, then either add their "
            "'bin' folder to PATH or set SALON_PG_BIN to that folder in .env."
        )
    return found


def _conn_args(db: dict) -> list[str]:
    args = ["-h", str(db.get("HOST") or "localhost"), "-p", str(db.get("PORT") or "5432")]
    if db.get("USER"):
        args += ["-U", db["USER"]]
    return args


def _env(db: dict) -> dict:
    env = dict(os.environ)
    if db.get("PASSWORD"):
        env["PGPASSWORD"] = db["PASSWORD"]
    return env


def _run(cmd: list[str], db: dict) -> None:
    result = subprocess.run(cmd, env=_env(db), capture_output=True, text=True)
    if result.returncode != 0:
        # Tool messages never contain the password, but keep the output short anyway.
        raise BackupError((result.stderr or "the tool failed").strip()[-400:])


def backup(directory: str | Path) -> Path:
    db = connection.settings_dict
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = folder / f"alankar-{stamp}.dump"
    _run(
        [
            _tool("pg_dump"),
            *_conn_args(db),
            "--format=custom",
            "--no-owner",
            "--file",
            str(target),
            db["NAME"],
        ],
        db,
    )
    if not target.exists() or target.stat().st_size == 0:
        raise BackupError("The backup file is empty.")
    return target


def restore(dump_file: str | Path, new_database: str) -> str:
    db = connection.settings_dict
    dump = Path(dump_file)
    if not dump.is_file():
        raise BackupError("Backup file not found.")
    if not NAME_OK.match(new_database):
        raise BackupError("Database name may only use letters, digits and underscore.")
    if new_database == db["NAME"] or new_database == f"test_{db['NAME']}":
        raise BackupError("Restore never writes into the database the app is using.")
    maintenance = psycopg.connect(
        host=db.get("HOST") or "localhost",
        port=db.get("PORT") or 5432,
        user=db.get("USER") or None,
        password=db.get("PASSWORD") or None,
        dbname="postgres",
        autocommit=True,
    )
    try:
        with maintenance.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", [new_database])
            if cur.fetchone():
                raise BackupError(
                    f"Database '{new_database}' already exists. Choose a new name or drop it first."
                )
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(new_database)))
    finally:
        maintenance.close()
    _run(
        [
            _tool("pg_restore"),
            *_conn_args(db),
            "--no-owner",
            "--exit-on-error",
            "--dbname",
            new_database,
            str(dump),
        ],
        db,
    )
    return new_database


def drop_database(name: str) -> None:
    """Used by tests and by people cleaning up a trial restore."""
    db = connection.settings_dict
    if not NAME_OK.match(name) or name == db["NAME"]:
        raise BackupError("Refusing to drop that database.")
    conn = psycopg.connect(
        host=db.get("HOST") or "localhost",
        port=db.get("PORT") or 5432,
        user=db.get("USER") or None,
        password=db.get("PASSWORD") or None,
        dbname="postgres",
        autocommit=True,
    )
    try:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(name)))
    finally:
        conn.close()


def configured_backup_dir() -> Path:
    return Path(getattr(settings, "SALON_BACKUP_DIR", settings.BASE_DIR / "backups"))
