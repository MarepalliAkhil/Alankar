"""AI Alankar Intelligence: a deterministic question-understanding engine.

No machine-learning models, no LLMs, no external APIs, no API keys.
Pipeline: normalize -> spell-correct -> stem -> canonicalize (rephrase)
-> entities -> intent scoring -> (BM25 fallback) -> grounded answer.
"""
from .engine import Engine, Session, Reply  # noqa: F401
