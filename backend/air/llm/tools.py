"""The tool registry: the ONLY way the language model can cause anything to happen.

Each tool has a JSON schema, a policy action (checked again inside the service function) and
server-side validation. The model never touches the database. Arguments use public UUIDs, and
every id is verified to belong to the CURRENT session's customer before anything runs. The
model's claim that "the customer confirmed" is ignored: only `ctx.confirmed_hold_id`, set by the
server from the customer's own confirm action, counts.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from air import actor, handover, holds, links, orders, service
from air.models import SlotHold
from scheduling import booking
from scheduling import products as visit_products
from scheduling.models import Appointment, AppointmentStatus, Service
from shop import orders as shop

MAX_TOOL_CALLS = 6
SAFE_TEXT = re.compile(r"[^\w\s.,!?'()-]")


class ToolError(Exception):
    """The arguments were wrong or not allowed. `code` is a short fixed word the model may see."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class TurnContext:
    customer: Any
    session_id: str
    confirmed_hold_id: str = ""
    collected: dict = field(default_factory=dict)
    now: datetime = field(default_factory=timezone.now)
    assist: bool = False  # the customer chat sets this: customer-assist actions need no desk cover
    pending: dict | None = None  # a change the model PROPOSED; only the customer's button runs it


# --------------------------------------------------------------------------- validation


def _uuid(value, name) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise ToolError(f"bad_{name}") from None


def _validate(schema: dict, args) -> dict:
    """Small JSON-schema check: object, known keys only, required keys, simple types/formats."""
    if not isinstance(args, dict):
        raise ToolError("bad_arguments")
    props = schema.get("properties", {})
    if set(args) - set(props):
        raise ToolError("unknown_argument")
    for key in schema.get("required", []):
        if key not in args:
            raise ToolError(f"missing_{key}")
    clean = {}
    for key, value in args.items():
        spec = props[key]
        kind = spec.get("type")
        if kind == "string":
            if not isinstance(value, str) or len(value) > spec.get("maxLength", 200):
                raise ToolError(f"bad_{key}")
            if spec.get("format") == "uuid":
                _uuid(value, key)
            elif spec.get("format") == "date":
                try:
                    date.fromisoformat(value)
                except ValueError:
                    raise ToolError(f"bad_{key}") from None
            elif spec.get("format") == "date-time":
                try:
                    if datetime.fromisoformat(value).tzinfo is None:
                        raise ToolError(f"bad_{key}")
                except ValueError:
                    raise ToolError(f"bad_{key}") from None
        elif kind == "integer":
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not spec.get("minimum", 0) <= value <= spec.get("maximum", 1000)
            ):
                raise ToolError(f"bad_{key}")
        elif kind == "boolean":
            if not isinstance(value, bool):
                raise ToolError(f"bad_{key}")
        elif kind == "array":
            if (
                not isinstance(value, list)
                or len(value) > spec.get("maxItems", 5)
                or not all(isinstance(v, str) and len(v) <= 64 for v in value)
            ):
                raise ToolError(f"bad_{key}")
        else:
            raise ToolError(f"bad_{key}")
        clean[key] = value
    return clean


# --------------------------------------------------------------------------- ownership checks


def _service(service_id) -> Service:
    obj = Service.objects.filter(pk=_uuid(service_id, "service_id"), is_active=True).first()
    if obj is None:
        raise ToolError("unknown_service")
    return obj


def _own_hold(ctx: TurnContext, hold_id) -> SlotHold:
    hold = (
        SlotHold.objects.select_related("service", "stylist")
        .filter(pk=_uuid(hold_id, "hold_id"), customer=ctx.customer)
        .first()
    )
    if hold is None:  # someone else's hold looks exactly like no hold
        raise ToolError("unknown_hold")
    return hold


def _own_request(ctx: TurnContext, request_id) -> Appointment:
    appt = Appointment.objects.filter(
        pk=_uuid(request_id, "request_id"), customer=ctx.customer
    ).first()
    if appt is None:
        raise ToolError("unknown_request")
    return appt


# --------------------------------------------------------------------------- handlers


def _get_services(ctx, args):
    return {"services": service.list_services(now=ctx.now, assist=ctx.assist)}


def _get_free_slots(ctx, args):
    svc = _service(args["service_id"])
    slots = service.free_slots(
        service=svc,
        variant_id=args.get("variant_id"),
        addon_ids=args.get("addon_ids", []),
        day=date.fromisoformat(args["day"]),
        now=ctx.now,
        assist=ctx.assist,
    )
    return {"slots": slots[:12], "service_id": str(svc.pk), "day": args["day"]}


def _hold_slot(ctx, args):
    svc = _service(args["service_id"])
    start = datetime.fromisoformat(args["start"])
    stylist = (
        booking.qualified_stylists(svc, public_only=True)
        .filter(pk=_uuid(args["stylist_id"], "stylist_id"))
        .first()
    )
    if stylist is None:
        raise ToolError("unknown_stylist")
    key = uuid.uuid5(
        uuid.NAMESPACE_URL, f"{ctx.session_id}|{svc.pk}|{stylist.pk}|{start.isoformat()}"
    ).hex
    hold = holds.create_hold(
        customer=ctx.customer,
        service=svc,
        variant_id=args.get("variant_id"),
        addon_ids=args.get("addon_ids", []),
        stylist=stylist,
        start=start,
        session_id=ctx.session_id,
        idempotency_key=key,
        now=ctx.now,
        assist=ctx.assist,
    )
    return {
        "hold_id": str(hold.pk),
        "start": hold.starts_at,
        "held_until": hold.expires_at,
        "stylist": stylist.display_name,
        "service": svc.name,
        "service_id": str(svc.pk),
    }


def _draft_booking(ctx, args):
    hold = _own_hold(ctx, args["hold_id"])
    if hold.status != SlotHold.Status.ACTIVE or hold.expires_at <= ctx.now:
        raise ToolError("hold_expired")
    quote = booking.quote(hold.service, hold.variant_id, hold.addon_ids)
    return {
        "hold_id": str(hold.pk),
        "service": hold.service.name,
        "stylist": hold.stylist.display_name,
        "start": hold.starts_at,
        "price": str(quote.price_total),
        "pay_online": str(quote.amount_payable),
        "needs_customer_confirmation": True,
    }


def _submit_booking(ctx, args):
    hold = _own_hold(ctx, args["hold_id"])
    if not ctx.confirmed_hold_id or str(hold.pk) != str(ctx.confirmed_hold_id):
        raise ToolError("customer_has_not_confirmed")
    customer = ctx.customer
    appt = service.submit_booking(
        customer=customer,
        hold_id=hold.pk,
        contact={
            "name": customer.full_name or customer.email,
            "email": customer.email,
            "phone": ctx.collected.get("phone", ""),
        },
        notes=SAFE_TEXT.sub("", str(ctx.collected.get("notes", "")))[:300],
        allergies="",
        session_id=ctx.session_id,
        customer_confirmed=True,
        now=ctx.now,
        assist=ctx.assist,
    )
    return {"request_id": str(appt.pk), "status": appt.status, "start": appt.preferred_start}


def _my_requests(ctx, args):
    return {"requests": service.my_requests(ctx.customer, now=ctx.now, assist=ctx.assist)}


def _send_payment_link(ctx, args):
    appt = _own_request(ctx, args["request_id"])
    if appt.status != AppointmentStatus.AWAITING_PAYMENT:
        raise ToolError("no_payment_waiting")
    from billing.models import PaymentLink

    if appt.payment_links.filter(status=PaymentLink.Status.ACTIVE).exists():
        links.resend(appt.pk, now=ctx.now)
    else:
        links.create(appt.pk, now=ctx.now)
    appt.refresh_from_db()
    return {"request_id": str(appt.pk), "pay_by": appt.awaiting_payment_until, "sent": True}


def _handoff(ctx, args):
    request_id = args.get("request_id")
    if request_id:
        appt = _own_request(ctx, request_id)
        handover.handoff(appt.pk, reason="customer_asked", now=ctx.now)
    return {"handed_to_desk": True}


# --------------------------------------------------------------------------- product tools
# These only READ or PROPOSE. A proposal is stored in `ctx.pending` and shown to the customer as a
# summary card; the change happens only when the customer presses the card's button (a separate
# endpoint that never goes through the model). The model cannot place, change or cancel anything.


def _sellable(product_id) -> dict:
    pid = str(_uuid(product_id, "product_id"))
    found = next((p for p in orders.sellable_products() if p["id"] == pid), None)
    if found is None:
        raise ToolError("unknown_product")
    return found


def _list_products(ctx, args):
    return {"products": orders.list_products(now=ctx.now, assist=ctx.assist)[:20]}


def _parse_items(raw) -> list[dict]:
    items = []
    for entry in raw:
        product, _, qty = str(entry).partition(":")
        try:
            quantity = int(qty)
        except ValueError:
            raise ToolError("bad_items") from None
        items.append({"product": str(_uuid(product, "items")), "quantity": quantity})
    return items


def _create_product_order(ctx, args):
    actor.require("air.order.create", now=ctx.now, assist=ctx.assist)
    items = orders.clean_items(_parse_items(args["items"]))
    for item in items:
        _sellable(item["product"])
    try:
        quote = shop.price(items, customer=ctx.customer)
    except shop.ShopError as exc:
        return {"error": exc.code, "message": exc.message}
    ctx.pending = {"kind": "order", "items": items}
    return {
        "needs_customer_confirmation": True,
        "draft": "order",
        "lines": [
            {"name": ln.product.name, "quantity": ln.quantity, "amount": str(ln.amount)}
            for ln in quote.lines
        ],
        "total": str(quote.total),
    }


def _update_order(ctx, args):
    actor.require("air.order.update", now=ctx.now, assist=ctx.assist)
    order = orders.own_order(ctx.customer, _uuid(args["order_id"], "order_id"))
    if order.status != shop.OrderStatus.PENDING_PAYMENT:
        raise actor.AirDenied("paid_order", "That order is already paid or closed.")
    pid = str(_uuid(args["product_id"], "product_id"))
    if not order.lines.filter(product_id=pid).exists():
        raise ToolError("not_on_order")
    if args["quantity"] > orders.quantity_cap():
        raise actor.AirDenied("quantity_cap", "That is more than I can order in chat.")
    ctx.pending = {
        "kind": "order_update",
        "order_id": str(order.pk),
        "changes": [{"product": pid, "quantity": args["quantity"]}],
    }
    return {
        "needs_customer_confirmation": True,
        "draft": "order_update",
        "order": order.number,
        "quantity": args["quantity"],
    }


def _order_status(ctx, args):
    return {"orders": orders.my_orders(ctx.customer, now=ctx.now, assist=ctx.assist)}


def _add_product_to_booking(ctx, args):
    actor.require("air.visit_product.add", now=ctx.now, assist=ctx.assist)
    product = _sellable(args["product_id"])
    if args["quantity"] > min(orders.quantity_cap(), visit_products.MAX_EACH):
        raise actor.AirDenied("quantity_cap", "That is more than I can add in chat.")
    if visit_products.next_visit(ctx.customer) is None:
        raise ToolError("no_visit")
    ctx.pending = {
        "kind": "visit_product",
        "product_id": product["id"],
        "quantity": args["quantity"],
    }
    return {
        "needs_customer_confirmation": True,
        "draft": "visit_product",
        "product": product["name"],
        "quantity": args["quantity"],
    }


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict
    action: str
    handler: Any


def _obj(props=None, required=()):
    return {
        "type": "object",
        "properties": props or {},
        "required": list(required),
        "additionalProperties": False,
    }


_UUID = {"type": "string", "format": "uuid", "maxLength": 36}
_ADDONS = {"type": "array", "maxItems": 5}
_QTY = {"type": "integer", "minimum": 0, "maximum": 50}

TOOLS: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool(
            "get_services",
            "List the salon's active services.",
            _obj(),
            "air.services.read",
            _get_services,
        ),
        Tool(
            "get_free_slots",
            "Free start times on one day for a service.",
            _obj(
                {
                    "service_id": _UUID,
                    "variant_id": _UUID,
                    "addon_ids": _ADDONS,
                    "day": {"type": "string", "format": "date", "maxLength": 10},
                },
                ["service_id", "day"],
            ),
            "air.availability.read",
            _get_free_slots,
        ),
        Tool(
            "hold_slot",
            "Hold one offered slot for the customer for a few minutes.",
            _obj(
                {
                    "service_id": _UUID,
                    "variant_id": _UUID,
                    "addon_ids": _ADDONS,
                    "stylist_id": _UUID,
                    "start": {"type": "string", "format": "date-time", "maxLength": 40},
                },
                ["service_id", "stylist_id", "start"],
            ),
            "air.hold.create",
            _hold_slot,
        ),
        Tool(
            "draft_booking",
            "Summarise a held slot so the customer can confirm it. Books nothing.",
            _obj({"hold_id": _UUID}, ["hold_id"]),
            "air.requests.read_own",
            _draft_booking,
        ),
        Tool(
            "submit_booking_after_customer_confirm",
            "Send the booking request. Works only after the customer pressed confirm.",
            _obj({"hold_id": _UUID}, ["hold_id"]),
            "air.booking.request",
            _submit_booking,
        ),
        Tool(
            "my_requests",
            "The customer's own requests and bookings.",
            _obj(),
            "air.requests.read_own",
            _my_requests,
        ),
        Tool(
            "send_payment_link",
            "Send (or once resend) the payment link for the customer's own booking.",
            _obj({"request_id": _UUID}, ["request_id"]),
            "air.payment_link.resend",
            _send_payment_link,
        ),
        Tool(
            "list_products",
            "List the shop products that are on sale and in stock.",
            _obj(),
            "air.products.read",
            _list_products,
        ),
        Tool(
            "add_product_to_booking",
            "Propose adding a product to the customer's next visit (paid at the salon).",
            _obj({"product_id": _UUID, "quantity": _QTY}, ["product_id", "quantity"]),
            "air.visit_product.add",
            _add_product_to_booking,
        ),
        Tool(
            "create_product_order",
            "Propose a product order. Items are 'product-uuid:quantity'. Places nothing.",
            _obj({"items": {"type": "array", "maxItems": 10}}, ["items"]),
            "air.order.create",
            _create_product_order,
        ),
        Tool(
            "update_order_before_payment",
            "Propose a new quantity (0 removes) for a product on the customer's unpaid order.",
            _obj(
                {"order_id": _UUID, "product_id": _UUID, "quantity": _QTY},
                ["order_id", "product_id", "quantity"],
            ),
            "air.order.update",
            _update_order,
        ),
        Tool(
            "order_status",
            "The customer's own latest orders and their status.",
            _obj(),
            "air.order.read_own",
            _order_status,
        ),
        Tool(
            "handoff_to_desk",
            "Ask the front desk to take over.",
            _obj({"request_id": _UUID}),
            "air.handoff",
            _handoff,
        ),
    )
}


def specs() -> list[dict]:
    """What the model is shown: name, description and schema only."""
    return [
        {"name": t.name, "description": t.description, "schema": t.schema} for t in TOOLS.values()
    ]


def run(ctx: TurnContext, name: str, arguments) -> dict:
    """Runs one tool call safely. Never raises: errors come back as {"error": <code>}."""
    tool = TOOLS.get(name) if isinstance(name, str) else None
    if tool is None:
        return {"error": "unknown_tool"}
    if not actor.allowed(tool.action):
        return {"error": "not_allowed"}
    try:
        args = _validate(tool.schema, arguments)
        return tool.handler(ctx, args)
    except ToolError as exc:
        return {"error": exc.code}
    except actor.AirDenied as exc:
        return {"error": exc.code}
    except booking.BookingError as exc:
        return {"error": exc.code, "message": exc.message}
