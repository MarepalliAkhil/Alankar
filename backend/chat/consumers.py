"""Live Zen Chat. One socket per open conversation: /api/ws/chat/<thread id>/.

Membership is checked when the socket connects and again for EVERY message, typing signal and
read receipt, so a thread that closes (or an account that is deactivated) stops working at once.
Message text is never logged. Photos are uploaded over REST (they are too big for a socket
message); the socket only announces them, with ids and sizes but never the picture."""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from chat import service
from chat.auth import socket_user

CLOSE_FORBIDDEN = 4403


class ChatConsumer(AsyncJsonWebsocketConsumer):
    user = None
    thread_id = None
    group = None

    # ------------------------------------------------------------------ sync helpers
    @database_sync_to_async
    def _open(self, user, thread_id):
        if not service.can_use_chat(user):
            return None
        thread = service.get_thread(user, thread_id)
        if thread is None:
            return None
        return {"delivered": service.mark_delivered(thread, user)}

    @database_sync_to_async
    def _still_member(self):
        from accounts.models import User

        user = User.objects.filter(pk=self.user.pk, is_active=True).first()
        if user is None or not service.can_use_chat(user):
            return None
        thread = service.get_thread(user, self.thread_id)
        return (user, thread) if thread else None

    @database_sync_to_async
    def _send(self, user, thread, text):
        message = service.send(thread, user, text)
        return service.message_payload(message)

    @database_sync_to_async
    def _read(self, user, thread):
        return service.mark_read(thread, user)

    @database_sync_to_async
    def _delivered(self, user, thread):
        return service.mark_delivered(thread, user)

    @database_sync_to_async
    def _rate_limited(self, kind):
        return service.hit_rate_limit(self.user.id, kind)

    # ------------------------------------------------------------------ lifecycle
    async def connect(self):
        user = await socket_user(self.scope)
        thread_id = self.scope["url_route"]["kwargs"]["thread_id"]
        opened = await self._open(user, thread_id) if user else None
        if opened is None:
            await self.close(code=CLOSE_FORBIDDEN)
            return
        self.user = user
        self.thread_id = thread_id
        self.group = service.group_name(thread_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready"})
        if opened["delivered"]:
            await self.channel_layer.group_send(
                self.group,
                {"type": "chat.status", "ids": opened["delivered"], "status": "delivered"},
            )

    async def disconnect(self, code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            return
        member = await self._still_member()
        if member is None:  # removed, deactivated or the thread is gone: cut the connection
            await self.close(code=CLOSE_FORBIDDEN)
            return
        user, thread = member
        kind = content.get("type")
        if kind == "message":
            await self._on_message(user, thread, content)
        elif kind == "typing":
            if not await self._rate_limited("typing"):
                await self.channel_layer.group_send(
                    self.group,
                    {"type": "chat.typing", "sender": str(user.id), "on": bool(content.get("on"))},
                )
        elif kind == "read":
            ids = await self._read(user, thread)
            if ids:
                await self.channel_layer.group_send(
                    self.group, {"type": "chat.status", "ids": ids, "status": "read"}
                )

    async def _on_message(self, user, thread, content):
        try:
            payload = await self._send(user, thread, content.get("text"))
        except service.ChatError as exc:
            await self.send_json(
                {
                    "type": "error",
                    "code": exc.code,
                    "detail": exc.message,
                    "client_id": str(content.get("client_id", ""))[:64],
                }
            )
            return
        payload["client_id"] = str(content.get("client_id", ""))[:64]
        await self.channel_layer.group_send(
            self.group, {"type": "chat.message", "message": payload}
        )

    # ------------------------------------------------------------------ group events
    async def chat_message(self, event):
        message = dict(event["message"])
        mine = message.pop("sender") == str(self.user.id)
        message["mine"] = mine
        if not mine:
            ids = await self._delivered_by_me(message["id"])
            if ids:
                message["status"] = "delivered"
                await self.channel_layer.group_send(
                    self.group, {"type": "chat.status", "ids": ids, "status": "delivered"}
                )
        else:
            message.setdefault("client_id", "")
        await self.send_json({"type": "message", "message": message})

    @database_sync_to_async
    def _delivered_by_me(self, message_id):
        from chat.models import Message

        updated = Message.objects.filter(pk=message_id, delivered_at__isnull=True).exclude(
            sender=self.user
        )
        found = list(updated.values_list("id", flat=True))
        if found:
            from django.utils import timezone

            Message.objects.filter(pk__in=found).update(delivered_at=timezone.now())
        return [str(i) for i in found]

    async def chat_photo_deleted(self, event):
        # Ids only: the screen already has the message and swaps it for "Photo deleted".
        await self.send_json(
            {"type": "photo_deleted", "message": event["message"], "image": event["image"]}
        )

    async def chat_status(self, event):
        await self.send_json({"type": "status", "ids": event["ids"], "status": event["status"]})

    async def chat_typing(self, event):
        if event["sender"] != str(self.user.id):
            await self.send_json({"type": "typing", "on": event["on"]})


class InboxConsumer(AsyncJsonWebsocketConsumer):
    """One personal socket per signed-in customer or stylist: /api/ws/inbox/.

    It only RECEIVES short notes about new messages addressed to this person (chat/inbox.py), so
    the app can show a pop-up on any page. It joins the person's own group only; nothing sent by
    the browser is acted on. The account is checked again before every note is passed on, so a
    deactivated account stops getting them at once."""

    user = None
    group = None

    @database_sync_to_async
    def _allowed(self, user_id) -> bool:
        from accounts.models import User

        return service.can_use_chat(User.objects.filter(pk=user_id).first())

    async def connect(self):
        from chat import inbox

        user = await socket_user(self.scope)
        if user is None or not await self._allowed(user.pk):
            await self.close(code=CLOSE_FORBIDDEN)
            return
        self.user = user
        self.group = inbox.group_for(user.pk)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready"})

    async def disconnect(self, code):
        if self.group:
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        return  # receive-only

    async def inbox_chat(self, event):
        if not await self._allowed(self.user.pk):
            await self.close(code=CLOSE_FORBIDDEN)
            return
        await self.send_json(
            {
                "type": "chat",
                "thread": event["thread"],
                "message": event["message"],
                "sender": event["sender"],
                "preview": event["preview"],
                "kind": event["kind"],
            }
        )
