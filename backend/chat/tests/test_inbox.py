"""Zen Chat notifications (chat/inbox.py): the receiver's pop-up over /api/ws/inbox/ and the email
for messages left unread."""

from datetime import timedelta

import pytest
from channels.testing import WebsocketCommunicator
from django.utils import timezone

from chat import inbox
from chat.models import Message
from chat.tests.test_chat import (  # noqa: F401  (shared fixtures and helpers)
    SECRET,
    api,
    asha,
    catalogue,
    customer,
    desk,
    other_customer,
    paired,
    ravi,
    run,
)
from chat.tests.test_photos import make_image, upload
from config.asgi import application
from core.models import MailOutbox


def inbox_socket(pair=None, *, cookie=None):
    headers = [(b"origin", b"http://localhost"), (b"host", b"localhost")]
    value = (
        cookie if cookie is not None else (pair[0].cookies["salon_access"].value if pair else None)
    )
    if value is not None:
        headers.append((b"cookie", f"salon_access={value}".encode()))
    return WebsocketCommunicator(application, "/api/ws/inbox/", headers=headers)


def send_text(pair, thread, text):
    url = f"/api/chat/threads/{thread.id}/messages/"
    response = api(pair[0], "post", url, {"text": text})
    assert response.status_code == 201, response.content
    return response.json()


# --------------------------------------------------------------------------- pop-up


@pytest.mark.django_db(transaction=True)
def test_the_receiver_gets_a_pop_up_note_and_the_sender_does_not(paired, customer, asha):
    async def scenario():
        mine = inbox_socket(customer)
        theirs = inbox_socket(asha)
        assert (await mine.connect())[0] and (await theirs.connect())[0]
        assert (await mine.receive_json_from())["type"] == "ready"
        assert (await theirs.receive_json_from())["type"] == "ready"
        from channels.db import database_sync_to_async

        await database_sync_to_async(send_text)(customer, paired, "Hello Asha, see you at 4")
        note = await theirs.receive_json_from(timeout=3)
        assert note["type"] == "chat"
        assert note["thread"] == str(paired.id)
        assert note["preview"] == "Hello Asha, see you at 4"
        # The stylist sees the customer's first name only, as in Zen Chat.
        assert note["sender"] == customer[1].full_name.split()[0]
        assert await mine.receive_nothing(timeout=0.5)  # never to the sender
        await mine.disconnect()
        await theirs.disconnect()

    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_the_customer_sees_the_stylist_name_and_photos_say_photo(paired, customer, asha):
    stylist_name = paired.stylist.display_name

    async def scenario():
        sock = inbox_socket(customer)
        assert (await sock.connect())[0]
        await sock.receive_json_from()
        from channels.db import database_sync_to_async

        def send_photo():
            r = upload(asha[0], paired, make_image())
            assert r.status_code == 201, r.content

        await database_sync_to_async(send_photo)()
        note = await sock.receive_json_from(timeout=3)
        assert note["sender"] == stylist_name
        assert note["kind"] == "image" and note["preview"].startswith("Photo")
        await sock.disconnect()

    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_other_people_never_get_the_note(paired, customer, asha, make_user, ravi):
    outsider = other_customer(make_user)

    async def scenario():
        socks = [inbox_socket(outsider), inbox_socket(ravi)]
        for sock in socks:
            assert (await sock.connect())[0]
            await sock.receive_json_from()
        from channels.db import database_sync_to_async

        await database_sync_to_async(send_text)(customer, paired, SECRET)
        for sock in socks:
            assert await sock.receive_nothing(timeout=0.5)
            await sock.disconnect()

    run(scenario())


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_staff_without_chat_and_guests_cannot_open_the_inbox(role, logged_in):
    staff = logged_in(role)

    async def scenario():
        assert (await inbox_socket(staff).connect())[0] is False
        assert (await inbox_socket().connect())[0] is False
        assert (await inbox_socket(cookie="not-a-token").connect())[0] is False

    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_a_deactivated_account_stops_getting_notes(paired, customer, asha):
    from accounts.models import User

    async def scenario():
        sock = inbox_socket(asha)
        assert (await sock.connect())[0]
        await sock.receive_json_from()
        from channels.db import database_sync_to_async

        await database_sync_to_async(
            lambda: User.objects.filter(pk=asha[1].pk).update(is_active=False)
        )()
        await database_sync_to_async(send_text)(customer, paired, "Are you there?")
        output = await sock.receive_output(timeout=3)
        assert output["type"] == "websocket.close"

    run(scenario())


# --------------------------------------------------------------------------- email


@pytest.fixture
def real_addresses(customer, asha):
    """Test accounts use example.com, which is never emailed; give these two normal addresses
    (nothing is really sent in tests: no SMTP is configured)."""
    from accounts.models import User

    for pair, email in ((customer, "meera.customer@mailbox.in"), (asha, "asha.stylist@mailbox.in")):
        User.objects.filter(pk=pair[1].pk).update(email=email)
        pair[1].email = email


def age(minutes):
    Message.objects.update(created_at=timezone.now() - timedelta(minutes=minutes))


@pytest.mark.django_db
def test_an_unread_message_is_emailed_once_without_its_text(paired, customer, asha, real_addresses):
    send_text(customer, paired, SECRET)
    send_text(customer, paired, "And one more thing")
    assert inbox.email_unread(timezone.now()) == 0  # not yet: they may still read it
    age(11)
    assert inbox.email_unread(timezone.now()) == 1
    mail = MailOutbox.objects.get(to_email=asha[1].email)
    assert "2 new messages from" in mail.subject and "Zen Chat" in mail.subject
    assert SECRET not in mail.body and "one more thing" not in mail.body
    assert mail.link.endswith(f"/chat/{paired.id}")
    assert not MailOutbox.objects.filter(to_email=customer[1].email).exists()
    assert inbox.email_unread(timezone.now()) == 0  # never twice
    assert MailOutbox.objects.filter(to_email=asha[1].email).count() == 1


@pytest.mark.django_db
def test_read_messages_and_old_messages_are_not_emailed(paired, customer, asha, real_addresses):
    send_text(customer, paired, "Read quickly")
    api(asha[0], "post", f"/api/chat/threads/{paired.id}/read/")
    age(11)
    assert inbox.email_unread(timezone.now()) == 0
    send_text(asha, paired, "From long ago")
    Message.objects.filter(read_at__isnull=True).update(
        created_at=timezone.now() - timedelta(days=3)
    )
    assert inbox.email_unread(timezone.now()) == 0
    assert not MailOutbox.objects.filter(subject__contains="Zen Chat").exists()


@pytest.mark.django_db
def test_the_customer_gets_a_link_to_the_customer_chat_page(paired, customer, asha, real_addresses):
    send_text(asha, paired, "Your colour is ready to book")
    age(11)
    assert inbox.email_unread(timezone.now()) == 1
    mail = MailOutbox.objects.get(subject__contains="Zen Chat")
    assert mail.to_email == customer[1].email
    assert mail.link.endswith(f"/customer/chat/{paired.id}")
    assert paired.stylist.display_name in mail.subject


@pytest.mark.django_db
def test_test_addresses_are_never_emailed(paired, customer, asha, real_addresses):
    from accounts.models import User

    User.objects.filter(pk=asha[1].pk).update(email="asha@demo.example.com")
    send_text(customer, paired, "Hi")
    age(11)
    assert inbox.email_unread(timezone.now()) == 0
    assert not MailOutbox.objects.filter(subject__contains="Zen Chat").exists()
    assert Message.objects.get().emailed_at is not None  # not looked at again


@pytest.mark.parametrize(
    "email, ok",
    [
        ("akhil@gmail.com", True),
        ("meera@demo.example.com", False),
        ("x@example.org", False),
        ("x@shop.test", False),
        ("x@notexample.com", True),
        ("broken", False),
    ],
)
def test_deliverable(email, ok):
    assert inbox.deliverable(email) is ok


def test_the_job_runs_on_every_schedule():
    from core import internal, jobs, scheduler

    assert "chat_unread_emails" in dict(jobs.JOBS)
    assert "chat_unread_emails" in scheduler.OTHER_JOBS
    assert "chat_unread_emails" in internal.TICK_JOBS
