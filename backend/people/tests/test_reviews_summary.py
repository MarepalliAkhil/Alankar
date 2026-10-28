"""Task 6c: rule-based indicators, monthly performance reviews and the Staff Summary."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.tests.test_pos import admin  # noqa: F401
from people.models import PerformanceReview
from people.tests.test_payroll import receptionist  # noqa: F401
from people.tests.test_ratings_pay_admin import (  # noqa: F401
    asha,
    catalogue,
    customer,
    desk,
    month,
    two_rated,
)
from people.tests.test_stylist import ravi  # noqa: F401
from scheduling.models import Appointment, AppointmentEvent, AppointmentStatus

S = AppointmentStatus
D = Decimal
REVIEWS = "/api/admin/reviews/"
SUMMARY = "/api/admin/staff-summary/"


def put(client, url, body):
    return client.put(url, body, content_type="application/json")


def appt(make_user, catalogue, who, *, start, status=S.COMPLETED, email="c@example.com"):
    """A visit created straight in the database for the indicator rules."""
    cust = make_user(role="customer", email=email, full_name=email.split("@")[0])
    service = catalogue["haircut"]
    return Appointment.objects.create(
        customer=cust,
        service=service,
        service_name=service.name,
        duration_minutes=30,
        price_total=D("100"),
        gst_amount=D("18"),
        amount_payable=D("118"),
        preferred_start=start,
        contact_name="C",
        contact_email=email,
        policy_accepted_at=start,
        status=status,
        stylist=who,
        start=start,
        end=start + timedelta(minutes=30),
    )


def mid_month(day=10, hour=11):
    today = timezone.localtime()
    return today.replace(day=1, hour=hour, minute=0, second=0, microsecond=0) + timedelta(
        days=day - 1
    )


def person(admin, name):
    rows = admin[0].get(f"{REVIEWS}?month={month()}").json()["people"]
    return next(p for p in rows if p["name"] == name)


# --- indicators


def test_rebooking_needs_five_customers_then_counts_only_real_repeat_bookings(
    asha, admin, catalogue, make_user
):
    profile = catalogue["asha"]
    for n in range(4):
        appt(make_user, catalogue, profile, start=mid_month(10 + n), email=f"a{n}@example.com")
    row = person(admin, profile.display_name)["indicators"]["rebooking"]
    assert row["enough"] is False and row["label"] == "Not enough data" and row["rate"] is None

    firsts = [
        appt(make_user, catalogue, profile, start=mid_month(2 + n), email=f"b{n}@example.com")
        for n in range(5)
    ]
    # two come back within 60 days (one booked, one finished); one cancelled; one after 60 days
    appt_for = lambda a, **kw: Appointment.objects.create(  # noqa: E731
        customer=a.customer,
        service=a.service,
        service_name=a.service_name,
        duration_minutes=30,
        price_total=D("100"),
        gst_amount=D("18"),
        amount_payable=D("118"),
        preferred_start=a.start,
        contact_name="C",
        contact_email=a.contact_email,
        policy_accepted_at=a.start,
        stylist=a.stylist,
        end=kw["start"] + timedelta(minutes=30),
        **kw,
    )
    appt_for(firsts[0], start=firsts[0].start + timedelta(days=20), status=S.SCHEDULED)
    appt_for(firsts[1], start=firsts[1].start + timedelta(days=59), status=S.COMPLETED)
    appt_for(firsts[2], start=firsts[2].start + timedelta(days=10), status=S.CANCELLED)
    appt_for(firsts[3], start=firsts[3].start + timedelta(days=61), status=S.SCHEDULED)
    row = person(admin, profile.display_name)["indicators"]["rebooking"]
    assert row["enough"] is True and row["customers"] == 9
    assert row["rebooked"] == 2 and row["label"] == ""


def test_cancelled_and_no_show_visits_are_left_out_of_rebooking(asha, admin, catalogue, make_user):
    profile = catalogue["asha"]
    for n in range(5):
        appt(
            make_user,
            catalogue,
            profile,
            start=mid_month(3 + n),
            status=S.NO_SHOW if n % 2 else S.CANCELLED,
            email=f"x{n}@example.com",
        )
    row = person(admin, profile.display_name)["indicators"]["rebooking"]
    assert row["customers"] == 0 and row["enough"] is False


def test_stylist_punctuality_uses_the_first_started_visit_of_each_day(
    asha, admin, catalogue, make_user
):
    profile = catalogue["asha"]
    on_time = appt(make_user, catalogue, profile, start=mid_month(4, 10), email="p1@example.com")
    late = appt(make_user, catalogue, profile, start=mid_month(5, 10), email="p2@example.com")
    for a, delay in ((on_time, 3), (late, 25)):
        ev = AppointmentEvent.objects.create(appointment=a, action="started")
        AppointmentEvent.objects.filter(pk=ev.pk).update(
            created_at=a.start + timedelta(minutes=delay)
        )
    p = person(admin, profile.display_name)["indicators"]["punctuality"]
    assert (p["days"], p["on_time"], p["late"]) == (2, 1, 1)
    assert p["rate"] == "50.0" and p["level"] == "concern"


def test_rating_indicator_ignores_ratings_under_review(asha, admin, catalogue, two_rated):
    first = person(admin, catalogue["asha"].display_name)["indicators"]["rating"]
    assert first["average"] == "3.00" and first["level"] == "watch"


def test_a_receptionist_without_a_shift_says_no_shift_set(admin, receptionist):
    row = person(admin, "Desk Staff")["indicators"]["punctuality"]
    assert row["label"] == "No shift set" and row["rate"] is None and row["level"] == "no_data"


# --- reviews


def test_saving_a_review_keeps_a_snapshot_and_audits_without_the_notes(admin, receptionist):
    user = receptionist[1]
    r = put(
        admin[0],
        f"{REVIEWS}{user.pk}/",
        {"month": month(), "status": "notice", "notes": "Late twice, talked it through"},
    )
    assert r.status_code == 200 and r.json()["status"] == "notice"
    saved = PerformanceReview.objects.get(user=user, month=month())
    assert (
        saved.notes == "Late twice, talked it through" and saved.metrics["kind"] == "receptionist"
    )
    entry = AuditLog.objects.filter(action=AuditLog.Action.REVIEW_SAVED).latest("created_at")
    assert entry.metadata["status_after"] == "notice" and entry.metadata["status_before"] is None
    assert "Late twice" not in str(entry.metadata)


def test_saving_again_updates_the_same_record(admin, receptionist):
    user = receptionist[1]
    url = f"{REVIEWS}{user.pk}/"
    put(admin[0], url, {"month": month(), "status": "continue", "notes": ""})
    put(admin[0], url, {"month": month(), "status": "notice", "notes": "Watching punctuality"})
    assert PerformanceReview.objects.filter(user=user).count() == 1
    history = admin[0].get(url).json()
    assert len(history) == 1 and history[0]["status"] == "notice"
    last = AuditLog.objects.filter(action=AuditLog.Action.REVIEW_SAVED).latest("created_at")
    assert last.metadata["status_before"] == "continue"


@pytest.mark.parametrize(
    "body",
    [
        {"month": "2026-13", "status": "continue", "notes": ""},
        {"month": "nope", "status": "continue", "notes": ""},
        {"month": "{m}", "status": "fire", "notes": "x"},
        {"month": "{m}", "status": "notice", "notes": ""},
        {"month": "{m}", "status": "continue", "notes": "x" * 2001},
    ],
)
def test_bad_reviews_are_refused(admin, receptionist, body):
    body = {**body, "month": body["month"].replace("{m}", month())}
    r = put(admin[0], f"{REVIEWS}{receptionist[1].pk}/", body)
    assert r.status_code == 400
    assert PerformanceReview.objects.count() == 0


def test_a_recommendation_to_end_the_job_does_not_deactivate_anyone(admin, receptionist):
    user = receptionist[1]
    put(
        admin[0],
        f"{REVIEWS}{user.pk}/",
        {"month": month(), "status": "recommend_end", "notes": "See file"},
    )
    user.refresh_from_db()
    assert user.is_active is True


def test_reviews_of_other_roles_or_unknown_people_are_404(admin, make_user):
    cust = make_user(role="customer", email="cu@example.com")
    r = put(admin[0], f"{REVIEWS}{cust.pk}/", {"month": month(), "status": "continue"})
    assert r.status_code == 404


# --- staff summary


def test_staff_summary_revenue_matches_the_reports_page(admin, catalogue, two_rated, receptionist):
    first_noon = timezone.localtime().replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    for n, a in enumerate(Appointment.objects.filter(status=S.COMPLETED)):
        a.start = first_noon + timedelta(minutes=45 * n)
        a.end = a.start + timedelta(minutes=30)
        a.save()
    today = timezone.localdate()
    rep = (
        admin[0]
        .get(f"/api/admin/reports/revenue-by-stylist/?start={today.replace(day=1)}&end={today}")
        .json()
    )
    reported = next(r for r in rep["rows"] if r["name"] == catalogue["asha"].display_name)
    data = admin[0].get(f"{SUMMARY}?month={month()}").json()
    row = next(s for s in data["stylists"] if s["name"] == catalogue["asha"].display_name)
    assert row["kpis"]["revenue"] == reported["revenue"]
    assert row["kpis"]["appointments"] == 2 and row["kpis"]["avg_rating"] is not None
    assert D(data["team"]["kpis"]["revenue"]) >= D(row["kpis"]["revenue"])
    assert data["team"]["kpis"]["payroll_cost"] == str(
        D(data["team"]["kpis"]["stylist_earnings"]) + D(data["team"]["kpis"]["receptionist_pay"])
    )
    assert "Desk Staff" in [r["name"] for r in data["receptionists"]]


def test_staff_summary_series_add_up_to_the_totals(admin, two_rated):
    data = admin[0].get(f"{SUMMARY}?month={month()}").json()
    assert (
        sum(b["appointments"] for b in data["team"]["series"])
        == data["team"]["kpis"]["appointments"]
    )


@pytest.mark.parametrize(
    "query",
    ["month=bad", "start=2026-02-01&end=2026-01-01", "start=2024-01-01&end=2026-01-01", "start=x"],
)
def test_staff_summary_refuses_bad_ranges(admin, query):
    assert admin[0].get(f"{SUMMARY}?{query}").status_code == 400


def test_staff_summary_long_range_switches_to_monthly_buckets(admin):
    today = timezone.localdate()
    start = today - timedelta(days=200)
    data = admin[0].get(f"{SUMMARY}?start={start}&end={today}").json()
    assert data["range"]["bucket"] == "month"


# --- who may use these


CALLS = [
    ("get", SUMMARY),
    ("get", REVIEWS),
    ("get", REVIEWS + "{id}/"),
    ("put", REVIEWS + "{id}/"),
]


@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
@pytest.mark.parametrize("method,url", CALLS)
def test_other_roles_are_denied(logged_in, admin, receptionist, role, method, url):
    client = logged_in(role)[0]
    url = url.replace("{id}", str(receptionist[1].pk))
    r = getattr(client, method)(
        url,
        *([{"month": month(), "status": "continue"}] if method == "put" else []),
        **({"content_type": "application/json"} if method == "put" else {}),
    )
    assert r.status_code == 403


@pytest.mark.parametrize("method,url", CALLS)
def test_guests_are_refused(receptionist, method, url):
    url = url.replace("{id}", str(receptionist[1].pk))
    r = getattr(Client(), method)(url)
    assert r.status_code in (401, 403)


def test_the_staff_member_cannot_read_their_own_review(admin, receptionist):
    user = receptionist[1]
    put(admin[0], f"{REVIEWS}{user.pk}/", {"month": month(), "status": "continue", "notes": ""})
    assert receptionist[0].get(f"{REVIEWS}{user.pk}/").status_code == 403
