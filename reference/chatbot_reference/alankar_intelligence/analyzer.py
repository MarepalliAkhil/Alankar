"""Query analysis: normalize -> spell-correct -> stem -> canonicalize (the 'rephrase' step)."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from .text import SpellCorrector, has_non_latin_script, normalize, stem, STOPWORDS

# Words ignored when matching phrases / scoring (they carry no topic information).
FILLER = {"a", "an", "the", "to", "do", "does", "did", "i", "you", "can", "could", "would",
          "will", "please", "is", "are", "am", "it", "of", "for", "me", "we", "us", "your",
          "yours", "there", "this", "that", "so", "just", "also", "and", "be", "get", "tell",
          "want", "need", "know", "kindly", "hi", "with", "by", "on", "in", "at", "from",
          "as", "if", "any", "or", "us", "our"}
FILLER_STEMS = {stem(w) for w in FILLER}
QUESTION_WORDS = {"what", "how", "when", "where", "why", "which", "who"}
STOP_STEMS = {stem(w) for w in STOPWORDS} | {stem(w) for w in QUESTION_WORDS}


@dataclass
class Analysis:
    original: str
    tokens: list[str] = field(default_factory=list)       # after cleaning/expansion
    corrected: list[str] = field(default_factory=list)    # after spell correction
    corrections: list[tuple[str, str]] = field(default_factory=list)
    canon: list[str] = field(default_factory=list)        # stemmed + synonym-canonicalized
    content: list[str] = field(default_factory=list)      # canon without filler words
    non_latin: bool = False


class Analyzer:
    def __init__(self, synonyms: dict, vocabulary: Counter):
        self.corrector = SpellCorrector(vocabulary)
        self.surface_map: dict[str, str] = {}
        for target, sources in synonyms.get("surface", {}).items():
            for s_ in sources:
                self.surface_map[s_] = target
        self.word_map: dict[str, str] = {}
        for target, sources in synonyms.get("words", {}).items():
            for s in sources:
                self.word_map[stem(s)] = stem(target)
        self.phrases: list[tuple[tuple[str, ...], tuple[str, ...]]] = []
        for target, sources in synonyms.get("phrases", {}).items():
            tgt = tuple(stem(w) for w in target.split())
            for phrase in sources:
                src = tuple(stem(w) for w in normalize(phrase))
                self.phrases.append((src, tgt))
        self.phrases.sort(key=lambda p: -len(p[0]))

    def analyze(self, text: str, correct: bool = True) -> Analysis:
        a = Analysis(original=text or "")
        a.non_latin = has_non_latin_script(a.original)
        a.tokens = normalize(a.original)
        for tok in a.tokens:
            fixed = self.corrector.correct(tok) if correct else tok
            if fixed != tok:
                a.corrections.append((tok, fixed))
            a.corrected.append(fixed)
        stems = [stem(self.surface_map.get(t, t)) for t in a.corrected]
        a.canon = self._canonicalize(stems)
        a.content = [t for t in a.canon if t not in FILLER_STEMS]
        return a

    def _canonicalize(self, stems: list[str]) -> list[str]:
        out: list[str] = []
        i = 0
        while i < len(stems):
            matched = False
            for src, tgt in self.phrases:
                n = len(src)
                if tuple(stems[i:i + n]) == src:
                    out.extend(tgt)
                    i += n
                    matched = True
                    break
            if not matched:
                out.append(self.word_map.get(stems[i], stems[i]))
                i += 1
        return out
