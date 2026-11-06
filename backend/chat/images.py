"""Zen Chat photos: validation, re-encoding, storage rules, limits and retention.

What happens to an upload, in order:
1. The file name and the browser's content type are IGNORED. The real type is read from the bytes
   (Pillow) and must be JPEG, PNG or WebP. Over 5 MB or over 4096 px on a side is refused before
   the picture is decoded.
2. The picture is decoded and written out again from the pixels only, so EXIF, GPS, ICC and every
   other piece of metadata is gone. A 480 px thumbnail is made the same way.
3. Both are encrypted (AES-256-GCM, the per-thread key) and stored in the database row.
Nothing about the picture's contents is ever logged.
"""

from __future__ import annotations

import io
import logging
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError

from accounts.audit import audit
from accounts.models import AuditLog, User
from chat import service
from chat.models import ChatImage, Message, Thread
from core import crypto

MAX_BYTES = 5 * 1024 * 1024
MAX_SIDE = 4096
THUMB_SIDE = 480
MAX_CAPTION = 300
PER_MINUTE = 6
PER_DAY = 30
ALLOWED = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
TAGS = {t.value for t in ChatImage.Tag}
TAG_LABELS = dict(ChatImage.Tag.choices)

# Pillow writes tag values (camera, GPS) to its own logger at DEBUG level; keep that off so
# nothing about a picture can reach a log file, whatever the log level is.
logging.getLogger("PIL").setLevel(logging.WARNING)

# Pillow's own decompression-bomb guard, set well above our 4096 x 4096 limit so that our clear
# message is the one people see.
Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE * 2


def retention_days() -> int:
    from website.content import chat_photo_retention_days

    return chat_photo_retention_days()


def clean_caption(raw: object) -> str:
    if raw is None:
        return ""
    if not isinstance(raw, str):
        raise service.ChatError("invalid", "The caption must be text.")
    text = service._CONTROL.sub("", raw.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if len(text) > MAX_CAPTION:
        raise service.ChatError("too_long", f"A caption can have at most {MAX_CAPTION} characters.")
    return text


def clean_tag(raw: object) -> str:
    tag = raw or ChatImage.Tag.OTHER
    if tag not in TAGS:
        raise service.ChatError("invalid", "Choose Style reference, Current hair or Other.")
    return str(tag)


def _encode(img: Image.Image, fmt: str) -> bytes:
    out = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
    elif fmt == "PNG":
        keep = img if img.mode in ("RGB", "RGBA", "L", "LA") else img.convert("RGBA")
        keep.save(out, "PNG", optimize=True)
    else:
        img.convert("RGBA" if "A" in img.getbands() else "RGB").save(
            out, "WEBP", quality=88, method=4
        )
    return out.getvalue()


def process(raw: bytes) -> dict:
    """Checks the bytes and returns clean original + thumbnail. Raises ChatError."""
    if not raw:
        raise service.ChatError("invalid", "Choose a photo to send.")
    if len(raw) > MAX_BYTES:
        raise service.ChatError("too_large", "That photo is bigger than 5 MB. Pick a smaller one.")
    try:
        probe = Image.open(io.BytesIO(raw))
        fmt = probe.format
        width, height = probe.size  # read from the header: nothing is decoded yet
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise service.ChatError(
            "bad_type", "That file is not a photo. Send a JPG, PNG or WebP picture."
        ) from None
    if fmt not in ALLOWED:
        raise service.ChatError("bad_type", "Only JPG, PNG and WebP photos can be sent.")
    if width > MAX_SIDE or height > MAX_SIDE:
        raise service.ChatError(
            "too_big_dimensions", f"That photo is larger than {MAX_SIDE} pixels on a side."
        )
    try:
        img = Image.open(io.BytesIO(raw))
        img.seek(0)  # animated PNG/WebP: first frame only
        img.load()
        img = ImageOps.exif_transpose(img)  # apply the camera rotation, then drop the metadata
        if img.width > MAX_SIDE or img.height > MAX_SIDE:
            raise service.ChatError(
                "too_big_dimensions", f"That photo is larger than {MAX_SIDE} pixels on a side."
            )
        pixels = img.copy()  # a fresh image object carries no EXIF, GPS or profile
        pixels.info.clear()
        original = _encode(pixels, fmt)
        thumb_img = pixels.copy()
        thumb_img.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
        thumb = _encode(thumb_img, "WEBP")
    except service.ChatError:
        raise
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise service.ChatError(
            "bad_type", "That photo could not be read. Try another picture."
        ) from None
    return {
        "mime": ALLOWED[fmt],
        "width": pixels.width,
        "height": pixels.height,
        "original": original,
        "thumb": thumb,
    }


# ----------------------------------------------------------------------------- rate limits
def _minute_key(user_id, thread_id) -> str:
    return f"chat:photo-rate:{thread_id}:{user_id}"


def hit_minute_limit(user_id, thread_id) -> bool:
    key = _minute_key(user_id, thread_id)
    cache.add(key, 0, 60)
    try:
        return cache.incr(key) > PER_MINUTE
    except ValueError:
        cache.set(key, 1, 60)
        return False


def day_count(thread: Thread, now=None) -> int:
    since = (now or timezone.now()) - timedelta(days=1)
    # Deleted photos still count: deleting does not give the sender more room.
    return ChatImage.objects.filter(thread=thread, created_at__gte=since).count()


# ----------------------------------------------------------------------------- sending
def send_image(thread: Thread, user: User, upload, tag: object, caption: object, request=None):
    """Validates and stores one photo message. Raises ChatError. Never logs the contents."""
    if thread.customer_id != user.id and thread.stylist.user_id != user.id:
        raise service.ChatError("forbidden", "You are not part of this conversation.")
    tag = clean_tag(tag)
    caption = clean_caption(caption)
    if upload is None:
        raise service.ChatError("invalid", "Choose a photo to send.")
    if getattr(upload, "size", 0) > MAX_BYTES:
        raise service.ChatError("too_large", "That photo is bigger than 5 MB. Pick a smaller one.")
    if not service.state(thread)["open"]:
        raise service.ChatError("closed", "This conversation is read-only now.")
    if hit_minute_limit(user.id, thread.id):
        raise service.ChatError(
            "rate_limited", f"You can send {PER_MINUTE} photos a minute. Wait a moment."
        )
    processed = process(upload.read(MAX_BYTES + 1))
    with transaction.atomic():
        Thread.objects.select_for_update().get(pk=thread.pk)  # serialises the daily count
        if day_count(thread) >= PER_DAY:
            raise service.ChatError(
                "daily_limit", f"This conversation has reached {PER_DAY} photos for today."
            )
        message = Message(
            thread=thread,
            sender=user,
            kind="image",
            appointment=service.current_appointment(thread),
        )
        message.set_text(caption)
        message.save()
        image = ChatImage(
            message=message,
            thread=thread,
            tag=tag,
            mime=processed["mime"],
            width=processed["width"],
            height=processed["height"],
            size=len(processed["original"]),
        )
        tid, iid = str(thread.id), str(image.id)
        image.original_enc = crypto.encrypt_image_for_thread(
            tid, iid, "original", processed["original"]
        )
        image.thumb_enc = crypto.encrypt_image_for_thread(tid, iid, "thumb", processed["thumb"])
        image.save()
        Thread.objects.filter(pk=thread.pk).update(last_message_at=message.created_at)
        audit(
            AuditLog.Action.CHAT_PHOTO_SENT,
            request=request,
            actor=user,
            thread=tid,
            message=str(message.id),
            image=iid,
            tag=tag,
            bytes=image.size,
        )
    return message


# ----------------------------------------------------------------------------- reading
def get_image(thread: Thread, image_id) -> ChatImage | None:
    try:
        return ChatImage.objects.get(pk=image_id, thread=thread)
    except (ChatImage.DoesNotExist, ValueError, TypeError):
        return None


def image_bytes(image: ChatImage, part: str) -> bytes | None:
    """The decrypted bytes, or None once the photo has been deleted or wiped."""
    blob = image.thumb_enc if part == "thumb" else image.original_enc
    if image.is_deleted or blob is None:
        return None
    return crypto.decrypt_image_for_thread(str(image.thread_id), str(image.id), part, blob)


def alt_text(image: ChatImage, caption: str) -> str:
    return caption or f"Photo: {TAG_LABELS.get(image.tag, 'Other')}"


def image_data(message: Message) -> dict | None:
    """What the screen needs to draw a photo message: ids and sizes only, never bytes or a URL."""
    image = getattr(message, "image", None) if message.kind == "image" else None
    if image is None:
        return None
    deleted = image.is_deleted
    return {
        "id": str(image.id),
        "tag": image.tag,
        "tag_label": TAG_LABELS.get(image.tag, "Other"),
        "width": image.width,
        "height": image.height,
        "deleted": deleted,
        "alt": "Photo deleted" if deleted else alt_text(image, message.text),
    }


def references_for(thread: Thread, limit: int = 6) -> list[dict]:
    """The latest style-reference photos for the visit this conversation is about."""
    qs = ChatImage.objects.filter(
        thread=thread, tag=ChatImage.Tag.STYLE_REFERENCE, deleted_at__isnull=True
    ).select_related("message")
    appt = service.current_appointment(thread)
    if appt is not None:
        qs = qs.filter(message__appointment=appt)
    rows = list(qs.order_by("-created_at")[:limit])
    return [
        {
            "image_id": str(r.id),
            "message_id": str(r.message_id),
            "created_at": r.created_at,
            "alt": alt_text(r, r.message.text),
            "width": r.width,
            "height": r.height,
        }
        for r in rows
    ]


def reference_appointment_ids(appointment_ids) -> set[str]:
    """Which of these visits have at least one live style-reference photo (for the stylist card)."""
    found = (
        ChatImage.objects.filter(
            tag=ChatImage.Tag.STYLE_REFERENCE,
            deleted_at__isnull=True,
            message__appointment_id__in=list(appointment_ids),
        )
        .values_list("message__appointment_id", flat=True)
        .distinct()
    )
    return {str(a) for a in found}


# ----------------------------------------------------------------------------- deleting
def wipe(image: ChatImage, by: str, now=None) -> None:
    """Removes the bytes for good. The row stays so the thread shows "Photo deleted"."""
    image.original_enc = None
    image.thumb_enc = None
    image.deleted_at = now or timezone.now()
    image.deleted_by = by
    image.save(update_fields=["original_enc", "thumb_enc", "deleted_at", "deleted_by"])
    # The caption goes with the photo.
    message = image.message
    message.set_text("")
    message.save(update_fields=["body_enc"])


def delete_image(thread: Thread, user: User, image: ChatImage, request=None) -> bool:
    """Only the sender may delete. Returns False if it was already deleted."""
    if image.message.sender_id != user.id:
        raise service.ChatError("forbidden", "You can only delete photos you sent.")
    with transaction.atomic():
        locked = ChatImage.objects.select_for_update().select_related("message").get(pk=image.pk)
        if locked.is_deleted:
            return False
        wipe(locked, "sender")
        audit(
            AuditLog.Action.CHAT_PHOTO_DELETED,
            request=request,
            actor=user,
            thread=str(thread.id),
            message=str(locked.message_id),
            image=str(locked.id),
            by="sender",
        )
    return True


def purge_expired(now=None) -> int:
    """The retention job. A conversation closes 7 days after its last visit; its photo bytes are
    wiped `retention_days` (admin setting, default 30) after that. Running it twice is harmless:
    a wiped photo is skipped."""
    now = now or timezone.now()
    keep = timedelta(days=retention_days())
    wiped = 0
    thread_ids = (
        ChatImage.objects.filter(deleted_at__isnull=True)
        .values_list("thread_id", flat=True)
        .distinct()
    )
    for thread in Thread.objects.filter(pk__in=list(thread_ids)):
        info = service.state(thread, now)
        if info["open"]:
            continue
        closed_at = info["closes_at"] or (
            (thread.last_message_at or thread.created_at) + service.CLOSE_AFTER
        )
        if now < closed_at + keep:
            continue
        with transaction.atomic():
            rows = list(
                ChatImage.objects.select_for_update()
                .select_related("message")
                .filter(thread=thread, deleted_at__isnull=True)
            )
            for image in rows:
                wipe(image, "retention", now)
            if rows:
                audit(
                    AuditLog.Action.CHAT_PHOTOS_PURGED,
                    thread=str(thread.id),
                    photos=len(rows),
                    retention_days=keep.days,
                )
                wiped += len(rows)
    return wiped
