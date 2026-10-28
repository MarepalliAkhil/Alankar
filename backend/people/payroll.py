"""Payroll: one run per month, with a line for every stylist and receptionist.

Stylist pay is the month's estimate from people.pay (task payout x rating multiplier + tips),
receptionist pay is hours x hourly rate from the work sessions. Generating a run freezes those
numbers into the lines. The admin then adds bonuses and deductions (always with a reason, and
shown on the payslip as separate lines), approves the run (the lines are locked), and marks it
paid (simulated). After approval a correction is a new adjustment entry, never an edit. Statutory
items (PF, ESI, TDS) are outside this prototype.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from accounts import work, work_admin
from accounts.audit import audit
from accounts.models import AuditLog, User
from billing.models import Invoice
from people import pay
from people.models import PayrollAdjustment, PayrollItem, PayrollRun, StylistProfile

ZERO = Decimal("0.00")
Status = PayrollRun.Status


class PayrollError(Exception):
    """`code` is invalid, conflict or not_found."""

    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.code = code


def parse_month(value) -> tuple[int, int]:
    try:
        year, month = (int(part) for part in str(value).split("-"))
        date(year, month, 1)
    except (TypeError, ValueError) as exc:
        raise PayrollError("Choose a month like 2026-10.") from exc
    return year, month


def plain(data):
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


def stylist_profiles(first: datetime, nxt: datetime):
    billed = set(
        Invoice.objects.filter(
            issued_at__gte=first, issued_at__lt=nxt, appointment__stylist__isnull=False
        ).values_list("appointment__stylist_id", flat=True)
    )
    rows = StylistProfile.objects.filter(user__isnull=False).select_related("user")
    return [p for p in rows.order_by("display_name") if p.user.is_active or p.id in billed]


def _line_for_stylist(profile: StylistProfile, first, nxt) -> dict:
    data = pay.earnings(profile, first, nxt)
    totals = data["totals"]
    return {
        "user": profile.user,
        "role": User.Role.STYLIST,
        "name": profile.display_name,
        "base_pay": Decimal(totals["tasks"]),
        "tips": Decimal(totals["tips"]),
        "components": plain(
            {
                "kind": "stylist",
                "rating": data["rating"],
                "rules": data["rules"],
                "tasks": data["tasks"],
                "totals": totals,
                "waiting_checkout": len(data["waiting_checkout"]),
            }
        ),
    }


def _line_for_receptionist(user: User, first, nxt) -> dict:
    data = work_admin.month_pay(user, first, nxt)
    return {
        "user": user,
        "role": User.Role.RECEPTIONIST,
        "name": user.full_name or user.email,
        "base_pay": Decimal(data["pay"]) if data["pay"] is not None else ZERO,
        "tips": ZERO,
        "components": plain(
            {
                "kind": "receptionist",
                **data,
                "rate_missing": data["hourly_rate"] is None,
            }
        ),
    }


def _lines(first, nxt) -> list[dict]:
    lines = [_line_for_stylist(p, first, nxt) for p in stylist_profiles(first, nxt)]
    lines += [_line_for_receptionist(u, first, nxt) for u in work_admin.receptionists(first, nxt)]
    return lines


def _write_lines(run: PayrollRun, lines: list[dict]) -> None:
    for line in lines:
        PayrollItem.objects.update_or_create(
            run=run,
            user=line["user"],
            defaults={
                "role": line["role"],
                "name": line["name"],
                "components": line["components"],
                "base_pay": line["base_pay"],
                "tips": line["tips"],
            },
        )


def create(month_value, *, actor, request=None) -> PayrollRun:
    year, month = parse_month(month_value)
    today = timezone.localdate()
    if (year, month) > (today.year, today.month):
        raise PayrollError("That month has not started yet.")
    first, nxt = work.month_bounds(year, month)
    key = f"{year:04d}-{month:02d}"
    try:
        with transaction.atomic():
            run = PayrollRun.objects.create(month=key, created_by=actor)
            lines = _lines(first, nxt)
            if not lines:
                raise PayrollError("There is no staff to pay yet.")
            _write_lines(run, lines)
            audit(
                AuditLog.Action.PAYROLL_CREATED,
                request=request,
                actor=actor,
                run=str(run.id),
                month=key,
                staff=len(lines),
            )
    except IntegrityError as exc:
        raise PayrollError(f"A payroll run for {key} already exists.", "conflict") from exc
    return run


def _locked(run_id) -> PayrollRun:
    run = PayrollRun.objects.select_for_update().filter(pk=run_id).first()
    if run is None:
        raise PayrollError("Not found.", "not_found")
    return run


def refresh(run_id, *, actor, request=None) -> PayrollRun:
    """Recalculate a draft from the latest visits, ratings and hours. Adjustments are kept."""
    with transaction.atomic():
        run = _locked(run_id)
        if run.status != Status.DRAFT:
            raise PayrollError("Only a draft can be recalculated.", "conflict")
        year, month = parse_month(run.month)
        first, nxt = work.month_bounds(year, month)
        _write_lines(run, _lines(first, nxt))
        audit(
            AuditLog.Action.PAYROLL_REFRESHED,
            request=request,
            actor=actor,
            run=str(run.id),
            month=run.month,
        )
    return run


def adjustments_total(item: PayrollItem) -> Decimal:
    return sum((a.signed for a in item.adjustments.all() if a.voided_at is None), ZERO)


def net(item: PayrollItem) -> Decimal:
    return pay.money(item.base_pay + item.tips + adjustments_total(item))


def add_adjustment(item_id, kind, amount, reason, *, actor, request=None) -> PayrollAdjustment:
    reason = (reason or "").strip()
    if kind not in PayrollAdjustment.Kind.values:
        raise PayrollError("Choose bonus or deduction.")
    amount = pay.money(amount)
    if amount <= 0:
        raise PayrollError("The amount must be more than zero.")
    if len(reason) < 3:
        raise PayrollError("Please give a reason (at least 3 characters).")
    with transaction.atomic():
        found = PayrollItem.objects.select_related("run").filter(pk=item_id).first()
        if found is None:
            raise PayrollError("Not found.", "not_found")
        run = _locked(found.run_id)
        item = (
            PayrollItem.objects.select_for_update().prefetch_related("adjustments").get(pk=item_id)
        )
        if run.status == Status.PAID:
            raise PayrollError(
                "This run is paid. Put the correction in next month's run.", "conflict"
            )
        if kind == PayrollAdjustment.Kind.DEDUCTION and amount > net(item):
            raise PayrollError("A deduction cannot be larger than the pay.")
        adj = PayrollAdjustment.objects.create(
            item=item,
            kind=kind,
            amount=amount,
            reason=reason,
            created_by=actor,
            after_approval=run.status == Status.APPROVED,
        )
        audit(
            AuditLog.Action.PAYROLL_ADJUSTED,
            request=request,
            actor=actor,
            target=item.user,
            run=str(run.id),
            month=run.month,
            kind=kind,
            amount=str(amount),
            reason=reason,
            correction_after_approval=adj.after_approval,
        )
    return adj


def void_adjustment(adj_id, reason, *, actor, request=None) -> PayrollAdjustment:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise PayrollError("Please give a reason (at least 3 characters).")
    with transaction.atomic():
        found = PayrollAdjustment.objects.select_related("item__run").filter(pk=adj_id).first()
        if found is None:
            raise PayrollError("Not found.", "not_found")
        run = _locked(found.item.run_id)
        if run.status != Status.DRAFT:
            raise PayrollError(
                "The run is approved. Add a new adjustment to correct it.", "conflict"
            )
        if found.voided_at is not None:
            raise PayrollError("That adjustment is already voided.", "conflict")
        PayrollAdjustment.objects.filter(pk=found.pk, voided_at__isnull=True).update(
            voided_at=timezone.now(), voided_by=actor, void_reason=reason
        )
        audit(
            AuditLog.Action.PAYROLL_ADJUSTMENT_VOIDED,
            request=request,
            actor=actor,
            target=found.item.user,
            run=str(run.id),
            month=run.month,
            kind=found.kind,
            amount=str(found.amount),
            original_reason=found.reason,
            reason=reason,
        )
    found.refresh_from_db()
    return found


def approve(run_id, *, actor, request=None) -> PayrollRun:
    with transaction.atomic():
        run = _locked(run_id)
        if run.status != Status.DRAFT:
            raise PayrollError("Only a draft can be approved.", "conflict")
        if not run.items.exists():
            raise PayrollError("There are no lines to approve.")
        run.status = Status.APPROVED
        run.approved_by = actor
        run.approved_at = timezone.now()
        run.save(update_fields=["status", "approved_by", "approved_at"])
        total = sum((net(i) for i in run.items.prefetch_related("adjustments")), ZERO)
        audit(
            AuditLog.Action.PAYROLL_APPROVED,
            request=request,
            actor=actor,
            run=str(run.id),
            month=run.month,
            total=str(total),
        )
    return run


def mark_paid(run_id, reference="", *, actor, request=None) -> PayrollRun:
    reference = (reference or "").strip()[:60]
    with transaction.atomic():
        run = _locked(run_id)
        if run.status != Status.APPROVED:
            raise PayrollError("Only an approved run can be marked as paid.", "conflict")
        run.status = Status.PAID
        run.paid_by = actor
        run.paid_at = timezone.now()
        run.payment_reference = reference
        run.save(update_fields=["status", "paid_by", "paid_at", "payment_reference"])
        total = sum((net(i) for i in run.items.prefetch_related("adjustments")), ZERO)
        audit(
            AuditLog.Action.PAYROLL_PAID,
            request=request,
            actor=actor,
            run=str(run.id),
            month=run.month,
            total=str(total),
            reference=reference,
            simulated=True,
        )
    return run


# --------------------------------------------------------------------------- what the screens show


def adjustment_row(a: PayrollAdjustment) -> dict:
    return {
        "id": str(a.id),
        "kind": a.kind,
        "kind_label": a.get_kind_display(),
        "amount": str(a.amount),
        "reason": a.reason,
        "created_at": a.created_at,
        "created_by": a.created_by.full_name if a.created_by_id else "",
        "after_approval": a.after_approval,
        "voided": a.voided_at is not None,
        "void_reason": a.void_reason,
    }


def payslip(item: PayrollItem) -> dict:
    """Base pay, tips and every adjustment as its own line; nothing is merged into the base."""
    run = item.run
    rows = list(item.adjustments.select_related("created_by"))
    return {
        "id": str(item.id),
        "run": {
            "id": str(run.id),
            "month": run.month,
            "status": run.status,
            "status_label": run.get_status_display(),
            "approved_at": run.approved_at,
            "paid_at": run.paid_at,
            "payment_reference": run.payment_reference,
        },
        "name": item.name,
        "role": item.role,
        "base_pay": str(item.base_pay),
        "tips": str(item.tips),
        "adjustments": [adjustment_row(a) for a in rows],
        "adjustments_total": str(adjustments_total(item)),
        "net": str(net(item)),
        "components": item.components,
        "locked": run.status != Status.DRAFT,
    }


def run_view(run: PayrollRun) -> dict:
    items = list(run.items.prefetch_related("adjustments").select_related("user"))
    base = sum((i.base_pay for i in items), ZERO)
    tips = sum((i.tips for i in items), ZERO)
    adj = sum((adjustments_total(i) for i in items), ZERO)
    year, month = parse_month(run.month)
    first, nxt = work.month_bounds(year, month)
    invoice_tips = (
        Invoice.objects.filter(
            issued_at__gte=first, issued_at__lt=nxt, appointment__stylist__isnull=False
        ).aggregate(total=Sum("tip_amount"))["total"]
        or ZERO
    )
    invoices = Invoice.objects.filter(
        issued_at__gte=first, issued_at__lt=nxt, appointment__stylist__isnull=False
    ).count()
    in_pay_visits = sum(len(i.components.get("tasks", [])) for i in items if i.role == "stylist")
    waiting = sum(int(i.components.get("waiting_checkout", 0)) for i in items)
    return {
        "id": str(run.id),
        "month": run.month,
        "status": run.status,
        "status_label": run.get_status_display(),
        "created_at": run.created_at,
        "approved_at": run.approved_at,
        "approved_by": run.approved_by.full_name if run.approved_by_id else "",
        "paid_at": run.paid_at,
        "paid_by": run.paid_by.full_name if run.paid_by_id else "",
        "payment_reference": run.payment_reference,
        "simulated_payment": True,
        "items": [
            {
                "id": str(i.id),
                "name": i.name,
                "role": i.role,
                "base_pay": str(i.base_pay),
                "tips": str(i.tips),
                "adjustments_total": str(adjustments_total(i)),
                "adjustments": sum(1 for a in i.adjustments.all() if a.voided_at is None),
                "net": str(net(i)),
            }
            for i in items
        ],
        "totals": {
            "base_pay": str(pay.money(base)),
            "tips": str(pay.money(tips)),
            "adjustments": str(pay.money(adj)),
            "net": str(pay.money(base + tips + adj)),
        },
        "checks": {
            "tips_on_invoices": str(pay.money(invoice_tips)),
            "tips_in_run": str(
                pay.money(sum((i.tips for i in items if i.role == "stylist"), ZERO))
            ),
            "invoices_in_month": invoices,
            "visits_in_run": in_pay_visits,
            "waiting_checkout": waiting,
        },
    }


def run_row(run: PayrollRun) -> dict:
    items = list(run.items.prefetch_related("adjustments"))
    return {
        "id": str(run.id),
        "month": run.month,
        "status": run.status,
        "status_label": run.get_status_display(),
        "staff": len(items),
        "net": str(pay.money(sum((net(i) for i in items), ZERO))),
        "approved_at": run.approved_at,
        "paid_at": run.paid_at,
    }
