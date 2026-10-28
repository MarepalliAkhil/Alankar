"""The engine's window onto ONE customer's own records.

A `UserTools` is created for the signed-in customer only. Every query is filtered by that
customer; the engine never receives a user id it could swap, and these methods ignore the id they
are given and use the customer they were built for. Money and dates come back as plain text.
"""

from __future__ import annotations

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from billing.models import Invoice
from people.models import LoyaltyEntry
from scheduling.models import Appointment, AppointmentStatus
from wallet import data as wallet_data

S = AppointmentStatus
UPCOMING = (S.REQUESTED, S.AWAITING_PAYMENT, S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS)
PAST = (S.COMPLETED, S.NO_SHOW)
LABEL = dict(AppointmentStatus.choices)


def _when(appt: Appointment) -> str:
    moment = appt.start or appt.preferred_start
    local = timezone.localtime(moment)
    return (
        f"{local:%a %d %b}, {local.hour % 12 or 12}:{local:%M} {'AM' if local.hour < 12 else 'PM'}"
    )


def _row(appt: Appointment) -> dict:
    stylist = appt.stylist.display_name if appt.stylist_id else "a stylist to be confirmed"
    return {
        "service": appt.service_name,
        "stylist": stylist,
        "when": _when(appt),
        "status": LABEL.get(appt.status, appt.status),
    }


class UserTools:
    def __init__(self, user) -> None:
        self.user = user

    def _mine(self):
        return Appointment.objects.filter(customer=self.user).select_related("stylist")

    def next_appointment(self, _user_id=None):
        appt = (
            self._mine()
            .filter(status__in=(S.SCHEDULED, S.CHECKED_IN, S.IN_PROGRESS, S.AWAITING_PAYMENT))
            .filter(Q(start__gte=timezone.now()) | Q(start__isnull=True))
            .order_by("start")
            .first()
        )
        return _row(appt) if appt else None

    def upcoming(self, _user_id=None):
        rows = self._mine().filter(status__in=UPCOMING).order_by("start", "preferred_start")[:5]
        return [_row(a) for a in rows]

    def history(self, _user_id=None):
        rows = self._mine().filter(status__in=PAST).order_by("-start")[:5]
        return [_row(a) for a in rows]

    def invoices(self, _user_id=None):
        rows = (
            Invoice.objects.filter(customer=self.user)
            .select_related("appointment")
            .order_by("-issued_at")[:5]
        )
        return [
            {
                "date": f"{timezone.localtime(i.issued_at):%d %b %Y}",
                "service": i.appointment.service_name if i.appointment_id else "Invoice",
                "total": f"{i.total:.2f}",
                "status": i.get_status_display(),
            }
            for i in rows
        ]

    def loyalty_points(self, _user_id=None):
        return LoyaltyEntry.objects.filter(customer=self.user).aggregate(
            total=Coalesce(Sum("points"), 0)
        )["total"]

    def awaiting_payment(self, _user_id=None):
        rows = self._mine().filter(status=S.AWAITING_PAYMENT).order_by("start")[:3]
        return [{"service": a.service_name, "when": _when(a)} for a in rows]

    # --- wallet: reuse the same data the My Wallet screen shows
    def _wallet(self) -> dict:
        return wallet_data.customer_wallet(self.user)

    def packages(self, _user_id=None):
        out = []
        for p in self._wallet()["packages"]:
            if p["remaining"] <= 0:
                continue
            expires = p.get("expires_at")
            out.append(
                {
                    "name": p["name"],
                    "remaining": p["remaining"],
                    "expires": f"{timezone.localtime(expires):%d %b %Y}" if expires else "",
                }
            )
        return out

    def membership(self, _user_id=None):
        m = self._wallet()["membership"]
        if not m:
            return None
        return {
            "plan": m["plan_name"],
            "status": m["status_label"],
            "until": f"{timezone.localtime(m['period_end']):%d %b %Y}",
            "sessions_left": m["sessions_left"] if m["included_sessions"] else None,
        }

    def gift_cards(self, _user_id=None):
        return [
            {"last4": c["last4"], "balance": c["usable_balance"]}
            for c in self._wallet()["gift_cards"]
            if c["status"] == "active" and not c["expired"]
        ]
