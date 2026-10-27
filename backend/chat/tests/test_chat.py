"""Task 4b: Zen Chat. Who may chat, when a thread opens and closes, encryption at rest, limits,
the REST API and the live WebSocket connection (cookie sign-in, membership on every message)."""

import asyncio
import json
import logging
from datetime import timedelta

import pytest
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from chat import service
from chat.models import Message, Thread
from config.asgi import application, websocket_urlpatterns
from conftest import login
from core import crypto, policy
from people.tests.test_stylist import (  # noqa: F401  (shared fixtures and helpers)
    asha,
    assert_no_contact_details,
    booked,
    catalogue,
    customer,
    desk,
    ravi,
    set_status,
    walk_all,
)
from scheduling.models import Appointment, AppointmentStatus, VisitCompletion
from scheduling.tests.test_booking import day_at

S = AppointmentStatus
SECRET = "Please use the lavender oil, my knee hurts"


# --------------------------------------------------------------------------- helpers


def api(client, method, url, body=None):
    kwargs = {"content_type": "application/json"}
    if body is not None:
        kwargs["data"] = json.dumps(body)
    headers = {}
    token = client.cookies.get("csrftoken")
    if token is not None:
        headers["HTTP_X_CSRFTOKEN"] = token.value
    return getattr(client, method)(url, **kwargs, **headers)


def csrf(client):
    client.get("/api/auth/csrf/")
    return client


def open_thread(customer_pair, stylist_pair) -> Thread:
    service.sync_threads(customer_pair[1])
    return Thread.objects.get(customer=customer_pair[1], stylist__user=stylist_pair[1])


def other_customer(make_user):
    from people.models import CustomerProfile

    user = make_user(role="customer", full_name="Meera Other")
    profile = CustomerProfile(user=user)
    profile.set_phone("9123456780")
    profile.save()
    client = Client()
    assert login(client, user).status_code == 200
    return csrf(client), user


@pytest.fixture
def paired(catalogue, customer, desk, asha):
    """A customer and a stylist with a paid, scheduled visit, and their thread."""
    booked(customer, desk, catalogue)
    csrf(customer[0])
    csrf(asha[0])
    return open_thread(customer, asha)


# --------------------------------------------------------------------------- when a thread opens


@pytest.mark.django_db
def test_no_thread_until_a_visit_is_scheduled(catalogue, customer, desk, asha):
    from scheduling.tests.test_booking import requested

    requested(customer[0], catalogue)  # only a request: unpaid, no stylist assigned
    for pair in (customer, asha):
        body = api(pair[0], "get", "/api/chat/threads/").json()
        assert body["results"] == []
    assert Thread.objects.count() == 0


@pytest.mark.django_db
def test_both_sides_get_a_person_card_after_the_visit_is_paid(paired, customer, asha):
    mine = api(customer[0], "get", "/api/chat/threads/").json()["results"]
    theirs = api(asha[0], "get", "/api/chat/threads/").json()["results"]
    assert [c["id"] for c in mine] == [c["id"] for c in theirs] == [str(paired.id)]
    assert mine[0]["other"]["name"] == "Asha"
    assert theirs[0]["other"]["name"] == "Priya"  # first name only
    assert mine[0]["open"] is True and mine[0]["unread"] == 0
    assert mine[0]["appointment"]["service_name"]
    assert_no_contact_details(theirs, customer)


@pytest.mark.django_db
def test_one_thread_per_pair_however_many_visits(catalogue, customer, desk, asha, paired):
    booked(customer, desk, catalogue, hour=14, days=4)
    service.sync_threads(customer[1])
    service.sync_threads(asha[1])
    assert Thread.objects.count() == 1


# --------------------------------------------------------------------------- who may chat


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_desk_and_admin_have_no_chat_access(role, logged_in, paired):
    client, _ = logged_in(role)
    csrf(client)
    url = f"/api/chat/threads/{paired.id}/"
    assert api(client, "get", "/api/chat/threads/").status_code == 403
    assert api(client, "get", url + "messages/").status_code == 403
    assert api(client, "post", url + "messages/", {"text": "hi"}).status_code == 403
    assert api(client, "post", url + "read/").status_code == 403


@pytest.mark.django_db
def test_guests_are_turned_away(client, paired):
    assert client.get("/api/chat/threads/").status_code in (401, 403)
    assert client.get(f"/api/chat/threads/{paired.id}/messages/").status_code in (401, 403)


@pytest.mark.django_db
def test_other_customers_and_stylists_get_a_404_for_a_thread_that_is_not_theirs(
    paired, make_user, ravi
):
    stranger = other_customer(make_user)
    csrf(ravi[0])
    for pair in (stranger, ravi):
        client = pair[0]
        url = f"/api/chat/threads/{paired.id}/"
        assert api(client, "get", url + "messages/").status_code == 404
        assert api(client, "post", url + "messages/", {"text": "hello"}).status_code == 404
        assert api(client, "post", url + "read/").status_code == 404
        assert api(client, "get", "/api/chat/threads/").json()["results"] == []
    assert Message.objects.count() == 0


@pytest.mark.django_db
def test_a_stylist_without_a_linked_profile_has_no_conversations(make_user, paired):
    user = make_user(role="stylist")
    client = Client()
    login(client, user)
    assert api(client, "get", "/api/chat/threads/").json()["results"] == []


# --------------------------------------------------------------------------- sending


@pytest.mark.django_db
def test_messages_flow_both_ways_with_unread_and_read_receipts(paired, customer, asha):
    url = f"/api/chat/threads/{paired.id}/"
    sent = api(customer[0], "post", url + "messages/", {"text": "Hello Asha"})
    assert sent.status_code == 201
    assert sent.json()["mine"] is True and sent.json()["status"] == "sent"

    card = api(asha[0], "get", "/api/chat/threads/").json()["results"][0]
    assert card["unread"] == 1 and card["last_message"]["preview"] == "Hello Asha"

    history = api(asha[0], "get", url + "messages/").json()
    assert [m["text"] for m in history["messages"]] == ["Hello Asha"]
    assert history["messages"][0]["mine"] is False
    # Fetching marks it delivered for the sender.
    mine = api(customer[0], "get", url + "messages/").json()["messages"][0]
    assert mine["status"] == "delivered"

    assert api(asha[0], "post", url + "read/").json() == {"read": 1}
    assert api(asha[0], "get", "/api/chat/threads/").json()["results"][0]["unread"] == 0
    assert api(customer[0], "get", url + "messages/").json()["messages"][0]["status"] == "read"


@pytest.mark.django_db
def test_messages_are_tagged_with_the_appointment(paired, customer):
    url = f"/api/chat/threads/{paired.id}/messages/"
    body = api(customer[0], "post", url, {"text": "Running late"}).json()
    assert body["service"] == "Haircut"
    assert Message.objects.get().appointment_id is not None


@pytest.mark.django_db
def test_text_limits_and_plain_text_only(paired, customer):
    url = f"/api/chat/threads/{paired.id}/messages/"
    client = customer[0]
    assert api(client, "post", url, {"text": "   "}).status_code == 400
    assert api(client, "post", url, {"text": ""}).status_code == 400
    too_long = api(client, "post", url, {"text": "x" * (service.MAX_LENGTH + 1)})
    assert too_long.status_code == 400 and too_long.json()["code"] == "too_long"
    assert api(client, "post", url, {"text": "x" * service.MAX_LENGTH}).status_code == 201
    markup = "<script>alert(1)</script> <b>bold</b>"
    body = api(client, "post", url, {"text": "a\x07b " + markup}).json()
    assert body["text"] == "ab " + markup  # stored as text, never interpreted; controls removed
    assert api(client, "post", url, {"text": "nul\x00"}).status_code == 400


@pytest.mark.django_db
def test_rate_limit(paired, customer):
    url = f"/api/chat/threads/{paired.id}/messages/"
    for _ in range(service.RATE_LIMIT):
        assert api(customer[0], "post", url, {"text": "hi"}).status_code == 201
    over = api(customer[0], "post", url, {"text": "hi"})
    assert over.status_code == 429 and over.json()["code"] == "rate_limited"
    cache.clear()
    assert api(customer[0], "post", url, {"text": "hi"}).status_code == 201


# --------------------------------------------------------------------------- encryption at rest


@pytest.mark.django_db
def test_message_text_is_encrypted_at_rest_with_a_per_thread_key(
    paired, customer, asha, catalogue, desk
):
    api(customer[0], "post", f"/api/chat/threads/{paired.id}/messages/", {"text": SECRET})
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("select body_enc from chat_message")
        (raw,) = cursor.fetchone()
    assert SECRET not in raw and "lavender" not in raw and raw.startswith("v1:")
    message = Message.objects.get()
    assert message.text == SECRET
    # The key is bound to the thread: the same ciphertext does not open under another thread id.
    booked(customer, desk, catalogue, hour=15, days=5, stylist="ravi")
    service.sync_threads(customer[1])
    other = Thread.objects.exclude(pk=paired.pk).get()
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_for_thread(str(other.id), message.body_enc)
    assert crypto.thread_key(str(paired.id)) != crypto.thread_key(str(other.id))
    # ...and it does not open as an ordinary field value either.
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(message.body_enc, "scheduling.appointment.notes")


@pytest.mark.django_db
def test_message_text_is_never_logged(paired, customer, caplog):
    caplog.set_level(logging.DEBUG)
    api(customer[0], "post", f"/api/chat/threads/{paired.id}/messages/", {"text": SECRET})
    assert "lavender" not in caplog.text


# --------------------------------------------------------------------------- closing


def finish_visit(appt_id, days_ago):
    """Mark the visit completed `days_ago` days back (with its completion record)."""
    appt = Appointment.objects.get(pk=appt_id)
    when = timezone.now() - timedelta(days=days_ago)
    Appointment.objects.filter(pk=appt_id).update(
        status=S.COMPLETED, start=when - timedelta(hours=1), end=when
    )
    VisitCompletion.objects.create(
        appointment=appt,
        done_lines=[],
        removed_lines=[],
        booked_price=appt.price_total,
        done_price=appt.price_total,
        completed_at=when,
    )


@pytest.mark.django_db
def test_a_thread_closes_read_only_seven_days_after_the_last_completed_visit(
    catalogue, customer, desk, asha
):
    appt_id = booked(customer, desk, catalogue)
    csrf(customer[0])
    thread = open_thread(customer, asha)
    url = f"/api/chat/threads/{thread.id}/messages/"
    assert api(customer[0], "post", url, {"text": "before"}).status_code == 201

    finish_visit(appt_id, days_ago=6)
    assert api(customer[0], "post", url, {"text": "still open"}).status_code == 201

    Appointment.objects.filter(pk=appt_id).update(end=timezone.now() - timedelta(days=8))
    VisitCompletion.objects.filter(appointment_id=appt_id)  # (records are immutable; see below)
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "update scheduling_visitcompletion set completed_at = %s where appointment_id = %s",
            [timezone.now() - timedelta(days=8), appt_id],
        )
    closed = api(customer[0], "post", url, {"text": "too late"})
    assert closed.status_code == 409 and closed.json()["code"] == "closed"
    assert api(asha[0], "post", url, {"text": "too late"}).status_code == 409
    history = api(customer[0], "get", url).json()
    assert history["open"] is False and len(history["messages"]) == 2  # history is kept
    card = api(customer[0], "get", "/api/chat/threads/").json()["results"][0]
    assert card["open"] is False

    # A new scheduled visit reopens the same thread.
    booked(customer, desk, catalogue, hour=16, days=6)
    assert api(customer[0], "post", url, {"text": "back again"}).status_code == 201
    assert Thread.objects.count() == 1


@pytest.mark.django_db
def test_a_cancelled_visit_does_not_open_a_thread(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    set_status(appt_id, S.CANCELLED)
    assert api(customer[0], "get", "/api/chat/threads/").json()["results"] == []


# --------------------------------------------------------------------------- policy


def test_websocket_routes_are_listed_in_the_policy():
    data = policy.load_policy()
    listed = {w["path"] for w in data["websocket"]}
    assert listed == {"/api/ws/chat/:id/"}
    assert len(websocket_urlpatterns) == len(listed)
    for entry in data["websocket"]:
        for role in policy.ROLES:
            allowed = role in ("customer", "stylist")
            assert policy.role_can(role, entry["connect"]) is allowed, role
            assert policy.role_can(role, entry["send"]) is allowed, role
    for action in ("chat.threads.list", "chat.messages.list", "chat.messages.send"):
        assert not policy.role_can("receptionist", action)
        assert not policy.role_can("admin", action)
        assert policy.role_can("customer", action) and policy.role_can("stylist", action)


# --------------------------------------------------------------------------- WebSocket


def run(coro):
    async def wrapper():
        from channels.db import database_sync_to_async
        from django.db import connections

        try:
            return await coro
        finally:  # the database threads must not keep sessions open into test-DB teardown
            await database_sync_to_async(connections.close_all)()

    return asyncio.run(wrapper())


def communicator(thread_id, pair=None, *, origin=b"http://localhost", cookie=None):
    headers = [(b"origin", origin), (b"host", b"localhost")]
    value = cookie
    if value is None and pair is not None:
        value = pair[0].cookies["salon_access"].value
    if value is not None:
        headers.append((b"cookie", f"salon_access={value}".encode()))
    return WebsocketCommunicator(application, f"/api/ws/chat/{thread_id}/", headers=headers)


async def recv_until(comm, kind, limit=8):
    for _ in range(limit):
        frame = await comm.receive_json_from(timeout=3)
        if frame["type"] == kind:
            return frame
    raise AssertionError(f"no {kind} frame")


@pytest.mark.django_db(transaction=True)
def test_live_messages_delivery_typing_and_read(paired, customer, asha):
    async def scenario():
        c = communicator(paired.id, customer)
        s = communicator(paired.id, asha)
        assert (await c.connect())[0] and (await s.connect())[0]
        assert (await c.receive_json_from())["type"] == "ready"
        assert (await s.receive_json_from())["type"] == "ready"

        await c.send_json_to({"type": "message", "text": "Hi Asha!", "client_id": "c1"})
        mine = await recv_until(c, "message")
        assert mine["message"]["mine"] is True and mine["message"]["client_id"] == "c1"
        theirs = await recv_until(s, "message")
        assert theirs["message"]["mine"] is False and theirs["message"]["text"] == "Hi Asha!"
        assert theirs["message"]["status"] == "delivered"
        delivered = await recv_until(c, "status")
        assert delivered["status"] == "delivered" and theirs["message"]["id"] in delivered["ids"]

        await s.send_json_to({"type": "typing", "on": True})
        assert (await recv_until(c, "typing"))["on"] is True

        await s.send_json_to({"type": "read"})
        read = await recv_until(c, "status")
        while read["status"] != "read":
            read = await recv_until(c, "status")
        assert theirs["message"]["id"] in read["ids"]

        await c.disconnect()
        await s.disconnect()

    run(scenario())
    assert Message.objects.get().status == "read"


@pytest.mark.django_db(transaction=True)
def test_connection_is_refused_for_everyone_who_is_not_a_member(paired, make_user, logged_in, ravi):
    outsiders = {}
    outsiders["customer"] = other_customer(make_user)
    outsiders["stylist"] = ravi
    outsiders["receptionist"] = logged_in("receptionist")
    outsiders["admin"] = logged_in("admin")

    async def scenario():
        for name, pair in outsiders.items():
            comm = communicator(paired.id, pair)
            connected, code = await comm.connect()
            assert connected is False, name
        anonymous = communicator(paired.id)
        assert (await anonymous.connect())[0] is False
        junk = communicator(paired.id, cookie="not-a-token")
        assert (await junk.connect())[0] is False

    run(scenario())
    assert Message.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_a_foreign_origin_is_refused(paired, customer):
    async def scenario():
        comm = communicator(paired.id, customer, origin=b"http://evil.example")
        assert (await comm.connect())[0] is False

    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_membership_is_checked_on_every_message(paired, customer, asha):
    async def scenario():
        c = communicator(paired.id, customer)
        assert (await c.connect())[0]
        await c.receive_json_from()
        await c.send_json_to({"type": "message", "text": "first"})
        await recv_until(c, "message")
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def deactivate():
            customer[1].is_active = False
            customer[1].save()

        await deactivate()
        await c.send_json_to({"type": "message", "text": "second"})
        output = await c.receive_output(timeout=3)
        assert output["type"] == "websocket.close" and output["code"] == 4403

    run(scenario())
    assert [m.text for m in Message.objects.all()] == ["first"]


@pytest.mark.django_db(transaction=True)
def test_live_errors_closed_thread_length_and_rate(paired, customer, asha):
    async def scenario():
        c = communicator(paired.id, customer)
        assert (await c.connect())[0]
        await c.receive_json_from()
        await c.send_json_to({"type": "message", "text": "y" * 2000, "client_id": "big"})
        err = await recv_until(c, "error")
        assert err["code"] == "too_long" and err["client_id"] == "big"
        await c.send_json_to({"type": "message", "text": ""})
        assert (await recv_until(c, "error"))["code"] == "invalid"
        await c.send_json_to({"type": "bogus"})
        await c.send_json_to("not an object")
        for _ in range(service.RATE_LIMIT + 1):
            await c.send_json_to({"type": "message", "text": "spam"})
        seen = set()
        while not await c.receive_nothing(timeout=0.5):
            frame = await c.receive_json_from()
            if frame["type"] == "error":
                seen.add(frame["code"])
        assert "rate_limited" in seen
        await c.disconnect()

    run(scenario())
    assert Message.objects.count() <= service.RATE_LIMIT


@pytest.mark.django_db(transaction=True)
def test_a_closed_thread_refuses_live_messages_but_still_opens(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    thread = open_thread(customer, asha)
    finish_visit(appt_id, days_ago=0)
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "update scheduling_visitcompletion set completed_at = %s",
            [timezone.now() - timedelta(days=9)],
        )
    Appointment.objects.filter(pk=appt_id).update(end=timezone.now() - timedelta(days=9))

    async def scenario():
        c = communicator(thread.id, customer)
        assert (await c.connect())[0]
        await c.receive_json_from()
        await c.send_json_to({"type": "message", "text": "hello?"})
        assert (await recv_until(c, "error"))["code"] == "closed"
        await c.disconnect()

    run(scenario())
    assert Message.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_live_text_is_not_logged(paired, customer, caplog):
    caplog.set_level(logging.DEBUG)

    async def scenario():
        c = communicator(paired.id, customer)
        assert (await c.connect())[0]
        await c.receive_json_from()
        await c.send_json_to({"type": "message", "text": SECRET})
        await recv_until(c, "message")
        await c.disconnect()

    run(scenario())
    assert "lavender" not in caplog.text


@pytest.mark.django_db
def test_my_appointments_carry_the_chat_thread_once_scheduled(catalogue, customer, desk, asha):
    from scheduling.tests.test_booking import requested

    requested(customer[0], catalogue, start=day_at(5, 10).isoformat())
    before = api(customer[0], "get", "/api/my/appointments/").json()
    rows = before["results"] if isinstance(before, dict) else before
    assert rows[0]["chat_thread_id"] is None
    booked(customer, desk, catalogue)
    rows = api(customer[0], "get", "/api/my/appointments/").json()
    rows = rows["results"] if isinstance(rows, dict) else rows
    ids = {r["chat_thread_id"] for r in rows if r["chat_thread_id"]}
    assert ids == {str(Thread.objects.get().id)}
