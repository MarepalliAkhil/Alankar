"""HTTP endpoints for the customer chat with AIR.

  POST /api/air/chat/            talk (guests: general questions only; customers: booking, orders)
  GET  /api/air/status/          is AIR covering the desk, is AI mode offered (public yes/no)
  POST /api/my/air/send-request/ the ONLY way a chat creates a booking request
  POST /api/my/air/confirm/      the ONLY way a chat places/changes an order, adds a product to a
                                 visit or cancels a booking
  GET/PUT /api/my/air/consent/   the customer's AI-mode consent
  GET  /api/desk/callbacks/      callback notes for the receptionist's request screen

Staff accounts are refused on the chat. Nothing here stores the conversation: the state of a chat
lives in the cache for 30 minutes and holds slot ids, never message text.
"""

from __future__ import annotations

import re
import uuid

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from shop.orders import ShopError

from accounts.audit import audit
from accounts.models import User
from air import actionlog, ai, callback, consent, cover, dialog, orders, service
from air.actor import AirDenied
from air.models import CallbackNote
from chatbot import logging as chat_log
from chatbot import registry
from chatbot.api import MAX_QUERY_CHARS, over_limit
from chatbot.engine import Session
from chatbot.tools import UserTools
from scheduling import booking

SESSION_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
AUDIT_CONSENT = "air_consent_changed"


def _who(request: Request) -> str:
    user = request.user
    from accounts.audit import client_ip

    return f"u{user.pk}" if user.is_authenticated else f"ip{client_ip(request) or 'unknown'}"


def _session(request: Request, supplied: str) -> tuple[str, str, dict]:
    sid = supplied if SESSION_ID.match(supplied or "") else str(uuid.uuid4())
    key = f"air:session:{_who(request)}:{sid}"
    return sid, key, cache.get(key) or dialog.new_state()


def _save(key: str, state: dict) -> None:
    cache.set(key, state, dialog.SESSION_SECONDS)


def public_reply(reply: dialog.Reply, *, mode: str) -> dict:
    return {
        "text": reply.text,
        "intent": reply.intent,
        "rephrased": reply.rephrased,
        "show_rephrase": reply.show_rephrase,
        "actions": reply.actions,
        "suggestions": reply.suggestions,
        "needs_login": reply.needs_login,
        "source": reply.source,
        "chips": reply.chips,
        "card": reply.card,
        "wording_by_ai": reply.wording_by_ai,
        "mode": mode,
    }


def _refuse_staff(user) -> Response | None:
    if user is not None and user.role != User.Role.CUSTOMER:
        return Response({"detail": "This assistant is for guests and customers."}, status=403)
    return None


def _customer_only(request: Request) -> Response | None:
    if request.user.role != User.Role.CUSTOMER:
        return Response({"detail": "This is for customers."}, status=403)
    return None


# --------------------------------------------------------------------------- chat


class ChatSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=MAX_QUERY_CHARS, trim_whitespace=True, required=False, allow_blank=True
    )
    pick = serializers.DictField(required=False)
    session_id = serializers.CharField(max_length=64, required=False, allow_blank=True)
    basic_mode = serializers.BooleanField(required=False, default=False)


class ChatView(APIView):
    policy_action = "air.chat"

    @extend_schema(summary="Talk to AIR (AI Alankar Intelligence)", request=ChatSerializer)
    def post(self, request: Request) -> Response:
        user = request.user if request.user.is_authenticated else None
        refused = _refuse_staff(user)
        if refused:
            return refused
        body = ChatSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        if not data.get("message") and not data.get("pick"):
            return Response({"detail": "Say something or tap a button."}, status=400)
        who = _who(request)
        if over_limit(who):
            return Response(
                {"detail": "You are asking quickly. Please wait a minute and try again."},
                status=429,
                headers={"Retry-After": "60"},
            )
        sid, key, state = _session(request, data.get("session_id", ""))
        now = timezone.now()
        if not state.get("_counted"):
            # One row per conversation for the AIR statistics: no text, only the channel and,
            # for a signed-in customer, their public id.
            actionlog.write("conversation", customer=user, session_id=sid, now=now)
            state["_counted"] = True
        engine = registry.get_engine()
        engine_session = state.pop("_engine", None) or Session()

        def engine_answer(text: str):
            return engine.answer(
                text,
                user={"id": str(user.pk), "name": user.full_name} if user else None,
                tools=UserTools(user) if user else None,
                session=engine_session,
            )

        use_ai = bool(user) and not data["basic_mode"] and ai.available(now)
        ai_turn = None
        if use_ai:

            def ai_turn(message, st, parsed):  # noqa: E306
                return ai.run_turn(user, message, st, parsed, sid, now)

        reply = dialog.converse(
            user=user,
            message=data.get("message", ""),
            pick=data.get("pick") or None,
            state=state,
            session_id=sid,
            now=now,
            engine_answer=engine_answer,
            ai_turn=ai_turn,
            help_answer=lambda text: engine.help_answer(text, "air_"),
        )
        state["_engine"] = engine_session
        _save(key, state)
        if reply.source in ("intent", "kb", "followup", "clarify", "fallback", "entity"):
            chat_log.record_usage(reply.intent)
            if reply.intent == "unknown" and not chat_log.looks_personal(data.get("message", "")):
                chat_log.record_unanswered(None)
        mode = "ai" if reply.wording_by_ai or reply.intent == "ai" else "basic"
        return Response(
            {
                "session_id": sid,
                "reply": public_reply(reply, mode=mode),
                "cover_active": cover.is_active(now),
            }
        )


class StatusView(APIView):
    policy_action = "air.status"

    @extend_schema(summary="Is AIR covering the front desk, and is AI mode offered?")
    def get(self, request: Request) -> Response:
        user = request.user if request.user.is_authenticated else None
        now = timezone.now()
        body = {"cover_active": cover.is_active(now), **ai.status_for(user, now)}
        if user is not None and user.role != User.Role.CUSTOMER:
            body.update(ai_available=False, consent="none")
        return Response(body)


# --------------------------------------------------------------------------- send request


class SendSerializer(serializers.Serializer):
    hold_id = serializers.UUIDField()
    session_id = serializers.CharField(max_length=64, required=False, allow_blank=True)


def _contact(user) -> dict:
    profile = getattr(user, "customer_profile", None)
    return {
        "name": user.full_name or user.email,
        "email": user.email,
        "phone": (profile.phone if profile else "") or "",
    }


_STATUS = {"conflict": 409, "ratings_pending": 403, "email_unverified": 403}


class SendRequestView(APIView):
    policy_action = "air.send_request"

    @extend_schema(
        summary="Send the booking request for the slot AIR is holding", request=SendSerializer
    )
    def post(self, request: Request) -> Response:
        refused = _customer_only(request)
        if refused:
            return refused
        body = SendSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user, now = request.user, timezone.now()
        sid, key, state = _session(request, body.validated_data.get("session_id", ""))
        try:
            appt = service.submit_booking(
                customer=user,
                hold_id=body.validated_data["hold_id"],
                contact=_contact(user),
                notes="",
                allergies="",
                session_id=sid,
                customer_confirmed=True,
                now=now,
                assist=True,
            )
        except booking.BookingError as exc:
            reply = dialog.Reply(text=exc.message, intent="book")
            if exc.code == "ratings_pending":
                reply.actions = [dialog.RATE_ACTION]
            state.pop("hold_id", None)
            _save(key, state)
            return Response(
                {
                    "detail": exc.message,
                    "code": exc.code,
                    "reply": public_reply(reply, mode="basic"),
                },
                status=_STATUS.get(exc.code, 400),
            )
        except AirDenied as exc:
            return Response({"detail": exc.message, "code": exc.code}, status=400)
        old = state.pop("reschedule_of", None)
        moved = False
        if old:
            moved = _drop_old_request(user, old)
        state.pop("hold_id", None)
        state["awaiting"] = None
        _save(key, state)
        from air import config

        minutes = config.get_settings().stylist_timeout_minutes
        desk = (
            "AIR is covering the front desk and has accepted that side."
            if appt.reception_status == "accepted"
            else "The front desk will look at it."
        )
        text = (
            f"Your request is sent. {desk} Your stylist has {minutes} minutes to answer. "
            f"{dialog.NOT_CONFIRMED_NOTE}"
        )
        if moved:
            text += " I've cancelled your earlier request."
        reply = dialog.Reply(
            text=text,
            intent="book",
            actions=[{"label": "Open My Appointments", "url": "/customer/appointments"}],
            chips=[],
            suggestions=["My requests"],
        )
        return Response(
            {
                "session_id": sid,
                "request_id": str(appt.pk),
                "status": appt.status,
                "reply": public_reply(reply, mode="basic"),
            },
            status=201,
        )


def _drop_old_request(user, request_id) -> bool:
    from scheduling.models import Appointment, AppointmentStatus

    old = Appointment.objects.filter(pk=request_id, customer=user).first()
    if old is None or old.status not in (
        AppointmentStatus.REQUESTED,
        AppointmentStatus.AWAITING_PAYMENT,
    ):
        return False
    if old.payments.exists():
        return False
    try:
        booking.customer_cancel(old.pk, customer=user, reason="Moved to a new time")
    except booking.BookingError:
        return False
    return True


# --------------------------------------------------------------------------- confirm


class ConfirmSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=["order", "order_update", "visit_product", "cancel_booking"]
    )
    session_id = serializers.CharField(max_length=64)


class ConfirmView(APIView):
    policy_action = "air.confirm"

    @extend_schema(summary="Confirm the change AIR is showing on a card", request=ConfirmSerializer)
    def post(self, request: Request) -> Response:
        refused = _customer_only(request)
        if refused:
            return refused
        body = ConfirmSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user, now = request.user, timezone.now()
        sid, key, state = _session(request, body.validated_data["session_id"])
        pending = state.get("pending")
        kind = body.validated_data["kind"]
        # Only a change AIR itself showed this customer in this chat can be confirmed, and only
        # as the kind that was shown: a made-up request does nothing.
        if not pending or pending.get("kind") != kind:
            return Response(
                {"detail": "There is nothing waiting for your confirmation."}, status=409
            )
        try:
            reply = _run_pending(user, pending, state, sid, now)
        except (AirDenied, ShopError) as exc:
            state.pop("pending", None)
            _save(key, state)
            message = getattr(exc, "message", str(exc))
            reply = dialog.Reply(text=message, intent="other")
            if getattr(exc, "code", "") in ("needs_desk", "paid_order", "discounted_order"):
                reply.chips = [{"label": "Talk to a person", "pick": {"kind": "person"}}]
            return Response(
                {
                    "detail": message,
                    "code": getattr(exc, "code", "invalid"),
                    "reply": public_reply(reply, mode="basic"),
                },
                status=400,
            )
        except booking.BookingError as exc:
            state.pop("pending", None)
            _save(key, state)
            return Response({"detail": exc.message, "code": exc.code}, status=400)
        state.pop("pending", None)
        _save(key, state)
        return Response({"session_id": sid, "reply": public_reply(reply, mode="basic")}, status=201)


def _run_pending(user, pending: dict, state: dict, sid: str, now) -> dialog.Reply:
    kind = pending["kind"]
    if kind == "order":
        order = orders.create_order(
            customer=user,
            items=pending["items"],
            customer_confirmed=True,
            session_id=sid,
            now=now,
            assist=True,
        )
        state.pop("cart", None)
        pay = (
            f" Pay by {dialog.pretty(order.pay_until)} or the items go back to stock."
            if order.pay_until
            else ""
        )
        return dialog.Reply(
            text=f"Order {order.number} is reserved and waiting for your payment.{pay} "
            "It is not confirmed until you pay.",
            intent="order",
            actions=[{"label": "Pay for this order", "url": f"/customer/orders/{order.pk}"}],
        )
    if kind == "order_update":
        order = orders.update_order(
            customer=user,
            order_id=pending["order_id"],
            changes=pending["changes"],
            session_id=sid,
            now=now,
            assist=True,
        )
        text = (
            f"Order {order.number} is cancelled and its items are back in stock."
            if order.status == "cancelled"
            else f"Order {order.number} is updated. The new total is Rs. {order.total}."
        )
        return dialog.Reply(
            text=text,
            intent="order",
            actions=[{"label": "Open My Orders", "url": "/customer/orders"}],
        )
    if kind == "visit_product":
        orders.add_to_visit(
            customer=user,
            product_id=pending["product_id"],
            quantity=pending["quantity"],
            session_id=sid,
            now=now,
            assist=True,
        )
        return dialog.Reply(
            text="Done. It is held for your next visit and you pay for it at the salon.",
            intent="order",
            actions=[{"label": "Open My Appointments", "url": "/customer/appointments"}],
        )
    appt = service.cancel_own(
        customer=user, request_id=pending["request_id"], session_id=sid, now=now, assist=True
    )
    return dialog.Reply(text=f"{appt.service_name} is cancelled.", intent="cancel")


# --------------------------------------------------------------------------- consent


class ConsentSerializer(serializers.Serializer):
    granted = serializers.BooleanField()


class ConsentView(APIView):
    policy_actions = {"GET": "air.consent.read", "PUT": "air.consent.update"}

    @extend_schema(summary="My AI-mode consent")
    def get(self, request: Request) -> Response:
        refused = _customer_only(request)
        return refused or Response(consent.state(request.user))

    @extend_schema(summary="Give or withdraw my AI-mode consent", request=ConsentSerializer)
    def put(self, request: Request) -> Response:
        refused = _customer_only(request)
        if refused:
            return refused
        body = ConsentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if body.validated_data["granted"]:
            consent.grant(request.user)
        else:
            consent.withdraw(request.user)
        audit(
            AUDIT_CONSENT,
            request=request,
            actor=request.user,
            granted=body.validated_data["granted"],
            version=consent.CURRENT_VERSION,
        )
        return Response(consent.state(request.user))


# --------------------------------------------------------------------------- desk callbacks


def _note_data(note: CallbackNote) -> dict:
    return {
        "id": str(note.pk),
        "customer_name": note.customer.full_name,
        "customer_id": str(note.customer_id),
        "note": note.note,
        "appointment_id": str(note.appointment_id) if note.appointment_id else None,
        "created_at": note.created_at,
    }


class DeskCallbackListView(APIView):
    policy_action = "desk.callbacks.list"

    @extend_schema(summary="Callback requests left through AIR (receptionist)")
    def get(self, request: Request) -> Response:
        return Response({"results": [_note_data(n) for n in callback.open_notes()[:50]]})


class DeskCallbackDoneView(APIView):
    policy_action = "desk.callbacks.done"

    @extend_schema(summary="Mark a callback request as done", request=None)
    def post(self, request: Request, pk) -> Response:
        try:
            note = callback.mark_done(pk, by=request.user)
        except AirDenied as exc:
            return Response({"detail": exc.message}, status=404)
        return Response(_note_data(note))
