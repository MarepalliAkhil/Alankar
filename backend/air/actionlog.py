"""The append-only AIR action log.

Only allow-listed, non-personal fields are written to `before` / `after`. No names, phone numbers,
emails, raw prompts, raw model output, tokens or keys ever reach this table: the model input is
stored as a one-way hash only.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from air import config, cover
from air.models import AIActionLog

ALLOWED_FIELDS = frozenset(
    {
        "status",
        "start",
        "end",
        "service_id",
        "stylist_id",
        "hold_id",
        "request_id",
        "booking_id",
        "expires_at",
        "link_status",
        "resend_count",
        "count",
        "reason",
        "tool",
        "event",
        "hold_status",
        "amount",
        "order_id",
        "product_id",
        "quantity",
        "stock_before",
        "stock_after",
        "order_status",
    }
)
MAX_VALUE = 120


def _scalar(value):
    if value is None or isinstance(value, bool | int):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)[:MAX_VALUE]


def clean(data: dict | None) -> dict:
    """Keeps only allow-listed keys with plain values."""
    return {k: _scalar(v) for k, v in (data or {}).items() if k in ALLOWED_FIELDS}


def input_hash(redacted_text: str | None) -> str:
    if not redacted_text:
        return ""
    return hashlib.sha256(redacted_text.encode("utf-8")).hexdigest()


def write(
    action_type: str,
    *,
    status: str = AIActionLog.Status.DONE,
    customer=None,
    booking=None,
    order_ref=None,
    session_id: str = "",
    channel: str = "chat",
    before: dict | None = None,
    after: dict | None = None,
    reason_code: str = "",
    reversible: bool = False,
    undo_of: AIActionLog | None = None,
    provider: str = "",
    model: str = "",
    latency_ms: int = 0,
    cost_rupees=0,
    redacted_input: str | None = None,
    period=None,
    customer_ref=None,
    booking_ref=None,
    now: datetime | None = None,
) -> AIActionLog:
    now = now or timezone.now()
    window = config.get_settings().undo_window_minutes
    return AIActionLog.objects.create(
        cover_period=period or cover.current_period(),
        channel=channel if channel in {"chat", "voice"} else "chat",
        session_id=(session_id or "")[:64],
        action_type=action_type[:40],
        status=status,
        customer_ref=customer_ref or getattr(customer, "pk", None),
        booking_ref=booking_ref or getattr(booking, "pk", None),
        order_ref=order_ref,
        before=clean(before),
        after=clean(after),
        reason_code=reason_code[:40],
        reversible_until=now + timedelta(minutes=window) if reversible else None,
        undo_of=undo_of,
        provider=provider[:20],
        model=model[:60],
        latency_ms=max(int(latency_ms), 0),
        estimated_cost_rupees=cost_rupees or 0,
        input_hash=input_hash(redacted_input),
    )
