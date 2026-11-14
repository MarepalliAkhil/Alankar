"""The admin's coupon report (docs/COUPONS.md).

Counts only coupon uses that still stand (a released use, from a cancelled booking, is left out).
"Bookings" are online-paid bookings in the range (paid, then possibly visited); "revenue" is the
money actually taken online for them, so a coupon's discount is never counted as revenue.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from billing.models import Payment
from marketing.models import Coupon, CouponRedemption

ZERO = Decimal("0")


def _day(text: str | None, default: date) -> date:
    try:
        return date.fromisoformat(text) if text else default
    except ValueError:
        return default


def build(params) -> dict:
    today = timezone.localdate()
    start = _day(params.get("from"), today - timedelta(days=29))
    end = _day(params.get("to"), today)
    if end < start:
        start, end = end, start
    tz = timezone.get_current_timezone()
    lo = timezone.make_aware(datetime.combine(start, time.min), tz)
    hi = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz)

    uses = CouponRedemption.objects.filter(
        released_at__isnull=True, created_at__gte=lo, created_at__lt=hi
    )
    per = {
        r["coupon"]: r
        for r in uses.values("coupon").annotate(n=Count("id"), discount=Sum("amount"))
    }
    coupons = Coupon.objects.filter(pk__in=per.keys()).order_by("code")
    rows = [
        {
            "code": c.code,
            "title": c.name,
            "uses": per[c.pk]["n"],
            "discount": str(per[c.pk]["discount"] or ZERO),
        }
        for c in coupons
    ]

    paid = Payment.objects.filter(
        status=Payment.Status.SUCCEEDED,
        kind=Payment.Kind.PREPAYMENT,
        created_at__gte=lo,
        created_at__lt=hi,
    )

    def side(with_coupon: bool) -> dict:
        qs = paid.filter(appointment__prepay_coupon__isnull=not with_coupon)
        agg = qs.aggregate(bookings=Count("appointment", distinct=True), revenue=Sum("amount"))
        return {"bookings": agg["bookings"] or 0, "revenue": str(agg["revenue"] or ZERO)}

    total_discount = sum((Decimal(r["discount"]) for r in rows), ZERO)
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "coupons": rows,
        "total_uses": sum(r["uses"] for r in rows),
        "total_discount": str(total_discount),
        "with_coupon": side(True),
        "without_coupon": side(False),
        "note": "Revenue is the money taken online; the discount is borne by the shop.",
    }
