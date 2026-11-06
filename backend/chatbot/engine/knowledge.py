"""Knowledge base + catalog loading and BM25 retrieval. Standard library only."""

from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .analyzer import STOP_STEMS, Analyzer
from .text import normalize

DATA = Path(__file__).parent / "data"


def load_json(name: str) -> dict:
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


@dataclass
class KBEntry:
    id: str
    question: str
    answer: str
    tags: list[str]
    tokens: list[str] | None = None


class BM25Index:
    """Classic BM25 (k1=1.5, b=0.75) over the knowledge base."""

    def __init__(
        self, entries: list[KBEntry], analyzer: Analyzer, k1: float = 1.5, b: float = 0.75
    ):
        self.entries, self.k1, self.b = entries, k1, b
        self.docs: list[Counter] = []
        for e in entries:
            q = self._terms(analyzer.analyze(e.question, correct=False).canon)
            t = self._terms(analyzer.analyze(" ".join(e.tags), correct=False).canon)
            a = self._terms(analyzer.analyze(e.answer, correct=False).canon)
            self.docs.append(Counter(q * 2 + t * 2 + a))  # question and tags weigh double
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg_len = (sum(self.lengths) / len(self.lengths)) if self.lengths else 1.0
        self.df: Counter = Counter()
        for d in self.docs:
            self.df.update(d.keys())

    @staticmethod
    def _terms(tokens: list[str]) -> list[str]:
        return [t for t in tokens if t not in STOP_STEMS and not t.isdigit()]

    def search(self, canon_tokens: list[str]) -> list[tuple[float, KBEntry]]:
        terms = set(self._terms(canon_tokens))
        n = len(self.docs)
        scored = []
        for i, d in enumerate(self.docs):
            s = 0.0
            for t in terms:
                f = d.get(t, 0)
                if not f:
                    continue
                idf = math.log(1 + (n - self.df[t] + 0.5) / (self.df[t] + 0.5))
                denom = f + self.k1 * (1 - self.b + self.b * self.lengths[i] / self.avg_len)
                s += idf * f * (self.k1 + 1) / denom
            if s > 0:
                scored.append((s, self.entries[i]))
        scored.sort(key=lambda x: -x[0])
        return scored


def build_vocabulary(
    synonyms: dict, kb: list[KBEntry], catalog: dict, intent_words: list[str]
) -> Counter:
    from .text import COMMON_WORDS

    texts: list[str] = []
    for e in kb:
        texts += [e.question, e.answer, " ".join(e.tags)]
    for s in catalog["services"]:
        texts += [s["name"], " ".join(s["aliases"]), s.get("info", "")]
    for st in catalog["stylists"]:
        texts += [st["name"], st["specialization"]]
    texts.append(catalog["shop"]["name"])
    vocab: Counter = Counter()
    for t in texts:
        vocab.update(normalize(t))
    for target, sources in synonyms["words"].items():
        vocab.update([target, *sources])
    for target, phrases in synonyms["phrases"].items():
        vocab.update(target.split())
        for p in phrases:
            vocab.update(normalize(p))
    vocab.update(intent_words)
    vocab.update(COMMON_WORDS)
    return vocab
