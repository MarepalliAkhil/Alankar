"""Task 8b: a backup can be restored into a fresh database with the same data."""

import shutil
from io import StringIO

import psycopg
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from core import backup

pytestmark = pytest.mark.django_db(transaction=True)

NEW_DB = "alankar_restore_check"

HAS_PG_TOOLS = bool(shutil.which("pg_dump") and shutil.which("pg_restore"))
needs_pg_tools = pytest.mark.skipif(
    not HAS_PG_TOOLS,
    reason="pg_dump/pg_restore not found on PATH (install PostgreSQL client tools, or set "
    "SALON_PG_BIN in .env, to run this test)",
)


def count_users(name):
    db = connection.settings_dict
    with psycopg.connect(
        host=db["HOST"] or "localhost",
        port=db["PORT"] or 5432,
        user=db["USER"],
        password=db["PASSWORD"] or None,
        dbname=name,
    ) as conn:
        return conn.execute("SELECT count(*) FROM accounts_user").fetchone()[0]


@pytest.fixture
def clean_target():
    backup.drop_database(NEW_DB)
    yield
    backup.drop_database(NEW_DB)


@needs_pg_tools
def test_backup_and_restore_round_trip(tmp_path, make_user, clean_target):
    make_user(role="customer", email="one@example.com")
    make_user(role="admin", email="two@example.com")
    out = StringIO()
    call_command("backup_db", "--dir", str(tmp_path), stdout=out)
    files = list(tmp_path.glob("alankar-*.dump"))
    assert len(files) == 1 and files[0].stat().st_size > 1000
    assert "Backup saved" in out.getvalue()
    call_command("restore_db", str(files[0]), "--into", NEW_DB, stdout=StringIO())
    assert count_users(NEW_DB) == 2


@needs_pg_tools
def test_restore_refuses_the_live_database_and_existing_names(tmp_path, clean_target):
    dump = backup.backup(tmp_path)
    with pytest.raises(CommandError):
        call_command("restore_db", str(dump), "--into", connection.settings_dict["NAME"])
    call_command("restore_db", str(dump), "--into", NEW_DB, stdout=StringIO())
    with pytest.raises(CommandError):
        call_command("restore_db", str(dump), "--into", NEW_DB)


def test_restore_rejects_odd_names_and_missing_files(tmp_path):
    with pytest.raises(CommandError):
        call_command("restore_db", str(tmp_path / "missing.dump"), "--into", "ok_name")
    dump = tmp_path / "x.dump"
    dump.write_bytes(b"x")
    with pytest.raises(CommandError):
        call_command("restore_db", str(dump), "--into", "bad name; drop database x")


def test_password_is_never_in_the_command_line(monkeypatch, tmp_path):
    """Checks the password handling in `_run` itself, regardless of whether pg_dump is
    actually installed on this machine: `_tool` is stubbed so the test exercises the same
    path (and fails the same way) whether or not PostgreSQL's client tools are on PATH."""
    seen = {}

    def fake_run(cmd, env=None, **kwargs):
        seen["cmd"] = cmd
        seen["env"] = env

        class Result:
            returncode = 1
            stderr = "boom"

        return Result()

    monkeypatch.setattr(backup, "_tool", lambda name: name)
    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    monkeypatch.setitem(connection.settings_dict, "PASSWORD", "super-secret-pw")
    with pytest.raises(backup.BackupError):
        backup.backup(tmp_path)
    assert "super-secret-pw" not in " ".join(seen["cmd"])
    assert seen["env"]["PGPASSWORD"] == "super-secret-pw"
