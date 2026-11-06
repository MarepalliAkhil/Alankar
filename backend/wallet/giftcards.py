"""Gift cards: long random codes, a ledger for the balance, and a limit on wrong guesses.

The code is shown once, to the buyer, and sent to the recipient. Only a keyed hash is stored, so a
database leak does not reveal usable codes. Lists show the last four characters only.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.audit import audit
from accounts.models import AuditLog
from billing.models import Payment
from billing.pos import money
from wallet.errors import WalletError
from wallet.models import CodeAttempt, GiftCard, GiftCardEntry

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I
GROUPS, GROUP_LEN = 4, 5
CODE_LENGTH = GROUPS * GROUP_LEN  # 20 characters from 32 = 100 bits
VALID_DAYS = 365
MIN_AMOUNT = Decimal("100")
MAX_AMOUNT = Decimal("50000")

USER_LIMIT = 5  # wrong codes per user in the window
IP_LIMIT = 10  # wrong codes per IP address in the window
WINDOW = timedelta(minutes=15)

ZERO = Decimal("0")


class GiftCardError(WalletError):
    """The card cannot be used as asked."""


def new_code() -> str:
    chars = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    return "-".join(chars[i : i + GROUP_LEN] for i in range(0, CODE_LENGTH, GROUP_LEN))


def normalize(text: str) -> str:
    return "".join(c for c in str(text or "").upper() if c in ALPHABET)


def code_hash(normalized: str) -> str:
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def mask(last4: str) -> str:
    return f"•••• {last4}"


# --------------------------------------------------------------------------- guess limit


def _failures(user, ip):
    since = timezone.now() - WINDOW
    recent = CodeAttempt.objects.filter(created_at__gte=since)
    by_user = recent.filter(user=user).count() if getattr(user, "pk", None) else 0
    by_ip = recent.filter(ip_address=ip).count() if ip else 0
    return by_user, by_ip


def check_not_locked(user, ip) -> None:
    by_user, by_ip = _failures(user, ip)
    if by_user >= USER_LIMIT or by_ip >= IP_LIMIT:
        raise GiftCardError(
            "Too many wrong gift card codes. Please wait 15 minutes and try again.",
            code="throttled",
        )


def record_failure(user, ip, request=None) -> None:
    """Counts a wrong code. Called outside any open transaction so the count is kept."""
    CodeAttempt.objects.create(user=user if getattr(user, "pk", None) else None, ip_address=ip)
    by_user, by_ip = _failures(user, ip)
    if by_user == USER_LIMIT or by_ip == IP_LIMIT:
        audit(
            AuditLog.Action.GIFT_CODE_LOCKED,
            request=request,
            actor=user if getattr(user, "pk", None) else None,
            attempts_user=by_user,
            attempts_ip=by_ip,
        )


def find(code: str, *, user, ip, request=None) -> GiftCard:
    """The card for a code, or an error. Wrong codes are counted and limited."""
    check_not_locked(user, ip)
    normalized = normalize(code)
    card = None
    if len(normalized) == CODE_LENGTH:
        card = GiftCard.objects.filter(code_hash=code_hash(normalized)).first()
    if card is None:
        record_failure(user, ip, request)
        raise GiftCardError("That gift card code is not valid.")
    return card


# --------------------------------------------------------------------------- balance


def is_expired(card: GiftCard, now=None) -> bool:
    return card.expires_at <= (now or timezone.now())


def usable_balance(card: GiftCard, now=None) -> Decimal:
    if card.status != GiftCard.Status.ACTIVE or is_expired(card, now):
        return ZERO
    return card.balance


def check_usable(card: GiftCard) -> Decimal:
    if card.status != GiftCard.Status.ACTIVE:
        raise GiftCardError("That gift card is not valid.")
    if is_expired(card):
        raise GiftCardError("That gift card has expired.")
    balance = card.balance
    if balance <= 0:
        raise GiftCardError("That gift card has no balance left.")
    return balance


def redeem(
    card_id, amount, *, payment: Payment | None = None, order_payment=None, actor=None
) -> GiftCardEntry:
    """Takes `amount` from the card. The card row is locked, so two payments at the same moment
    can never spend the same rupees, and the balance never goes below zero."""
    amount = money(amount)
    if amount <= 0:
        raise GiftCardError("The amount must be more than zero.")
    with transaction.atomic():
        card = GiftCard.objects.select_for_update().get(pk=card_id)
        balance = check_usable(card)
        if amount > balance:
            raise GiftCardError(f"That gift card has only Rs. {balance} left.", code="insufficient")
        return GiftCardEntry.objects.create(
            card=card,
            delta=-amount,
            reason=GiftCardEntry.Reason.REDEEMED,
            payment=payment,
            order_payment=order_payment,
            actor=actor if getattr(actor, "pk", None) else None,
        )


def refund_order_payment(order_payment, *, actor=None, note: str = "") -> GiftCardEntry | None:
    """A shop order paid with a gift card was cancelled: the rupees go back on that card."""
    used = (
        GiftCardEntry.objects.filter(
            order_payment=order_payment, reason=GiftCardEntry.Reason.REDEEMED
        )
        .select_related("card")
        .first()
    )
    if used is None:
        return None
    with transaction.atomic():
        card = GiftCard.objects.select_for_update().get(pk=used.card_id)
        if GiftCardEntry.objects.filter(
            order_payment=order_payment, reason=GiftCardEntry.Reason.REFUNDED
        ).exists():
            return None
        if is_expired(card):
            card.expires_at = timezone.now() + timedelta(days=30)
            card.save(update_fields=["expires_at"])
        return GiftCardEntry.objects.create(
            card=card,
            delta=-used.delta,
            reason=GiftCardEntry.Reason.REFUNDED,
            order_payment=order_payment,
            actor=actor if getattr(actor, "pk", None) else None,
            note=note[:300],
        )


def refund_payment(payment: Payment, amount, *, actor=None, note: str = "") -> GiftCardEntry | None:
    """A payment made with a gift card was refunded: the rupees go back on that card."""
    if payment.method != "gift_card":
        return None
    used = (
        GiftCardEntry.objects.filter(payment=payment, reason=GiftCardEntry.Reason.REDEEMED)
        .select_related("card")
        .first()
    )
    if used is None:
        return None
    with transaction.atomic():
        card = GiftCard.objects.select_for_update().get(pk=used.card_id)
        back = sum(
            (
                e.delta
                for e in GiftCardEntry.objects.filter(
                    card=card, payment=payment, reason=GiftCardEntry.Reason.REFUNDED
                )
            ),
            ZERO,
        )
        give = min(money(amount), -used.delta - back)
        if give <= 0:
            return None
        if is_expired(card):
            # The money goes back, so the card gets a short extension to be used again.
            card.expires_at = timezone.now() + timedelta(days=30)
            card.save(update_fields=["expires_at"])
        return GiftCardEntry.objects.create(
            card=card,
            delta=give,
            reason=GiftCardEntry.Reason.REFUNDED,
            payment=payment,
            actor=actor if getattr(actor, "pk", None) else None,
            note=note[:300],
        )


def void(card: GiftCard, *, actor, reason: str) -> GiftCard:
    with transaction.atomic():
        card = GiftCard.objects.select_for_update().get(pk=card.pk)
        if card.status == GiftCard.Status.VOID:
            raise GiftCardError("This gift card is already cancelled.", code="conflict")
        left = card.balance
        card.status = GiftCard.Status.VOID
        card.save(update_fields=["status"])
        if left > 0:
            GiftCardEntry.objects.create(
                card=card,
                delta=-left,
                reason=GiftCardEntry.Reason.VOIDED,
                actor=actor,
                note=reason[:300],
            )
    return card


def reveal(card: GiftCard) -> str | None:
    """The full code, if it was kept (cards issued before Task 8.5 only ever had a hash stored,
    so there is nothing to decrypt for those)."""
    if not card.code_encrypted:
        return None
    return card.code_encrypted


def visible_to(user):
    """Cards the user may see in lists: ones they bought, and ones sent to their email."""
    from django.db.models import Q

    return GiftCard.objects.filter(Q(buyer=user) | Q(recipient_email__iexact=user.email)).distinct()
