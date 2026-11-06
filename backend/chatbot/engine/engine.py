"""AI Alankar Intelligence engine: deterministic, grounded, no external services."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

from .analyzer import FILLER_STEMS, Analysis, Analyzer
from .intents import INTENT_TO_KB, INTENTS, Intent
from .knowledge import BM25Index, KBEntry, build_vocabulary
from .text import TRANSLIT, normalize, stem

MIN_CONF = 0.60  # accept an intent at or above this confidence
STRONG_CONF = 0.80  # accept without the "did you mean" check
CLEAR_MARGIN = 0.10  # required lead over the second-best intent
KB_MIN_CONF = 0.45  # minimum BM25 confidence to answer from the knowledge base
MAX_QUERY_CHARS = 500

GENDERS = {"men": "men", "women": "women", "kid": "kids"}  # keys are STEMS
DIVISIONS = {"salon": "salon", "spa": "spa", "parlor": "parlor"}  # keys are STEMS
DIVISION_LABEL = {"salon": "Salon", "spa": "Spa", "parlor": "Beauty Parlor"}
DIVISION_URL = {"salon": "/salon", "spa": "/spa", "parlor": "/beauty-parlor"}
AUDIENCE_LABEL = {"men": "Men", "women": "Women", "kids": "Kids", "unisex": "Everyone (unisex)"}
URL_APPOINTMENTS = "/customer/appointments"
URL_INVOICES = "/customer/invoices"
URL_WALLET = "/customer/wallet"
URL_BOOK = "/customer/book"
URL_ORDERS = "/customer/orders"
WORDS_NOT_LANGUAGE = "I can read English, and Telugu or Hindi words typed in English letters (for example 'haircut entha'). Please type your question using English letters."


@dataclass
class Reply:
    text: str
    intent: str = "unknown"
    confidence: float = 0.0
    rephrased: str = (
        ""  # the question as understood (built from canonical data, never from raw input)
    )
    show_rephrase: bool = False  # UI shows "I understood: ..." when True
    actions: list[dict] = field(default_factory=list)  # [{"label","url"}] deep links only
    suggestions: list[str] = field(default_factory=list)  # tappable follow-up questions
    needs_login: bool = False
    source: str = "intent"  # intent | kb | followup | clarify | fallback
    unanswered_key: str | None = None  # normalized, anonymous text for the admin "unanswered" list


@dataclass
class Session:
    last_intent: str | None = None
    last_entities: dict = field(default_factory=dict)


class NullTools:
    """Default tools: no user data."""

    def next_appointment(self, user_id):
        return None

    def upcoming(self, user_id):
        return []

    def history(self, user_id):
        return []

    def invoices(self, user_id):
        return []

    def loyalty_points(self, user_id):
        return 0

    def awaiting_payment(self, user_id):
        return []

    def packages(self, user_id):
        return []

    def membership(self, user_id):
        return None

    def gift_cards(self, user_id):
        return []

    def orders(self, user_id):
        return []


class _Safe(dict):
    """format_map helper: an unknown {placeholder} in an admin-written answer stays as typed."""

    def __missing__(self, key):
        return "{" + key + "}"


@dataclass
class _Svc:
    data: dict
    alias_stems: list[tuple[str, ...]]


class Engine:
    def __init__(
        self,
        catalog: dict,
        kb_entries: list[dict],
        synonyms: dict,
        intents: list[Intent] | None = None,
    ):
        self.catalog = catalog
        self.shop = catalog["shop"]
        self.intents = intents or INTENTS
        self.kb = [
            KBEntry(e["id"], e["question"], e["answer"], e.get("tags", [])) for e in kb_entries
        ]
        self.kb_by_id = {e.id: e for e in self.kb}
        intent_words = [w for i in self.intents for w in i.keywords]
        vocab = build_vocabulary(synonyms, self.kb, catalog, intent_words)
        self.analyzer = Analyzer(synonyms, vocab)
        self.index = BM25Index(self.kb, self.analyzer)
        self._kw = {i.name: {stem(w): wt for w, wt in i.keywords.items()} for i in self.intents}
        self._ph = {
            i.name: [(tuple(stem(w) for w in p.split()), b) for p, b in i.phrases]
            for i in self.intents
        }
        self.services = [_Svc(s, self._alias_stems(s)) for s in catalog["services"]]
        self.stylist_names = {stem(st["name"].lower()): st for st in catalog["stylists"]}

    # ------------------------------------------------------------------ public API
    def answer(
        self, text: str, user: dict | None = None, tools=None, session: Session | None = None
    ) -> Reply:
        tools = tools or NullTools()
        session = session if session is not None else Session()
        text = (text or "")[:MAX_QUERY_CHARS]
        a = self.analyzer.analyze(text)
        if a.non_latin and not a.content:
            return self._fallback(WORDS_NOT_LANGUAGE, key=None)
        if not a.content:
            return self._fallback(self._fallback_text(), key=None)

        ents = self._entities(a)
        ranked = self._rank(a, ents, user is not None)
        top, conf1 = ranked[0]
        conf2 = ranked[1][1] if len(ranked) > 1 else 0.0

        # 0) "how long does it take?" right after talking about a service: keep that service
        if (
            top.name in ("service_price", "service_duration")
            and not ents["services"]
            and session.last_entities.get("services")
            and len(a.content) <= 5
        ):
            ents = {**ents, "services": session.last_entities["services"]}

        # 1) confident intent
        if conf1 >= MIN_CONF and (
            conf2 < MIN_CONF or conf1 - conf2 >= CLEAR_MARGIN or conf1 >= STRONG_CONF
        ):
            return self._handle(top, conf1, a, ents, user, tools, session)

        # 2) two close intents -> ask the user to choose between the rephrased questions
        if conf1 >= MIN_CONF and conf2 >= MIN_CONF:
            t1, t2 = top, ranked[1][0]
            return Reply(
                text="I want to be sure I answer the right question. Did you mean one of these?",
                intent="clarify",
                confidence=conf1,
                source="clarify",
                suggestions=[self._rephrase(t1, ents), self._rephrase(t2, ents)],
            )

        # 2b) a short, weak question on the same topic as the last answer ("and on sunday?")
        if (
            session.last_intent == top.name
            and conf1 >= 0.30
            and len(a.content) <= 3
            and top.name in ("hours", "location", "contact", "payment_howto", "booking_howto")
        ):
            r = self._handle(top, 0.7, a, ents, user, tools, session)
            r.source = "followup"
            return r

        # 3) follow-up using the previous topic ("and for women?")
        if (
            session.last_intent
            and (ents["services"] or ents["division"] or ents["gender"])
            and len(a.content) <= 4
        ):
            prev = next((i for i in self.intents if i.name == session.last_intent), None)
            if prev and prev.name in (
                "service_price",
                "service_duration",
                "services_list",
                "recommend",
                "stylist_info",
            ):
                merged = {**session.last_entities, **{k: v for k, v in ents.items() if v}}
                r = self._handle(prev, 0.7, a, merged, user, tools, session)
                r.source = "followup"
                return r

        # 3b) a service / division / audience was named but no clear question: describe it from the catalogue
        if ents["services"] or ents["division"] or ents["gender"]:
            it = next(i for i in self.intents if i.name == "service_details")
            r = self._handle(it, 0.6, a, ents, user, tools, session)
            r.source = "entity"
            return r

        # 4) knowledge-base retrieval (BM25)
        hits = self.index.search(a.canon)
        if hits:
            score, entry = hits[0]
            kconf = score / (score + 3.0)
            if kconf >= KB_MIN_CONF:
                r = Reply(
                    text=self._fmt(entry.answer),
                    intent=f"kb:{entry.id}",
                    confidence=kconf,
                    rephrased=entry.question,
                    show_rephrase=True,
                    source="kb",
                    actions=self._kb_actions(entry.id),
                    suggestions=self._chips_after_kb(hits),
                )
                return r

        # 5) honest fallback
        return self._fallback(self._fallback_text(), key=" ".join(a.content))

    # ------------------------------------------------------------------ understanding
    def _alias_stems(self, svc: dict) -> list[tuple[str, ...]]:
        out = []
        for alias in [svc["name"], *svc["aliases"]]:
            toks = self.analyzer.analyze(alias, correct=False).canon
            toks = tuple(dict.fromkeys(t for t in toks if t not in FILLER_STEMS))
            if toks:
                out.append(toks)
        return out

    def _entities(self, a: Analysis) -> dict:
        stems = set(a.canon)
        cands = []
        for svc in self.services:
            best, used = 0, set()
            for alias in svc.alias_stems:
                if all(t in stems for t in alias) and len(alias) > best:
                    best, used = len(alias), set(alias)
            if best:
                cands.append((best, svc, used))
        services, used_tokens = [], set()
        if cands:
            m = max(c[0] for c in cands)
            for ln, svc, used in cands:
                if ln == m:
                    services.append(svc.data)
                    used_tokens |= used
        division = next(
            (DIVISIONS[t] for t in a.canon if t in DIVISIONS and t not in used_tokens), None
        )
        gender = next((GENDERS[t] for t in a.canon if t in GENDERS), None)
        stylists = [self.stylist_names[t] for t in a.canon if t in self.stylist_names]
        return {"services": services, "division": division, "gender": gender, "stylists": stylists}

    def _rank(self, a: Analysis, ents: dict, logged_in: bool) -> list[tuple[Intent, float]]:
        content = a.content
        cset = set(content)
        out = []
        for it in self.intents:
            if it.max_tokens is not None and len(content) > it.max_tokens:
                continue
            if it.requires and not any(stem(w) in cset for w in it.requires):
                continue
            if it.excludes and any(stem(w) in cset for w in it.excludes):
                continue
            raw = sum(w for k, w in self._kw[it.name].items() if k in cset)
            for ph, bonus in self._ph[it.name]:
                if self._phrase_in(content, ph):
                    raw += bonus
            if raw > 0:
                for ent, boost in it.entity_boost.items():
                    key = (
                        "stylists"
                        if ent == "stylist"
                        else ("services" if ent == "service" else ent)
                    )
                    if ents.get(key):
                        raw += boost
                if it.personal and "my" in cset:
                    # "how do I ..." questions are about the process, not about the user's data
                    raw += 0.5 if ("how" in cset and "many" not in cset) else 1.5
            if it.howto_penalty != 1.0 and "how" in cset and "many" not in cset:
                raw *= it.howto_penalty
            out.append((it, raw / (raw + 2.0)))
        out.sort(key=lambda x: -x[1])
        return out or [(self.intents[0], 0.0)]

    @staticmethod
    def _phrase_in(content: list[str], phrase: tuple[str, ...], max_gap: int = 1) -> bool:
        """phrase tokens appear in order with at most `max_gap` tokens between neighbours."""
        for start, tok in enumerate(content):
            if tok != phrase[0]:
                continue
            pos, ok = start, True
            for nxt in phrase[1:]:
                window = content[pos + 1 : pos + 2 + max_gap]
                if nxt in window:
                    pos = pos + 1 + window.index(nxt)
                else:
                    ok = False
                    break
            if ok:
                return True
        return False

    # ------------------------------------------------------------------ answering
    def _handle(
        self, it: Intent, conf: float, a: Analysis, ents: dict, user, tools, session: Session
    ) -> Reply:
        rephrased = self._rephrase(it, ents)
        r = Reply(
            text="",
            intent=it.name,
            confidence=round(conf, 2),
            rephrased=rephrased,
            show_rephrase=bool(a.corrections) or conf < STRONG_CONF,
            suggestions=list(it.chips),
        )
        session.last_intent, session.last_entities = it.name, ents
        n = it.name
        if it.personal:
            if user is None:
                r.text, r.needs_login = (
                    "Please log in to see your own appointments, invoices and points.",
                    True,
                )
                r.actions = [{"label": "Log in", "url": "/login"}]
                return r
            return self._personal(n, r, user, tools)
        if n == "greeting":
            r.text = (
                "Hello! I'm AI Alankar Intelligence. I can help with services and prices, booking and payment, "
                "cancellations, and your appointments."
            )
            r.show_rephrase = False
            r.suggestions = ["How do I book an appointment?", "Our services", "Opening hours"]
        elif n == "thanks":
            r.text, r.show_rephrase = "You're welcome! Ask me anything else about Alankar.", False
        elif n == "bye":
            r.text, r.show_rephrase = "Goodbye! See you at Alankar.", False
        elif n in INTENT_TO_KB:
            r.text = self._fmt(self.kb_by_id[INTENT_TO_KB[n]].answer)
            r.actions = self._kb_actions(INTENT_TO_KB[n])
            if n in ("payment_link", "cancel_info", "reschedule_info") and user is not None:
                r.actions.append({"label": "Open My Appointments", "url": URL_APPOINTMENTS})
            if n == "payment_link" and user is not None:
                waiting = tools.awaiting_payment(user["id"])
                if waiting:
                    first = waiting[0]
                    r.text += f" You currently have a booking awaiting payment: {first['service']} on {first['when']}."
        elif n == "service_details":
            if len(ents["services"]) == 1:
                svc = ents["services"][0]
                r.text, r.actions = self._details(svc)
                r.show_rephrase = bool(a.corrections) or not self._exact(svc, a)
            elif ents["services"]:
                lines = [
                    f"- {s['name']}: from Rs {s['price_from']} (about {s['duration']} min)"
                    for s in ents["services"][:8]
                ]
                r.text = (
                    "Several of our services match. Which one would you like to know about?\n"
                    + "\n".join(lines)
                )
                r.actions = [
                    {
                        "label": f"Open {DIVISION_LABEL[ents['services'][0]['division']]}",
                        "url": DIVISION_URL[ents["services"][0]["division"]],
                    }
                ]
                r.suggestions = [f"Tell me about {s['name']}" for s in ents["services"][:4]]
                r.show_rephrase = bool(a.corrections)
            else:
                r.text, r.actions = self._list_services(ents)
        elif n == "services_list":
            r.text, r.actions = self._list_services(ents)
        elif n == "service_price":
            r.text, r.actions = self._price(ents)
        elif n == "service_duration":
            r.text = self._duration(ents)
        elif n == "recommend":
            r.text, r.actions = self._recommend(ents)
        elif n == "stylist_info":
            r.text = self._stylists(ents)
        return r

    def _personal(self, n: str, r: Reply, user: dict, tools) -> Reply:
        uid = user["id"]
        if n == "my_next_appointment":
            ap = tools.next_appointment(uid)
            r.text = (
                f"Your next appointment: {ap['service']} with {ap['stylist']} on {ap['when']} ({ap['status']})."
                if ap
                else "You have no upcoming appointments. Would you like to book one?"
            )
            r.actions = (
                [{"label": "My Appointments", "url": URL_APPOINTMENTS}]
                if ap
                else [{"label": "Book now", "url": URL_BOOK}]
            )
        elif n == "my_appointments":
            items = tools.upcoming(uid)[:5]
            r.text = (
                ("Your appointments:\n" + "\n".join(self._line(i) for i in items))
                if items
                else "You have no upcoming appointments."
            )
            r.actions = [{"label": "My Appointments", "url": URL_APPOINTMENTS}]
        elif n == "my_history":
            items = tools.history(uid)[:5]
            r.text = (
                ("Your recent visits:\n" + "\n".join(self._line(i) for i in items))
                if items
                else "You have no past appointments yet."
            )
            r.actions = [{"label": "My Appointments", "url": URL_APPOINTMENTS}]
        elif n == "my_invoices":
            items = tools.invoices(uid)[:5]
            r.text = (
                (
                    "Your recent invoices:\n"
                    + "\n".join(
                        f"{i['date']}: {i['service']}, Rs {i['total']} ({i['status']})"
                        for i in items
                    )
                )
                if items
                else "You have no invoices yet."
            )
            r.actions = [{"label": "Invoices", "url": URL_INVOICES}]
        elif n == "my_packages":
            items = tools.packages(uid)[:5]
            r.text = (
                (
                    "Your packages:\n"
                    + "\n".join(
                        f"- {i['name']}: {i['remaining']} session(s) left"
                        + (f", valid until {i['expires']}" if i.get("expires") else "")
                        for i in items
                    )
                )
                if items
                else "You do not have any packages yet."
            )
            r.actions = [{"label": "Open My Wallet", "url": URL_WALLET}]
        elif n == "my_membership":
            m = tools.membership(uid)
            r.text = (
                (
                    f"Your membership: {m['plan']} ({m['status']}), valid until {m['until']}."
                    + (
                        f" Sessions left: {m['sessions_left']}."
                        if m.get("sessions_left") is not None
                        else ""
                    )
                )
                if m
                else "You do not have a membership right now."
            )
            r.actions = [{"label": "Open My Wallet", "url": URL_WALLET}]
        elif n == "my_giftcard":
            items = tools.gift_cards(uid)[:5]
            r.text = (
                (
                    "Your gift cards:\n"
                    + "\n".join(
                        f"- Card ending {i['last4']}: Rs {i['balance']} usable" for i in items
                    )
                )
                if items
                else "You do not have any gift cards."
            )
            r.actions = [{"label": "Open My Wallet", "url": URL_WALLET}]
        elif n == "my_orders":
            items = tools.orders(uid)[:3]
            r.text = (
                (
                    "Your latest orders:\n"
                    + "\n".join(
                        f"- {i['number']}: {i['status']}, Rs {i['total']}"
                        + (f" ({i['note']})" if i.get("note") else "")
                        for i in items
                    )
                )
                if items
                else "You have no shop orders yet."
            )
            r.actions = [{"label": "My Orders", "url": URL_ORDERS}]
        elif n == "my_loyalty":
            r.text = f"You have {tools.loyalty_points(uid)} loyalty points. You can redeem them at checkout."
            r.actions = [{"label": "Open My Wallet", "url": URL_WALLET}]
        return r

    @staticmethod
    def _line(i: dict) -> str:
        return f"- {i['service']} with {i['stylist']} on {i['when']} ({i['status']})"

    # ------------------------------------------------------------------ catalogue answers
    def _scope(self, ents: dict) -> str:
        bits = []
        if ents.get("gender"):
            bits.append(f"for {ents['gender']}")
        if ents.get("division"):
            bits.append(f"in {DIVISION_LABEL[ents['division']]}")
        return (" " + " ".join(bits)) if bits else ""

    def _filter(self, ents: dict) -> list[dict]:
        pool = ents.get("services") or self.catalog["services"]
        if ents.get("division"):
            pool = [s for s in pool if s["division"] == ents["division"]]
        if ents.get("gender"):
            pool = [s for s in pool if s["gender"] in (ents["gender"], "unisex")]
        return pool

    def _list_services(self, ents: dict) -> tuple[str, list[dict]]:
        pool = self._filter(ents)
        if not ents.get("division") and not ents.get("gender"):
            counts = Counter(s["division"] for s in self.catalog["services"])
            lines = [f"- {DIVISION_LABEL[d]}: {c} services" for d, c in counts.items()]
            text = (
                "We have three divisions:\n"
                + "\n".join(lines)
                + "\nTell me which one you'd like to see."
            )
            return text, [{"label": DIVISION_LABEL[d], "url": DIVISION_URL[d]} for d in counts]
        lines = [f"- {s['name']}: from Rs {s['price_from']}" for s in pool[:8]]
        text = (
            ("Here is what we offer" + self._scope(ents) + ":\n" + "\n".join(lines))
            if lines
            else "I could not find matching services."
        )
        d = ents.get("division") or (pool[0]["division"] if pool else None)
        return text, ([{"label": f"Open {DIVISION_LABEL[d]}", "url": DIVISION_URL[d]}] if d else [])

    def _exact(self, svc: dict, a: Analysis) -> bool:
        """True when the question used the service's own words: no spelling fix, no synonym
        (such as "gents" for "men") and no Hindi or Telugu word was needed to understand it."""
        if a.corrections:
            return False
        if any(w in TRANSLIT for w in re.findall(r"[a-z']+", a.original.lower())):
            return False
        name = {stem(t) for t in normalize(svc["name"])}
        return bool(name) and name <= {stem(t) for t in a.tokens}

    def _details(self, svc: dict) -> tuple[str, list[dict]]:
        """A full explanation built only from the service's own fields. Empty fields are skipped."""
        lines = []
        about = svc.get("description") or svc.get("info")
        lines.append(f"{svc['name']}" + (f": {about}" if about else ""))
        lo, hi = svc["duration"], svc.get("duration_max") or svc["duration"]
        time = (
            f"about {lo} minutes" if lo == hi else f"{lo} to {hi} minutes depending on the option"
        )
        lines.append(f"Time: {time}.")
        lines.append(
            f"Price: from Rs {svc['price_from']} incl. GST. "
            "Prices include GST and may vary with options such as hair length or add-ons."
        )
        who = AUDIENCE_LABEL.get(svc.get("gender"), "")
        lines.append(
            "Suits: "
            + (f"{who}. " if who else "")
            + f"Division: {DIVISION_LABEL[svc['division']]}."
        )
        team = svc.get("stylists") or []
        if team:
            lines.append(
                "Offered by: "
                + ", ".join(
                    f"{t['name']} ({t['specialization']})" if t.get("specialization") else t["name"]
                    for t in team[:5]
                )
                + "."
            )
        actions = [
            {"label": "Book this service", "url": f"{URL_BOOK}?service={svc['slug']}"},
            {"label": "See similar services", "url": DIVISION_URL[svc["division"]]},
        ]
        return "\n".join(lines), actions

    def _price(self, ents: dict) -> tuple[str, list[dict]]:
        pool = (
            self._filter(ents)
            if (ents.get("services") or ents.get("division") or ents.get("gender"))
            else []
        )
        if not pool:
            return (
                "Which service would you like the price for? For example: haircut, facial, body massage, bridal makeup.",
                [],
            )
        lines = [
            f"- {s['name']}: from Rs {s['price_from']} (about {s['duration']} min)"
            for s in pool[:8]
        ]
        return (
            "Prices include GST and may vary with options such as hair length or add-ons:\n"
            + "\n".join(lines),
            [
                {
                    "label": f"Open {DIVISION_LABEL[pool[0]['division']]}",
                    "url": DIVISION_URL[pool[0]["division"]],
                }
            ],
        )

    def _duration(self, ents: dict) -> str:
        pool = self._filter(ents) if ents.get("services") else []
        if not pool:
            return "Which service do you mean? For example: haircut, facial or body massage."
        return "\n".join(f"- {s['name']}: about {s['duration']} minutes" for s in pool[:8])

    def _recommend(self, ents: dict) -> tuple[str, list[dict]]:
        pool = (
            self._filter(ents)
            if (ents.get("services") or ents.get("division") or ents.get("gender"))
            else []
        )
        if not pool:
            return (
                "Tell me what you're looking for: hair (Salon), relaxation (Spa), or skin, makeup and bridal (Beauty Parlor).",
                [],
            )
        lines = [f"- {s['name']}: {s['info']} From Rs {s['price_from']}." for s in pool[:3]]
        return "Here are my suggestions" + self._scope(ents) + ":\n" + "\n".join(lines), [
            {
                "label": f"Open {DIVISION_LABEL[pool[0]['division']]}",
                "url": DIVISION_URL[pool[0]["division"]],
            }
        ]

    def _stylists(self, ents: dict) -> str:
        pool = ents.get("stylists") or [
            s
            for s in self.catalog["stylists"]
            if not ents.get("division") or s["division"] == ents["division"]
        ]
        return "Our team:\n" + "\n".join(
            f"- {s['name']}: {s['specialization']}"
            + (f" (rating {s['rating']})" if s.get("rating") else "")
            for s in pool
        )

    # ------------------------------------------------------------------ helpers
    def _rephrase(self, it: Intent, ents: dict) -> str:
        if ents.get("services"):
            names = [s["name"] for s in ents["services"][:3]]
            what = " / ".join(names)
        elif ents.get("division") or ents.get("gender"):
            what = "our services" + self._scope(ents)
        else:
            what = "our services"
        return it.template.format(what=what, scope=self._scope(ents), shop=self.shop["name"])

    def _fmt(self, s: str) -> str:
        return s.format_map(
            _Safe(
                shop_name=self.shop["name"],
                hours=self.shop["hours"],
                address=self.shop["address"],
                phone=self.shop["phone"],
                email=self.shop["email"],
                cancel_window_hours=self.shop["cancel_window_hours"],
                link_valid_hours=self.shop["link_valid_hours"],
                delivery_fee=self.shop.get("delivery_fee", "49"),
                free_delivery_over=self.shop.get("free_delivery_over", "999"),
            )
        )

    def _kb_actions(self, kb_id: str) -> list[dict]:
        m = {
            "how_to_book": [{"label": "Browse services", "url": "/salon"}],
            "login_help": [{"label": "Log in", "url": "/login"}],
            "register_help": [{"label": "Register", "url": "/register"}],
            "contact": [
                {"label": "Call the salon", "url": f"tel:{self.shop['phone'].replace(' ', '')}"}
            ],
            "offers": [{"label": "My Wallet", "url": URL_WALLET}],
            "shop_delivery": [{"label": "Shop", "url": "/customer/shop"}],
            "order_cancel": [{"label": "My Orders", "url": URL_ORDERS}],
            "products_with_booking": [{"label": "Shop", "url": "/customer/shop"}],
            "package_cancel": [{"label": "Packages", "url": "/customer/packages"}],
            "membership_manage": [{"label": "Memberships", "url": "/customer/memberships"}],
        }
        return list(m.get(kb_id, []))

    def _chips_after_kb(self, hits) -> list[str]:
        return [e.question for _, e in hits[1:3]]

    def _fallback_text(self) -> str:
        return (
            "I'm not sure I understood that. I can help with services and prices, booking and payments, "
            f"cancellations, and your appointments. For anything else please call us on {self.shop['phone']}."
        )

    def _fallback(self, text: str, key: str | None) -> Reply:
        return Reply(
            text=text,
            intent="unknown",
            source="fallback",
            unanswered_key=key,
            suggestions=["Our services", "How do I book an appointment?", "Opening hours"],
            actions=[
                {"label": "Call the salon", "url": f"tel:{self.shop['phone'].replace(' ', '')}"}
            ],
        )
