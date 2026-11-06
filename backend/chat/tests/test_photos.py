"""Zen Chat photos: who may send, fetch and delete, what is accepted, what is stored, limits,
deletion, the retention job and the live announcement. Allowed AND denied cases."""

import io
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.utils import timezone
from PIL import Image

from accounts.models import AuditLog
from chat import images, service
from chat.models import ChatImage, Message
from chat.tests.test_chat import (  # noqa: F401  (shared fixtures and helpers)
    communicator,
    csrf,
    finish_visit,
    open_thread,
    other_customer,
    paired,
    recv_until,
    run,
)
from core import crypto, jobs
from people.tests.test_stylist import (  # noqa: F401
    asha,
    booked,
    catalogue,
    customer,
    desk,
    ravi,
)
from scheduling.models import Appointment


# --------------------------------------------------------------------------- helpers
def make_image(fmt="JPEG", size=(120, 90), exif=False, color=(200, 80, 120)) -> bytes:
    img = Image.new("RGB", size, color)
    out = io.BytesIO()
    kwargs = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = "SecretCameraMaker"  # Make
        data[0x0110] = "SecretModel"
        gps = data.get_ifd(0x8825)  # GPS block
        gps[1] = "N"
        gps[2] = (17.0, 23.0, 30.0)
        gps[3] = "E"
        gps[4] = (78.0, 29.0, 15.0)
        kwargs["exif"] = data
    img.save(out, fmt, **kwargs)
    return out.getvalue()


def upload(client, thread, data, *, name="x.jpg", tag=None, caption=None, ctype="image/jpeg"):
    body = {"image": SimpleUploadedFile(name, data, content_type=ctype)}
    if tag is not None:
        body["tag"] = tag
    if caption is not None:
        body["caption"] = caption
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token else {}
    return client.post(f"/api/chat/threads/{thread.id}/images/", body, **headers)


def get(client, url):
    return client.get(url)


def delete(client, url):
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token else {}
    return client.delete(url, **headers)


def sent(client, thread, **kw):
    r = upload(client, thread, kw.pop("data", make_image()), **kw)
    assert r.status_code == 201, r.content
    return r.json()


def urls(thread, data):
    base = f"/api/chat/threads/{thread.id}/images/{data['image']['id']}/"
    return base, base + "thumbnail/"


# --------------------------------------------------------------------------- allowed
@pytest.mark.django_db
def test_customer_sends_a_style_reference_and_both_sides_can_fetch_it(paired, customer, asha):
    data = sent(customer[0], paired, tag="style_reference", caption="  Like this fade  ")
    assert data["kind"] == "image" and data["text"] == "Like this fade"
    assert data["image"]["tag"] == "style_reference" and data["image"]["alt"] == "Like this fade"
    assert "bytes" not in str(data) and "url" not in data["image"]
    full, thumb = urls(paired, data)
    for pair in (customer, asha):
        r = get(pair[0], full)
        assert r.status_code == 200 and r["Content-Type"] == "image/jpeg"
        assert r["Cache-Control"] == "private, no-store"
        assert r["X-Content-Type-Options"] == "nosniff"
        assert "filename" not in r["Content-Disposition"]
        t = get(pair[0], thumb)
        assert t.status_code == 200 and t["Content-Type"] == "image/webp"
        assert t["Cache-Control"] == "private, no-store"
    assert max(Image.open(io.BytesIO(get(customer[0], thumb).content)).size) <= 480


@pytest.mark.django_db
def test_stylist_can_send_a_photo_too_and_alt_text_falls_back_to_the_tag(paired, customer, asha):
    data = sent(asha[0], paired, tag="current_hair")
    assert data["image"]["alt"] == "Photo: Current hair"
    default = sent(asha[0], paired)
    assert default["image"]["tag"] == "other"
    assert get(customer[0], urls(paired, data)[0]).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fmt,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")]
)
def test_jpg_png_and_webp_are_accepted(paired, customer, fmt, mime):
    data = sent(customer[0], paired, data=make_image(fmt), ctype=mime)
    assert ChatImage.objects.get(pk=data["image"]["id"]).mime == mime


@pytest.mark.django_db
def test_messages_history_lists_photos_and_references(paired, customer, asha):
    sent(customer[0], paired, tag="style_reference")
    sent(customer[0], paired, tag="current_hair")
    history = customer[0].get(f"/api/chat/threads/{paired.id}/messages/").json()
    assert history["photo"]["max_bytes"] == 5 * 1024 * 1024
    assert [m["kind"] for m in history["messages"]] == ["image", "image"]
    assert len(history["references"]) == 1  # only the style reference
    assert history["references"][0]["image_id"] == history["messages"][0]["image"]["id"]
    card = asha[0].get("/api/chat/threads/").json()["results"][0]
    assert card["last_message"]["preview"] == "Photo"


@pytest.mark.django_db
def test_the_stylist_card_shows_the_reference_badge_only_for_style_references(
    paired, customer, asha
):
    mine = asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"][0]
    assert mine["reference_photo"] is False
    sent(customer[0], paired, tag="current_hair")
    mine = asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"][0]
    assert mine["reference_photo"] is False
    data = sent(customer[0], paired, tag="style_reference")
    mine = asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"][0]
    assert mine["reference_photo"] is True
    delete(customer[0], urls(paired, data)[0])  # a deleted reference no longer counts
    mine = asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"][0]
    assert mine["reference_photo"] is False


# --------------------------------------------------------------------------- denied
@pytest.mark.django_db
def test_other_customers_and_stylists_cannot_fetch_or_delete_a_photo(
    paired, customer, make_user, ravi
):
    data = sent(customer[0], paired, caption="private")
    full, thumb = urls(paired, data)
    stranger = other_customer(make_user)
    csrf(ravi[0])
    for pair in (stranger, ravi):
        for url in (full, thumb):
            assert get(pair[0], url).status_code == 404
        assert delete(pair[0], full).status_code == 404
        assert upload(pair[0], paired, make_image()).status_code == 404
    # a stranger's own thread id cannot be used to reach this photo either
    other_thread_url = f"/api/chat/threads/{paired.id}/images/{data['image']['id']}/"
    assert get(stranger[0], other_thread_url).status_code == 404
    assert ChatImage.objects.get(pk=data["image"]["id"]).is_deleted is False


@pytest.mark.django_db
def test_a_photo_id_from_another_thread_is_not_found_in_this_one(
    paired, customer, asha, catalogue, desk, make_user
):
    data = sent(customer[0], paired)
    from people.tests.test_stylist import booked as book

    # A second pair: the stranger customer books ravi-less thread via a fresh thread row.
    stranger = other_customer(make_user)
    from chat.models import Thread

    other = Thread.objects.create(customer=stranger[1], stylist=paired.stylist)
    assert (
        get(stranger[0], f"/api/chat/threads/{other.id}/images/{data['image']['id']}/").status_code
        == 404
    )
    del book


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_desk_and_admin_are_denied_on_every_photo_endpoint(role, logged_in, paired, customer):
    data = sent(customer[0], paired)
    full, thumb = urls(paired, data)
    client, _ = logged_in(role)
    csrf(client)
    assert get(client, full).status_code == 403
    assert get(client, thumb).status_code == 403
    assert delete(client, full).status_code == 403
    assert upload(client, paired, make_image()).status_code == 403
    assert Message.objects.filter(kind="image").count() == 1


@pytest.mark.django_db
def test_guests_are_turned_away(client, paired, customer):
    data = sent(customer[0], paired)
    full, thumb = urls(paired, data)
    for url in (full, thumb):
        assert client.get(url).status_code in (401, 403)
    assert upload(client, paired, make_image()).status_code in (401, 403)


@pytest.mark.django_db(transaction=True)
def test_websocket_refuses_desk_and_admin_and_announces_photos_by_id_only(
    paired, customer, asha, make_user
):
    from django.test import Client

    from conftest import login

    desk_user = make_user(role="receptionist")
    desk_client = Client()
    login(desk_client, desk_user)

    async def scenario():
        denied = communicator(paired.id, (desk_client, desk_user))
        assert (await denied.connect())[0] is False

        c = communicator(paired.id, asha)
        assert (await c.connect())[0]
        await c.receive_json_from()
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def send():
            return upload(customer[0], paired, make_image(), tag="style_reference").json()

        data = await send()
        frame = await recv_until(c, "message")
        assert frame["message"]["id"] == data["id"] and frame["message"]["kind"] == "image"
        image = frame["message"]["image"]
        assert set(image) >= {"id", "tag", "width", "height", "deleted", "alt"}
        assert "data" not in str(frame).lower() or "bytes" not in str(frame)
        assert not any(isinstance(v, (bytes, bytearray)) for v in image.values())

        @database_sync_to_async
        def remove():
            return delete(customer[0], urls(paired, data)[0]).status_code

        assert await remove() == 200
        gone = await recv_until(c, "photo_deleted")
        assert gone == {"type": "photo_deleted", "message": data["id"], "image": image["id"]}

    csrf(customer[0])
    run(scenario())


@pytest.mark.django_db(transaction=True)
def test_the_live_socket_cannot_carry_a_photo(paired, customer):
    async def scenario():
        c = communicator(paired.id, customer)
        assert (await c.connect())[0]
        await c.receive_json_from()
        await c.send_json_to({"type": "image", "data": "AAAA"})
        await c.send_json_to({"type": "message", "text": "still works"})
        await recv_until(c, "message")

    run(scenario())
    assert ChatImage.objects.count() == 0


# --------------------------------------------------------------------------- validation
@pytest.mark.django_db
def test_wrong_file_types_are_rejected_even_with_a_picture_extension(paired, customer):
    cases = {
        "text": b"hello, I am not a picture",
        "html": b"<html><script>alert(1)</script></html>",
        "svg": b'<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
        "pdf": b"%PDF-1.4 fake",
        "empty-ish": b"\x00" * 20,
    }
    for _name, blob in cases.items():
        cache.clear()  # (refused tries count towards the per-minute limit too)
        r = upload(customer[0], paired, blob, name="holiday.jpg", ctype="image/jpeg")
        assert r.status_code == 400 and r.json()["code"] == "bad_type"
    cache.clear()
    gif = make_image("GIF")
    r = upload(customer[0], paired, gif, name="a.png", ctype="image/png")
    assert r.status_code == 400 and r.json()["code"] == "bad_type"
    cache.clear()
    bmp = make_image("BMP")
    assert upload(customer[0], paired, bmp, name="a.jpg").status_code == 400
    assert Message.objects.count() == 0


@pytest.mark.django_db
def test_a_real_jpeg_named_with_a_wrong_extension_is_accepted_by_its_real_type(paired, customer):
    r = upload(customer[0], paired, make_image(), name="photo.txt", ctype="text/plain")
    assert r.status_code == 201
    assert ChatImage.objects.get().mime == "image/jpeg"


@pytest.mark.django_db
def test_truncated_picture_is_rejected(paired, customer):
    r = upload(customer[0], paired, make_image(size=(800, 800))[:300])
    assert r.status_code == 400


@pytest.mark.django_db
def test_oversized_file_is_rejected(paired, customer):
    big = make_image() + b"\x00" * (images.MAX_BYTES + 10)
    r = upload(customer[0], paired, big)
    assert r.status_code == 413 and r.json()["code"] == "too_large"
    assert ChatImage.objects.count() == 0


@pytest.mark.django_db
def test_five_megabytes_exactly_is_the_limit(paired, customer):
    with pytest.raises(service.ChatError) as e:
        images.process(b"\xff" * (images.MAX_BYTES + 1))
    assert e.value.code == "too_large"


@pytest.mark.django_db
def test_over_dimension_pictures_are_rejected(paired, customer):
    wide = make_image("PNG", size=(images.MAX_SIDE + 1, 8))
    r = upload(customer[0], paired, wide, name="w.png", ctype="image/png")
    assert r.status_code == 400 and r.json()["code"] == "too_big_dimensions"
    tall = make_image("PNG", size=(8, images.MAX_SIDE + 1))
    assert upload(customer[0], paired, tall, name="t.png").json()["code"] == "too_big_dimensions"
    exact = make_image("PNG", size=(images.MAX_SIDE, 8))
    assert upload(customer[0], paired, exact, name="e.png").status_code == 201


@pytest.mark.django_db
def test_caption_and_tag_validation(paired, customer):
    assert upload(customer[0], paired, make_image(), caption="x" * 301).status_code == 400
    assert upload(customer[0], paired, make_image(), caption="x" * 300).status_code == 201
    r = upload(customer[0], paired, make_image(), tag="selfie")
    assert r.status_code == 400 and r.json()["code"] == "invalid"
    r = upload(customer[0], paired, make_image(), caption="<b>hi</b>\x00")
    assert r.status_code == 201 and r.json()["text"] == "<b>hi</b>"  # plain text, never rendered
    token = customer[0].cookies["csrftoken"].value
    missing = customer[0].post(
        f"/api/chat/threads/{paired.id}/images/", {"tag": "other"}, HTTP_X_CSRFTOKEN=token
    )
    assert missing.status_code == 400


# --------------------------------------------------------------------------- stored data
@pytest.mark.django_db
def test_exif_and_gps_are_stripped_and_the_picture_is_reencoded(paired, customer):
    raw = make_image("JPEG", exif=True)
    assert b"SecretCameraMaker" in raw and Image.open(io.BytesIO(raw)).getexif()
    data = sent(customer[0], paired, data=raw)
    full, thumb = urls(paired, data)
    for url in (full, thumb):
        body = customer[0].get(url).content
        assert b"SecretCameraMaker" not in body and b"Exif" not in body
        img = Image.open(io.BytesIO(body))
        assert len(img.getexif()) == 0
        assert not img.getexif().get_ifd(0x8825)
        assert "exif" not in img.info and "icc_profile" not in img.info


@pytest.mark.django_db
def test_camera_rotation_is_applied_before_the_metadata_is_dropped(paired, customer):
    img = Image.new("RGB", (200, 100), (10, 200, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif)
    data = sent(customer[0], paired, data=out.getvalue())
    stored = ChatImage.objects.get(pk=data["image"]["id"])
    assert (stored.width, stored.height) == (100, 200)


@pytest.mark.django_db
def test_the_database_row_holds_no_readable_image_bytes(paired, customer):
    raw = make_image("PNG", exif=False)
    data = sent(customer[0], paired, data=raw, name="a.png", ctype="image/png", caption="Zebra99")
    iid = data["image"]["id"]
    with connection.cursor() as cursor:
        cursor.execute(
            "select original_enc, thumb_enc from chat_chatimage where id = %s",
            [iid.replace("-", "")] if connection.vendor == "sqlite" else [iid],
        )
        original, thumb = (bytes(x) for x in cursor.fetchone())
        cursor.execute(
            "select body_enc from chat_message where id = %s",
            [data["id"]] if connection.vendor != "sqlite" else [data["id"].replace("-", "")],
        )
        body = cursor.fetchone()[0]
    for blob in (original, thumb):
        assert blob.startswith(b"i1")
        assert b"\x89PNG" not in blob and b"\xff\xd8\xff" not in blob and b"RIFF" not in blob
        assert b"IHDR" not in blob and b"WEBP" not in blob
    assert "Zebra99" not in body
    # and it really is the per-thread AES-GCM blob: it decrypts back to a PNG
    plain = crypto.decrypt_image_for_thread(str(paired.id), iid, "original", original)
    assert plain.startswith(b"\x89PNG")


@pytest.mark.django_db
def test_ciphertext_cannot_be_moved_to_another_photo_or_part(paired, customer):
    a = sent(customer[0], paired)["image"]["id"]
    b = sent(customer[0], paired)["image"]["id"]
    blob = bytes(ChatImage.objects.get(pk=a).original_enc)
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_image_for_thread(str(paired.id), b, "original", blob)
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_image_for_thread(str(paired.id), a, "thumb", blob)


@pytest.mark.django_db
def test_nothing_about_the_picture_is_logged(paired, customer, caplog):
    caplog.set_level("DEBUG")
    sent(customer[0], paired, caption="SecretCaption77", data=make_image(exif=True))
    text = caplog.text
    assert "SecretCaption77" not in text and "SecretCameraMaker" not in text


@pytest.mark.django_db
def test_sending_is_audited_without_contents(paired, customer):
    sent(customer[0], paired, caption="SecretCaption77", tag="style_reference")
    row = AuditLog.objects.get(action=AuditLog.Action.CHAT_PHOTO_SENT)
    assert "SecretCaption77" not in str(row.metadata) and row.metadata["tag"] == "style_reference"


# --------------------------------------------------------------------------- limits
@pytest.mark.django_db
def test_six_photos_a_minute(paired, customer):
    for _ in range(images.PER_MINUTE):
        assert upload(customer[0], paired, make_image()).status_code == 201
    r = upload(customer[0], paired, make_image())
    assert r.status_code == 429 and r.json()["code"] == "rate_limited"
    assert ChatImage.objects.count() == images.PER_MINUTE


@pytest.mark.django_db
def test_thirty_photos_a_day_per_thread_and_deleting_gives_no_room_back(paired, customer, asha):
    first = None
    for i in range(images.PER_DAY):
        cache.clear()
        r = upload(customer[0], paired, make_image(size=(8, 8)))
        assert r.status_code == 201, i
        first = first or r.json()
    cache.clear()
    r = upload(asha[0], paired, make_image(size=(8, 8)))  # the limit is per thread, both sides
    assert r.status_code == 429 and r.json()["code"] == "daily_limit"
    delete(customer[0], urls(paired, first)[0])
    cache.clear()
    assert upload(customer[0], paired, make_image(size=(8, 8))).status_code == 429
    # yesterday's photos no longer count
    ChatImage.objects.update(created_at=timezone.now() - timedelta(days=2))
    cache.clear()
    assert upload(customer[0], paired, make_image(size=(8, 8))).status_code == 201


# --------------------------------------------------------------------------- deletion
@pytest.mark.django_db
def test_sender_deletes_and_the_bytes_are_wiped(paired, customer, asha):
    data = sent(customer[0], paired, caption="remove me", tag="style_reference")
    full, thumb = urls(paired, data)
    r = delete(customer[0], full)
    assert r.status_code == 200
    row = ChatImage.objects.get(pk=data["image"]["id"])
    assert row.original_enc is None and row.thumb_enc is None
    assert row.is_deleted and row.deleted_by == "sender"
    for pair in (customer, asha):
        assert get(pair[0], full).status_code == 410
        assert get(pair[0], thumb).status_code == 410
    shown = asha[0].get(f"/api/chat/threads/{paired.id}/messages/").json()
    msg = shown["messages"][0]
    assert msg["image"]["deleted"] is True and msg["image"]["alt"] == "Photo deleted"
    assert msg["text"] == ""  # the caption goes too
    assert shown["references"] == []
    assert AuditLog.objects.filter(action=AuditLog.Action.CHAT_PHOTO_DELETED).count() == 1
    assert delete(customer[0], full).status_code == 200  # twice is harmless
    assert AuditLog.objects.filter(action=AuditLog.Action.CHAT_PHOTO_DELETED).count() == 1


@pytest.mark.django_db
def test_only_the_sender_may_delete(paired, customer, asha):
    data = sent(customer[0], paired)
    r = delete(asha[0], urls(paired, data)[0])
    assert r.status_code == 403
    assert ChatImage.objects.get().is_deleted is False
    assert get(asha[0], urls(paired, data)[0]).status_code == 200


# --------------------------------------------------------------------------- closed thread
def close_thread(appt_id):
    finish_visit(appt_id, days_ago=8)
    with connection.cursor() as cursor:
        cursor.execute(
            "update scheduling_visitcompletion set completed_at = %s where appointment_id = %s",
            [timezone.now() - timedelta(days=8), appt_id],
        )


@pytest.mark.django_db
def test_a_closed_thread_blocks_new_photos_but_keeps_viewing_and_deleting(
    catalogue, customer, desk, asha
):
    appt_id = booked(customer, desk, catalogue)
    csrf(customer[0])
    thread = open_thread(customer, asha)
    data = sent(customer[0], thread, tag="style_reference")
    close_thread(appt_id)
    r = upload(customer[0], thread, make_image())
    assert r.status_code == 409 and r.json()["code"] == "closed"
    assert upload(asha[0], thread, make_image()).status_code == 409
    assert get(customer[0], urls(thread, data)[0]).status_code == 200  # read-only, still viewable
    assert ChatImage.objects.count() == 1


# --------------------------------------------------------------------------- retention
@pytest.mark.django_db
def test_retention_wipes_photos_thirty_days_after_the_thread_closes_and_is_idempotent(
    catalogue, customer, desk, asha
):
    appt_id = booked(customer, desk, catalogue)
    csrf(customer[0])
    thread = open_thread(customer, asha)
    sent(customer[0], thread, tag="style_reference", caption="hold on")
    sent(asha[0], thread)
    now = timezone.now()
    assert images.purge_expired(now) == 0  # thread is open

    close_thread(appt_id)  # closed ~1 day ago (8 days after the visit, 7-day window)
    assert images.purge_expired(now) == 0  # closed, but inside the 30-day keep period
    closes = service.state(thread)["closes_at"]
    assert images.purge_expired(closes + timedelta(days=29)) == 0
    assert images.purge_expired(closes + timedelta(days=31)) == 2
    assert images.purge_expired(closes + timedelta(days=31)) == 0  # second run: nothing to do
    rows = list(ChatImage.objects.all())
    assert all(r.original_enc is None and r.thumb_enc is None for r in rows)
    assert {r.deleted_by for r in rows} == {"retention"}
    assert AuditLog.objects.filter(action=AuditLog.Action.CHAT_PHOTOS_PURGED).count() == 1
    assert Message.objects.filter(thread=thread, kind="image").count() == 2  # rows stay
    assert get(customer[0], urls(thread, {"image": {"id": str(rows[0].id)}})[0]).status_code == 410


@pytest.mark.django_db
def test_retention_days_are_an_admin_setting(catalogue, customer, desk, asha, logged_in):
    appt_id = booked(customer, desk, catalogue)
    csrf(customer[0])
    thread = open_thread(customer, asha)
    sent(customer[0], thread)
    close_thread(appt_id)
    closes = service.state(thread)["closes_at"]

    admin, _ = logged_in("admin")
    csrf(admin)
    r = admin.patch(
        "/api/admin/settings/",
        data='{"chat": {"photo_retention_days": 10}}',
        content_type="application/json",
        HTTP_X_CSRFTOKEN=admin.cookies["csrftoken"].value,
    )
    assert r.status_code == 200, r.content
    assert images.retention_days() == 10
    assert images.purge_expired(closes + timedelta(days=9)) == 0
    assert images.purge_expired(closes + timedelta(days=11)) == 1

    bad = admin.patch(
        "/api/admin/settings/",
        data='{"chat": {"photo_retention_days": 0}}',
        content_type="application/json",
        HTTP_X_CSRFTOKEN=admin.cookies["csrftoken"].value,
    )
    assert bad.status_code == 400


@pytest.mark.django_db
def test_run_jobs_includes_the_retention_job_and_is_safe_twice(catalogue, customer, desk, asha):
    assert "chat_photo_retention" in [name for name, _ in jobs.JOBS]
    appt_id = booked(customer, desk, catalogue)
    csrf(customer[0])
    thread = open_thread(customer, asha)
    sent(customer[0], thread)
    close_thread(appt_id)
    Appointment.objects.filter(pk=appt_id).update(updated_at=timezone.now()) if hasattr(
        Appointment, "updated_at"
    ) else None
    closes = service.state(thread)["closes_at"]
    assert jobs.chat_photo_retention(closes + timedelta(days=40)) == 1
    assert jobs.chat_photo_retention(closes + timedelta(days=40)) == 0
