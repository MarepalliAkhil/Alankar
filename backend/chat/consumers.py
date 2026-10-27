"""Live Zen Chat. One socket per open conversation: /api/ws/chat/<thread id>/.

Membership is checked when the socket connects and again for EVERY message, typing signal and
read receipt, so a thread that closes (or an account that is deactivated) stops working at once.
Message text is never logged."""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from chat import service
from chat.auth import user_from_cookie

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
        user = await user_from_cookie(self.scope)
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

    async def chat_status(self, event):
        await self.send_json({"type": "status", "ids": event["ids"], "status": event["status"]})

    async def chat_typing(self, event):
        if event["sender"] != str(self.user.id):
            await self.send_json({"type": "typing", "on": event["on"]})
