"""The shared engine: built from the database once, rebuilt whenever its data changes."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from django.db.models.signals import post_delete, post_save

from chatbot import data
from chatbot.engine import Engine

_SYNONYMS = json.loads(
    (Path(__file__).parent / "engine" / "data" / "synonyms.json").read_text(encoding="utf-8")
)
_lock = threading.Lock()
_engine: Engine | None = None
_built_at = 0.0
# Other server processes do not see our signals, and some admin changes use bulk updates,
# so the engine is also rebuilt after this many seconds.
MAX_AGE_SECONDS = 300


def get_engine() -> Engine:
    global _engine, _built_at
    engine = _engine
    if engine is None or time.monotonic() - _built_at > MAX_AGE_SECONDS:
        with _lock:
            if _engine is None or time.monotonic() - _built_at > MAX_AGE_SECONDS:
                _engine = Engine(data.catalog(), data.knowledge_entries(), _SYNONYMS)
                _built_at = time.monotonic()
            engine = _engine
    return engine


def rebuild(**_kwargs) -> None:
    """Drop the cached engine; the next question builds a fresh one from the database."""
    global _engine
    with _lock:
        _engine = None


def connect_signals() -> None:
    from people.models import Rating, StylistProfile
    from scheduling.models import Service, ServiceCategory
    from website.models import KnowledgeEntry, SiteContent

    for model in (Service, ServiceCategory, StylistProfile, Rating, SiteContent, KnowledgeEntry):
        for signal in (post_save, post_delete):
            signal.connect(rebuild, sender=model, dispatch_uid=f"chatbot-{signal}-{model.__name__}")
