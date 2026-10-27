"""Zen Chat rules in one place, used by the REST views and the WebSocket consumer.

Who may chat: the customer and the stylist of an appointment that is scheduled or later. Nobody
else: receptionists and admins have no chat access at all. A thread stays open while a visit is
scheduled, checked in or in progress, and for 7 days after the last completed visit; after that it
is read-only. Message text is plain text only and is never logged.
"""

from __future__ import annotations

import re
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.utils import timezone

from accounts.models import User
from chat.models import Message, Thread
from people.models import StylistProfile
from scheduling.models import Appointment, AppointmentStatus

S = AppointmentStatus
ACTIVE = (S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS)
ELIGIBLE = (*ACTIVE, S.COMPLETED)
CLOSE_AFTER = timedelta(days=7)
MAX_LENGTH = 1000
RATE_LIMIT = 20  # messages per user ...
RATE_WINDOW = 60  # ... per this many seconds
TYPING_LIMIT = 60

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ChatError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def group_name(thread_id) -> str:
    return f"chat_{str(thread_id).replace('-', '')}"


def clean_text(raw: object) -> str:
    """Plain text only: no markup is interpreted anywhere, and the screen escapes it again."""
    if not isinstance(raw, str):
        raise ChatError("invalid", "Write a message first.")
    text = _CONTROL.sub("", raw.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if not text:
        raise ChatError("invalid", "Write a message first.")
    if len(text) > MAX_LENGTH:
        raise ChatError("too_long", f"Messages can have at most {MAX_LENGTH} characters.")
    return text


def hit_rate_limit(user_id, kind: str = "message") -> bool:
    limit = RATE_LIMIT if kind == "message" else TYPING_LIMIT
    key = f"chat:rate:{kind}:{user_id}"
    cache.add(key, 0, RATE_WINDOW)
    try:
        return cache.incr(key) > limit
    except ValueError:  # key expired between add and incr
        cache.set(key, 1, RATE_WINDOW)
        return False


def can_use_chat(user: User | None) -> bool:
    return bool(
        user and user.is_authenticated and user.is_active and user.role in ("customer", "stylist")
    )


def profile_of(user: User) -> StylistProfile | None:
    return StylistProfile.objects.filter(user=user).first()


def threads_for(user: User):
    """Every thread this account takes part in (empty for any other role)."""
    if not can_use_chat(user):
        return Thread.objects.none()
    if user.role == "customer":
        return Thread.objects.filter(customer=user)
    return Thread.objects.filter(stylist__user=user)


def get_thread(user: User, thread_id) -> Thread | None:
    """The thread if (and only if) the account is one of its two participants."""
    try:
        return (
            threads_for(user)
            .select_related("customer", "stylist", "stylist__user")
            .get(pk=thread_id)
        )
    except (Thread.DoesNotExist, ValueError, TypeError):
        return None


def pair_appointments(thread: Thread):
    return Appointment.objects.filter(
        customer_id=thread.customer_id, stylist_id=thread.stylist_id, status__in=ELIGIBLE
    )


def sync_threads(user: User) -> None:
    """Opens a thread for every customer-stylist pair that has a scheduled-or-later visit."""
    if not can_use_chat(user):
        return
    if user.role == "customer":
        pairs = Appointment.objects.filter(
            customer=user, stylist__isnull=False, status__in=ELIGIBLE
        ).values_list("customer_id", "stylist_id")
    else:
        profile = profile_of(user)
        if profile is None:
            return
        pairs = Appointment.objects.filter(stylist=profile, status__in=ELIGIBLE).values_list(
            "customer_id", "stylist_id"
        )
    for customer_id, stylist_id in set(pairs):
        Thread.objects.get_or_create(customer_id=customer_id, stylist_id=stylist_id)


def state(thread: Thread, now=None) -> dict:
    """open: may send. closes_at: when a thread with only finished visits becomes read-only."""
    now = now or timezone.now()
    visits = list(pair_appointments(thread).select_related("completion"))
    if any(v.status in ACTIVE for v in visits):
        return {"open": True, "closes_at": None}
    stamps = []
    for visit in visits:
        completion = getattr(visit, "completion", None)
        stamps.append(
            (completion.completed_at if completion else None) or visit.end or visit.start or now
        )
    if not stamps:
        return {"open": False, "closes_at": None}
    closes_at = max(stamps) + CLOSE_AFTER
    return {"open": now < closes_at, "closes_at": closes_at}


def current_appointment(thread: Thread) -> Appointment | None:
    visits = list(pair_appointments(thread).order_by("start"))
    active = [v for v in visits if v.status in ACTIVE]
    if active:
        return active[0]
    return visits[-1] if visits else None


def first_name(full: str) -> str:
    parts = (full or "").split()
    return parts[0] if parts else "Guest"


def message_payload(message: Message) -> dict:
    """JSON-safe form used on the channel layer; the receiver adds `mine` for its own user."""
    return {
        "id": str(message.id),
        "thread": str(message.thread_id),
        "sender": str(message.sender_id),
        "text": message.text,
        "created_at": message.created_at.isoformat(),
        "status": message.status,
        "service": message.appointment.service_name if message.appointment_id else "",
    }


def message_data(message: Message, viewer_id) -> dict:
    data = message_payload(message)
    data["mine"] = str(viewer_id) == data.pop("sender")
    return data


def broadcast_status(thread_id, ids: list[str], status: str) -> None:
    if ids:
        broadcast(thread_id, {"type": "chat.status", "ids": ids, "status": status})


def send(thread: Thread, user: User, raw_text: object) -> Message:
    """Validates and stores one message. Raises ChatError. Never logs the text."""
    if thread.customer_id != user.id and thread.stylist.user_id != user.id:
        raise ChatError("forbidden", "You are not part of this conversation.")
    text = clean_text(raw_text)
    if not state(thread)["open"]:
        raise ChatError("closed", "This conversation is read-only now.")
    if hit_rate_limit(user.id):
        raise ChatError("rate_limited", "You are sending messages too fast. Wait a moment.")
    message = Message(thread=thread, sender=user, appointment=current_appointment(thread))
    message.set_text(text)
    message.save()
    Thread.objects.filter(pk=thread.pk).update(last_message_at=message.created_at)
    return message


def other_user_id(thread: Thread, user: User):
    return thread.stylist.user_id if user.id == thread.customer_id else thread.customer_id


def mark_delivered(thread: Thread, viewer: User) -> list[str]:
    ids = list(
        Message.objects.filter(thread=thread, delivered_at__isnull=True)
        .exclude(sender=viewer)
        .values_list("id", flat=True)
    )
    if ids:
        Message.objects.filter(pk__in=ids).update(delivered_at=timezone.now())
    return [str(i) for i in ids]


def mark_read(thread: Thread, viewer: User) -> list[str]:
    now = timezone.now()
    qs = Message.objects.filter(thread=thread, read_at__isnull=True).exclude(sender=viewer)
    ids = list(qs.values_list("id", flat=True))
    if ids:
        Message.objects.filter(pk__in=ids).update(read_at=now, delivered_at=now)
    return [str(i) for i in ids]


def unread_count(thread: Thread, viewer: User) -> int:
    return (
        Message.objects.filter(thread=thread, read_at__isnull=True).exclude(sender=viewer).count()
    )


def broadcast(thread_id, payload: dict) -> None:
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(group_name(thread_id), payload)


def thread_card(thread: Thread, viewer: User) -> dict:
    viewing_customer = viewer.id == thread.customer_id
    last = thread.messages.order_by("-created_at").first()
    appt = current_appointment(thread)
    st = state(thread)
    if viewing_customer:
        other = {"name": thread.stylist.display_name, "photo_url": thread.stylist.photo_url}
        other["title"] = thread.stylist.title
    else:
        other = {"name": first_name(thread.customer.full_name), "photo_url": "", "title": ""}
    preview = ""
    if last is not None:
        preview = last.text[:80]
    return {
        "id": str(thread.id),
        "other": other,
        "appointment": (
            {"service_name": appt.service_name, "start": appt.start, "status": appt.status}
            if appt
            else None
        ),
        "last_message": (
            {"preview": preview, "created_at": last.created_at, "mine": last.sender_id == viewer.id}
            if last
            else None
        ),
        "unread": unread_count(thread, viewer),
        "open": st["open"],
        "closes_at": st["closes_at"],
    }
