"""AI Alankar Intelligence: a deterministic question-understanding engine.

No machine-learning models, no LLMs, no external APIs, no API keys. Standard library only.
Pipeline: normalize -> spell-correct -> stem -> canonicalize (rephrase) -> entities -> intent
scoring -> (BM25 fallback) -> grounded answer. See docs/CHATBOT_ALGORITHM.md.
"""

from .engine import Engine, Reply, Session  # noqa: F401
