"""Task 8a: nothing that could hold a secret or a private message is passed to the logger."""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = ("tests", "migrations", ".venv", "venv", "staticfiles", "node_modules")
LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical", "log"}
FORBIDDEN = {"password", "token", "otp", "code", "body", "text", "content", "message", "secret"}


def _names(node):
    """Names that are actually passed on: `message.kind` yields `kind`, not `message`."""
    bases = {id(n.value) for n in ast.walk(node) if isinstance(n, ast.Attribute)}
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name) and id(sub) not in bases:
            yield sub.id
        elif isinstance(sub, ast.Attribute):
            yield sub.attr


def test_logger_calls_never_receive_secrets_or_message_text():
    problems = []
    for path in ROOT.rglob("*.py"):
        if any(part in SKIP for part in path.relative_to(ROOT).parts):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                continue
            if node.func.attr not in LOG_METHODS:
                continue
            base = node.func.value
            if not (isinstance(base, ast.Name) and base.id in {"logger", "log", "logging"}):
                continue
            for arg in node.args[1:]:
                bad = {n.lower() for n in _names(arg)} & FORBIDDEN
                if bad:
                    problems.append(f"{path.relative_to(ROOT)}:{node.lineno} {sorted(bad)}")
    assert not problems, problems


def test_scan_actually_sees_logger_calls():
    found = 0
    for path in ROOT.rglob("*.py"):
        if "mail.py" in path.name:
            found += path.read_text(encoding="utf-8").count("logger.")
    assert found >= 2
