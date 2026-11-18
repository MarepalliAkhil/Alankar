"""Zen Chat notifications: a pop-up for the person who receives a message, and an email when it
stays unread.

Pop-up: every signed-in customer and stylist keeps one personal socket (/api/ws/inbox/, see
consumers.InboxConsumer). When a message is saved, `announce` sends a short note to the RECEIVER's
personal group only: the conversation id, the sender's name as the receiver sees it in Zen Chat
(customers see the stylist's display name, stylists see the customer's first name), and a
preview. Nothing goes to the sender, to staff or to anyone else.

Email: the `chat_unread_emails` job (core/jobs.py) finds messages still unread after
EMAIL_AFTER, and sends the receiver ONE short email per conversation ("New message from Priya
in Zen Chat") with a link to the conversation. The message text is never put in an email (chat
is encrypted at rest; mail is not). Each message is emailed about at most once (emailed_at).
Addresses on reserved test domains (example.com and the like) are never emailed.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from chat.models import Message, Thread

EMAIL_AFTER = timedelta(minutes=10)  # a message read within this time never causes an email
EMAIL_LOOKBACK = timedelta(days=2)  # older unread messages are left alone (no late surprises)
PREVIEW_CHARS = 80
RESERVED_DOMAINS = ("example.com", "example.org", "example.net", ".test", ".invalid", ".localhost")


def group_for(user_id) -> str:
    return f"inbox_{str(user_id).replace('-', '')}"


def receiver_id(message: Message):
    thread = message.thread
    return thread.stylist.user_id if message.sender_id == thread.customer_id else thread.customer_id


def sender_name(message: Message) -> str:
    """The sender as the RECEIVER sees them in Zen Chat."""
    from chat.service import first_name

    thread = message.thread
    if message.sender_id == thread.customer_id:
        return first_name(thread.customer.full_name)
    return thread.stylist.display_name


def preview(message: Message) -> str:
    text = (message.text or "").replace("\n", " ").strip()
    if message.kind == "image":
        text = f"Photo: {text}" if text else "Photo"
    return text[:PREVIEW_CHARS]


def event_for(message: Message) -> dict:
    return {
        "type": "inbox.chat",
        "thread": str(message.thread_id),
        "message": str(message.id),
        "sender": sender_name(message),
        "preview": preview(message),
        "kind": message.kind,
    }


def announce(message: Message) -> None:
    """Pop-up note for the receiver, sent after the message is safely saved."""
    target = group_for(receiver_id(message))
    event = event_for(message)

    def push():
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(target, event)

    transaction.on_commit(push)


# ----------------------------------------------------------------------------- email
def deliverable(email: str) -> bool:
    domain = (email or "").rsplit("@", 1)[-1].lower()
    if not domain or "@" not in (email or ""):
        return False
    return not any(
        domain == d or domain.endswith(d if d.startswith(".") else f".{d}")
        for d in RESERVED_DOMAINS
    )


def chat_path(role: str, thread_id) -> str:
    return f"/customer/chat/{thread_id}" if role == "customer" else f"/chat/{thread_id}"


def email_unread(now) -> int:
    """One email per (receiver, conversation) for messages unread for EMAIL_AFTER. Returns the
    number of emails queued."""
    from chat.service import first_name
    from core import brand
    from core.mail import frontend_link, queue_mail
    from core.models import MailOutbox

    due = list(
        Message.objects.filter(
            read_at__isnull=True,
            emailed_at__isnull=True,
            created_at__lte=now - EMAIL_AFTER,
            created_at__gte=now - EMAIL_LOOKBACK,
        ).select_related("thread", "thread__customer", "thread__stylist", "thread__stylist__user")
    )
    if not due:
        return 0
    batches: dict[tuple, list[Message]] = defaultdict(list)
    for message in due:
        batches[(message.thread_id, receiver_id(message))].append(message)

    sent = 0
    for (_thread_id, to_id), messages in batches.items():
        thread: Thread = messages[0].thread
        receiver = thread.customer if to_id == thread.customer_id else thread.stylist.user
        ids = [m.pk for m in messages]
        with transaction.atomic():
            # Claim the rows first, so two runs at once can never email twice.
            claimed = Message.objects.filter(pk__in=ids, emailed_at__isnull=True).update(
                emailed_at=now
            )
            if not claimed or receiver is None or not receiver.is_active:
                continue
            if not deliverable(receiver.email):
                continue
            name = sender_name(messages[0])
            count = len(messages)
            subject = (
                f"New message from {name} in Zen Chat"
                if count == 1
                else f"{count} new messages from {name} in Zen Chat"
            )
            hello = first_name(receiver.full_name) if receiver.full_name else ""
            queue_mail(
                kind=MailOutbox.Kind.NOTICE,
                to=receiver.email,
                subject=f"{brand.SHOP_NAME}: {subject}",
                body=(
                    (f"Hello {hello},\n\n" if hello else "Hello,\n\n")
                    + f"{name} sent you {'a message' if count == 1 else f'{count} messages'} in "
                    "Zen Chat. Open the conversation to read and reply. (For your privacy, "
                    "messages are never copied into emails.)"
                ),
                link=frontend_link(chat_path(receiver.role, thread.id)),
            )
            sent += 1
    return sent
