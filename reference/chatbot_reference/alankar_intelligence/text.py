"""Text utilities. Standard library only."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

CONTRACTIONS = {
    "what's": "what is", "whats": "what is", "where's": "where is", "wheres": "where is",
    "when's": "when is", "how's": "how is", "i'm": "i am", "im": "i am", "it's": "it is",
    "can't": "cannot", "cant": "cannot", "won't": "will not", "don't": "do not",
    "dont": "do not", "doesn't": "does not", "doesnt": "does not", "didn't": "did not",
    "didnt": "did not", "isn't": "is not", "isnt": "is not", "i'd": "i would",
    "i'll": "i will", "ive": "i have", "i've": "i have", "u": "you", "ur": "your",
    "r": "are", "pls": "please", "plz": "please", "thx": "thanks", "ty": "thanks",
}

ABBREVIATIONS = {
    "appt": "appointment", "appts": "appointments", "apt": "appointment", "apts": "appointments",
    "hrs": "hours", "hr": "hour", "mins": "minutes", "min": "minute", "tmrw": "tomorrow",
    "tmr": "tomorrow", "tomo": "tomorrow", "wat": "what", "wen": "when", "hw": "how",
    "bkg": "booking", "cncl": "cancel", "rs": "rupees", "inr": "rupees", "info": "information",
    "msg": "message", "acc": "account", "pwd": "password", "num": "number", "no.": "number",
}

# Telugu / Hindi words typed in English letters -> canonical English words.
# Admin/developer editable. Extend freely; unknown words are simply ignored.
TRANSLIT = {
    "kitna": "how much", "kitne": "how much", "entha": "how much", "enta": "how much",
    "kharcha": "price", "dabbulu": "price", "dhara": "price",
    "kab": "when", "eppudu": "when", "epudu": "when",
    "kahan": "location", "kaha": "location", "ekkada": "location", "ekkadundi": "location",
    "kaise": "how", "ela": "how", "yela": "how", "kya": "what", "emiti": "what", "emi": "what",
    "namaste": "hello", "namaskaram": "hello", "namaskar": "hello", "dhanyavadalu": "thanks",
    "dhanyavad": "thanks", "shukriya": "thanks", "ledu": "not", "nahi": "not", "nahin": "not",
}

STOPWORDS = {
    "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "do", "does", "did", "i",
    "you", "your", "yours", "me", "we", "us", "can", "could", "would", "should", "will", "to",
    "of", "in", "on", "at", "for", "it", "this", "that", "and", "or", "please", "tell", "want",
    "need", "know", "there", "any", "have", "has", "get", "with", "about", "so", "if", "my",
    "mine", "our", "ours", "also", "just", "kindly", "hi", "hey", "hello",
}

# Ordinary words that must never be "corrected" into domain words.
COMMON_WORDS = set("""
please tell show give want need know have does will would could should today tomorrow available
anyone there where which about around after before with without from into your yours mine make
made take takes long much many time times day days week month year open close work working good
best cheap change update status check find help thanks thank hello what when how why who whom
whose this that these those here some more most less very also only other another again still
already always never often sometimes really maybe because while during between under over
above below near next last first second third email phone mobile number name list details
detail information service services price prices total monthly daily online offline receive
received send sent late early soon today evening morning afternoon night tonight women men
kids girl boys male female child children please sorry okay yeah yes cancel
coming come comes came going goes sending sending sends reaching working works wrong right left
stuck failed failing error problem issue issues trouble
""".split())

IRREGULAR = {
    "cancelled": "cancel", "cancelling": "cancel", "canceled": "cancel", "canceling": "cancel",
    "cancellation": "cancel", "cancellations": "cancel", "paid": "pay", "paying": "pay",
    "payments": "payment", "went": "go", "gone": "go", "bought": "buy", "booked": "book",
    "women": "women", "men": "men", "kids": "kids", "pricing": "price",
    "received": "receive", "receiving": "receive", "refunded": "refund", "refunding": "refund",
    "rescheduled": "reschedule", "rescheduling": "reschedule", "expired": "expire",
    "expiry": "expire", "expires": "expire", "expiring": "expire",
}

TELUGU_RANGE = re.compile(r"[\u0C00-\u0C7F]")
DEVANAGARI_RANGE = re.compile(r"[\u0900-\u097F]")


def has_non_latin_script(text: str) -> bool:
    return bool(TELUGU_RANGE.search(text) or DEVANAGARI_RANGE.search(text))


def normalize(text: str, max_len: int = 500) -> list[str]:
    """Lowercase, clean, expand contractions/abbreviations/transliteration -> token list."""
    t = unicodedata.normalize("NFKC", text or "")[:max_len].lower()
    t = re.sub(r"[\u200b-\u200f\u202a-\u202e\ufeff]", "", t)
    t = t.replace("\u20b9", " rupees ")
    t = re.sub(r"\brs\.", " rupees ", t)
    t = re.sub(r"[^a-z0-9\s'\-]", " ", t)
    out: list[str] = []
    for raw in t.split():
        tok = raw.strip("'-")
        if not tok:
            continue
        for piece in _expand(tok):
            out.append(piece)
    return out


def _expand(tok: str) -> list[str]:
    if tok in CONTRACTIONS:
        return CONTRACTIONS[tok].split()
    if tok in ABBREVIATIONS:
        return ABBREVIATIONS[tok].split()
    if tok in TRANSLIT:
        return TRANSLIT[tok].split()
    return [tok.replace("'", "")]


def stem(w: str) -> str:
    """Small, consistent suffix stripper. Applied to BOTH queries and knowledge, so it only
    needs to be consistent, not linguistically perfect."""
    if w in IRREGULAR:
        w = IRREGULAR[w]
    if len(w) <= 3 or w.isdigit():
        return w
    if w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    elif w.endswith(("sses", "shes", "ches", "xes", "zes")):
        w = w[:-2]
    elif w.endswith("s") and not w.endswith(("ss", "us", "is")):
        w = w[:-1]
    for suf in ("ing", "ed", "ly"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            w = w[: -len(suf)]
            if len(w) >= 3 and w[-1] == w[-2] and w[-1] not in "lsz":
                w = w[:-1]
            break
    if w.endswith("e") and len(w) > 3:
        w = w[:-1]
    return w


def edit_distance(a: str, b: str, limit: int = 3) -> int:
    """Optimal string alignment distance (insert, delete, substitute, transpose) with early exit."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev2: list[int] | None = None
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if prev2 is not None and i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        if min(cur) > limit:
            return limit + 1
        prev2, prev = prev, cur
    return prev[-1]


class SpellCorrector:
    """Corrects a token to the closest word in the shop's own vocabulary.
    Rules: token length >= 4, same first letter, distance <= 1 (len<=5) or <= 2 (longer),
    never touches known words, numbers or common English words."""

    def __init__(self, vocabulary: Counter[str]):
        self.vocab = vocabulary
        self.by_first: dict[str, list[str]] = {}
        for w in vocabulary:
            self.by_first.setdefault(w[0], []).append(w)

    def correct(self, tok: str) -> str:
        if len(tok) < 4 or tok.isdigit() or tok in self.vocab or tok in COMMON_WORDS:
            return tok
        limit = 1 if len(tok) <= 6 else 2
        best: tuple[int, int, str] | None = None
        for cand in self.by_first.get(tok[0], []):
            if abs(len(cand) - len(tok)) > limit:
                continue
            d = edit_distance(tok, cand, limit)
            if d <= limit:
                key = (d, -self.vocab[cand], cand)
                if best is None or key < best:
                    best = key
        return best[2] if best else tok
