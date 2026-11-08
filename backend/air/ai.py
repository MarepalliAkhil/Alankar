"""AI-assisted understanding for the customer chat (optional; OFF by default).

Used only when ALL of these are true: the admin's master switch, the AIR switch, a configured
provider (environment) and THIS customer's consent. Any other case, and any failure, means the
rules in `dialog.py` answer instead. The model reads the redacted message through the tool
registry; this module only turns the tools' structured results into the same chips and cards
the rules produce. It never submits or places anything.
"""

from __future__ import annotations

from datetime import datetime

from air import config, consent, holds
from air.dialog import (
    Reply,
    _cart_reply,
    booking_card,
    pretty,
)
from air.llm import orchestrator, providers, usage
from air.models import SlotHold
from scheduling import booking

UNUSABLE = {
    "no_consent",
    "provider_disabled",
    "master_off",
    "air_off",
    "spend_shutoff",
    "daily_cap",
    "monthly_cap",
    "breaker_open",
}


def available(now: datetime | None = None) -> bool:
    """Is the AI mode switched on and usable at all (before asking about any customer)?"""
    ok, _why = usage.allowed(now)
    return ok and providers.get_provider().name != "disabled"


def status_for(user, now: datetime | None = None) -> dict:
    """What the widget needs to know: is AI mode offered, and has this customer agreed?"""
    on = available(now)
    return {
        "ai_available": on,
        "consent": "granted" if user is not None and consent.granted(user) else "none",
        "consent_version": consent.CURRENT_VERSION,
        "consent_text": consent.NOTICE,
    }


def run_turn(user, message: str, state: dict, parsed, session_id: str, now, provider=None):
    """Returns a Reply built from the model's tool results, or None to let the rules answer."""
    if user is None or not consent.granted(user) or not config.get_settings().air_enabled:
        return None
    collected = {
        "service_id": state.get("service_id", ""),
        "day": state.get("day", ""),
        "stylist_id": state.get("stylist", ""),
    }
    result = orchestrator.handle_turn(
        customer=user,
        session_id=session_id,
        message=message,
        collected=collected,
        now=now,
        provider=provider,
        assist=True,
    )
    if result.reason == "refused":
        return Reply(text=result.text, intent="refused", source="air")
    if result.reason in UNUSABLE or not result.results:
        return None
    return _render(user, result, state, session_id, now)


def _render(user, result, state: dict, session_id: str, now) -> Reply | None:
    reply = Reply(text=result.text, intent="ai", wording_by_ai=result.used_llm)
    useful = False
    for res in result.results:
        if "error" in res:
            continue
        if "service_id" in res and res["service_id"]:
            state["service_id"] = res["service_id"]
        if "held_until" in res and res.get("hold_id"):
            hold = (
                SlotHold.objects.select_related("service", "stylist")
                .filter(pk=res["hold_id"], customer=user)
                .first()
            )
            if hold is not None:
                old = state.get("hold_id")
                if old and old != str(hold.pk):
                    try:
                        holds.release(old, reason="changed", customer=user, now=now)
                    except Exception:  # noqa: BLE001 - an old hold that is gone is fine
                        pass
                state["hold_id"], state["awaiting"] = str(hold.pk), "confirm"
                reply.card = booking_card(hold)
                useful = True
        elif "slots" in res and res["slots"]:
            state["day"] = res.get("day", state.get("day", ""))
            state["awaiting"] = "time"
            chips = []
            for slot in res["slots"][:8]:
                try:
                    start = datetime.fromisoformat(str(slot["start"]))
                except (KeyError, ValueError):
                    continue
                stylists = slot.get("stylists") or []
                if not stylists:
                    continue
                chips.append(
                    {
                        "label": f"{pretty(start)} · {stylists[0].get('name', '')}".rstrip(" ·"),
                        "pick": {
                            "kind": "slot",
                            "start": start.isoformat(),
                            "stylist_id": stylists[0]["id"],
                        },
                    }
                )
            if chips:
                reply.chips = chips
                useful = True
        elif res.get("needs_customer_confirmation") and result.pending:
            state["pending"] = result.pending
            if result.pending["kind"] == "order":
                state["cart"] = list(result.pending["items"])
                full = _cart_reply(user, state)
                reply.card, reply.chips = full.card, full.chips
            else:
                reply.card = {
                    "type": "confirm",
                    "kind": result.pending["kind"],
                    "label": "Yes, go ahead",
                }
                reply.chips = [{"label": "No thanks", "pick": {"kind": "dismiss"}}]
            useful = True
        elif any(k in res for k in ("products", "orders", "requests", "services")):
            useful = True
    if not useful:  # every tool failed: the rules answer instead of the model's words
        return None
    if booking.ratings.pending_count(user) and reply.card and reply.card.get("type") == "booking":
        return None  # the rules explain the rating block with a link
    return reply
