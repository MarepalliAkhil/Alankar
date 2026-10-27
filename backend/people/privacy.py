"""Customer data export and anonymizing (the "delete my account" request).

Anonymizing keeps invoices and their amounts (a paid invoice is immutable and the shop must keep its
accounts) but removes everything that identifies the person: name, email, phone, allergies, notes,
chat messages, sign-in and marketing consent. It never runs while the customer has an open visit or
an undecided refund.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from accounts.models import AuditLog, LoginAttempt, LoginLock, User
from accounts.tokens import revoke_all_refresh_tokens
from billing.models import Invoice, Refund
from chat.models import Message
from core.models import MailOutbox
from people.models import CustomerNote, CustomerProfile, LoyaltyEntry, Rating
from scheduling.models import Appointment, AppointmentStatus

DELETED_NAME = "Deleted customer"
EXPORT_DAYS = 7
OPEN = (
    AppointmentStatus.REQUESTED,
    AppointmentStatus.AWAITING_PAYMENT,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
)


class PrivacyError(Exception):
    pass


def blockers(user: User) -> list[str]:
    """Reasons the account cannot be anonymized yet."""
    out = []
    if Appointment.objects.filter(customer=user, status__in=OPEN).exists():
        out.append("The customer still has an open booking. Finish or cancel it first.")
    if Refund.objects.filter(
        payment__appointment__customer=user, status=Refund.Status.PENDING_APPROVAL
    ).exists():
        out.append("A refund for this customer is waiting for a decision.")
    return out


def export_data(user: User) -> dict:
    """Everything the shop holds about the customer, as plain JSON (no staff notes)."""
    profile = CustomerProfile.objects.filter(user=user).first()
    appointments = Appointment.objects.filter(customer=user).order_by("preferred_start")
    invoices = Invoice.objects.filter(customer=user).prefetch_related("items").order_by("issued_at")
    return {
        "generated_at": timezone.now().isoformat(),
        "account": {
            "name": user.full_name,
            "email": user.email,
            "joined": user.date_joined.isoformat(),
        },
        "profile": {
            "phone": profile.phone if profile else "",
            "allergies": profile.allergies if profile else "",
            "preferences": profile.preferences if profile else "",
            "marketing_opt_in": bool(profile and profile.marketing_opt_in),
            "marketing_choice_changed_at": (
                profile.marketing_opt_changed_at.isoformat()
                if profile and profile.marketing_opt_changed_at
                else None
            ),
        },
        "appointments": [
            {
                "service": a.service_name,
                "option": a.variant_label,
                "start": (a.start or a.preferred_start).isoformat(),
                "status": a.status,
                "price": str(a.price_total),
                "notes": a.notes,
            }
            for a in appointments
        ],
        "invoices": [
            {
                "number": i.number,
                "issued_at": i.issued_at.isoformat(),
                "subtotal": str(i.subtotal),
                "gst": str(i.gst_amount),
                "total": str(i.total),
                "discount": str(i.discount_amount),
                "coupon": i.coupon_code,
                "tip": str(i.tip_amount),
                "items": [
                    {
                        "description": it.description,
                        "quantity": it.quantity,
                        "amount": str(it.amount),
                    }
                    for it in i.items.all()
                ],
            }
            for i in invoices
        ],
        "loyalty": [
            {"points": e.points, "reason": e.reason, "at": e.created_at.isoformat()}
            for e in LoyaltyEntry.objects.filter(customer=user)
        ],
        "ratings": [
            {"stars": r.stars, "comment": r.comment, "at": r.submitted_at.isoformat()}
            for r in Rating.objects.filter(customer=user, status=Rating.Status.SUBMITTED)
            if r.submitted_at
        ],
    }


@transaction.atomic
def anonymize(user: User) -> None:
    if user.role != User.Role.CUSTOMER:
        raise PrivacyError("Only customer accounts can be anonymized.")
    problems = blockers(user)
    if problems:
        raise PrivacyError(" ".join(problems))
    old_email = user.email
    placeholder = f"deleted-{user.pk}@deleted.invalid"

    # Immutable rows are changed with queryset updates, and only the personal fields.
    Invoice.objects.filter(customer=user).update(
        customer_name=DELETED_NAME, customer_email=placeholder
    )
    Appointment.objects.filter(customer=user).update(
        contact_name=DELETED_NAME,
        contact_email=placeholder,
        contact_phone="",
        notes="",
        allergies="",
    )
    CustomerNote.objects.filter(customer=user).delete()
    Message.objects.filter(thread__customer=user).delete()
    Rating.objects.filter(customer=user).update(comment="")
    MailOutbox.objects.filter(to_email__iexact=old_email).update(
        to_email=placeholder, subject="[removed]", body="[removed]", link=""
    )
    AuditLog.objects.filter(email__iexact=old_email).update(email=placeholder)
    LoginAttempt.objects.filter(email__iexact=old_email).delete()
    LoginLock.objects.filter(email__iexact=old_email).delete()

    profile = CustomerProfile.objects.filter(user=user).first()
    if profile is not None:
        profile.phone = ""
        profile.phone_index = ""
        profile.allergies = ""
        profile.preferences = ""
        profile.marketing_opt_in = False
        profile.marketing_opt_changed_at = timezone.now()
        profile.save()

    revoke_all_refresh_tokens(user)
    user.full_name = DELETED_NAME
    user.email = placeholder
    user.username = placeholder
    user.is_active = False
    user.set_unusable_password()
    user.save()
