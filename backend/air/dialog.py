"""The customer conversation: slot filling for bookings and product orders.

One function, `converse()`, takes a customer message (or a button press) and the saved state of the
chat and returns a `Reply`: text, tappable chips, and at most one summary card. It never creates a
booking request or an order itself: those need the customer's own press of a button, handled by
`air.chat_api` (Send request / Confirm). Holds are the only thing it creates (a hold is a short,
reversible reservation that expires on its own).

The same code runs in basic mode (rules only) and in AI mode (the language model reads the message
through the tool registry; this module then shows what the tools returned). Any problem with the
model falls back to the rules, so the customer always gets an answer.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.utils import timezone

from air import callback, holds, orders, service, understand
from air import catalogue as cat_builder
from air.actor import AirDenied
from air.models import SlotHold
from scheduling import booking
from scheduling.models import Appointment, AppointmentStatus, Service
from shop import orders as shop

S = AppointmentStatus
SESSION_SECONDS = 30 * 60
MAX_CHIPS = 8

QUICK = (
    "Book a haircut",
    "Today's free slots",
    "Opening hours",
    "My requests",
    "My orders",
    "Talk to a person",
)
RATE_ACTION = {"label": "Rate your visit", "url": "/customer/book"}
LOGIN_ACTION = {"label": "Log in", "url": "/login"}
NOT_CONFIRMED_NOTE = (
    "Nothing is booked yet. A booking is confirmed only after the front desk and your stylist "
    "accept and you pay."
)
# Money requests AIR can never act on, whatever the wording.
_MONEY = re.compile(
    r"(?i)\b(discount|coupon|refund|waive|free of charge|for free|cheaper|lower the price|"
    r"price match|bargain|cashback|concession|return (it|my|the)|money back|reduce the price|"
    r"change the price|half price|50 ?%)"
)
_CONTEXT = re.compile(
    r"(?i)\b(order|booking|appointment|request|bill|invoice|price|make it|give me|apply)\b"
)


@dataclass
class Reply:
    text: str
    intent: str = "other"
    chips: list[dict] = field(default_factory=list)  # [{"label", "pick": {...}}]
    suggestions: list[str] = field(default_factory=list)  # tappable questions (sent as messages)
    actions: list[dict] = field(default_factory=list)  # [{"label", "url"}] links
    card: dict | None = None
    needs_login: bool = False
    source: str = "air"
    wording_by_ai: bool = False
    rephrased: str = ""
    show_rephrase: bool = False


def new_state() -> dict:
    return {}


# --------------------------------------------------------------------------- small helpers


def pretty_time(dt: datetime) -> str:
    local = booking.local(dt)
    hour = local.hour % 12 or 12
    return f"{hour}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def pretty_day(dt) -> str:
    d = booking.local(dt).date() if isinstance(dt, datetime) else dt
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def pretty(dt: datetime) -> str:
    return f"{pretty_day(dt)}, {pretty_time(dt)}"


def _money(value) -> str:
    return f"Rs. {value}"


def _load_service(service_id) -> Service | None:
    if not service_id:
        return None
    try:
        return (
            Service.objects.filter(pk=service_id, is_active=True, category__is_active=True)
            .prefetch_related("variants", "addons")
            .first()
        )
    except (ValueError, TypeError, ValidationError):
        return None


def _default_variant(svc: Service):
    variants = svc.active_variants()
    return str(variants[0].id) if variants else None


def _names(ids) -> list[dict]:
    rows = Service.objects.filter(pk__in=list(ids), is_active=True, category__is_active=True)
    return [{"id": str(s.id), "name": s.name} for s in rows.order_by("name")]


def _service_chips(rows) -> list[dict]:
    return [
        {"label": r["name"], "pick": {"kind": "service", "service_id": r["id"]}}
        for r in rows[:MAX_CHIPS]
    ]


def _day_chips(today: date, limit: int = 6) -> list[dict]:
    chips = []
    for offset in range(limit):
        d = today + timedelta(days=offset)
        label = "Today" if offset == 0 else "Tomorrow" if offset == 1 else pretty_day(d)
        chips.append({"label": label, "pick": {"kind": "day", "day": d.isoformat()}})
    return chips


def _slot_chip(start: datetime, stylist: dict, *, with_day: bool) -> dict:
    label = pretty(start) if with_day else pretty_time(start)
    if stylist.get("name"):
        label += f" · {stylist['name']}"
    return {
        "label": label,
        "pick": {"kind": "slot", "start": start.isoformat(), "stylist_id": stylist["id"]},
    }


def _in_window(start: datetime, st: dict) -> bool:
    local = booking.local(start).time().replace(second=0, microsecond=0)
    exact, lo, hi = st.get("time_exact"), st.get("time_from"), st.get("time_to")
    if exact:
        return local.strftime("%H:%M") == exact
    if lo and local.strftime("%H:%M") < lo:
        return False
    return not (hi and local.strftime("%H:%M") >= hi)


def _pick_stylist(slot: dict, wanted: str) -> dict | None:
    ids = {s["id"]: s for s in slot["stylists"]}
    if wanted and wanted != "any":
        return ids.get(wanted)
    if not slot["stylists"]:
        return None
    # "Any stylist": the same rules as the booking form (scheduling/anystylist.py).
    from scheduling import anystylist

    start = slot["start"]
    when = start if isinstance(start, datetime) else datetime.fromisoformat(str(start))
    by_key = {str(s["id"]): s for s in slot["stylists"]}
    raw = {str(s["id"]): s["id"] for s in slot["stylists"]}
    best = anystylist.chat_pick(list(raw.values()), when)
    return by_key.get(str(best[0])) if best else slot["stylists"][0]


# --------------------------------------------------------------------------- card builders


def booking_card(hold: SlotHold) -> dict:
    q = booking.quote(hold.service, hold.variant_id, hold.addon_ids)
    return {
        "type": "booking",
        "hold_id": str(hold.pk),
        "service": hold.service.name,
        "option": q.variant.label if q.variant else "",
        "price": _money(q.price_total),
        "gst_included": _money(q.gst_amount),
        "duration_minutes": q.duration_minutes,
        # "Any stylist": the same words as the appointments page and the emails.
        "stylist": (
            f"{hold.stylist.display_name.split(' ')[0]}, assigned by AIR"
            if hold.any_stylist
            else hold.stylist.display_name
        ),
        "start": hold.starts_at.isoformat(),
        "when": pretty(hold.starts_at),
        "held_until": hold.expires_at.isoformat(),
        "buttons": ["send", "change"],
    }


def order_card(items: list[dict], *, customer) -> dict:
    quote = shop.price(items, customer=customer)
    return {
        "type": "order",
        "lines": [
            {
                "product": str(ln.product.id),
                "name": ln.product.name,
                "quantity": ln.quantity,
                "amount": _money(ln.amount),
            }
            for ln in quote.lines
        ],
        "total": _money(quote.total),
        "delivery_fee": _money(quote.breakdown.delivery_fee),
        "buttons": ["confirm", "clear"],
    }


# --------------------------------------------------------------------------- status words


def request_words(row: dict) -> str:
    """Customer-visible status only: never the stylist's private reason."""
    status = row["status"]
    if status == S.REQUESTED:
        reception, stylist = row.get("reception"), row.get("stylist")
        if reception == "accepted" and stylist != "accepted":
            return "The front desk accepted; waiting for your stylist"
        if stylist == "accepted" and reception != "accepted":
            return "Your stylist accepted; waiting for the front desk"
        return "Waiting for the front desk and your stylist"
    if status == S.AWAITING_PAYMENT:
        return "Accepted by both: please pay to confirm"
    words = {
        S.SCHEDULED: "Confirmed and paid",
        S.CHECKED_IN: "You have arrived",
        S.IN_PROGRESS: "In progress",
        S.COMPLETED: "Completed",
        S.CANCELLED: "Cancelled",
        S.REJECTED: "Not accepted",
        S.PAYMENT_EXPIRED: "Payment time ran out",
        S.NO_SHOW: "Missed",
        S.DECLINED_BY_STYLIST: "Your stylist could not take it",
        S.DECLINED_BY_RECEPTION: "The front desk could not take it",
        S.EXPIRED: "Not answered in time",
    }
    return words.get(status, "In progress")


# --------------------------------------------------------------------------- entry point


_HELP_Q = re.compile(r"(?i)^\s*(how|is|are|can|what|when|does|do|will|why)\b")


def _is_help_question(message: str, parsed, state: dict) -> bool:
    """A question ABOUT the assistant ("how long does the stylist have?"), not a request with
    details in it ("how much is a haircut", "book a facial tomorrow")."""
    if state.get("awaiting") or not _HELP_Q.match(message or ""):
        return False
    return not (
        parsed.service_ids or parsed.products or parsed.day or parsed.has_time or parsed.stylist
    )


def converse(
    *,
    user,
    message: str,
    pick: dict | None,
    state: dict,
    session_id: str,
    now: datetime,
    engine_answer,
    ai_turn=None,
    help_answer=None,
) -> Reply:
    """`engine_answer(text)` -> the existing chatbot's Reply (for questions that are not about
    booking or orders). `ai_turn(message, state)` -> an optional model turn (see ai.py).
    `help_answer(text)` -> one of the assistant's own help answers (chatbot KB "air_*"), or None."""
    if pick:
        return _handle_pick(user, pick, state, session_id, now)
    cat = cat_builder.build(with_products=user is not None)
    parsed = understand.understand(message, now, cat)
    intent = parsed.intent
    if help_answer is not None and _is_help_question(message, parsed, state):
        found = help_answer(message)
        if found is not None:
            return Reply(text=found.text, intent=found.intent, source="kb")
    if user is None:
        return _guest(intent, message, engine_answer)
    # Money requests about the customer's own order or booking are refused, never actioned.
    if (
        _MONEY.search(message)
        and (state.get("cart") or state.get("hold_id") or _CONTEXT.search(message))
        and intent != "hours"
    ):
        return _money_refusal(user, session_id, now)
    if state.get("awaiting") == "order_edit" and (parsed.quantity or parsed.products):
        return _order_edit_text(user, parsed, state, session_id, now)
    if ai_turn is not None:
        reply = ai_turn(message, state, parsed)
        if reply is not None:
            return reply
    if intent == "reschedule" and not state.get("reschedule_of"):
        return _reschedule_choose(user, state, session_id, now)
    if intent in ("book", "availability", "reschedule") or _is_slot_answer(parsed, state):
        return _booking_step(user, parsed, state, session_id, now, intent)
    if intent == "status":
        return _status(user, now)
    if intent == "cancel":
        return _cancel_start(user, state, now)
    if intent in ("order_product", "visit_product"):
        return _order_step(user, parsed, state, intent, now)
    if intent == "order_status":
        return _order_status(user, state, now)
    if intent == "order_update":
        return _order_update_start(user, parsed, state, now)
    if intent == "person":
        return _person(user, session_id, now)
    answer = engine_answer(message)
    return _from_engine(answer)


def _is_slot_answer(parsed: understand.Parsed, state: dict) -> bool:
    """A bare reply like "tomorrow" or "5pm" while a booking is being built."""
    if state.get("awaiting") not in ("service", "day", "time", "slot", "confirm"):
        return False
    return bool(
        parsed.service_ids or parsed.day or parsed.has_time or parsed.stylist
    ) and parsed.intent in ("other", "greeting", "book", "availability")


def _from_engine(a) -> Reply:
    return Reply(
        text=a.text,
        intent=a.intent,
        suggestions=list(a.suggestions),
        actions=list(a.actions),
        needs_login=a.needs_login,
        source=a.source,
        rephrased=a.rephrased,
        show_rephrase=a.show_rephrase,
    )


def _guest(intent: str, message: str, engine_answer) -> Reply:
    wants_to_buy = bool(re.search(r"(?i)\b(buy|order|purchase|add|cancel|status)\b", message))
    if intent in ("order_product", "visit_product") and not wants_to_buy:
        return _from_engine(engine_answer(message))
    if intent in (
        "book", "availability", "reschedule", "status", "cancel", "order_product",
        "visit_product", "order_status", "order_update",
    ):  # fmt: skip
        return Reply(
            text="Please log in first. I can then look for free times, hold one for you and "
            "send your request. You can still ask me general questions here.",
            intent=intent,
            actions=[LOGIN_ACTION],
            needs_login=True,
        )
    if intent == "person":
        info = callback.shop_contact()
        return Reply(
            text=f"You can call the salon on {info['phone']}. We are open {info['hours']}.",
            intent="person",
        )
    return _from_engine(engine_answer(message))


def _money_refusal(user, session_id, now) -> Reply:
    from air import actionlog
    from air.models import AIActionLog

    actionlog.write(
        "request_refused",
        status=AIActionLog.Status.HANDED_OFF,
        customer=user,
        session_id=session_id,
        reason_code="money_request",
        now=now,
    )
    return Reply(
        text="I can't change prices, give discounts, make refunds or take returns. "
        "I can ask the front desk to look at it with you.",
        intent="refused",
        chips=[{"label": "Talk to a person", "pick": {"kind": "person"}}],
    )


# --------------------------------------------------------------------------- booking


def _merge(state: dict, parsed: understand.Parsed) -> None:
    changed = False
    if parsed.service_ids:
        if len(parsed.service_ids) == 1:
            if state.get("service_id") != parsed.service_ids[0]:
                changed = True
            state["service_id"] = parsed.service_ids[0]
            state.pop("candidates", None)
            state.pop("variant_id", None)
        else:
            state["candidates"] = parsed.service_ids
            state.pop("service_id", None)
            changed = True
    slots = parsed.slots()
    if parsed.day:
        if state.get("day") != slots["day"]:
            changed = True
        state["day"] = slots["day"]
        state["day_is_week"] = parsed.day_is_week
        state["past"] = parsed.past
    if parsed.has_time:
        for key in ("time_from", "time_to", "time_exact"):
            state[key] = slots[key]
        changed = True
    if parsed.stylist:
        if state.get("stylist") != parsed.stylist:
            changed = True
        state["stylist"] = parsed.stylist
    state["_changed"] = changed


def _release_hold(user, state: dict, now, reason: str = "changed") -> None:
    hold_id = state.pop("hold_id", None)
    if hold_id:
        try:
            holds.release(hold_id, reason=reason, customer=user, now=now)
        except AirDenied:
            pass


def _clear_booking(state: dict) -> None:
    for key in (
        "service_id", "candidates", "variant_id", "day", "day_is_week", "past", "time_from",
        "time_to", "time_exact", "stylist", "awaiting", "offered", "reschedule_of",
    ):  # fmt: skip
        state.pop(key, None)


def _booking_step(user, parsed, state, session_id, now, intent) -> Reply:
    _merge(state, parsed)
    changed = state.pop("_changed", False)
    if changed and state.get("hold_id"):
        _release_hold(user, state, now)
    if booking.ratings.pending_count(user):
        return Reply(
            text="Please rate your recent visit first. New booking requests wait until you do.",
            intent="book",
            actions=[RATE_ACTION],
        )
    svc = _load_service(state.get("service_id"))
    if svc is None:
        state.pop("service_id", None)
        state["awaiting"] = "service"
        rows = _names(state.get("candidates") or []) or _all_services()
        text = (
            "Which one did you mean?"
            if state.get("candidates")
            else "Which service would you like?"
        )
        if state.get("service_missing"):
            text = "That service isn't available right now. Which one would you like?"
        return Reply(text=text, intent="book", chips=_service_chips(rows))
    if not state.get("variant_id"):
        state["variant_id"] = _default_variant(svc)
    today = booking.local(now).date()
    if not state.get("day"):
        state["awaiting"] = "day"
        return Reply(
            text=f"Which day would you like {svc.name}?", intent="book", chips=_day_chips(today)
        )
    day = date.fromisoformat(state["day"])
    if state.get("past") or day < today:
        state["awaiting"] = "day"
        state.pop("day", None)
        state.pop("past", None)
        return Reply(
            text="That date has already passed. Which day would you like?",
            intent="book",
            chips=_day_chips(today),
        )
    if day > booking.latest_day():
        state["awaiting"] = "day"
        state.pop("day", None)
        return Reply(
            text="I can only look that far ahead: "
            f"up to {pretty_day(booking.latest_day())}. Which day would you like?",
            intent="book",
            chips=_day_chips(today),
        )
    return _offer_slots(user, svc, state, session_id, now, day)


def _all_services() -> list[dict]:
    rows = Service.objects.filter(is_active=True, category__is_active=True).order_by("name")
    return [{"id": str(s.id), "name": s.name} for s in rows[:MAX_CHIPS]]


def _free(svc, state, day, now) -> list[dict]:
    return service.free_slots(
        service=svc,
        variant_id=state.get("variant_id"),
        addon_ids=[],
        day=day,
        now=now,
        assist=True,
    )


def _offer_slots(user, svc, state, session_id, now, day) -> Reply:
    state["awaiting"] = "time"
    wanted = state.get("stylist", "")
    days = [day]
    if state.get("day_is_week"):
        days = [day + timedelta(days=i) for i in range(7)]
    found: list[tuple[date, dict]] = []
    closed = booking.opening_hours(day) is None
    for d in days:
        for slot in _free(svc, state, d, now):
            stylist = _pick_stylist(slot, wanted)
            if stylist and _in_window(slot["start"], state):
                found.append((d, {"start": slot["start"], "stylist": stylist}))
        if found and state.get("day_is_week"):
            break
    if state.get("time_exact") and found:
        chosen = found[0][1]
        return _hold_and_card(user, svc, state, session_id, now, chosen["start"], chosen["stylist"])
    if found:
        with_day = state.get("day_is_week", False)
        chips = [
            _slot_chip(item["start"], item["stylist"], with_day=with_day)
            for _d, item in found[:MAX_CHIPS]
        ]
        label = _window_phrase(state)
        text = f"Free times on {pretty_day(found[0][0])}{label}. Tap one to hold it for you:"
        return Reply(text=text, intent="book", chips=chips)
    return _no_slots(svc, state, day, closed)


def _window_phrase(state: dict) -> str:
    if state.get("time_exact"):
        return ""
    lo, hi = state.get("time_from"), state.get("time_to")
    if lo and hi:
        return f" between {_clock(lo)} and {_clock(hi)}"
    if lo:
        return f" after {_clock(lo)}"
    if hi:
        return f" before {_clock(hi)}"
    return ""


def _clock(hhmm: str) -> str:
    hour, minute = (int(p) for p in hhmm.split(":"))
    return f"{hour % 12 or 12}:{minute:02d} {'AM' if hour < 12 else 'PM'}"


def _no_slots(svc, state, day, closed: bool) -> Reply:
    ids = list(booking.qualified_stylists(svc, public_only=True).values_list("id", flat=True))
    q = booking.quote(svc, state.get("variant_id"), [])
    around = datetime.combine(day, time(12, 0), tzinfo=timezone.get_current_timezone())
    if state.get("time_exact"):
        hh, mm = (int(p) for p in state["time_exact"].split(":"))
        around = around.replace(hour=hh, minute=mm)
    wanted = state.get("stylist", "")
    if wanted and wanted != "any":
        ids = [i for i in ids if str(i) == wanted] or ids
    near = booking.nearest_slots(around, q.duration_minutes, ids, count=3) if ids else []
    chips = []
    for start in near:
        free = dict(booking.free_starts(booking.local(start).date(), q.duration_minutes, ids))
        free_ids = free.get(start, [])
        if free_ids:
            names = {
                s.id: s.display_name for s in booking.qualified_stylists(svc, public_only=True)
            }
            chips.append(
                _slot_chip(
                    start,
                    {"id": str(free_ids[0]), "name": names.get(free_ids[0], "")},
                    with_day=True,
                )
            )
    if closed:
        head = f"We are closed on {pretty_day(day)}."
    elif state.get("time_exact"):
        head = f"Nothing is free at {_clock(state['time_exact'])} on {pretty_day(day)}."
    else:
        head = f"Nothing is free on {pretty_day(day)}{_window_phrase(state)}."
    if chips:
        return Reply(text=f"{head} The nearest free times are:", intent="book", chips=chips)
    state["awaiting"] = "day"
    return Reply(
        text=f"{head} I can't see a free time in the next few days. Would another day work?",
        intent="book",
        chips=_day_chips(booking.local(timezone.now()).date()),
    )


def _hold_and_card(user, svc, state, session_id, now, start: datetime, stylist: dict) -> Reply:
    _release_hold(user, state, now)
    profile = booking.StylistProfile.objects.filter(pk=stylist["id"]).first()
    if profile is None:
        return Reply(text="That stylist isn't available. Pick another time.", intent="book")
    key = uuid.uuid5(
        uuid.NAMESPACE_URL, f"{session_id}|{svc.pk}|{profile.pk}|{start.isoformat()}"
    ).hex
    try:
        hold = holds.create_hold(
            customer=user,
            service=svc,
            variant_id=state.get("variant_id"),
            addon_ids=[],
            stylist=profile,
            start=start,
            session_id=session_id,
            idempotency_key=key,
            now=now,
            assist=True,
        )
    except booking.BookingError as exc:
        state["awaiting"] = "time"
        return Reply(text=exc.message, intent="book", chips=_alt_chips(svc, state, exc.slots))
    if state.get("stylist", "") in ("", "any") and not hold.any_stylist:
        hold.any_stylist = True  # AIR's rules chose the stylist (scheduling/anystylist.py)
        hold.save(update_fields=["any_stylist"])
    state["hold_id"] = str(hold.pk)
    state["awaiting"] = "confirm"
    minutes = max(int((hold.expires_at - now).total_seconds() // 60), 1)
    return Reply(
        text=f"I'm holding this time for you for about {minutes} minutes. Check it, then press "
        f"Send request. {NOT_CONFIRMED_NOTE}",
        intent="book",
        card=booking_card(hold),
        chips=[{"label": "Change", "pick": {"kind": "change"}}],
    )


def _alt_chips(svc, state, starts) -> list[dict]:
    ids = list(booking.qualified_stylists(svc, public_only=True))
    q = booking.quote(svc, state.get("variant_id"), [])
    chips = []
    for start in starts[:3]:
        free = dict(
            booking.free_starts(
                booking.local(start).date(), q.duration_minutes, [s.id for s in ids]
            )
        )
        names = {s.id: s.display_name for s in ids}
        free_ids = free.get(start, [])
        if free_ids:
            chips.append(
                _slot_chip(
                    start,
                    {"id": str(free_ids[0]), "name": names.get(free_ids[0], "")},
                    with_day=True,
                )
            )
    return chips


# --------------------------------------------------------------------------- picks (buttons)


def _handle_pick(user, pick: dict, state: dict, session_id: str, now) -> Reply:
    kind = str(pick.get("kind") or "")
    if user is None:
        return _guest("book", "", None)
    if kind == "service":
        state["service_id"], state["_changed"] = str(pick.get("service_id") or ""), True
        state.pop("candidates", None)
        state.pop("variant_id", None)
        _release_hold(user, state, now)
        if _load_service(state["service_id"]) is None:
            state["service_missing"] = True
            state.pop("service_id", None)
        else:
            state.pop("service_missing", None)
        return _booking_step(user, understand.Parsed(), state, session_id, now, "book")
    if kind == "day":
        _release_hold(user, state, now)
        try:
            day = date.fromisoformat(str(pick.get("day")))
        except ValueError:
            return Reply(text="I didn't catch that day. Which day would you like?", intent="book")
        state["day"], state["past"], state["day_is_week"] = day.isoformat(), False, False
        for key in ("time_from", "time_to", "time_exact"):
            state.pop(key, None)
        return _booking_step(user, understand.Parsed(), state, session_id, now, "book")
    if kind == "slot":
        return _pick_slot(user, pick, state, session_id, now)
    if kind == "change":
        _release_hold(user, state, now)
        for key in ("time_from", "time_to", "time_exact", "stylist"):
            state.pop(key, None)
        state["awaiting"] = "time"
        return _booking_step(user, understand.Parsed(), state, session_id, now, "book")
    if kind == "person":
        return _person(user, session_id, now)
    if kind == "dismiss":
        state.pop("pending", None)
        state.pop("awaiting", None)
        return Reply(
            text="Okay, nothing has changed. Anything else I can help with?", intent="other"
        )
    if kind == "product":
        return _pick_product(user, pick, state, now)
    if kind in ("cart_remove", "cart_clear"):
        return _cart_edit(user, pick, state, now)
    if kind == "cancel_booking":
        return _cancel_ask(user, str(pick.get("request_id") or ""), state, now)
    if kind == "reschedule_booking":
        return _reschedule_start(user, str(pick.get("request_id") or ""), state, session_id, now)
    if kind == "order_edit":
        return _order_edit_start(user, str(pick.get("order_id") or ""), state, now)
    if kind == "order_cancel":
        return _order_cancel_ask(user, str(pick.get("order_id") or ""), state, now)
    return Reply(text="I didn't understand that button. What would you like to do?", intent="other")


def _pick_slot(user, pick, state, session_id, now) -> Reply:
    svc = _load_service(state.get("service_id"))
    if svc is None:
        state["service_missing"] = True
        return _booking_step(user, understand.Parsed(), state, session_id, now, "book")
    try:
        start = datetime.fromisoformat(str(pick.get("start")))
    except ValueError:
        return Reply(text="I didn't catch that time. Please pick one again.", intent="book")
    if timezone.is_naive(start):
        return Reply(text="I didn't catch that time. Please pick one again.", intent="book")
    return _hold_and_card(
        user, svc, state, session_id, now, start, {"id": str(pick.get("stylist_id") or "")}
    )


# --------------------------------------------------------------------------- my requests


def _status(user, now) -> Reply:
    rows = service.my_requests(user, now=now, assist=True)
    live = [r for r in rows if r["status"] not in (S.COMPLETED, S.CANCELLED, S.NO_SHOW)] or rows
    if not rows:
        return Reply(
            text="You have no booking requests yet. Would you like to book something?",
            intent="status",
            suggestions=["Book a haircut"],
        )
    lines = []
    for r in live[:3]:
        when = pretty(r["when"]) if r["when"] else "time to be confirmed"
        line = f"{r['service']} on {when}: {request_words(r)}"
        if r["status"] == S.AWAITING_PAYMENT and r.get("pay_by"):
            line += f" (pay by {pretty(r['pay_by'])})"
        lines.append(line)
    chips = []
    for r in live[:3]:
        if r["status"] in (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED):
            chips.append(
                {
                    "label": f"Cancel {r['service']}",
                    "pick": {"kind": "cancel_booking", "request_id": r["id"]},
                }
            )
    return Reply(
        text="Your latest requests:\n" + "\n".join(f"- {line}" for line in lines),
        intent="status",
        chips=chips,
        actions=[{"label": "Open My Appointments", "url": "/customer/appointments"}],
    )


# --------------------------------------------------------------------------- cancel, reschedule


def _own(user, request_id) -> Appointment | None:
    try:
        return Appointment.objects.filter(pk=request_id, customer=user).first()
    except (ValueError, TypeError, ValidationError):
        return None


def _cancel_start(user, state, now) -> Reply:
    rows = [
        r
        for r in service.my_requests(user, now=now, assist=True)
        if r["status"] in (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED)
    ]
    if not rows:
        return Reply(text="You have nothing I can cancel right now.", intent="cancel")
    if len(rows) == 1:
        return _cancel_ask(user, rows[0]["id"], state, now)
    return Reply(
        text="Which one would you like to cancel?",
        intent="cancel",
        chips=[
            {
                "label": f"{r['service']} · {pretty(r['when']) if r['when'] else 'to be set'}",
                "pick": {"kind": "cancel_booking", "request_id": r["id"]},
            }
            for r in rows[:MAX_CHIPS]
        ],
    )


def _cancel_ask(user, request_id, state, now) -> Reply:
    appt = _own(user, request_id)
    if appt is None:
        return Reply(text="I can't find that booking.", intent="cancel")
    actions = booking.customer_actions(appt, now)
    when = (
        pretty(appt.start or appt.preferred_start) if (appt.start or appt.preferred_start) else ""
    )
    if "cancel" not in actions:
        note = callback.request_callback(customer=user, now=now, assist=True)
        info = callback.shop_contact()
        return Reply(
            text="That booking is outside the free-cancellation time, so fees or exceptions are "
            f"decided by the front desk. I've left them a note to call you; you can also call "
            f"{info['phone']}.",
            intent="cancel",
            card={"type": "callback", "note_id": str(note.pk)},
        )
    state["pending"] = {"kind": "cancel_booking", "request_id": str(appt.pk)}
    paid = appt.payments.exists()
    extra = " It is paid, so the usual free-cancellation refund applies." if paid else ""
    return Reply(
        text=f"Cancel {appt.service_name} on {when}?{extra}",
        intent="cancel",
        card={"type": "confirm", "kind": "cancel_booking", "label": "Yes, cancel it"},
        chips=[{"label": "Keep it", "pick": {"kind": "dismiss"}}],
    )


def _reschedule_choose(user, state, session_id, now) -> Reply:
    rows = [
        r
        for r in service.my_requests(user, now=now, assist=True)
        if r["status"] in (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED)
    ]
    if not rows:
        return Reply(
            text="You have no booking to move. Would you like to book a new one?",
            intent="reschedule",
        )
    if len(rows) == 1:
        return _reschedule_start(user, rows[0]["id"], state, session_id, now)
    return Reply(
        text="Which one would you like to move?",
        intent="reschedule",
        chips=[
            {
                "label": f"{r['service']} · {pretty(r['when']) if r['when'] else 'to be set'}",
                "pick": {"kind": "reschedule_booking", "request_id": r["id"]},
            }
            for r in rows[:MAX_CHIPS]
        ],
    )


def _reschedule_start(user, request_id, state, session_id, now) -> Reply:
    appt = _own(user, request_id)
    if appt is None:
        return Reply(text="I can't find that booking.", intent="reschedule")
    if appt.status not in (S.REQUESTED, S.AWAITING_PAYMENT) or appt.payments.exists():
        note = callback.request_callback(customer=user, now=now, assist=True)
        return Reply(
            text="Moving a paid booking needs the front desk. I've left them a note to call you.",
            intent="reschedule",
            card={"type": "callback", "note_id": str(note.pk)},
        )
    _release_hold(user, state, now)
    _clear_booking(state)
    state["service_id"] = str(appt.service_id) if appt.service_id else ""
    state["reschedule_of"] = str(appt.pk)
    return _booking_step(user, understand.Parsed(), state, session_id, now, "reschedule")


# --------------------------------------------------------------------------- person


def _person(user, session_id, now) -> Reply:
    info = callback.shop_contact()
    note = callback.request_callback(customer=user, session_id=session_id, now=now, assist=True)
    return Reply(
        text=f"I've left the front desk a note to call you back. You can also call "
        f"{info['phone']}. We are open {info['hours']}.",
        intent="person",
        card={"type": "callback", "note_id": str(note.pk)},
    )


# --------------------------------------------------------------------------- products


def _order_step(user, parsed, state, intent, now) -> Reply:
    if not parsed.products:
        rows = orders.sellable_products()[:MAX_CHIPS]
        if not rows:
            return Reply(text="No products are in stock right now.", intent="order")
        return Reply(
            text="Which product would you like?",
            intent="order",
            chips=[
                {"label": p["name"], "pick": {"kind": "product", "product_id": p["id"]}}
                for p in rows
            ],
        )
    state["pending_qty"] = parsed.quantity or 1
    state["mode"] = "visit" if intent == "visit_product" else "order"
    if len(parsed.products) > 1:
        names = {p["id"]: p["name"] for p in orders.sellable_products()}
        return Reply(
            text="Which one did you mean?",
            intent="order",
            chips=[
                {"label": names.get(pid, "Product"), "pick": {"kind": "product", "product_id": pid}}
                for pid in parsed.products
                if pid in names
            ],
        )
    return _add_to_cart(user, parsed.products[0], state["pending_qty"], state, now)


def _pick_product(user, pick, state, now) -> Reply:
    return _add_to_cart(
        user, str(pick.get("product_id") or ""), int(state.pop("pending_qty", 1) or 1), state, now
    )


def _add_to_cart(user, product_id, quantity, state, now) -> Reply:
    sellable = {p["id"]: p for p in orders.sellable_products()}
    if product_id not in sellable:
        return Reply(text="Sorry, that product isn't available right now.", intent="order")
    cap = orders.quantity_cap()
    if quantity > cap:
        return Reply(
            text=f"I can order at most {cap} of one product in chat. For more, please ask the "
            "front desk.",
            intent="order",
            chips=[{"label": "Talk to a person", "pick": {"kind": "person"}}],
        )
    if state.get("mode") == "visit":
        state["pending"] = {"kind": "visit_product", "product_id": product_id, "quantity": quantity}
        return Reply(
            text=f"Add {quantity} × {sellable[product_id]['name']} to your next visit? "
            "You pay for it at the salon.",
            intent="order",
            card={"type": "confirm", "kind": "visit_product", "label": "Add to my visit"},
            chips=[{"label": "No thanks", "pick": {"kind": "dismiss"}}],
        )
    cart = {i["product"]: i["quantity"] for i in state.get("cart", [])}
    cart[product_id] = min(cart.get(product_id, 0) + quantity, cap)
    state["cart"] = [{"product": p, "quantity": q} for p, q in cart.items()]
    return _cart_reply(user, state)


def _cart_reply(user, state) -> Reply:
    items = state.get("cart", [])
    if not items:
        state.pop("pending", None)
        return Reply(text="Your order is empty.", intent="order")
    try:
        card = order_card(items, customer=user)
    except shop.ShopError as exc:
        state["cart"] = []
        return Reply(text=exc.message, intent="order")
    state["pending"] = {"kind": "order", "items": items}
    return Reply(
        text="Here is your order. Press Place order to reserve it, then pay from My Orders. "
        "It is not confirmed until you pay, and unpaid orders are released after a short time.",
        intent="order",
        card=card,
        chips=[
            *(
                {
                    "label": f"Remove {ln['name']}",
                    "pick": {"kind": "cart_remove", "product_id": ln["product"]},
                }
                for ln in card["lines"]
            ),
            {"label": "Clear order", "pick": {"kind": "cart_clear"}},
        ],
    )


def _cart_edit(user, pick, state, now) -> Reply:
    if pick.get("kind") == "cart_clear":
        state.pop("cart", None)
        state.pop("pending", None)
        return Reply(text="Okay, I've cleared it. Anything else?", intent="order")
    pid = str(pick.get("product_id") or "")
    state["cart"] = [i for i in state.get("cart", []) if i["product"] != pid]
    return _cart_reply(user, state)


def _order_status(user, state, now) -> Reply:
    rows = orders.my_orders(user, now=now, assist=True)
    if not rows:
        return Reply(text="You have no orders yet.", intent="order_status")
    lines, chips = [], []
    for o in rows[:3]:
        line = f"{o['number']}: {o['status']} (Rs. {o['total']})"
        if o["pay_by"]:
            line += f", pay by {pretty(o['pay_by'])}"
        lines.append(line)
        if o["can_edit"]:
            chips.append(
                {
                    "label": f"Change {o['number']}",
                    "pick": {"kind": "order_edit", "order_id": o["id"]},
                }
            )
            chips.append(
                {
                    "label": f"Cancel {o['number']}",
                    "pick": {"kind": "order_cancel", "order_id": o["id"]},
                }
            )
    return Reply(
        text="Your latest orders:\n" + "\n".join(f"- {line}" for line in lines),
        intent="order_status",
        chips=chips,
        actions=[{"label": "Open My Orders", "url": "/customer/orders"}],
    )


def _order_update_start(user, parsed, state, now) -> Reply:
    rows = [o for o in orders.my_orders(user, now=now, assist=True) if o["can_edit"]]
    paid = [o for o in orders.my_orders(user, now=now, assist=True) if not o["can_edit"]]
    if not rows:
        if paid:
            note = callback.request_callback(customer=user, now=now, assist=True)
            return Reply(
                text="That order is already paid or closed, so I can't change it. I've left the "
                "front desk a note to call you.",
                intent="order_update",
                card={"type": "callback", "note_id": str(note.pk)},
            )
        return Reply(text="You have no order waiting for payment.", intent="order_update")
    return _order_cancel_ask(user, rows[0]["id"], state, now)


def _order_cancel_ask(user, order_id, state, now) -> Reply:
    rows = {o["id"]: o for o in orders.my_orders(user, now=now, assist=True)}
    row = rows.get(order_id)
    if row is None:
        return Reply(text="I can't find that order.", intent="order_update")
    if not row["can_edit"]:
        note = callback.request_callback(customer=user, now=now, assist=True)
        return Reply(
            text="That order is already paid or closed, so I can't change it. I've left the "
            "front desk a note to call you.",
            intent="order_update",
            card={"type": "callback", "note_id": str(note.pk)},
        )
    state["pending"] = {
        "kind": "order_update",
        "order_id": order_id,
        "changes": [{"product": ln["product"], "quantity": 0} for ln in row["lines"]],
    }
    return Reply(
        text=f"Cancel order {row['number']}? Its items go back to stock.",
        intent="order_update",
        card={"type": "confirm", "kind": "order_update", "label": "Yes, cancel the order"},
        chips=[{"label": "Keep it", "pick": {"kind": "dismiss"}}],
    )


def _order_edit_start(user, order_id, state, now) -> Reply:
    rows = {o["id"]: o for o in orders.my_orders(user, now=now, assist=True)}
    row = rows.get(order_id)
    if row is None or not row["can_edit"]:
        return _order_cancel_ask(user, order_id, state, now)
    state["awaiting"] = "order_edit"
    state["edit_order"] = order_id
    names = ", ".join(f"{ln['name']} × {ln['quantity']}" for ln in row["lines"])
    return Reply(
        text=f"{row['number']} has: {names}. Tell me the product and its new quantity "
        '(for example "2 shampoo"), or 0 to remove it.',
        intent="order_update",
    )


def _order_edit_text(user, parsed, state, session_id, now) -> Reply:
    order_id = state.get("edit_order", "")
    rows = {o["id"]: o for o in orders.my_orders(user, now=now, assist=True)}
    row = rows.get(order_id)
    if row is None or not row["can_edit"]:
        state.pop("awaiting", None)
        return _order_cancel_ask(user, order_id, state, now)
    on_order = {ln["product"] for ln in row["lines"]}
    target = [p for p in parsed.products if p in on_order]
    if not target and len(row["lines"]) == 1:
        target = [row["lines"][0]["product"]]
    if len(target) != 1 or parsed.quantity is None:
        return Reply(
            text='Tell me which product and the new quantity, for example "2 shampoo".',
            intent="order_update",
        )
    state["pending"] = {
        "kind": "order_update",
        "order_id": order_id,
        "changes": [{"product": target[0], "quantity": parsed.quantity}],
    }
    state.pop("awaiting", None)
    return Reply(
        text=f"Change the quantity to {parsed.quantity}?",
        intent="order_update",
        card={"type": "confirm", "kind": "order_update", "label": "Yes, change it"},
        chips=[{"label": "Keep it as it is", "pick": {"kind": "dismiss"}}],
    )
