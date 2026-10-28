"""Task 6c: payroll runs, adjustments, approval, payslips and who may see what."""

import uuid
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, WorkSession
from billing.tests.test_pos import admin  # noqa: F401
from conftest import login
from people.models import PayrollAdjustment, PayrollItem, PayrollRun, Rating
from people.tests.test_ratings_pay_admin import (  # noqa: F401
    asha,
    catalogue,
    customer,
    desk,
    month,
    rating_id,
    two_rated,
    visit,
)
from people.tests.test_stylist import ravi  # noqa: F401
from scheduling.models import Service

D = Decimal
RUNS = "/api/admin/payroll/runs/"
TZ = timezone.get_current_timezone()


def post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


@pytest.fixture
def receptionist(make_user):
    user = make_user(role="receptionist", full_name="Desk Staff")
    user.hourly_rate = D("200.00")
    user.save()
    day = timezone.localdate().replace(day=1)
    WorkSession.objects.create(
        user=user,
        started_at=datetime.combine(day, time(9), tzinfo=TZ),
        last_seen_at=datetime.combine(day, time(13), tzinfo=TZ),
        ended_at=datetime.combine(day, time(13), tzinfo=TZ),
    )
    client = Client()
    login(client, user)
    if not WorkSession.objects.filter(user=user, ended_at__isnull=True).exists():
        WorkSession.objects.create(
            user=user, started_at=timezone.now(), last_seen_at=timezone.now()
        )
    return client, user


def new_run(admin_pair, mon=None):
    r = post(admin_pair[0], RUNS, {"month": mon or month()})
    assert r.status_code == 201, r.content
    return r.json()


def lines(run):
    return {i["name"]: i for i in run["items"]}


def line_of(run, name):
    return lines(run)[name]


@pytest.fixture
def run(admin, two_rated, receptionist, catalogue):
    return new_run(admin)


# --- generating


def test_the_draft_has_a_line_for_every_stylist_and_receptionist_with_the_formula(run, catalogue):
    asha = line_of(run, catalogue["asha"].display_name)
    # 2 visits x 100 payout x 0.90 (average 3.00) = 180, tips 40
    assert asha["base_pay"] == "180.00" and asha["tips"] == "40.00" and asha["net"] == "220.00"
    desk = line_of(run, "Desk Staff")
    assert desk["base_pay"] == "800.00" and desk["tips"] == "0.00"  # 4 h x 200
    assert run["status"] == "draft" and run["simulated_payment"] is True
    assert run["totals"]["net"] == str(sum(D(i["net"]) for i in run["items"]))


def test_totals_reconcile_with_invoices_and_tips(run):
    checks = run["checks"]
    assert checks["tips_on_invoices"] == checks["tips_in_run"] == "40.00"
    assert checks["invoices_in_month"] == checks["visits_in_run"] == 2
    assert D(run["totals"]["tips"]) == D(checks["tips_on_invoices"])


def test_creating_is_audited_and_one_run_per_month(admin, run):
    assert AuditLog.objects.filter(action="payroll_created").count() == 1
    again = post(admin[0], RUNS, {"month": month()})
    assert again.status_code == 409 and PayrollRun.objects.count() == 1


@pytest.mark.parametrize("bad", ["", "2026", "abc", "2999-01"])
def test_bad_or_future_months_are_refused(admin, two_rated, bad):
    assert post(admin[0], RUNS, {"month": bad}).status_code == 400
    assert PayrollRun.objects.count() == 0


def test_a_month_with_no_staff_cannot_be_drafted(admin):
    assert post(admin[0], RUNS, {"month": month()}).status_code == 400


def test_the_item_detail_keeps_how_the_pay_was_worked_out(admin, run, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    slip = admin[0].get(f"/api/admin/payroll/items/{item['id']}/").json()
    parts = slip["components"]
    assert parts["kind"] == "stylist" and parts["rating"]["multiplier"] == "0.90"
    assert len(parts["tasks"]) == 2 and parts["totals"]["tasks"] == "180.00"
    desk = (
        admin[0]
        .get(f"/api/admin/payroll/items/{line_of(run, 'Desk Staff')['id']}/")
        .json()["components"]
    )
    assert desk["kind"] == "receptionist" and desk["hours"] == "4.00"


# --- adjustments


def adjust(admin, item_id, kind, amount, reason="Festival bonus"):
    return post(
        admin[0],
        f"/api/admin/payroll/items/{item_id}/adjustments/",
        {"kind": kind, "amount": amount, "reason": reason},
    )


def test_adjustments_are_separate_lines_never_merged_into_the_base(admin, run, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    assert adjust(admin, item["id"], "bonus", "100.00", "Festival bonus").status_code == 201
    r = adjust(admin, item["id"], "deduction", "30.00", "Damaged equipment")
    assert r.status_code == 201
    slip = r.json()
    assert slip["base_pay"] == "180.00" and slip["tips"] == "40.00"
    kinds = [(a["kind"], a["amount"], a["reason"]) for a in slip["adjustments"]]
    assert kinds == [
        ("bonus", "100.00", "Festival bonus"),
        ("deduction", "30.00", "Damaged equipment"),
    ]
    assert slip["adjustments_total"] == "70.00" and slip["net"] == "290.00"
    entries = AuditLog.objects.filter(action="payroll_adjusted")
    assert entries.count() == 2 and entries.first().metadata["reason"]


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "bonus", "amount": "0", "reason": "zero"},
        {"kind": "bonus", "amount": "-5", "reason": "negative"},
        {"kind": "gift", "amount": "5", "reason": "wrong kind"},
        {"kind": "bonus", "amount": "5", "reason": ""},
        {"kind": "bonus", "amount": "5", "reason": "no"},
        {"kind": "deduction", "amount": "100000", "reason": "more than the pay"},
    ],
)
def test_bad_adjustments_are_refused(admin, run, catalogue, body):
    item = line_of(run, catalogue["asha"].display_name)
    r = post(admin[0], f"/api/admin/payroll/items/{item['id']}/adjustments/", body)
    assert r.status_code == 400
    assert PayrollAdjustment.objects.count() == 0


def test_a_draft_adjustment_can_be_voided_and_stops_counting_but_stays_visible(
    admin, run, catalogue
):
    item = line_of(run, catalogue["asha"].display_name)
    slip = adjust(admin, item["id"], "bonus", "100.00").json()
    adj = slip["adjustments"][0]["id"]
    r = post(admin[0], f"/api/admin/payroll/adjustments/{adj}/void/", {"reason": "Entered twice"})
    assert r.status_code == 200
    voided = r.json()["adjustments"][0]
    assert voided["voided"] is True and voided["void_reason"] == "Entered twice"
    assert r.json()["net"] == "220.00"
    assert (
        post(
            admin[0], f"/api/admin/payroll/adjustments/{adj}/void/", {"reason": "again"}
        ).status_code
        == 409
    )
    assert AuditLog.objects.filter(action="payroll_adjustment_voided").count() == 1


def test_adjustment_records_cannot_be_edited_or_deleted(admin, run, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    adjust(admin, item["id"], "bonus", "50")
    row = PayrollAdjustment.objects.get()
    row.reason = "changed"
    with pytest.raises(ValueError):
        row.save()
    with pytest.raises(ValueError):
        row.delete()


# --- approve and pay


def test_approving_locks_the_run_and_corrections_are_new_entries(admin, run, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    first = adjust(admin, item["id"], "bonus", "100").json()["adjustments"][0]["id"]
    ok = post(admin[0], f"{RUNS}{run['id']}/approve/")
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    assert ok.json()["approved_by"]
    # cannot approve twice, recalculate, or void an old entry
    assert post(admin[0], f"{RUNS}{run['id']}/approve/").status_code == 409
    assert post(admin[0], f"{RUNS}{run['id']}/refresh/").status_code == 409
    assert (
        post(
            admin[0], f"/api/admin/payroll/adjustments/{first}/void/", {"reason": "oops"}
        ).status_code
        == 409
    )
    # a correction is a new adjustment entry, marked as made after approval
    fix = adjust(admin, item["id"], "deduction", "100", "Bonus was a mistake")
    assert fix.status_code == 201
    entries = fix.json()["adjustments"]
    assert [a["after_approval"] for a in entries] == [False, True]
    assert fix.json()["net"] == "220.00" and fix.json()["locked"] is True
    assert AuditLog.objects.filter(action="payroll_approved").count() == 1


def test_the_calculated_lines_do_not_change_after_approval(admin, run, catalogue, two_rated):
    item = line_of(run, catalogue["asha"].display_name)
    post(admin[0], f"{RUNS}{run['id']}/approve/")
    # an unfair rating is excluded afterwards: the payslip numbers stay as approved
    post(
        admin[0],
        f"/api/admin/ratings/{rating_id(two_rated[1])}/moderate/",
        {"action": "exclude", "reason": "Unfair rating"},
    )
    slip = admin[0].get(f"/api/admin/payroll/items/{item['id']}/").json()
    assert slip["base_pay"] == "180.00" and slip["components"]["rating"]["multiplier"] == "0.90"


def test_a_draft_can_be_recalculated_and_keeps_its_adjustments(admin, run, catalogue, two_rated):
    item = line_of(run, catalogue["asha"].display_name)
    adjust(admin, item["id"], "bonus", "100")
    post(
        admin[0],
        f"/api/admin/ratings/{rating_id(two_rated[1])}/moderate/",
        {"action": "exclude", "reason": "Unfair rating"},
    )
    r = post(admin[0], f"{RUNS}{run['id']}/refresh/")
    assert r.status_code == 200
    again = line_of(r.json(), catalogue["asha"].display_name)
    assert again["base_pay"] == "240.00" and again["adjustments"] == 1  # 2 x 100 x 1.20
    assert AuditLog.objects.filter(action="payroll_refreshed").count() == 1


def test_only_an_approved_run_can_be_marked_paid_and_only_once(admin, run):
    assert post(admin[0], f"{RUNS}{run['id']}/pay/").status_code == 409
    post(admin[0], f"{RUNS}{run['id']}/approve/")
    paid = post(admin[0], f"{RUNS}{run['id']}/pay/", {"reference": "SIM-0001"})
    assert paid.status_code == 200
    body = paid.json()
    assert body["status"] == "paid" and body["payment_reference"] == "SIM-0001"
    assert body["paid_by"] and body["simulated_payment"] is True
    assert post(admin[0], f"{RUNS}{run['id']}/pay/").status_code == 409
    entry = AuditLog.objects.get(action="payroll_paid")
    assert entry.metadata["simulated"] is True and entry.metadata["total"] == body["totals"]["net"]


def test_a_paid_run_takes_no_more_adjustments(admin, run, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    post(admin[0], f"{RUNS}{run['id']}/approve/")
    post(admin[0], f"{RUNS}{run['id']}/pay/")
    assert adjust(admin, item["id"], "bonus", "10").status_code == 409


def test_unknown_ids_are_not_found(admin):
    assert admin[0].get(f"{RUNS}{uuid.uuid4()}/").status_code == 404
    assert post(admin[0], f"{RUNS}{uuid.uuid4()}/approve/").status_code == 404
    assert adjust(admin, uuid.uuid4(), "bonus", "5").status_code == 404
    assert admin[0].get(f"/api/admin/payroll/items/{uuid.uuid4()}/").status_code == 404


def test_the_run_list(admin, run):
    rows = admin[0].get(RUNS).json()
    assert [r["month"] for r in rows] == [month()] and rows[0]["staff"] == 3


# --- payslips: only your own


def test_staff_see_only_their_own_payslip_and_only_after_approval(
    admin, run, asha, ravi, receptionist, catalogue
):
    mine = asha[0].get("/api/payslips/")
    assert mine.status_code == 200 and mine.json() == []  # still a draft
    own = line_of(run, catalogue["asha"].display_name)
    assert asha[0].get(f"/api/payslips/{own['id']}/").status_code == 404
    post(admin[0], f"{RUNS}{run['id']}/approve/")
    listed = asha[0].get("/api/payslips/").json()
    assert len(listed) == 1 and listed[0]["net"] == "220.00"
    slip = asha[0].get(f"/api/payslips/{own['id']}/").json()
    assert slip["net"] == "220.00" and slip["name"] == catalogue["asha"].display_name
    # another stylist, and the receptionist, cannot open it
    assert ravi[0].get(f"/api/payslips/{own['id']}/").status_code == 404
    assert receptionist[0].get(f"/api/payslips/{own['id']}/").status_code == 404
    assert ravi[0].get("/api/payslips/").json() == []
    desk = line_of(run, "Desk Staff")
    assert receptionist[0].get(f"/api/payslips/{desk['id']}/").json()["base_pay"] == "800.00"
    assert asha[0].get(f"/api/payslips/{desk['id']}/").status_code == 404


def test_a_payslip_shows_adjustments_as_their_own_lines(admin, run, asha, catalogue):
    item = line_of(run, catalogue["asha"].display_name)
    adjust(admin, item["id"], "bonus", "100", "Festival bonus")
    post(admin[0], f"{RUNS}{run['id']}/approve/")
    slip = asha[0].get(f"/api/payslips/{item['id']}/").json()
    assert slip["base_pay"] == "180.00"
    assert [(a["kind"], a["amount"]) for a in slip["adjustments"]] == [("bonus", "100.00")]
    assert slip["net"] == "320.00"


def test_customers_and_guests_have_no_payslips(logged_in, client, run):
    assert logged_in("customer")[0].get("/api/payslips/").status_code == 403
    assert client.get("/api/payslips/").status_code in (401, 403)


# --- who may use the admin side

ADMIN_CALLS = [
    ("get", "/api/admin/payroll/runs/"),
    ("post", "/api/admin/payroll/runs/"),
    ("get", "/api/admin/payroll/runs/{run}/"),
    ("post", "/api/admin/payroll/runs/{run}/refresh/"),
    ("post", "/api/admin/payroll/runs/{run}/approve/"),
    ("post", "/api/admin/payroll/runs/{run}/pay/"),
    ("get", "/api/admin/payroll/items/{item}/"),
    ("post", "/api/admin/payroll/items/{item}/adjustments/"),
    ("post", "/api/admin/payroll/adjustments/{adj}/void/"),
]


@pytest.mark.parametrize("method,path", ADMIN_CALLS)
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_every_admin_payroll_endpoint_is_denied_to_other_roles(
    logged_in, admin, run, catalogue, role, method, path
):
    item = line_of(run, catalogue["asha"].display_name)["id"]
    adj = adjust(admin, item, "bonus", "10").json()["adjustments"][0]["id"]
    url = path.format(run=run["id"], item=item, adj=adj)
    client = logged_in(role)[0]
    response = getattr(client, method)(
        url,
        {"month": month(), "kind": "bonus", "amount": "5", "reason": "trying"},
        content_type="application/json",
    )
    assert response.status_code == 403
    run_row = PayrollRun.objects.get()
    assert run_row.status == "draft"
    assert PayrollAdjustment.objects.count() == 1
    assert AuditLog.objects.filter(action__in=["payroll_approved", "payroll_paid"]).count() == 0


@pytest.mark.parametrize("method,path", ADMIN_CALLS)
def test_guests_are_denied_payroll(client, run, method, path):
    url = path.format(run=run["id"], item=uuid.uuid4(), adj=uuid.uuid4())
    assert getattr(client, method)(url).status_code in (401, 403)


def test_a_stylist_cannot_see_the_pay_of_a_colleague_through_the_stylist_api(asha, ravi, run):
    mine = asha[0].get("/api/stylist/earnings/").json()
    assert mine["totals"]["total"] == "220.00"
    assert D(ravi[0].get("/api/stylist/earnings/").json()["totals"]["total"]) == 0
