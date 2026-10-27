"""What a customer's packages and membership can do at checkout."""

from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from wallet import selling
from wallet.errors import WalletError
from wallet.models import (
    Membership,
    MembershipEntry,
    PackageCredit,
    PackageEntry,
)

ZERO = Decimal("0")


def package_credits(customer, service, now=None) -> list[PackageCredit]:
    """Package sessions that can pay for this service, soonest-to-expire first."""
    now = now or timezone.now()
    rows = (
        PackageCredit.objects.filter(
            purchase__customer=customer, purchase__expires_at__gt=now, service=service
        )
        .select_related("purchase")
        .order_by("purchase__expires_at", "purchase__purchased_at")
    )
    return [c for c in rows if c.remaining > 0]


def membership_benefits(customer, now=None) -> Membership | None:
    return selling.current_membership(customer, now)


def session_available(membership: Membership | None, service) -> bool:
    return bool(
        membership
        and membership.sessions_left > 0
        and str(service.pk) in (membership.included_service_ids or [])
    )


def for_visit(customer, service) -> dict:
    """Everything the checkout screen offers for this customer and service."""
    membership = membership_benefits(customer)
    return {
        "membership": membership,
        "session_available": session_available(membership, service),
        "packages": package_credits(customer, service),
    }


def lock_package_credit(credit_id, customer, service) -> PackageCredit:
    """Locks a credit for use at checkout and checks it again inside the transaction."""
    credit = (
        PackageCredit.objects.select_for_update(of=("self",))
        .select_related("purchase")
        .filter(pk=credit_id, purchase__customer=customer)
        .first()
    )
    if credit is None:
        raise WalletError("That package is not available for this customer.", code="not_found")
    if credit.service_id != service.pk:
        raise WalletError("That package does not cover this service.")
    if credit.purchase.expires_at <= timezone.now():
        raise WalletError("That package has expired.")
    if credit.remaining < 1:
        raise WalletError("That package has no sessions left.", code="conflict")
    return credit


def use_package(credit: PackageCredit, invoice, actor) -> PackageEntry:
    return PackageEntry.objects.create(
        credit=credit,
        delta=-1,
        reason=PackageEntry.Reason.USED,
        invoice=invoice,
        actor=actor if getattr(actor, "pk", None) else None,
    )


def lock_membership(customer, service) -> Membership:
    m = (
        Membership.objects.select_for_update()
        .filter(
            customer=customer,
            status__in=[Membership.Status.ACTIVE, Membership.Status.CANCELLED],
            period_end__gt=timezone.now(),
        )
        .first()
    )
    if m is None or not session_available(m, service):
        raise WalletError("No included membership session is available for this service.")
    return m


def use_membership_session(m: Membership, invoice, actor) -> MembershipEntry:
    m.sessions_left -= 1
    m.save(update_fields=["sessions_left"])
    return MembershipEntry.objects.create(
        membership=m,
        reason=MembershipEntry.Reason.USED,
        sessions_change=-1,
        sessions_after=m.sessions_left,
        invoice=invoice,
        actor=actor if getattr(actor, "pk", None) else None,
    )


def total_remaining(customer) -> int:
    now = timezone.now()
    total = PackageEntry.objects.filter(
        credit__purchase__customer=customer, credit__purchase__expires_at__gt=now
    ).aggregate(t=Sum("delta"))["t"]
    return total or 0
