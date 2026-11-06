"""Task 14B: the shop statistics service and API. Fixed data, so every number is checked by hand.

Current period: Mon 2 March to Sun 8 March 2026 (7 days). Previous period: 23 Feb to 1 March.
"""

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing import shopstats
from billing.models import Invoice, InvoiceItem
from conftest import login
from inventory.models import Product, StockMovement
from marketing.models import Coupon, CouponRedemption
from people.models import DayOffRequest, PayrollRun, Rating
from scheduling.models import Appointment, AppointmentEvent, AppointmentStatus
from scheduling.tests.test_booking import catalogue  # noqa: F401
from wallet.models import Sale, SaleRefund
from website.models import SiteContent

D = Decimal
S = AppointmentStatus
URL = "/api/admin/stats/"
RANGE = {"preset": "custom", "from": "2026-03-02", "to": "2026-03-08"}


def at(day: str, hour: int, minute: int = 0) -> datetime:
    y, m, d = (int(x) for x in day.split("-"))
    return timezone.make_aware(datetime(y, m, d, hour, minute), timezone.get_current_timezone())


def query(**params) -> str:
    return URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())


@pytest.fixture
def shop(catalogue, make_user):  # noqa: F811
    """Seven visits, three bills, ratings, sales and requests with known values."""
    SiteContent.objects.update_or_create(
        key="booking",
        defaults={
            "value": {"weekly_hours": {d: ["10:00", "18:00"] for d in shopstats.WEEKDAYS}},
            "is_published": True,
        },
    )
    asha, ravi = catalogue["asha"], catalogue["ravi"]
    # Only these two stylists work in these tests (the demo catalogue has others).
    for other in ("meena", "hidden"):
        catalogue[other].delete()
    c1 = make_user(role="customer", email="c1@example.com", full_name="C One")
    c2 = make_user(role="customer", email="c2@example.com", full_name="C Two")
    c3 = make_user(role="customer", email="c3@example.com", full_name="C Three")
    haircut, facial = catalogue["haircut"], catalogue["facial"]
    counter = {"n": 0}

    def visit(customer, service, stylist, start, minutes, status, *, created=None):
        counter["n"] += 1
        a = Appointment.objects.create(
            customer=customer,
            service=service,
            service_name=service.name,
            duration_minutes=minutes,
            price_total=D("100"),
            gst_amount=D("18"),
            amount_payable=D("118"),
            preferred_start=start,
            contact_name=customer.full_name,
            contact_email=customer.email,
            policy_accepted_at=start,
            status=status,
            stylist=stylist,
            start=start,
            end=start + timedelta(minutes=minutes),
        )
        Appointment.objects.filter(pk=a.pk).update(created_at=created or start - timedelta(days=30))
        return a

    def bill(a, items, subtotal, total, tip, issued):
        counter["n"] += 1
        inv = Invoice.objects.create(
            number=f"T-{counter['n']}",
            appointment=a,
            customer=a.customer,
            customer_name=a.customer.full_name,
            customer_email=a.customer.email,
            subtotal=D(subtotal),
            gst_amount=D(total) - D(subtotal),
            total=D(total),
            tip_amount=D(tip),
            prepaid_amount=D("0"),
            balance_paid=D(total),
            issued_at=issued,
        )
        for kind, text, qty, price in items:
            InvoiceItem.objects.create(
                invoice=inv,
                kind=kind,
                description=text,
                quantity=qty,
                unit_price=D(price),
                amount=D(price) * qty,
            )
        return inv

    # previous period: one 500 bill for c1
    a0 = visit(c1, haircut, asha, at("2026-02-25", 10), 60, S.COMPLETED)
    bill(a0, [("service", "Haircut", 1, "500")], "500", "590", "0", at("2026-02-25", 11))

    a1 = visit(
        c1, haircut, asha, at("2026-03-02", 10), 60, S.COMPLETED, created=at("2026-03-02", 8)
    )
    i1 = bill(a1, [("service", "Haircut", 1, "1000")], "1000", "1180", "50", at("2026-03-02", 11))
    a2 = visit(c2, haircut, asha, at("2026-03-03", 11), 30, S.COMPLETED)
    bill(
        a2,
        [("service", "Haircut", 1, "400"), ("product", "Rose Serum", 2, "100")],
        "600",
        "708",
        "0",
        at("2026-03-03", 12),
    )
    a3 = visit(c3, facial, ravi, at("2026-03-04", 14), 60, S.COMPLETED, created=at("2026-03-04", 8))
    bill(a3, [("service", "Facial", 1, "800")], "800", "944", "100", at("2026-03-04", 15))
    visit(c1, haircut, asha, at("2026-03-05", 10), 30, S.CANCELLED)
    visit(c2, haircut, ravi, at("2026-03-06", 12), 30, S.NO_SHOW)
    visit(c3, haircut, asha, at("2026-03-07", 15), 60, S.SCHEDULED)
    a7 = visit(
        c1, haircut, None, at("2026-03-08", 16), 30, S.DECLINED_BY_STYLIST,
        created=at("2026-03-08", 9),
    )  # fmt: skip
    Appointment.objects.filter(pk=a7.pk).update(start=None, stylist=None)

    # ratings: 5 and 4 count, the 3 is excluded by the admin
    for appt, stars, when, moderation in (
        (a1, 5, "2026-03-02", "active"),
        (a3, 4, "2026-03-04", "active"),
        (a2, 3, "2026-03-03", "excluded"),
    ):
        Rating.objects.create(
            appointment=appt,
            customer=appt.customer,
            stylist=appt.stylist,
            status="submitted",
            stars=stars,
            submitted_at=at(when, 20),
            moderation=moderation,
        )

    # requests: A1 desk 08:30, stylist 09:00; A3 'confirmed' 08:10; A7 stylist declined 09:20
    def event(appt, action, from_status, to_status, when):
        e = AppointmentEvent.objects.create(
            appointment=appt, action=action, from_status=from_status, to_status=to_status
        )
        AppointmentEvent.objects.filter(pk=e.pk).update(created_at=when)

    for appt, when in (
        (a1, "2026-03-02 08:00"),
        (a3, "2026-03-04 08:00"),
        (a7, "2026-03-08 09:00"),
    ):
        day_, hm = when.split()
        event(appt, "requested", "", S.REQUESTED, at(day_, *(int(x) for x in hm.split(":"))))
    event(a1, "reception_accepted", S.REQUESTED, S.REQUESTED, at("2026-03-02", 8, 30))
    event(a1, "stylist_accepted", S.REQUESTED, S.AWAITING_PAYMENT, at("2026-03-02", 9))
    event(a3, "confirmed", S.REQUESTED, S.AWAITING_PAYMENT, at("2026-03-04", 8, 10))
    event(a7, "stylist_declined", S.REQUESTED, S.DECLINED_BY_STYLIST, at("2026-03-08", 9, 20))

    # wallet: package 3000 with 500 refunded, membership 1000
    def sale(kind, amount, when):
        counter["n"] += 1
        s = Sale.objects.create(
            number=f"S-{counter['n']}", kind=kind, channel="pos", method="cash",
            reference=f"ref-{counter['n']}",
            amount=D(amount), description=kind, buyer_name="x", customer=c1,
        )  # fmt: skip
        Sale.objects.filter(pk=s.pk).update(created_at=when)
        return s

    pack = sale("package", "3000", at("2026-03-03", 13))
    SaleRefund.objects.create(sale=pack, amount=D("500"), method="cash", reason="x")
    sale("membership", "1000", at("2026-03-05", 13))

    # coupon used on bill 1
    coupon = Coupon.objects.create(code="TEN", name="Ten", kind="flat", value=D("100"))
    red = CouponRedemption.objects.create(coupon=coupon, invoice=i1, customer=c1, amount=D("100"))
    CouponRedemption.objects.filter(pk=red.pk).update(created_at=at("2026-03-02", 11))

    # stock: one product low (3 left, level 5), one fine
    low = Product.objects.create(sku="LOW", name="Low Oil", unit_price=D("10"), low_stock_level=5)
    ok = Product.objects.create(sku="OK", name="Plenty", unit_price=D("10"), low_stock_level=5)
    StockMovement.objects.create(product=low, delta=3, reason="opening")
    StockMovement.objects.create(product=ok, delta=20, reason="opening")

    # ravi is away Saturday and Sunday
    DayOffRequest.objects.create(
        stylist=ravi, start_date=date(2026, 3, 7), end_date=date(2026, 3, 8),
        reason="x", status="approved",
    )  # fmt: skip
    PayrollRun.objects.create(month="2026-03", status="approved")
    return {"asha": asha, "ravi": ravi}


@pytest.fixture
def stats(shop):
    return shopstats.build(shopstats.resolve_period(RANGE))


def k(stats, key):
    return stats["kpis"][key]


# --------------------------------------------------------------------------- periods


def test_periods_and_the_previous_range():
    today = date(2026, 3, 18)
    one = shopstats.resolve_period({"preset": "today"}, today)
    assert (one["start"], one["end"], one["prev_start"]) == (today, today, date(2026, 3, 17))
    week = shopstats.resolve_period({"preset": "7d"}, today)
    assert (week["start"], week["end"]) == (date(2026, 3, 12), today)
    assert (week["prev_start"], week["prev_end"]) == (date(2026, 3, 5), date(2026, 3, 11))
    month = shopstats.resolve_period({"preset": "month"}, today)
    assert month["start"] == date(2026, 3, 1) and month["days"] == 18
    assert month["prev_end"] == date(2026, 2, 28) and month["prev_start"] == date(2026, 2, 11)
    assert shopstats.resolve_period({"preset": "30d"}, today)["days"] == 30


@pytest.mark.parametrize(
    "params",
    [
        {"preset": "yearly"},
        {"preset": "custom"},
        {"preset": "custom", "from": "2026-03-09", "to": "2026-03-02"},
        {"preset": "custom", "from": "2024-01-01", "to": "2026-03-02"},
        {"preset": "custom", "from": "nope", "to": "2026-03-02"},
    ],
)
def test_bad_periods_are_refused(params):
    with pytest.raises(shopstats.StatsError):
        shopstats.resolve_period(params)


# --------------------------------------------------------------------------- numbers


def test_revenue_streams_add_up_by_hand(stats):
    assert k(stats, "revenue_services")["value"] == "2200.00"  # 1000 + 400 + 800
    assert k(stats, "revenue_products")["value"] == "200.00"  # 2 x 100
    assert k(stats, "revenue_tips")["value"] == "150.00"  # 50 + 0 + 100
    assert k(stats, "revenue_packages")["value"] == "2500.00"  # 3000 - 500 refunded
    assert k(stats, "revenue_memberships")["value"] == "1000.00"
    assert k(stats, "revenue_total")["value"] == "6050.00"
    table = stats["tables"]["revenue_streams"]
    assert [r["revenue"] for r in table["rows"]] == [
        "2200.00",
        "200.00",
        "150.00",
        "2500.00",
        "1000.00",
    ]
    assert table["totals"]["revenue"] == "6050.00"
    assert table["totals"]["previous"] == "500.00"


def test_the_trend_adds_up_to_the_totals_and_has_every_day(stats):
    rows = stats["tables"]["revenue_trend"]["rows"]
    assert [r["date"] for r in rows][0] == "2026-03-02" and len(rows) == 7
    assert sum(D(r["total"]) for r in rows) == D("6050.00")
    by_day = {r["date"]: r for r in rows}
    assert by_day["2026-03-02"]["services"] == "1000.00" and by_day["2026-03-02"]["tips"] == "50.00"
    assert (
        by_day["2026-03-03"]["packages"] == "2500.00"
        and by_day["2026-03-03"]["products"] == "200.00"
    )
    assert by_day["2026-03-06"]["total"] == "0.00"


def test_comparison_with_the_period_before(stats):
    total = k(stats, "revenue_total")
    assert total["previous"] == "500.00" and total["change_pct"] == 1110.0
    assert k(stats, "bookings")["previous"] == 1 and k(stats, "bookings")["change_pct"] == 600.0
    # nothing to compare with: no percentage, never a made-up one
    assert k(stats, "average_rating")["previous"] is None
    assert k(stats, "average_rating")["change_pct"] is None


def test_bookings_by_status_and_per_day(stats):
    assert (k(stats, "bookings")["value"], k(stats, "completed")["value"]) == (7, 3)
    assert (k(stats, "cancelled")["value"], k(stats, "no_show")["value"]) == (1, 1)
    rows = {r["status"]: r["count"] for r in stats["tables"]["bookings_by_status"]["rows"]}
    assert rows == {
        "Scheduled": 1,
        "Completed": 3,
        "Cancelled": 1,
        "No-show": 1,
        "Declined by the stylist": 1,
    }
    days = {r["date"]: r for r in stats["tables"]["bookings_per_day"]["rows"]}
    assert days["2026-03-08"]["total"] == 1  # the declined request is counted on the asked day
    assert sum(r["total"] for r in days.values()) == 7
    assert sum(r["completed"] for r in days.values()) == 3


def test_rating_ignores_excluded_ones(stats):
    assert k(stats, "average_rating")["value"] == 4.5
    assert k(stats, "ratings")["value"] == 2


def test_average_bill_and_customers(stats):
    assert k(stats, "average_bill")["value"] == "944.00"  # (1180 + 708 + 944) / 3
    assert k(stats, "new_customers")["value"] == 2  # c2, c3
    assert k(stats, "returning_customers")["value"] == 1  # c1 was billed last week


def test_utilization(stats):
    rows = {r["name"]: r for r in stats["tables"]["utilization"]["rows"]}
    asha = rows["Asha"]  # 60 + 30 + 60 booked, 7 days x 480
    assert (asha["booked_minutes"], asha["available_minutes"]) == (150, 3360)
    assert asha["utilization_pct"] == 4.5
    ravi = rows["Ravi"]  # 60 booked, Saturday and Sunday off: 5 x 480
    assert (ravi["booked_minutes"], ravi["available_minutes"]) == (60, 2400)
    assert ravi["utilization_pct"] == 2.5
    assert k(stats, "utilization_pct")["value"] == round(210 / 5760 * 100, 1)


def test_request_acceptance_and_response_times(stats):
    req = stats["details"]["requests"]
    assert (req["requests"], req["accepted"], req["declined"], req["expired"]) == (3, 2, 1, 0)
    assert req["acceptance_pct"] == 66.7
    assert req["desk_minutes"] == 20.0  # 30 and 10
    assert req["stylist_minutes"] == 30.0  # 60, 10 and 20
    assert req["decision_minutes"] == 30.0  # 60, 10 and 20
    assert k(stats, "acceptance_pct")["value"] == 66.7


def test_tables(stats):
    t = stats["tables"]
    assert [(r["name"], r["revenue"], r["visits"]) for r in t["revenue_by_service"]["rows"]] == [
        ("Haircut", "1400.00", 2),
        ("Facial", "800.00", 1),
    ]
    assert [
        (r["name"], r["revenue"], r["completed"], r["rating"]) for r in t["top_stylists"]["rows"]
    ] == [
        ("Asha", "1400.00", 2, 5.0),
        ("Ravi", "800.00", 1, 4.0),
    ]
    assert [(r["name"], r["units"], r["revenue"]) for r in t["top_products"]["rows"]] == [
        ("Rose Serum", 2, "200.00")
    ]
    assert [(r["name"], r["stock"]) for r in t["low_stock"]["rows"]] == [("Low Oil", 3)]
    assert [(r["name"], r["uses"], r["given"]) for r in t["coupons"]["rows"]] == [
        ("TEN", 1, "100.00")
    ]
    assert [(r["month"], r["status"]) for r in t["payroll"]["rows"]] == [("2026-03", "Approved")]
    heat = t["busiest_hours"]
    assert heat["totals"]["total"] == 4  # the four booked/completed visits
    assert {r["weekday"]: r["total"] for r in heat["rows"]}["Monday"] == 1


def test_offers(stats):
    offers = stats["details"]["offers"]
    assert offers["coupons"] == {"uses": 1, "given": "100.00"}
    assert (offers["packages"]["sold"], offers["packages"]["net"]) == (1, "2500.00")
    assert (offers["memberships"]["sold"], offers["memberships"]["net"]) == (1, "1000.00")
    assert stats["details"]["revenue_extra"]["bills"] == 3


def test_no_data_is_honest_not_invented(db):
    data = shopstats.build(
        shopstats.resolve_period({"preset": "custom", "from": "2020-01-01", "to": "2020-01-07"})
    )
    assert data["kpis"]["revenue_total"]["value"] == "0.00"
    assert data["kpis"]["revenue_total"]["change_pct"] is None
    for key in (
        "average_bill",
        "average_rating",
        "acceptance_pct",
        "desk_minutes",
        "decision_minutes",
    ):
        assert data["kpis"][key]["value"] is None
    assert data["kpis"]["bookings"]["value"] == 0
    assert data["tables"]["bookings_by_status"]["rows"] == []
    assert data["tables"]["top_stylists"]["rows"] == []
    assert len(data["tables"]["revenue_trend"]["rows"]) == 7


# --------------------------------------------------------------------------- API


def sign_in(user):
    client = Client()
    assert login(client, user).status_code == 200
    return client


def test_admin_reads_the_dashboard_and_exports_csv(shop, make_user):
    admin = sign_in(make_user(role="admin"))
    data = admin.get(query(**RANGE)).json()
    assert data["kpis"]["revenue_total"]["value"] == "6050.00"
    assert data["period"]["previous_from"] == "2026-02-23" and data["generated_at"]
    response = admin.get(query(**RANGE, table="revenue_streams", export="csv"))
    assert response.status_code == 200 and response["Content-Type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(response.content.decode())))
    assert rows[0] == ["Stream", "Revenue (before GST)", "Previous period"]
    assert rows[1] == ["Services", "2200.00", "500.00"] and rows[-1][1] == "6050.00"
    assert AuditLog.objects.filter(action=AuditLog.Action.REPORT_EXPORTED).count() == 1
    assert admin.get(query(**RANGE, table="nope", export="csv")).status_code == 404
    assert admin.get(query(preset="yearly")).status_code == 400
    assert (
        admin.get(query(preset="custom", **{"from": "2026-03-09", "to": "2026-03-02"})).status_code
        == 400
    )


@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_everyone_but_the_admin_is_refused(shop, make_user, role):
    client = sign_in(make_user(role=role))
    assert client.get(query(**RANGE)).status_code == 403
    assert client.get(query(**RANGE, table="revenue_streams", export="csv")).status_code == 403


def test_guests_are_refused(shop):
    assert Client().get(query(**RANGE)).status_code == 401


def test_a_normal_dashboard_does_a_bounded_number_of_queries(
    shop, make_user, django_assert_max_num_queries
):
    admin = sign_in(make_user(role="admin"))
    with django_assert_max_num_queries(70):
        assert admin.get(query(**RANGE)).status_code == 200
