"""Rule-based understanding of a booking or order message. No model, no network, no key.

`understand(text, now, catalogue)` returns a `Parsed` record: the intent and the slots it could
read (service, date, time, stylist, product and quantity). Dates are resolved deterministically in
Asia/Kolkata from `now`. English, Hinglish and Telugu written in English letters are understood
through small word lists; typos are repaired against the shop's own vocabulary.

This is also the fallback when the optional language-model layer is off, unavailable or refused.
The module never touches the database: callers pass in the catalogue (see `Catalogue`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from chatbot.engine.text import edit_distance, stem

IST = ZoneInfo("Asia/Kolkata")
MAX_CHARS = 500

# ----------------------------------------------------------------------------- word lists

TODAY = {"today", "todays", "aaj", "aj", "eroju", "ee", "2day", "indiki"}
TOMORROW = {
    "tomorrow",
    "tomorow",
    "tommorow",
    "tommorrow",
    "tmrw",
    "tmr",
    "tomo",
    "kal",
    "kaal",
    "repu",
    "rapu",
    "rpu",
}
AFTER_TOMORROW = {"parso", "parson", "perso", "ellundi"}
YESTERDAY = {"yesterday", "ninna", "kl"}

WEEKDAYS = {
    0: ("monday", "mon", "somvar", "somwar", "somavaram", "somvaar"),
    1: ("tuesday", "tue", "tues", "mangalvar", "mangalwar", "mangalavaram", "mangalvaar"),
    2: ("wednesday", "wed", "budhvar", "budhwar", "budhavaram", "budhvaar"),
    3: ("thursday", "thu", "thur", "thurs", "guruvar", "guruvaram", "veervar", "brihaspativar"),
    4: ("friday", "fri", "shukravar", "shukrawar", "sukravaram", "shukravaar"),
    5: ("saturday", "sat", "shanivar", "shaniwar", "sanivaram", "shanivaar"),
    6: ("sunday", "sun", "ravivar", "itwar", "aadivaram", "adivaram", "ravivaar"),
}
SHORT_DAYS = {"mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun"}
RISKY_SHORT = {"wed", "sat", "sun", "mon"}  # only a day name after on / this / next / coming
DAY_LOOKUP = {w: d for d, words in WEEKDAYS.items() for w in words}
LONG_DAY_WORDS = [w for w in DAY_LOOKUP if len(w) >= 6]

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

MORNING = {"morning", "mrng", "morn", "subah", "subha", "savere", "udayam", "ubhayam", "am"}
AFTERNOON = {"afternoon", "dopahar", "madhyahnam", "lunchtime", "noon", "afternon"}
EVENING = {
    "evening",
    "eve",
    "evng",
    "evenin",
    "shaam",
    "sham",
    "sayantram",
    "saayantram",
    "saayankalam",
    "sayankalam",
}
NIGHT = {"night", "raat", "ratri", "raatri"}
WINDOWS = {
    "morning": (time(9, 0), time(12, 0)),
    "afternoon": (time(12, 0), time(16, 0)),
    "evening": (time(16, 0), time(20, 0)),
    "night": (time(18, 0), time(22, 0)),
}

ANY_STYLIST = {
    "any",
    "anyone",
    "anybody",
    "whoever",
    "whichever",
    "evaraina",
    "evarina",
    "evaru",
    "koi",
}

WANT = {
    "want",
    "wanna",
    "need",
    "like",
    "chahiye",
    "chahie",
    "chahiyea",
    "chaahiye",
    "chahta",
    "chahti",
    "chahunga",
    "chahungi",
    "kavali",
    "kaavali",
    "kavalli",
    "kavaali",
    "kavalsindi",
    "venum",
}
BOOK = {
    "book",
    "booking",
    "bookin",
    "apointment",
    "appointment",
    "appointmnt",
    "appt",
    "reserve",
    "reservation",
    "schedule",
    "fix",
    "arrange",
    "karo",
    "karna",
    "karni",
    "karwao",
    "kar",
    "cheyyandi",
    "cheyandi",
    "cheyali",
    "cheyyali",
    "chey",
    "cheyyi",
}
AVAILABILITY = {
    "available",
    "availability",
    "avilable",
    "availible",
    "free",
    "slot",
    "slots",
    "vacant",
    "vacancy",
    "khali",
    "empty",
    "openings",
}
HOURS = {
    "hours",
    "timing",
    "timings",
    "open",
    "close",
    "closed",
    "closing",
    "opening",
    "khulta",
    "khulte",
    "khulega",
    "shut",
    "closes",
}
PRICE = {
    "price",
    "prices",
    "cost",
    "rate",
    "rates",
    "charge",
    "charges",
    "pricing",
    "kitna",
    "kitne",
    "entha",
    "enta",
    "kharcha",
    "dhara",
}
STATUS = {"status", "track", "update", "progress", "kahan", "ekkada", "pending", "stuck"}
CANCEL = {"cancel", "cancle", "cancell", "cancelled", "canceled", "cancl", "radd", "raddu"}
ORDER_EDIT = {
    "change",
    "quantity",
    "qty",
    "remove",
    "reduce",
    "increase",
    "edit",
    "modify",
    "delete",
}
RESCHEDULE = {
    "reschedule",
    "reschedul",
    "resched",
    "rebook",
    "postpone",
    "prepone",
    "badlo",
    "badal",
    "badalna",
    "marchu",
    "maarchu",
    "marchandi",
    "shift",
    "move",
    "change",
}
PERSON = {
    "person",
    "human",
    "receptionist",
    "agent",
    "representative",
    "executive",
    "manager",
    "somebody",
    "someone",
    "insaan",
    "manishi",
    "banda",
    "aadmi",
    "callback",
    "staff",
}
TALK = {"talk", "speak", "baat", "matladali", "matladandi", "connect", "call", "chat", "contact"}
ORDER = {
    "order",
    "orders",
    "buy",
    "purchase",
    "purchas",
    "shop",
    "kharidna",
    "kharidni",
    "konali",
    "konalani",
}
GREETING = {"hi", "hii", "hello", "helo", "hey", "namaste", "namaskaram", "hola", "yo"}
BOOKING_WORDS = {"booking", "bookings", "appointment", "appointments", "request", "requests"}

SERVICE_SYNONYMS = {
    "baal": "hair",
    "bal": "hair",
    "balon": "hair",
    "juttu": "hair",
    "jutt": "hair",
    "katwana": "cut",
    "katwani": "cut",
    "katwao": "cut",
    "katvana": "cut",
    "katai": "cut",
    "kataai": "cut",
    "kattinchali": "cut",
    "kattinchukovali": "cut",
    "cutting": "cut",
    "trimming": "trim",
    "mukham": "face",
    "chehra": "face",
    "nakhun": "nail",
    "goru": "nail",
    "goollu": "nail",
    "colouring": "colour",
    "coloring": "colour",
    "color": "colour",
    "dyeing": "dye",
    "mehendi": "mehndi",
}
GENDER_WORDS = {
    "men": "men",
    "mens": "men",
    "man": "men",
    "gents": "men",
    "gent": "men",
    "gentleman": "men",
    "male": "men",
    "boy": "men",
    "boys": "men",
    "husband": "men",
    "women": "women",
    "womens": "women",
    "woman": "women",
    "ladies": "women",
    "lady": "women",
    "female": "women",
    "girl": "women",
    "wife": "women",
    "kids": "kids",
    "kid": "kids",
    "child": "kids",
    "children": "kids",
    "son": "kids",
    "daughter": "kids",
    "baby": "kids",
}
GENERIC = {
    "a", "an", "the", "for", "me", "my", "i", "to", "of", "and", "in", "on", "at", "is", "it",
    "please", "pls", "plz", "can", "could", "you", "with", "some", "your", "do", "have", "get",
    "kindly", "hair",  # "hair" alone must not pick a hair service
}  # fmt: skip
# Ordinary words that must never be "repaired" into a service or product word.
PROTECTED = {
    "stylist", "stylists", "salon", "please", "tomorrow", "morning", "evening", "afternoon",
    "service", "services", "available", "appointment", "booking", "today", "again", "number",
    "price", "prices", "person", "someone", "receptionist", "request", "requests", "hours",
}  # fmt: skip
UNITS = {"ml", "gm", "gms", "kg", "ltr", "litre", "pack", "pcs"}
NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "ek": 1,
    "do": 2,
    "teen": 3,
    "char": 4,
    "paanch": 5,
    "oka": 1,
    "okati": 1,
    "rendu": 2,
    "moodu": 3,
    "nalugu": 4,
    "aidu": 5,
}


# ----------------------------------------------------------------------------- the catalogue


@dataclass
class Catalogue:
    """What the parser may match against. Plain data, built by the caller from the database."""

    services: list[dict] = field(default_factory=list)  # {id, name, aliases, gender}
    stylists: list[dict] = field(default_factory=list)  # {id, name}  (first names)
    products: list[dict] = field(default_factory=list)  # {id, name}

    def vocabulary(self) -> set[str]:
        words: set[str] = set()
        for svc in self.services:
            for phrase in [svc["name"], *svc.get("aliases", [])]:
                words.update(_tokens(phrase))
        for p in self.products:
            words.update(_tokens(p["name"]))
        return {w for w in words if len(w) >= 4}


@dataclass
class Parsed:
    intent: str = "other"
    service_ids: list[str] = field(default_factory=list)  # candidates (1 = decided)
    service_unknown: bool = False  # the customer named something we do not offer
    day: date | None = None
    day_is_week: bool = False  # "next week": any day from `day` on
    past: bool = False  # the date they gave has already passed
    time_from: time | None = None
    time_to: time | None = None
    time_exact: time | None = None
    stylist: str = ""  # "" | "any" | a stylist id
    stylist_name: str = ""
    products: list[str] = field(default_factory=list)  # product ids (candidates)
    quantity: int | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def has_time(self) -> bool:
        return bool(self.time_exact or self.time_from or self.time_to)

    def slots(self) -> dict:
        return {
            "service_ids": self.service_ids,
            "day": self.day.isoformat() if self.day else "",
            "time_from": self.time_from.strftime("%H:%M") if self.time_from else "",
            "time_to": self.time_to.strftime("%H:%M") if self.time_to else "",
            "time_exact": self.time_exact.strftime("%H:%M") if self.time_exact else "",
            "stylist": self.stylist,
            "products": self.products,
            "quantity": self.quantity,
        }


# ----------------------------------------------------------------------------- tokens


def _clean(text: str) -> str:
    text = (text or "")[:MAX_CHARS].lower()
    text = text.replace("’", "'").replace("`", "'")
    return re.sub(r"[^\w\s:/.\-']", " ", text)


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+|\d+", _clean(text).replace("'", ""))


def _swapped(a: str, b: str) -> bool:
    """Two neighbouring letters typed the wrong way round ("hiar" for "hair")."""
    if len(a) != len(b) or a == b:
        return False
    diff = [i for i in range(len(a)) if a[i] != b[i]]
    return (
        len(diff) == 2
        and diff[1] == diff[0] + 1
        and a[diff[0]] == b[diff[1]]
        and a[diff[1]] == b[diff[0]]
    )


def _near(word: str, options, *, limit: int | None = None) -> str | None:
    """The option closest to `word` (same first letter, small edit distance), else None."""
    if len(word) < 4 or word in PROTECTED:
        return None
    limit = limit if limit is not None else (1 if len(word) <= 7 else 2)
    best, best_d = None, limit + 1
    for option in options:
        if option[0] != word[0] or abs(len(option) - len(word)) > limit:
            continue
        d = 1 if _swapped(word, option) else edit_distance(word, option, limit)
        if d < best_d:
            best, best_d = option, d
    return best


# ----------------------------------------------------------------------------- dates


def _next_weekday(today: date, weekday: int, *, after_this_week: bool = False) -> date:
    start = today
    if after_this_week:
        start = today + timedelta(days=7 - today.weekday())  # next Monday
    return start + timedelta(days=(weekday - start.weekday()) % 7)


_NUMERIC_DATE = re.compile(
    r"(?<![\d:])(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?(?![\d:])"
)
_ORDINAL = re.compile(r"\b(\d{1,2})\s*(?:st|nd|rd|th)\b")
_DAY_MONTH = re.compile(r"\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})\b")
_MONTH_DAY = re.compile(r"\b([a-z]{3,9})\s+(\d{1,2})\s*(?:st|nd|rd|th)?\b")
_IN_DAYS = re.compile(r"\bin\s+(\d{1,2})\s+days?\b")


def _month_of(word: str) -> int | None:
    if word in MONTHS:
        return MONTHS[word]
    near = _near(word, [m for m in MONTHS if len(m) >= 5], limit=1)
    return MONTHS.get(near) if near else None


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _explicit_date(text: str, today: date) -> tuple[date | None, tuple[int, int] | None]:
    """A written date and its span in `text`, so the time reader can skip it."""
    m = _NUMERIC_DATE.search(text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        year = today.year
        if m.group(3):
            year = int(m.group(3))
            year += 2000 if year < 100 else 0
        if 1 <= d <= 31 and 1 <= mo <= 12:
            found = _safe_date(year, mo, d)
            if found:
                return found, m.span()
    for m in _DAY_MONTH.finditer(text):
        mo = _month_of(m.group(2))
        if mo:
            found = _safe_date(today.year, mo, int(m.group(1)))
            if found:
                return found, m.span()
    for m in _MONTH_DAY.finditer(text):
        mo = _month_of(m.group(1))
        if mo:
            found = _safe_date(today.year, mo, int(m.group(2)))
            if found:
                return found, m.span()
    m = _ORDINAL.search(text)
    if m:
        d = int(m.group(1))
        for add in (0, 1):
            month = today.month + add
            year = today.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            found = _safe_date(year, month, d)
            if found and found >= today:
                return found, m.span()
    return None, None


def read_day(
    text: str, tokens: list[str], today: date
) -> tuple[date | None, bool, bool, tuple | None]:
    """(day, whole_week, past, span). `today` is the date in Asia/Kolkata."""
    explicit, span = _explicit_date(text, today)
    if explicit is not None:
        if explicit < today and not _has_year(text):
            # "5 nov" said in december means next year; within the last 2 weeks it is simply past
            if (today - explicit).days > 60:
                explicit = explicit.replace(year=explicit.year + 1)
        return explicit, False, explicit < today, span
    m = _IN_DAYS.search(text)
    if m:
        return today + timedelta(days=int(m.group(1))), False, False, m.span()
    joined = " ".join(tokens)
    if "day after tomorrow" in joined or "overmorrow" in joined:
        return today + timedelta(days=2), False, False, None
    prev = ""
    for i, tok in enumerate(tokens):
        if tok in AFTER_TOMORROW:
            return today + timedelta(days=2), False, False, None
        if tok in YESTERDAY:
            return today - timedelta(days=1), False, True, None
        if tok in TOMORROW:
            if tok == "kal" and any(t in ("tha", "thi", "gaya", "gayi") for t in tokens):
                return today - timedelta(days=1), False, True, None
            return today + timedelta(days=1), False, False, None
        if tok in TODAY and tok != "ee":
            return today, False, False, None
        if tok == "ee" and i + 1 < len(tokens) and tokens[i + 1] == "roju":
            return today, False, False, None
        weekday = DAY_LOOKUP.get(tok)
        if weekday is None and len(tok) >= 6:
            near = _near(tok, LONG_DAY_WORDS, limit=2)
            weekday = DAY_LOOKUP.get(near) if near else None
        if weekday is not None:
            if tok in RISKY_SHORT and prev not in (
                "on",
                "this",
                "next",
                "coming",
                "by",
                "upcoming",
            ):
                prev = tok
                continue
            nxt = prev == "next"
            return _next_weekday(today, weekday, after_this_week=nxt), False, False, None
        prev = tok
    if "weekend" in tokens:
        return _next_weekday(today, 5), False, False, None
    if "next" in tokens and "week" in tokens:
        return today + timedelta(days=7 - today.weekday()), True, False, None
    return None, False, False, None


def _has_year(text: str) -> bool:
    return bool(re.search(r"\b20\d\d\b", text))


# ----------------------------------------------------------------------------- time of day

_CLOCK = r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"
_AFTER = re.compile(r"\b(?:after|post|from|starting|not before|later than)\s+" + _CLOCK)
_BEFORE = re.compile(r"\b(?:before|by|until|till|upto|up to|earlier than)\s+" + _CLOCK)
_AROUND = re.compile(r"\b(?:around|about|approx|near)\s+" + _CLOCK)
_AT = re.compile(r"\b(?:at|@)\s*" + _CLOCK)
_SUFFIX = re.compile(r"(?<![\d:/.-])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)")
_COLON = re.compile(r"(?<![\d/.-])([01]?\d|2[0-3]):([0-5]\d)(?!\d)")
_BAJE = re.compile(
    r"(?<![\d:/.-])(\d{1,2})\s*(?:baje|bje|o'?clock|oclock|gantalaku|gantalaki|gantalu)"
)


def _to_time(hour: int, minute: str | None, suffix: str | None) -> time | None:
    minute_i = int(minute) if minute else 0
    suffix = (suffix or "").replace(".", "")
    if suffix == "pm" and hour < 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    elif not suffix:
        if 1 <= hour <= 8:
            hour += 12  # "at 5" means 5 pm in a salon
        elif hour == 12:
            pass
    if hour > 23 or minute_i > 59:
        return None
    return time(hour, minute_i)


def read_time(text: str, tokens: list[str], skip: tuple | None = None):
    """(exact, from, to). Bare numbers are never a time: it needs at / am / pm / a colon."""
    if skip:
        text = text[: skip[0]] + " " * (skip[1] - skip[0]) + text[skip[1] :]
    m = _AFTER.search(text)
    if m and (t := _to_time(int(m.group(1)), m.group(2), m.group(3))):
        return None, t, None
    m = _BEFORE.search(text)
    if m and (t := _to_time(int(m.group(1)), m.group(2), m.group(3))):
        return None, None, t
    m = _AROUND.search(text)
    if m and (t := _to_time(int(m.group(1)), m.group(2), m.group(3))):
        return (
            None,
            (datetime.combine(date.min, t) - timedelta(hours=1)).time(),
            (datetime.combine(date.min, t) + timedelta(hours=1)).time(),
        )
    for pattern in (_AT, _SUFFIX, _COLON, _BAJE):
        m = pattern.search(text)
        if not m:
            continue
        if pattern is _COLON:
            t = _to_time(int(m.group(1)), m.group(2), None) if int(m.group(1)) > 12 else None
            t = t or time(
                int(m.group(1)) + (12 if 1 <= int(m.group(1)) <= 8 else 0), int(m.group(2))
            )
        elif pattern is _BAJE:
            t = _to_time(int(m.group(1)), None, None)
        else:
            t = _to_time(int(m.group(1)), m.group(2), m.group(3))
        if t:
            return t, None, None
    toks = set(tokens)
    for words, name in (
        (MORNING - {"am"}, "morning"),
        (AFTERNOON, "afternoon"),
        (EVENING, "evening"),
        (NIGHT, "night"),
    ):
        if toks & words or any(
            _near(t, [w for w in words if len(w) >= 6], limit=1) for t in toks if len(t) >= 6
        ):
            lo, hi = WINDOWS[name]
            return None, lo, hi
    return None, None, None


# ----------------------------------------------------------------------------- services, people


def _light(word: str) -> str:
    word = SERVICE_SYNONYMS.get(word, word)
    return stem(word)


def _stems(tokens: list[str]) -> list[str]:
    out = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if (
            tok == "hair"
            and i + 1 < len(tokens)
            and tokens[i + 1] in ("cut", "cutting", "spa", "colour", "color", "wash", "dry")
        ):
            if tokens[i + 1] in ("cut", "cutting"):
                out.append(_light("haircut"))
                i += 2
                continue
        out.append(_light(tok))
        i += 1
    return out


def _alias_sets(svc: dict) -> list[tuple[str, ...]]:
    sets = []
    for phrase in [svc["name"], *svc.get("aliases", [])]:
        toks = tuple(
            dict.fromkeys(t for t in _stems(_tokens(phrase)) if t not in GENERIC and len(t) > 1)
        )
        if toks:
            sets.append(toks)
    return sets


def match_services(tokens: list[str], cat: Catalogue) -> tuple[list[str], bool]:
    """(candidate service ids, named_something_unknown)."""
    vocab = cat.vocabulary()
    fixed = []
    for tok in tokens:
        if tok in vocab or tok in GENERIC or len(tok) < 4 or tok in GENDER_WORDS:
            fixed.append(tok)
            continue
        near = _near(tok, vocab)
        fixed.append(near or tok)
    stems = set(_stems(fixed))
    best_len, found = 0, []
    for svc in cat.services:
        longest = 0
        for alias in _alias_sets(svc):
            if all(a in stems for a in alias) and len(alias) > longest:
                longest = len(alias)
        if longest:
            found.append((longest, svc))
            best_len = max(best_len, longest)
    chosen = [svc for ln, svc in found if ln == best_len]
    if best_len == 1 and chosen:
        shared = {
            a
            for svc in chosen
            for alias in _alias_sets(svc)
            if len(alias) == 1 and alias[0] in stems
            for a in alias
        }
        for svc in cat.services:
            name_stems = set(_stems(_tokens(svc["name"])))
            if shared & name_stems and svc not in chosen:
                chosen.append(svc)
    wanted = {GENDER_WORDS[t] for t in tokens if t in GENDER_WORDS}
    if wanted and len(chosen) > 1:
        narrowed = [s for s in chosen if s.get("gender") in wanted]
        if narrowed:
            chosen = narrowed
    return [s["id"] for s in chosen], False


def match_stylist(tokens: list[str], cat: Catalogue) -> tuple[str, str]:
    """("any" | stylist id | "", display name)."""
    names = {s["name"].lower(): s for s in cat.stylists if s.get("name")}
    for tok in tokens:
        if tok in names:
            return names[tok]["id"], names[tok]["name"]
    for tok in tokens:
        if len(tok) >= 5:
            near = _near(tok, [n for n in names if len(n) >= 5], limit=1)
            if near:
                return names[near]["id"], names[near]["name"]
    joined = " ".join(tokens)
    if any(t in ANY_STYLIST for t in tokens) or "no preference" in joined or "koi bhi" in joined:
        return "any", ""
    return "", ""


def match_products(tokens: list[str], cat: Catalogue) -> list[str]:
    """Candidate product ids (the best-scoring ones)."""
    if not cat.products:
        return []
    stems = set(_stems(tokens))
    frequency: dict[str, int] = {}
    parsed = []
    for p in cat.products:
        words = [
            w
            for w in dict.fromkeys(_stems(_tokens(p["name"])))
            if w not in GENERIC and w not in UNITS and len(w) > 2 and not w.isdigit()
        ]
        parsed.append((p, words))
        for w in words:
            frequency[w] = frequency.get(w, 0) + 1
    scored = []
    for p, words in parsed:
        if not words:
            continue
        hit = [w for w in words if w in stems]
        if not hit:
            continue
        distinctive = any(frequency[w] <= 2 for w in hit)
        score = len(hit) / len(words)
        head = hit and words[-1] in hit and frequency[words[-1]] <= 2
        if (score >= 0.5 and (distinctive or len(hit) >= 2)) or head:
            scored.append((score, len(hit), p["id"]))
    if not scored:
        return []
    top = max(s[0] for s in scored)
    return [pid for sc, _n, pid in sorted(scored, reverse=True) if sc >= top - 1e-9][:6]


def read_quantity(text: str, tokens: list[str], skip: tuple | None) -> int | None:
    if skip:
        text = text[: skip[0]] + " " * (skip[1] - skip[0]) + text[skip[1] :]
    text = _AT.sub(" ", _SUFFIX.sub(" ", _COLON.sub(" ", text)))
    m = re.search(
        r"(?<![\d/:])(\d{1,3})\s*(?:x|pcs|pc|pieces|piece|bottles|bottle|nos|units|of)?(?![\d/:])",
        text,
    )
    if m and 1 <= int(m.group(1)) <= 999:
        return int(m.group(1))
    for tok in tokens:
        if tok in NUMBER_WORDS and tok not in ("do", "ek", "char"):
            return NUMBER_WORDS[tok]
    return None


# ----------------------------------------------------------------------------- intent


def _fix(tokens: list[str], *groups: set[str]) -> list[str]:
    """Repairs typos of the intent words only (so 'cancle' reads as 'cancel')."""
    pool = set().union(*groups)
    long_pool = [w for w in pool if len(w) >= 5]
    out = []
    for tok in tokens:
        if tok in pool or len(tok) < 5:
            out.append(tok)
        else:
            out.append(_near(tok, long_pool, limit=1) or tok)
    return out


def classify(tokens: list[str], text: str, parsed: Parsed) -> str:
    t = set(_fix(tokens, BOOK, AVAILABILITY, HOURS, PRICE, CANCEL, RESCHEDULE, ORDER, PERSON))
    t_all = " ".join(tokens)
    has_service = bool(parsed.service_ids)
    has_product = bool(parsed.products)
    has_when = parsed.day is not None or parsed.has_time
    mine = bool(t & {"my", "mine", "mera", "meri", "mere", "naa", "na"})
    if t & PERSON and (
        t & TALK
        or "person" in t
        or "human" in t
        or "receptionist" in t
        or t & {"callback", "agent", "representative", "executive", "manager"}
    ):
        return "person"
    if "call" in t and ("me" in t or "back" in t):
        return "person"
    if t & CANCEL:
        if "order" in t or "orders" in t or has_product:
            return "order_update"
        return "cancel"
    if ("order" in t or "orders" in t) and t & ORDER_EDIT:
        return "order_update"
    if "order" in t or "orders" in t:
        if (
            t & STATUS
            or t
            & {"where", "delivery", "delivered", "arrive", "arrived", "shipped", "ship", "reach"}
            or (mine and not has_product and not (t & {"buy", "add", "want", "need", "place"}))
        ):
            return "order_status"
    if t & RESCHEDULE and (
        t & {"booking", "appointment", "request", "time", "slot", "visit"}
        or (mine and has_service)
        or "reschedule" in t
        or "postpone" in t
        or "prepone" in t
        or "rebook" in t
        or t & {"badlo", "badal", "marchu", "marchandi"}
    ):
        return "reschedule"
    if has_product and (t & ORDER or t & WANT or t & {"add", "get", "need"}):
        if t & {"booking", "appointment", "visit"} and "add" in t:
            return "visit_product"
        return "order_product"
    if ("order" in t or t & {"buy", "purchase", "shop"}) and not has_service:
        return "order_product"
    if t and t <= {"order", "orders", "my", "mine", "mera", "meri"} and t & {"order", "orders"}:
        return "order_status"
    if t & STATUS and t & BOOKING_WORDS:
        return "status"
    if (mine and t & BOOKING_WORDS) or "where" in t and t & BOOKING_WORDS:
        return "status"
    if (t & PRICE or "how much" in t_all) and not (t & BOOK):
        return "price"
    if t & HOURS and not has_service and not (t & AVAILABILITY):
        return "hours"
    if t & AVAILABILITY and not (t & {"book", "booking"} and has_service and has_when):
        return "availability"
    if t & BOOK or (has_service and (t & WANT or has_when)):
        return "book"
    if has_service and not t - GENERIC - WANT:
        return "book"
    if has_product and not has_service:
        return "order_product"
    if t <= GREETING and t:
        return "greeting"
    if t & GREETING and len(t) <= 3:
        return "greeting"
    if "free" in t_all or "slots" in t_all:
        return "availability"
    return "other"


# ----------------------------------------------------------------------------- the entry point


def _named_in_full(tokens: list[str], cat: Catalogue, parsed: Parsed) -> bool:
    """Every word of a candidate product is in the message, including words that are not part of
    any matched service's name or aliases."""
    stems = set(_stems(tokens))
    service_words: set[str] = set()
    for svc in cat.services:
        if svc["id"] in parsed.service_ids:
            service_words |= set(_stems(_tokens(svc["name"])))
            for alias in _alias_sets(svc):
                service_words |= set(alias)
    for p in cat.products:
        if p["id"] not in parsed.products:
            continue
        words = [
            w
            for w in dict.fromkeys(_stems(_tokens(p["name"])))
            if w not in GENERIC and w not in UNITS and len(w) > 2 and not w.isdigit()
        ]
        if len(words) >= 2 and all(w in stems for w in words) and set(words) - service_words:
            return True
    return False


def understand(text: str, now: datetime, cat: Catalogue) -> Parsed:
    """Reads one message. `now` is any aware datetime; the date is taken in Asia/Kolkata."""
    cleaned = _clean(text)
    tokens = _tokens(text)
    today = now.astimezone(IST).date()
    parsed = Parsed()
    if not tokens:
        return parsed
    day, week, past, span = read_day(cleaned, tokens, today)
    parsed.day, parsed.day_is_week, parsed.past = day, week, past
    parsed.time_exact, parsed.time_from, parsed.time_to = read_time(cleaned, tokens, span)
    ids, unknown = match_services(tokens, cat)
    parsed.service_ids, parsed.service_unknown = ids, unknown
    parsed.stylist, parsed.stylist_name = match_stylist(tokens, cat)
    parsed.products = match_products(tokens, cat)
    if parsed.products and parsed.service_ids:
        # a name that fits both ("hair spa" product vs service): the one asked to be ordered wins,
        # and so does a product named in full ("glow facial kit" is not a facial)
        if set(tokens) & (ORDER | {"buy", "purchase", "bottle", "bottles"}) or _named_in_full(
            tokens, cat, parsed
        ):
            parsed.service_ids = []
        else:
            parsed.products = []
    if parsed.products:
        parsed.quantity = read_quantity(cleaned, tokens, span)
    parsed.intent = classify(tokens, cleaned, parsed)
    return parsed
