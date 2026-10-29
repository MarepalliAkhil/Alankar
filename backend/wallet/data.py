"""JSON shapes for packages, memberships, gift cards and sales. Gift-card codes never appear
here: lists show only the last four characters."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from wallet import giftcards, selling
from wallet.models import (
    GiftCard,
    Membership,
    MembershipPlan,
    Package,
    PackagePurchase,
    Sale,
)


def money_str(value) -> str:
    return str(Decimal(value).quantize(Decimal("0.01")))


def package_data(p: Package, *, sold: int | None = None) -> dict:
    data = {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "price": money_str(p.price),
        "validity_days": p.validity_days,
        "is_active": p.is_active,
        "sort_order": p.sort_order,
        "items": [
            {
                "service": str(i.service_id),
                "service_name": i.service.name,
                "quantity": i.quantity,
                "list_price": money_str(i.service.price),
            }
            for i in p.items.all()
        ],
    }
    if sold is not None:
        data["sold"] = sold
    return data


def plan_data(p: MembershipPlan, *, members: int | None = None) -> dict:
    data = {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "price": money_str(p.price),
        "period_months": p.period_months,
        "discount_percent": money_str(p.discount_percent),
        "applies_to_products": p.applies_to_products,
        "included_sessions": p.included_sessions,
        "included_services": [{"id": str(s.pk), "name": s.name} for s in p.included_services.all()],
        "rules": p.rules,
        "is_active": p.is_active,
        "sort_order": p.sort_order,
    }
    if members is not None:
        data["members"] = members
    return data


def purchase_data(pp: PackagePurchase, *, ledger: bool = False) -> dict:
    credits = list(pp.credits.all())
    data = {
        "id": str(pp.id),
        "name": pp.name,
        "price_paid": money_str(pp.price_paid),
        "purchased_at": pp.purchased_at,
        "expires_at": pp.expires_at,
        "sale_number": pp.sale.number,
        "customer_name": pp.customer.full_name,
        "customer_id": str(pp.customer_id),
        "last4": pp.last4,
        "masked": giftcards.mask(pp.last4) if pp.last4 else "",
        "code_available": bool(pp.code_encrypted),
        "cancel_status": pp.cancel_status,
        "credits": [
            {
                "id": str(c.id),
                "service_name": c.service_name,
                "quantity": c.quantity,
                "remaining": c.remaining,
                "unit_value": money_str(c.unit_value),
            }
            for c in credits
        ],
        "remaining": sum(c.remaining for c in credits),
        "refunded": money_str(sum((r.amount for r in pp.sale.refunds.all()), Decimal("0"))),
    }
    if ledger:
        data["ledger"] = [
            {
                "id": str(e.id),
                "service_name": c.service_name,
                "delta": e.delta,
                "reason": e.reason,
                "reason_label": e.get_reason_display(),
                "invoice": e.invoice.number if e.invoice_id else None,
                "appointment": str(e.appointment_id) if e.appointment_id else None,
                "note": e.note,
                "created_at": e.created_at,
                "actor": e.actor.full_name if e.actor_id else None,
            }
            for c in credits
            for e in c.entries.select_related("invoice", "actor", "appointment")
        ]
        data["ledger"].sort(key=lambda r: r["created_at"])
    return data


def membership_data(m: Membership, *, ledger: bool = False, admin: bool = False) -> dict:
    data = {
        "id": str(m.id),
        "plan_name": m.plan_name,
        "price": money_str(m.price),
        "period_months": m.period_months,
        "discount_percent": money_str(m.discount_percent),
        "applies_to_products": m.applies_to_products,
        "included_sessions": m.included_sessions,
        "included_services": m.included_service_names,
        "sessions_left": m.sessions_left,
        "status": m.status,
        "status_label": m.get_status_display(),
        "started_at": m.started_at,
        "period_end": m.period_end,
        "cancelled_at": m.cancelled_at,
        "can_renew": m.status == Membership.Status.ACTIVE,
    }
    if admin:
        data["customer_name"] = m.customer.full_name
        data["customer_id"] = str(m.customer_id)
    if ledger:
        data["ledger"] = [
            {
                "id": str(e.id),
                "reason": e.reason,
                "reason_label": e.get_reason_display(),
                "sessions_change": e.sessions_change,
                "sessions_after": e.sessions_after,
                "invoice": e.invoice.number if e.invoice_id else None,
                "note": e.note,
                "created_at": e.created_at,
            }
            for e in m.entries.select_related("invoice")
        ]
    return data


def card_data(card: GiftCard, *, viewer=None, ledger: bool = False, admin: bool = False) -> dict:
    balance = giftcards.usable_balance(card)
    data = {
        "id": str(card.id),
        "last4": card.last4,
        "masked": giftcards.mask(card.last4),
        "initial_amount": money_str(card.initial_amount),
        "balance": money_str(card.balance),
        "usable_balance": money_str(balance),
        "status": card.status,
        "expired": giftcards.is_expired(card),
        "expires_at": card.expires_at,
        "issued_at": card.issued_at,
        "recipient_name": card.recipient_name,
        # Whether the full code can ever be shown again (cards issued before Task 8.5 never
        # kept the plaintext, so they stay "shown once" forever).
        "code_available": bool(card.code_encrypted),
    }
    if viewer is not None:
        data["role"] = "bought" if card.buyer_id == viewer.pk else "received"
    if admin:
        data["buyer_name"] = card.buyer_name
        data["recipient_email"] = card.recipient_email
        data["sale_number"] = card.sale.number
        data["channel"] = card.sale.channel
    if ledger:
        data["ledger"] = [
            {
                "id": str(e.id),
                "delta": money_str(e.delta),
                "reason": e.reason,
                "reason_label": e.get_reason_display(),
                "note": e.note,
                "created_at": e.created_at,
            }
            for e in card.entries.all()
        ]
    return data


def sale_data(s: Sale) -> dict:
    refunded = sum((r.amount for r in s.refunds.all()), Decimal("0"))
    return {
        "id": str(s.id),
        "number": s.number,
        "kind": s.kind,
        "kind_label": s.get_kind_display(),
        "channel": s.channel,
        "method": s.method,
        "amount": money_str(s.amount),
        "refunded": money_str(refunded),
        "description": s.description,
        "customer_name": s.buyer_name,
        "created_at": s.created_at,
    }


def customer_wallet(user) -> dict:
    """Everything one customer holds, for their own screens."""
    from wallet import credits

    with transaction.atomic():
        selling.end_lapsed(user)
    purchases = (
        PackagePurchase.objects.filter(customer=user)
        .select_related("sale", "customer")
        .prefetch_related("credits__entries", "sale__refunds")
    )
    membership = Membership.objects.filter(
        customer=user,
        status__in=[Membership.Status.ACTIVE, Membership.Status.CANCELLED],
    ).first()
    cards = giftcards.visible_to(user).select_related("sale").prefetch_related("entries")
    if not user.email_verified_at:
        cards = cards.filter(buyer=user)
    return {
        "packages": [purchase_data(p, ledger=True) for p in purchases],
        "membership": membership_data(membership, ledger=True) if membership else None,
        "gift_cards": [card_data(c, viewer=user, ledger=True) for c in cards],
        "sessions_total": credits.total_remaining(user),
    }
