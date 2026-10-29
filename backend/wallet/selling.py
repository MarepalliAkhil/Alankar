"""Selling packages, memberships and gift cards. One path for the till and for online buyers.

Both channels take the money through `billing.tender.charge` and then write the same Sale record,
so the receipts, the cash close and the reports see every sale the same way.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from decimal import ROUND_DOWN, Decimal

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from billing import tender
from billing.pos import money
from core import brand
from core.mail import frontend_link, queue_mail
from core.models import MailOutbox
from scheduling.models import Service
from wallet import giftcards
from wallet.errors import WalletError
from wallet.models import (
    GiftCard,
    GiftCardEntry,
    Membership,
    MembershipEntry,
    MembershipPlan,
    Package,
    PackageCredit,
    PackageEntry,
    PackagePurchase,
    Sale,
    SaleSequence,
)

PAISA = Decimal("0.01")


def _next_number(now: datetime) -> str:
    seq, _ = SaleSequence.objects.select_for_update().get_or_create(year=now.year)
    seq.last += 1
    seq.save(update_fields=["last"])
    return f"SAL-{now.year}-{seq.last:05d}"


def _take(channel: str, method: str, succeed: bool) -> tuple[str, str]:
    try:
        return tender.charge(channel=channel, method=method, succeed=succeed)
    except tender.PaymentDeclined as exc:
        raise WalletError(
            "The payment did not go through and no money was taken. You can try again.",
            code="payment_declined",
        ) from exc
    except Exception as exc:
        if getattr(exc, "message", None):
            raise WalletError(exc.message) from exc
        raise


def _sale(*, kind, channel, method, reference, amount, description, customer, buyer_name,
          buyer_email, actor, now) -> Sale:  # fmt: skip
    return Sale.objects.create(
        number=_next_number(now),
        kind=kind,
        channel=channel,
        method=method,
        reference=reference,
        amount=amount,
        description=description[:200],
        customer=customer,
        buyer_name=buyer_name[:120],
        buyer_email=buyer_email,
        created_by=actor if getattr(actor, "pk", None) else None,
    )


def _customer(customer_id_or_user) -> User:
    if isinstance(customer_id_or_user, User):
        user = customer_id_or_user
    else:
        user = User.objects.filter(pk=customer_id_or_user).first()
    if user is None or user.role != User.Role.CUSTOMER or not user.is_active:
        raise WalletError("Customer not found.", code="not_found")
    return user


def _receipt(sale: Sale, to: str, name: str, extra: str = "") -> None:
    if not to:
        return
    paid_how = "online" if sale.channel == "online" else sale.method
    queue_mail(
        kind=MailOutbox.Kind.NOTICE,
        to=to,
        subject=f"{brand.SHOP_NAME}: receipt {sale.number}",
        body=(
            f"Hello {name},\n\nThank you. {sale.description}: Rs. {sale.amount} "
            f"(receipt {sale.number}, paid {paid_how}).{extra}"
        ),
        link=frontend_link("/customer/wallet"),
    )


# --------------------------------------------------------------------------- packages


def _floor(value: Decimal) -> Decimal:
    return value.quantize(PAISA, rounding=ROUND_DOWN)


def allocate_values(price: Decimal, rows: list[tuple[Service, int]]) -> list[Decimal]:
    """What one session of each service is worth, sharing the package price by list price."""
    weights = [(s.price or Decimal("0")) * q for s, q in rows]
    total = sum(weights, Decimal("0"))
    if total <= 0:
        weights = [Decimal(q) for _, q in rows]
        total = sum(weights, Decimal("0"))
    return [_floor(price * w / total / q) for w, (_, q) in zip(weights, rows, strict=True)]


def sell_package(package_id, customer, *, channel, method="", succeed=True, actor=None):
    customer = _customer(customer)
    now = timezone.now()
    with transaction.atomic():
        package = Package.objects.select_for_update().filter(pk=package_id, is_active=True).first()
        if package is None:
            raise WalletError("That package is not on sale.", code="not_found")
        items = list(package.items.select_related("service"))
        if not items:
            raise WalletError("That package has no services.", code="invalid")
        used_method, reference = _take(channel, method, succeed)
        sale = _sale(
            kind=Sale.Kind.PACKAGE, channel=channel, method=used_method, reference=reference,
            amount=package.price, description=f"Package: {package.name}", customer=customer,
            buyer_name=customer.full_name, buyer_email=customer.email, actor=actor, now=now,
        )  # fmt: skip
        purchase = PackagePurchase.objects.create(
            customer=customer,
            package=package,
            name=package.name,
            sale=sale,
            price_paid=package.price,
            purchased_at=now,
            expires_at=now + timedelta(days=package.validity_days),
        )
        values = allocate_values(package.price, [(i.service, i.quantity) for i in items])
        for item, value in zip(items, values, strict=True):
            credit = PackageCredit.objects.create(
                purchase=purchase,
                service=item.service,
                service_name=item.service.name,
                quantity=item.quantity,
                unit_value=value,
            )
            PackageEntry.objects.create(
                credit=credit,
                delta=item.quantity,
                reason=PackageEntry.Reason.PURCHASED,
                actor=actor if getattr(actor, "pk", None) else None,
            )
        from wallet import packagecodes

        packagecodes.issue_code(purchase)
        _receipt(sale, customer.email, customer.full_name,
                 f" It is valid until {purchase.expires_at:%d %b %Y}.")  # fmt: skip
    return purchase


def package_remaining(purchase: PackagePurchase) -> int:
    return sum(c.remaining for c in purchase.credits.all())


def refund_package(purchase_id, *, actor, method: str, reason: str):
    """Gives back the value of the sessions that were never used. Admin only."""
    from billing.pos import METHODS
    from wallet.models import SaleRefund

    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("Give a reason for the refund.")
    method = (method or "").lower()
    if method not in METHODS:
        raise WalletError("Choose how the money goes back: cash, card or UPI.")
    now = timezone.now()
    with transaction.atomic():
        purchase = PackagePurchase.objects.select_for_update().filter(pk=purchase_id).first()
        if purchase is None:
            raise WalletError("Package not found.", code="not_found")
        if purchase.expires_at <= now:
            raise WalletError("This package has expired, so it cannot be refunded.")
        amount = Decimal("0")
        credits = list(purchase.credits.select_for_update().all())
        left = {c.pk: c.remaining for c in credits}
        for credit in credits:
            amount += credit.unit_value * left[credit.pk]
        if amount <= 0:
            raise WalletError("There are no unused sessions to refund.", code="conflict")
        done = sum((r.amount for r in purchase.sale.refunds.all()), Decimal("0"))
        amount = min(money(amount), purchase.price_paid - done)
        for credit in credits:
            if left[credit.pk] > 0:
                PackageEntry.objects.create(
                    credit=credit,
                    delta=-left[credit.pk],
                    reason=PackageEntry.Reason.REFUNDED,
                    actor=actor,
                    note=reason[:300],
                )
        refund = SaleRefund.objects.create(
            sale=purchase.sale, amount=amount, method=method, reason=reason[:300], decided_by=actor
        )
        queue_mail(
            kind=MailOutbox.Kind.NOTICE,
            to=purchase.customer.email,
            subject=f"{brand.SHOP_NAME}: package refund",
            body=f"Hello {purchase.customer.full_name},\n\nWe refunded Rs. {amount} for the unused "
            f"sessions of {purchase.name}.",
            link=frontend_link("/customer/wallet"),
        )
    return refund


def restore_package_use(entry_id, *, actor, reason: str) -> PackageEntry:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("Give a reason.")
    with transaction.atomic():
        used = (
            PackageEntry.objects.select_related("credit")
            .filter(pk=entry_id, reason=PackageEntry.Reason.USED)
            .first()
        )
        if used is None:
            raise WalletError("That use was not found.", code="not_found")
        credit = PackageCredit.objects.select_for_update().get(pk=used.credit_id)
        purchase = credit.purchase
        if purchase.expires_at <= timezone.now():
            raise WalletError("This package has expired.")
        taken = credit.entries.filter(reason="used", invoice=used.invoice).count()
        back = credit.entries.filter(reason="restored", invoice=used.invoice).count()
        if back >= taken:
            raise WalletError("That session was already put back.", code="conflict")
        return PackageEntry.objects.create(
            credit=credit,
            delta=1,
            reason=PackageEntry.Reason.RESTORED,
            invoice=used.invoice,
            actor=actor,
            note=reason[:300],
        )


# --------------------------------------------------------------------------- memberships


def add_months(moment: datetime, months: int) -> datetime:
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def end_lapsed(customer, now=None) -> None:
    now = now or timezone.now()
    for m in Membership.objects.select_for_update().filter(
        customer=customer,
        status__in=[Membership.Status.ACTIVE, Membership.Status.CANCELLED],
        period_end__lte=now,
    ):
        m.status = Membership.Status.ENDED
        m.sessions_left = 0
        m.save(update_fields=["status", "sessions_left"])
        MembershipEntry.objects.create(
            membership=m, reason=MembershipEntry.Reason.ENDED, sessions_after=0
        )


def current_membership(customer, now=None) -> Membership | None:
    """The membership that gives benefits right now, or None."""
    now = now or timezone.now()
    return Membership.objects.filter(
        customer=customer,
        status__in=[Membership.Status.ACTIVE, Membership.Status.CANCELLED],
        period_end__gt=now,
    ).first()


def join_membership(plan_id, customer, *, channel, method="", succeed=True, actor=None):
    customer = _customer(customer)
    now = timezone.now()
    with transaction.atomic():
        end_lapsed(customer, now)
        plan = MembershipPlan.objects.select_for_update().filter(pk=plan_id, is_active=True).first()
        if plan is None:
            raise WalletError("That plan is not on offer.", code="not_found")
        if current_membership(customer, now) is not None:
            raise WalletError("This customer already has a membership.", code="conflict")
        used_method, reference = _take(channel, method, succeed)
        sale = _sale(
            kind=Sale.Kind.MEMBERSHIP, channel=channel, method=used_method, reference=reference,
            amount=plan.price, description=f"Membership: {plan.name}", customer=customer,
            buyer_name=customer.full_name, buyer_email=customer.email, actor=actor, now=now,
        )  # fmt: skip
        services = list(plan.included_services.all())
        membership = Membership.objects.create(
            customer=customer,
            plan=plan,
            plan_name=plan.name,
            price=plan.price,
            period_months=plan.period_months,
            discount_percent=plan.discount_percent,
            applies_to_products=plan.applies_to_products,
            included_sessions=plan.included_sessions,
            included_service_ids=[str(s.pk) for s in services],
            included_service_names=[s.name for s in services],
            started_at=now,
            period_start=now,
            period_end=add_months(now, plan.period_months),
            sessions_left=plan.included_sessions,
        )
        MembershipEntry.objects.create(
            membership=membership,
            reason=MembershipEntry.Reason.JOINED,
            sessions_change=plan.included_sessions,
            sessions_after=plan.included_sessions,
            sale=sale,
            actor=actor if getattr(actor, "pk", None) else None,
        )
        _receipt(sale, customer.email, customer.full_name,
                 f" Your membership runs until {membership.period_end:%d %b %Y}.")  # fmt: skip
    return membership


def renew_membership(customer, *, channel, method="", succeed=True, actor=None):
    customer = _customer(customer)
    now = timezone.now()
    with transaction.atomic():
        end_lapsed(customer, now)
        m = (
            Membership.objects.select_for_update()
            .filter(customer=customer, status=Membership.Status.ACTIVE, period_end__gt=now)
            .first()
        )
        if m is None:
            raise WalletError(
                "There is no active membership to renew. Join a plan instead.", code="conflict"
            )
        used_method, reference = _take(channel, method, succeed)
        sale = _sale(
            kind=Sale.Kind.MEMBERSHIP, channel=channel, method=used_method, reference=reference,
            amount=m.price, description=f"Membership renewed: {m.plan_name}", customer=customer,
            buyer_name=customer.full_name, buyer_email=customer.email, actor=actor, now=now,
        )  # fmt: skip
        m.period_start = m.period_end
        m.period_end = add_months(m.period_end, m.period_months)
        m.sessions_left = m.included_sessions
        m.save(update_fields=["period_start", "period_end", "sessions_left"])
        MembershipEntry.objects.create(
            membership=m,
            reason=MembershipEntry.Reason.RENEWED,
            sessions_change=m.included_sessions,
            sessions_after=m.sessions_left,
            sale=sale,
            actor=actor if getattr(actor, "pk", None) else None,
        )
        _receipt(sale, customer.email, customer.full_name,
                 f" Your membership now runs until {m.period_end:%d %b %Y}.")  # fmt: skip
    return m


def cancel_membership(customer, *, actor=None) -> Membership:
    customer = _customer(customer)
    now = timezone.now()
    with transaction.atomic():
        end_lapsed(customer, now)
        m = (
            Membership.objects.select_for_update()
            .filter(customer=customer, status=Membership.Status.ACTIVE, period_end__gt=now)
            .first()
        )
        if m is None:
            raise WalletError("There is no active membership to cancel.", code="conflict")
        m.status = Membership.Status.CANCELLED
        m.cancelled_at = now
        m.save(update_fields=["status", "cancelled_at"])
        MembershipEntry.objects.create(
            membership=m,
            reason=MembershipEntry.Reason.CANCELLED,
            sessions_after=m.sessions_left,
            actor=actor if getattr(actor, "pk", None) else None,
        )
    return m


def restore_membership_use(entry_id, *, actor, reason: str) -> MembershipEntry:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("Give a reason.")
    with transaction.atomic():
        used = MembershipEntry.objects.filter(
            pk=entry_id, reason=MembershipEntry.Reason.USED
        ).first()
        if used is None:
            raise WalletError("That use was not found.", code="not_found")
        m = Membership.objects.select_for_update().get(pk=used.membership_id)
        if m.period_end <= timezone.now() or m.status == Membership.Status.ENDED:
            raise WalletError("This membership period is over.")
        taken = m.entries.filter(reason="used", invoice=used.invoice).count()
        back = m.entries.filter(reason="restored", invoice=used.invoice).count()
        if back >= taken:
            raise WalletError("That session was already put back.", code="conflict")
        m.sessions_left = min(m.sessions_left + 1, m.included_sessions)
        m.save(update_fields=["sessions_left"])
        return MembershipEntry.objects.create(
            membership=m,
            reason=MembershipEntry.Reason.RESTORED,
            sessions_change=1,
            sessions_after=m.sessions_left,
            invoice=used.invoice,
            actor=actor,
            note=reason[:300],
        )


# --------------------------------------------------------------------------- gift cards


def sell_gift_card(
    *,
    amount,
    channel,
    method="",
    succeed=True,
    actor=None,
    buyer: User | None = None,
    buyer_name: str = "",
    recipient_name: str = "",
    recipient_email: str = "",
    message: str = "",
):
    """Returns (card, code). The code is returned once and emailed; it is never stored."""
    try:
        amount = money(amount)
    except Exception as exc:
        raise WalletError("Enter a valid amount.") from exc
    if amount < giftcards.MIN_AMOUNT or amount > giftcards.MAX_AMOUNT:
        raise WalletError(
            f"A gift card can be worth Rs. {giftcards.MIN_AMOUNT:f} "
            f"to Rs. {giftcards.MAX_AMOUNT:f}."
        )
    name = (buyer.full_name if buyer else buyer_name).strip()
    if not name:
        raise WalletError("Enter the buyer's name.")
    now = timezone.now()
    code = giftcards.new_code()
    with transaction.atomic():
        used_method, reference = _take(channel, method, succeed)
        sale = _sale(
            kind=Sale.Kind.GIFT_CARD, channel=channel, method=used_method, reference=reference,
            amount=amount, description="Gift card", customer=buyer, buyer_name=name,
            buyer_email=buyer.email if buyer else "", actor=actor, now=now,
        )  # fmt: skip
        normalized = giftcards.normalize(code)
        card = GiftCard.objects.create(
            code_hash=giftcards.code_hash(normalized),
            code_encrypted=code,
            last4=normalized[-4:],
            initial_amount=amount,
            expires_at=now + timedelta(days=giftcards.VALID_DAYS),
            sale=sale,
            buyer=buyer,
            buyer_name=name,
            recipient_name=recipient_name.strip()[:120],
            recipient_email=recipient_email.strip().lower(),
            message=message.strip()[:300],
            issued_at=now,
        )
        GiftCardEntry.objects.create(
            card=card,
            delta=amount,
            reason=GiftCardEntry.Reason.PURCHASED,
            actor=actor if getattr(actor, "pk", None) else None,
        )
        _email_card(card, code, name)
    return card, code


def _email_card(card: GiftCard, code: str, buyer_name: str) -> None:
    """The code goes to the recipient, or to the buyer when no recipient email was given."""
    to = card.recipient_email or (card.buyer.email if card.buyer_id else "")
    if not to:
        return
    greeting = card.recipient_name or "there"
    lines = [f"Hello {greeting},", ""]
    if card.recipient_email:
        lines.append(
            f"{buyer_name} sent you a {brand.SHOP_NAME} gift card worth Rs. {card.initial_amount}."
        )
    else:
        lines.append(f"Here is your {brand.SHOP_NAME} gift card worth Rs. {card.initial_amount}.")
    if card.message:
        lines += ["", f"“{card.message}”"]
    lines += [
        "",
        f"Gift card code: {code}",
        f"Valid until {card.expires_at:%d %b %Y}. Keep this code private: anyone who has it can "
        "use the card.",
    ]
    queue_mail(
        kind=MailOutbox.Kind.GIFT_CARD,
        to=to,
        subject=f"{brand.SHOP_NAME}: your gift card",
        body="\n".join(lines),
        link=frontend_link("/customer/wallet"),
    )
