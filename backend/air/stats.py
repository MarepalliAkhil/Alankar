"""AIR activity statistics for the receptionist and the admin (Task 3).

Everything here is counted from the database: the append-only `AIActionLog`, the AIR request
state rows, appointments, payment links, callback notes and shop orders. Nothing comes from a
language model. Every number is defined in docs/AIR.md section 14; the names below match it.

A "window" is [start, end). Days and hours are in Asia/Kolkata.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone
from shop.models import Order

from accounts.models import LoginAttempt, WorkSession
from air.models import AIActionLog, AirRequestState, CallbackNote, NeedsYouState
from billing.models import PaymentLink
from inventory.models import Product
from scheduling.models import Appointment, AppointmentStatus, ApprovalStatus

IST = ZoneInfo("Asia/Kolkata")
S = AppointmentStatus
A = ApprovalStatus
L = AIActionLog.Status
K = NeedsYouState.Kind

RANGES = ("since_last", "today", "7d", "30d")
RANGE_LABELS = {
    "since_last": "Since your last session",
    "today": "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
}
MAX_SINCE_LAST = timedelta(days=30)

CONVERSATION = "conversation"
ORDER_ACTIONS = (
    "create_product_order",
    "update_product_order",
    "cancel_product_order",
    "add_product_to_booking",
)
BOOKING_ACTIONS = (
    "hold_slot",
    "release_slot",
    "expire_hold",
    "submit_booking_request",
    "accept_reception",
    "cancel_booking",
)
PAYMENT_ACTIONS = (
    "create_payment_link",
    "resend_payment_link",
    "expire_payment_link",
    "payment_link_paid",
)
NOT_ACTIONS = (CONVERSATION, "llm_turn")  # counted separately, not as things AIR did
TYPES = ("booking", "payment", "order", "handoff", "other")
TYPE_LABELS = {
    "booking": "Bookings",
    "payment": "Payment links",
    "order": "Product orders",
    "handoff": "Handed to a person",
    "other": "Other",
}
DECLINED = (S.DECLINED_BY_STYLIST, S.DECLINED_BY_RECEPTION, S.REJECTED)
CONFIRMED = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED)
UNDOABLE = ("hold_slot", "submit_booking_request")
BOOKING_KINDS = (K.AWAITING_STYLIST, K.HANDED_TO_DESK)

ACTION_WORDS = {
    CONVERSATION: "Talked with a customer",
    "hold_slot": "Held a time",
    "release_slot": "Released a held time",
    "expire_hold": "A held time ran out",
    "submit_booking_request": "Sent a booking request",
    "accept_reception": "Accepted the desk side of a request",
    "cancel_booking": "Cancelled a booking for the customer",
    "create_payment_link": "Sent a payment link",
    "resend_payment_link": "Sent a payment link again",
    "expire_payment_link": "A payment link expired",
    "payment_link_paid": "A payment link was paid",
    "desk_cover_check": "Looked at a waiting request",
    "create_product_order": "Placed a product order",
    "update_product_order": "Changed a product order",
    "cancel_product_order": "Cancelled an unpaid product order",
    "add_product_to_booking": "Added a product to a visit",
    "order_handoff": "Handed an order question to the desk",
    "callback_note": "Left a call-back note",
    "handoff_to_desk": "Handed a request to the desk",
    "request_refused": "Refused a money request and passed it on",
    "undo_refused": "Could not undo a paid booking",
    "llm_turn": "Used the optional AI service",
}
RESULT_WORDS = {
    L.DONE: "Done",
    L.FAILED: "Failed",
    L.HANDED_OFF: "Handed to a person",
    L.UNDONE: "Undone",
    L.SKIPPED: "Looked at, nothing done",
}


class StatsError(ValueError):
    pass


@dataclass(frozen=True)
class Window:
    key: str
    start: datetime
    end: datetime

    @property
    def previous(self) -> Window:
        length = self.end - self.start
        return Window(self.key, self.start - length, self.start)


def ist_midnight(moment: datetime) -> datetime:
    local = moment.astimezone(IST)
    return datetime.combine(local.date(), time.min, tzinfo=IST)


def last_session_end(user, now: datetime) -> datetime:
    """When the user's previous session ended: the last finished work session (receptionists),
    else the previous successful sign-in, else midnight today (IST). Never more than 30 days."""
    floor = now - MAX_SINCE_LAST
    session = (
        WorkSession.objects.filter(user=user, ended_at__isnull=False, ended_at__lte=now)
        .order_by("-ended_at")
        .first()
    )
    if session is not None:
        return max(session.ended_at, floor)
    logins = list(
        LoginAttempt.objects.filter(email__iexact=user.email, succeeded=True, created_at__lte=now)
        .order_by("-created_at")
        .values_list("created_at", flat=True)[:2]
    )
    if len(logins) == 2:
        return max(logins[1], floor)
    return ist_midnight(now)


def window_for(key: str, user, now: datetime | None = None) -> Window:
    now = now or timezone.now()
    if key not in RANGES:
        raise StatsError("Choose since_last, today, 7d or 30d.")
    if key == "since_last":
        start = min(last_session_end(user, now), now)
    elif key == "today":
        start = ist_midnight(now)
    else:
        days = 7 if key == "7d" else 30
        start = ist_midnight(now) - timedelta(days=days - 1)
    if start >= now:  # an empty window still compares cleanly
        start = now - timedelta(seconds=1)
    return Window(key, start, now)


# --------------------------------------------------------------------------- helpers


def _logs(w: Window):
    return AIActionLog.objects.filter(created_at__gte=w.start, created_at__lt=w.end)


def kind_of(row_type: str, status: str) -> str:
    if status == L.HANDED_OFF:
        return "handoff"
    if row_type in BOOKING_ACTIONS or row_type.startswith("undo_"):
        return "booking"
    if row_type in PAYMENT_ACTIONS:
        return "payment"
    if row_type in ORDER_ACTIONS or row_type == "order_handoff":
        return "order"
    return "other"


def rate(part: int, whole: int) -> float | None:
    if not whole:
        return None
    return float((Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("0.1"), ROUND_HALF_UP))


def change(current, previous) -> dict:
    pct = None
    if previous not in (None, 0) and current is not None:
        pct = float(
            (
                (Decimal(str(current)) - Decimal(str(previous))) * 100 / Decimal(str(previous))
            ).quantize(Decimal("0.1"), ROUND_HALF_UP)
        )
    return {"value": current, "previous": previous, "change_pct": pct}


def _name(user) -> str:
    return (getattr(user, "full_name", "") or getattr(user, "email", "") or "Customer").strip()


def _when(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


# --------------------------------------------------------------------------- the counts


def counts(w: Window) -> dict:
    """The headline numbers for one window (also used for the period before)."""
    logs = _logs(w)
    conversations = Counter(logs.filter(action_type=CONVERSATION).values_list("channel", flat=True))
    requests = Appointment.objects.filter(
        air_state__created_at__gte=w.start, air_state__created_at__lt=w.end
    )
    links = PaymentLink.objects.filter(
        appointment__air_state__isnull=False, created_at__gte=w.start, created_at__lt=w.end
    )
    paid_links = PaymentLink.objects.filter(
        appointment__air_state__isnull=False,
        status=PaymentLink.Status.PAID,
        paid_at__gte=w.start,
        paid_at__lt=w.end,
    )
    order_rows = logs.filter(action_type__in=ORDER_ACTIONS, status=L.DONE)
    chat = conversations.get("chat", 0)
    voice = conversations.get("voice", 0)
    handed = logs.filter(status=L.HANDED_OFF).count()
    return {
        "conversations": chat + voice,
        "conversations_chat": chat,
        "conversations_voice": voice,
        "booking_requests": requests.count(),
        "reception_accepted": logs.filter(action_type="accept_reception", status=L.DONE).count(),
        "awaiting_stylist": requests.filter(status=S.REQUESTED)
        .exclude(stylist_status__in=(A.ACCEPTED, A.DECLINED))
        .count(),
        "stylist_accepted": requests.filter(stylist_status=A.ACCEPTED).count(),
        "declined": requests.filter(status__in=DECLINED).count(),
        "timed_out": requests.filter(status=S.EXPIRED).count(),
        "links_sent": links.count(),
        "links_paid": links.filter(status=PaymentLink.Status.PAID).count(),
        "links_pending": links.filter(status=PaymentLink.Status.ACTIVE).count(),
        "links_expired": links.filter(status=PaymentLink.Status.EXPIRED).count(),
        "confirmed": paid_links.filter(appointment__status__in=CONFIRMED)
        .values("appointment_id")
        .distinct()
        .count(),
        "orders_created": order_rows.filter(action_type="create_product_order").count(),
        "orders_updated": order_rows.exclude(action_type="create_product_order").count(),
        "handed_off": handed,
        "handover_rate": rate(handed, chat + voice),
    }


KPI_KEYS = (
    "conversations",
    "booking_requests",
    "reception_accepted",
    "stylist_accepted",
    "declined_or_timed_out",
    "links_sent",
    "links_paid",
    "links_expired",
    "confirmed",
    "orders",
    "handed_off",
    "handover_rate",
)


def _kpi_values(c: dict) -> dict:
    return {
        **{k: c[k] for k in KPI_KEYS if k in c},
        "declined_or_timed_out": c["declined"] + c["timed_out"],
        "orders": c["orders_created"] + c["orders_updated"],
    }


def hourly(w: Window) -> list[dict]:
    """Actions per hour of the day (IST) stacked by type. Conversations are not actions."""
    grid = {h: dict.fromkeys(TYPES, 0) for h in range(24)}
    rows = (
        _logs(w)
        .exclude(action_type__in=NOT_ACTIONS)
        .values_list("created_at", "action_type", "status")
    )
    for created, action_type, status in rows:
        grid[created.astimezone(IST).hour][kind_of(action_type, status)] += 1
    return [{"hour": f"{h:02d}:00", **grid[h], "total": sum(grid[h].values())} for h in range(24)]


def stylist_responses(w: Window) -> list[dict]:
    rows = defaultdict(lambda: {"accepted": 0, "declined": 0, "timed_out": 0, "waiting": 0})
    appts = Appointment.objects.filter(
        air_state__created_at__gte=w.start, air_state__created_at__lt=w.end
    ).select_related("stylist", "hold_stylist", "preferred_stylist")
    for appt in appts:
        who = appt.stylist or appt.hold_stylist or appt.preferred_stylist
        name = who.display_name if who else "Any stylist"
        row = rows[name]
        if appt.stylist_status == A.ACCEPTED:
            row["accepted"] += 1
        elif appt.stylist_status == A.DECLINED or appt.status == S.DECLINED_BY_STYLIST:
            row["declined"] += 1
        elif appt.status == S.EXPIRED:
            row["timed_out"] += 1
        elif appt.status == S.REQUESTED:
            row["waiting"] += 1
    out = [{"name": name, **v, "total": sum(v.values())} for name, v in sorted(rows.items())]
    return out


def handover_trend(now: datetime) -> list[dict]:
    """The last 7 days (IST, today included): conversations, hand-overs and the rate."""
    today = ist_midnight(now)
    out = []
    for back in range(6, -1, -1):
        start = today - timedelta(days=back)
        w = Window("day", start, min(start + timedelta(days=1), now))
        logs = _logs(w)
        channels = Counter(logs.filter(action_type=CONVERSATION).values_list("channel", flat=True))
        conversations = sum(channels.values())
        handed = logs.filter(status=L.HANDED_OFF).count()
        out.append(
            {
                "date": start.date().isoformat(),
                "chat": channels.get("chat", 0),
                "voice": channels.get("voice", 0),
                "conversations": conversations,
                "handed_off": handed,
                "rate": rate(handed, conversations),
            }
        )
    return out


def products(w: Window) -> list[dict]:
    """Every product change AIR made: product, what changed, quantity, stock before and after,
    and which order. Newest first."""
    rows = _logs(w).filter(action_type__in=ORDER_ACTIONS, status=L.DONE)
    product_ids = {r.after.get("product_id") for r in rows if r.after.get("product_id")}
    names = {
        str(p.pk): p.name for p in Product.objects.filter(pk__in=[p for p in product_ids if p])
    }
    order_ids = {r.order_ref for r in rows if r.order_ref}
    numbers = {o.pk: o.number for o in Order.objects.filter(pk__in=order_ids)}
    out = []
    for r in rows:
        pid = r.after.get("product_id")
        out.append(
            {
                "when": _when(r.created_at),
                "product": names.get(str(pid), "Product"),
                "action_type": r.action_type,
                "change": ACTION_WORDS.get(r.action_type, r.action_type),
                "quantity": r.after.get("quantity"),
                "stock_before": r.after.get("stock_before"),
                "stock_after": r.after.get("stock_after"),
                "order": numbers.get(r.order_ref, ""),
                "order_id": str(r.order_ref) if r.order_ref else None,
            }
        )
    return out


ADDS_UNITS = ("create_product_order", "add_product_to_booking")


def units_per_product(rows: list[dict]) -> list[dict]:
    """Units per product = the quantities of placed orders and visit add-ons (a later change
    of quantity is listed under "changes", not added again). Stock before = the first reading in
    the range, stock after = the last."""
    per: dict[str, dict] = {}
    for row in reversed(rows):  # oldest first
        entry = per.setdefault(
            row["product"],
            {"name": row["product"], "units": 0, "stock_before": row["stock_before"]},
        )
        if row["action_type"] in ADDS_UNITS:
            entry["units"] += int(row["quantity"] or 0)
        entry["stock_after"] = row["stock_after"]
    return sorted(per.values(), key=lambda e: (-e["units"], e["name"]))


def customers(w: Window, limit: int = 50) -> list[dict]:
    """Who AIR dealt with and what it did for each (names come from the account, not the log)."""
    from accounts.models import User

    rows = (
        _logs(w)
        .exclude(customer_ref__isnull=True)
        .values_list("customer_ref", "action_type", "status", "created_at")
    )
    per: dict = {}
    for ref, action_type, status, created in rows:
        entry = per.setdefault(
            ref, {"actions": 0, "bookings": 0, "orders": 0, "handed_off": 0, "did": Counter()}
        )
        entry["actions"] += 1
        entry["last"] = max(entry.get("last", created), created)
        entry["did"][ACTION_WORDS.get(action_type, action_type)] += 1
        if action_type == "submit_booking_request":
            entry["bookings"] += 1
        if action_type in ORDER_ACTIONS:
            entry["orders"] += 1
        if status == L.HANDED_OFF:
            entry["handed_off"] += 1
    users = {u.pk: u for u in User.objects.filter(pk__in=list(per))}
    out = []
    for ref, entry in per.items():
        out.append(
            {
                "customer_id": str(ref),
                "name": _name(users.get(ref)),
                "actions": entry["actions"],
                "bookings": entry["bookings"],
                "orders": entry["orders"],
                "handed_off": entry["handed_off"],
                "last": _when(entry["last"]),
                "did": [f"{words} ({n})" for words, n in entry["did"].most_common()],
            }
        )
    out.sort(key=lambda e: e["last"] or "", reverse=True)
    return out[:limit]


# --------------------------------------------------------------------------- needs you


def _state_rows() -> dict[tuple[str, str], NeedsYouState]:
    return {
        (s.kind, str(s.ref)): s
        for s in NeedsYouState.objects.select_related("claimed_by", "resolved_by")
    }


def needs_you(now: datetime | None = None, limit: int = 50) -> list[dict]:
    """What a person should look at now (not limited to the chosen range). Resolved items drop
    off; claimed items stay with the name of the person who claimed them."""
    now = now or timezone.now()
    week = now - timedelta(days=7)
    states = _state_rows()
    items: list[dict] = []

    def add(kind, ref, title, when, customer=None, link=""):
        state = states.get((kind, str(ref)))
        if kind in BOOKING_KINDS:  # one booking, one claim, whichever way it reached the list
            state = state or next(
                (states[(k, str(ref))] for k in BOOKING_KINDS if (k, str(ref)) in states), None
            )
        if state is not None and state.resolved_at:
            return
        items.append(
            {
                "kind": kind,
                "kind_label": K(kind).label,
                "ref": str(ref),
                "title": title,
                "customer": _name(customer) if customer else "",
                "customer_id": str(customer.pk) if customer else None,
                "when": _when(when),
                "link": link,
                "claimed_by": _name(state.claimed_by) if state and state.claimed_by else "",
                "claimed_at": _when(state.claimed_at) if state else None,
            }
        )

    waiting = (
        Appointment.objects.filter(air_state__isnull=False, status=S.REQUESTED)
        .exclude(stylist_status__in=(A.ACCEPTED, A.DECLINED))
        .exclude(air_state__handed_to_desk=True)  # listed once, as handed to the desk
        .select_related("customer")
        .order_by("created_at")
    )
    for appt in waiting:
        add(
            K.AWAITING_STYLIST,
            appt.pk,
            f"{appt.service_name}: waiting for the stylist",
            appt.created_at,
            appt.customer,
            "/appointments",
        )
    handed = (
        AirRequestState.objects.filter(
            handed_to_desk=True, appointment__status__in=(S.REQUESTED, S.AWAITING_PAYMENT)
        )
        .select_related("appointment__customer")
        .order_by("handed_at")
    )
    for st in handed:
        add(
            K.HANDED_TO_DESK,
            st.appointment_id,
            f"{st.appointment.service_name}: AIR handed this request to the desk",
            st.handed_at,
            st.appointment.customer,
            "/appointments",
        )
    expired = (
        PaymentLink.objects.filter(
            appointment__air_state__isnull=False,
            status=PaymentLink.Status.EXPIRED,
            expires_at__gte=week,
            appointment__status=S.PAYMENT_EXPIRED,
        )
        .select_related("appointment__customer")
        .order_by("expires_at")
    )
    for link in expired:
        add(
            K.EXPIRED_LINK,
            link.pk,
            f"{link.appointment.service_name}: the payment link expired unpaid",
            link.expires_at,
            link.appointment.customer,
            "/appointments",
        )
    for note in CallbackNote.objects.filter(status=CallbackNote.Status.OPEN).select_related(
        "customer"
    ):
        add(K.CALLBACK, note.pk, "Asked to talk to a person", note.created_at, note.customer)
    money = _logs(Window("week", week, now)).filter(
        Q(reason_code__in=("money_request", "paid_booking", "paid_order", "discounted_order"))
        | Q(action_type="order_handoff")
    )
    users = _users({r.customer_ref for r in money if r.customer_ref})
    for row in money:
        link = f"/orders/{row.order_ref}" if row.order_ref else "/appointments"
        add(
            K.REFUND_REQUEST,
            row.pk,
            "A refund, discount or paid-order request for the desk",
            row.created_at,
            users.get(row.customer_ref),
            link,
        )
    items.sort(key=lambda i: i["when"] or "")
    return items[:limit]


def _users(ids) -> dict:
    from accounts.models import User

    return {u.pk: u for u in User.objects.filter(pk__in=[i for i in ids if i])}


# --------------------------------------------------------------------------- the whole page


def _table(columns: list[tuple[str, str, str]], rows: list[dict], totals: dict | None = None):
    out = {
        "columns": [{"key": k, "label": label, "kind": kind} for k, label, kind in columns],
        "rows": rows,
    }
    if totals is not None:
        out["totals"] = totals
    return out


def build(w: Window, now: datetime | None = None) -> dict:
    now = now or w.end
    current = counts(w)
    before = counts(w.previous)
    cur_kpi, prev_kpi = _kpi_values(current), _kpi_values(before)
    hours = hourly(w)
    changes = products(w)
    per_product = units_per_product(changes)
    stylists = stylist_responses(w)
    trend = handover_trend(now)
    funnel_rows = [
        {"step": "Booking requests", "count": current["booking_requests"]},
        {"step": "Desk side accepted by AIR", "count": current["reception_accepted"]},
        {"step": "Accepted by the stylist", "count": current["stylist_accepted"]},
        {"step": "Payment link sent", "count": current["links_sent"]},
        {"step": "Paid", "count": current["links_paid"]},
    ]
    lost_rows = [
        {"step": "Declined", "count": current["declined"]},
        {"step": "Stylist did not answer in time", "count": current["timed_out"]},
        {"step": "Payment link expired", "count": current["links_expired"]},
    ]
    type_totals = {t: sum(h[t] for h in hours) for t in TYPES}
    return {
        "range": w.key,
        "range_label": RANGE_LABELS.get(w.key, w.key),
        "period": {
            "start": w.start.isoformat(),
            "end": w.end.isoformat(),
            "previous_start": w.previous.start.isoformat(),
            "previous_end": w.previous.end.isoformat(),
        },
        "generated_at": now.isoformat(),
        "counts": current,
        "previous_counts": before,
        "kpis": {k: change(cur_kpi[k], prev_kpi[k]) for k in KPI_KEYS},
        "needs_you": needs_you(now),
        "tables": {
            "hourly": _table(
                [
                    ("hour", "Hour", "text"),
                    *[(t, TYPE_LABELS[t], "number") for t in TYPES],
                    ("total", "Total", "number"),
                ],
                hours,
                {"hour": "Total", **type_totals, "total": sum(type_totals.values())},
            ),
            "funnel": _table([("step", "Step", "text"), ("count", "Count", "number")], funnel_rows),
            "lost": _table(
                [("step", "Ended without a booking", "text"), ("count", "Count", "number")],
                lost_rows,
            ),
            "links": _table(
                [("status", "Payment links", "text"), ("count", "Count", "number")],
                [
                    {"status": "Paid", "count": current["links_paid"]},
                    {"status": "Pending", "count": current["links_pending"]},
                    {"status": "Expired", "count": current["links_expired"]},
                ],
                {"status": "Sent", "count": current["links_sent"]},
            ),
            "stylists": _table(
                [
                    ("name", "Stylist", "text"),
                    ("accepted", "Accepted", "number"),
                    ("declined", "Declined", "number"),
                    ("timed_out", "No answer in time", "number"),
                    ("waiting", "Waiting", "number"),
                    ("total", "Total", "number"),
                ],
                stylists,
            ),
            "conversations": _table(
                [
                    ("date", "Day", "text"),
                    ("chat", "Chat", "number"),
                    ("voice", "Voice", "number"),
                    ("conversations", "Conversations", "number"),
                    ("handed_off", "Handed to a person", "number"),
                    ("rate", "Handover rate (%)", "number"),
                ],
                trend,
            ),
            "products": _table(
                [
                    ("name", "Product", "text"),
                    ("units", "Units", "number"),
                    ("stock_before", "Stock before", "number"),
                    ("stock_after", "Stock after", "number"),
                ],
                per_product,
            ),
            "product_changes": _table(
                [
                    ("when", "When", "text"),
                    ("product", "Product", "text"),
                    ("change", "Change", "text"),
                    ("quantity", "Quantity", "number"),
                    ("stock_before", "Stock before", "number"),
                    ("stock_after", "Stock after", "number"),
                    ("order", "Order", "text"),
                ],
                changes,
            ),
        },
        "channels": {
            "chat": current["conversations_chat"],
            "voice": current["conversations_voice"],
        },
        "customers": customers(w),
    }


# --------------------------------------------------------------------------- activity table


def _mask(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 4:
        return ""
    return "•" * (len(digits) - 4) + digits[-4:]


def activity(
    w: Window, *, kind: str = "", customer: str = "", now: datetime | None = None, limit: int = 100
) -> list[dict]:
    """The activity table: one row per thing AIR did, newest first."""
    now = now or timezone.now()
    rows = list(_logs(w).exclude(action_type__in=NOT_ACTIONS).order_by("-created_at")[:500])
    if kind in TYPES:
        rows = [r for r in rows if kind_of(r.action_type, r.status) == kind]
    if customer:
        rows = [r for r in rows if str(r.customer_ref) == customer]
    rows = rows[:limit]
    users = _users({r.customer_ref for r in rows})
    profiles = {}
    from people.models import CustomerProfile

    for p in CustomerProfile.objects.filter(user_id__in=list(users)):
        profiles[p.user_id] = p
    undone = set(
        AIActionLog.objects.filter(undo_of__in=[r.pk for r in rows]).values_list(
            "undo_of_id", flat=True
        )
    )
    paid = set(
        PaymentLink.objects.filter(
            appointment_id__in=[r.booking_ref for r in rows if r.booking_ref],
            status=PaymentLink.Status.PAID,
        ).values_list("appointment_id", flat=True)
    )
    numbers = {
        o.pk: o.number
        for o in Order.objects.filter(pk__in=[r.order_ref for r in rows if r.order_ref])
    }
    out = []
    for r in rows:
        profile = profiles.get(r.customer_ref)
        phone = ""
        if profile is not None:
            try:
                phone = profile.phone or ""
            except Exception:  # noqa: BLE001 - an unreadable phone is simply not shown
                phone = ""
        can_undo = (
            r.action_type in UNDOABLE
            and r.status == L.DONE
            and r.reversible_until is not None
            and now <= r.reversible_until
            and r.pk not in undone
            and r.booking_ref not in paid
        )
        if r.order_ref:
            link, link_label = f"/orders/{r.order_ref}", numbers.get(r.order_ref, "Order")
        elif r.booking_ref:
            link, link_label = "/appointments", "Booking"
        else:
            link, link_label = "", ""
        out.append(
            {
                "id": str(r.pk),
                "when": _when(r.created_at),
                "type": kind_of(r.action_type, r.status),
                "action": ACTION_WORDS.get(r.action_type, r.action_type.replace("_", " ")),
                "result": RESULT_WORDS.get(r.status, r.status),
                "customer": _name(users.get(r.customer_ref)) if r.customer_ref else "",
                "customer_id": str(r.customer_ref) if r.customer_ref else None,
                "phone_masked": _mask(phone),
                "link": link,
                "link_label": link_label,
                "can_undo": can_undo,
            }
        )
    return out
