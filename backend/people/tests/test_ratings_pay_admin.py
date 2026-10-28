"""Task 6a: admin ratings overview and moderation, and the admin stylist-pay breakdown."""

import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice
from billing.tests.helpers import bill
from billing.tests.test_pos import admin  # noqa: F401
from people.models import Rating
from people.tests.test_stylist import (  # noqa: F401
    asha,
    booked,
    catalogue,
    customer,
    desk,
    rate,
    ravi,
    strings_in,
    walk_all,
)
from scheduling.models import Service
from website.models import SiteContent

D = Decimal
BASE = "/api/admin"


def post(client, url, body=None):
    return client.post(url, body or {}, content_type="application/json")


def visit(customer, desk, catalogue, asha, *, hour, stars=None, comment="", tip="0"):
    """A finished, billed visit with Asha; rated when stars are given."""
    appt_id = booked(customer, desk, catalogue, hour=hour)
    walk_all(asha, appt_id)
    bill(appt_id, tip=tip)
    if stars:
        rate(appt_id, stars, comment)
    return appt_id


@pytest.fixture
def two_rated(catalogue, customer, desk, asha):
    """Asha has two rated visits: 5 stars (praise) and 1 star (rude comment)."""
    SiteContent.objects.create(key="pay_rules", value={"min_ratings": 1})
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("100"))
    good = visit(customer, desk, catalogue, asha, hour=10, stars=5, comment="Lovely", tip="40")
    bad = visit(customer, desk, catalogue, asha, hour=14, stars=1, comment="Abusive rant", tip="0")
    return good, bad


def rating_id(appt_id):
    return str(Rating.objects.get(appointment_id=appt_id).pk)


def month():
    return timezone.localdate().strftime("%Y-%m")


# --------------------------------------------------------------------------- overview


def test_overview_has_average_count_and_trend_per_stylist(catalogue, admin, two_rated):
    rows = admin[0].get(f"{BASE}/ratings/").json()
    asha_row = next(r for r in rows if r["name"] == catalogue["asha"].display_name)
    assert asha_row["count"] == 2 and asha_row["average"] == "3.00"
    assert asha_row["under_review"] == 0 and asha_row["excluded"] == 0
    assert asha_row["trend"][-1]["count"] == 2 and "direction" in asha_row


def test_admin_sees_comments_with_customer_names(catalogue, customer, admin, two_rated):
    data = admin[0].get(f"{BASE}/ratings/stylists/{catalogue['asha'].pk}/").json()
    assert data["count"] == 2 and data["distribution"]["1"] == 1
    texts = {r["comment"]: r for r in data["ratings"]}
    assert texts["Abusive rant"]["customer"] == customer[1].full_name
    assert texts["Abusive rant"]["moderation"] == "active"
    only = admin[0].get(f"{BASE}/ratings/stylists/{catalogue['asha'].pk}/?moderation=excluded")
    assert only.json()["ratings"] == []


# --------------------------------------------------------------------------- moderation


def test_flagging_hides_it_from_the_stylist_and_the_pay_without_changing_the_rating(
    catalogue, admin, asha, two_rated
):
    good, bad = two_rated
    before = asha[0].get("/api/stylist/earnings/").json()
    assert before["rating"]["average"] == "3.00" and before["rating"]["multiplier"] == "0.90"
    r = post(
        admin[0],
        f"{BASE}/ratings/{rating_id(bad)}/moderate/",
        {"action": "flag", "reason": "Abusive language"},
    )
    assert r.status_code == 200 and r.json()["moderation"] == "under_review"
    stored = Rating.objects.get(appointment_id=bad)
    assert stored.stars == 1 and stored.comment == "Abusive rant"  # original stays
    seen = asha[0].get("/api/stylist/ratings/").json()
    assert seen["count"] == 1 and seen["average"] == "5.00" and seen["under_review"] == 1
    text = " ".join(strings_in(seen))
    assert "Abusive" not in text and "rant" not in text  # no comment, reason or customer
    assert "Priya" not in text
    after = asha[0].get("/api/stylist/earnings/").json()
    assert after["rating"]["multiplier"] == "1.20"
    entry = AuditLog.objects.get(action="rating_flagged")
    assert entry.metadata["original_stars"] == 1 and entry.metadata["reason"] == "Abusive language"
    assert entry.actor_id == admin[1].pk


def test_excluding_looks_the_same_to_the_stylist_and_can_be_restored(
    catalogue, admin, asha, two_rated
):
    _, bad = two_rated
    url = f"{BASE}/ratings/{rating_id(bad)}/moderate/"
    assert (
        post(admin[0], url, {"action": "exclude", "reason": "Not about the service"}).status_code
        == 200
    )
    seen = asha[0].get("/api/stylist/ratings/").json()
    assert seen["under_review"] == 1 and seen["count"] == 1
    assert "excluded" not in " ".join(strings_in(seen)).lower()
    row = admin[0].get(f"{BASE}/ratings/").json()[0]
    assert row["excluded"] == 1 and row["count"] == 1
    assert (
        post(admin[0], url, {"action": "restore", "reason": "Reviewed, it counts"}).status_code
        == 200
    )
    assert asha[0].get("/api/stylist/ratings/").json()["count"] == 2
    actions = list(
        AuditLog.objects.filter(action__startswith="rating_").values_list("action", flat=True)
    )
    assert sorted(actions) == ["rating_excluded", "rating_restored"]
    assert Rating.objects.get(appointment_id=bad).stars == 1


def test_bad_moderation_requests_are_refused(admin, two_rated):
    good, _ = two_rated
    url = f"{BASE}/ratings/{rating_id(good)}/moderate/"
    assert post(admin[0], url, {"action": "flag", "reason": "no"}).status_code == 400
    assert post(admin[0], url, {"action": "delete", "reason": "remove it"}).status_code == 400
    assert (
        post(admin[0], url, {"action": "restore", "reason": "nothing to restore"}).status_code
        == 400
    )
    assert post(admin[0], url, {"action": "flag", "reason": "first flag"}).status_code == 200
    assert post(admin[0], url, {"action": "flag", "reason": "second flag"}).status_code == 400
    missing = post(
        admin[0], f"{BASE}/ratings/{uuid.uuid4()}/moderate/", {"action": "flag", "reason": "xxxxx"}
    )
    assert missing.status_code == 404


def test_a_rating_that_is_not_submitted_yet_cannot_be_moderated(
    catalogue, customer, desk, asha, admin
):
    appt_id = visit(customer, desk, catalogue, asha, hour=10)
    r = post(
        admin[0],
        f"{BASE}/ratings/{rating_id(appt_id)}/moderate/",
        {"action": "flag", "reason": "too early"},
    )
    assert r.status_code == 404


def test_ratings_still_cannot_be_deleted_or_edited(two_rated):
    row = Rating.objects.get(appointment_id=two_rated[1])
    with pytest.raises(ValueError):
        row.delete()
    row.stars = 5
    with pytest.raises(ValueError):
        row.save()


# --------------------------------------------------------------------------- stylist pay


def test_pay_breakdown_matches_the_formula_with_fixed_data(catalogue, admin, two_rated):
    data = admin[0].get(f"{BASE}/pay/stylists/{catalogue['asha'].pk}/?month={month()}").json()
    assert data["rating"]["average"] == "3.00" and data["rating"]["multiplier"] == "0.90"
    rows = {r["stars"]: r for r in data["tasks"]}
    assert rows[5]["base_payout"] == "100.00" and rows[5]["payout"] == "90.00"
    assert rows[5]["tip"] == "40.00" and rows[5]["total"] == "130.00"
    assert rows[1]["payout"] == "90.00" and rows[1]["tip"] == "0.00"
    assert rows[1]["rating_state"] == "counted" and rows[5]["invoice"].startswith(
        Invoice.objects.first().number[:3]
    )
    assert data["totals"] == {"tasks": "180.00", "tips": "40.00", "total": "220.00"}


def test_excluding_a_rating_changes_the_multiplier_in_the_breakdown(catalogue, admin, two_rated):
    _, bad = two_rated
    post(
        admin[0],
        f"{BASE}/ratings/{rating_id(bad)}/moderate/",
        {"action": "exclude", "reason": "Unfair"},
    )
    data = admin[0].get(f"{BASE}/pay/stylists/{catalogue['asha'].pk}/?month={month()}").json()
    assert data["rating"]["multiplier"] == "1.20"
    held = [r for r in data["tasks"] if r["rating_state"] == "held"]
    assert len(held) == 1 and held[0]["stars"] == 1
    assert data["totals"]["tasks"] == "240.00"  # 2 x 100 x 1.20


def test_not_enough_ratings_means_one_in_the_admin_view_too(catalogue, customer, desk, asha, admin):
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("100"))
    visit(customer, desk, catalogue, asha, hour=10, stars=5)
    data = admin[0].get(f"{BASE}/pay/stylists/{catalogue['asha'].pk}/?month={month()}").json()
    assert data["rating"]["enough"] is False and data["tasks"][0]["multiplier"] == "1.00"


def test_month_list_totals_reconcile_with_invoices_and_tips(catalogue, admin, two_rated):
    data = admin[0].get(f"{BASE}/pay/stylists/?month={month()}").json()
    assert data["estimated"] is True and data["totals"]["invoices"] == 2
    assert data["reconciliation"]["difference"] == "0.00"
    assert data["reconciliation"]["tips_on_invoices"] == "40.00"
    asha_row = next(s for s in data["stylists"] if s["id"] == str(catalogue["asha"].pk))
    assert asha_row["total"] == "220.00"
    assert sum(D(s["total"]) for s in data["stylists"]) == D(data["totals"]["total"])
    last = admin[0].get(f"{BASE}/pay/stylists/?month=2020-01").json()
    assert last["totals"]["invoices"] == 0


# --------------------------------------------------------------------------- who may

URLS = [
    ("get", "/ratings/"),
    ("get", "/ratings/stylists/{id}/"),
    ("post", "/ratings/{id}/moderate/"),
    ("get", "/pay/stylists/"),
    ("get", "/pay/stylists/{id}/"),
]


@pytest.mark.parametrize("method,path", URLS)
@pytest.mark.parametrize("role", ["customer", "receptionist", "stylist"])
def test_other_roles_are_denied(logged_in, two_rated, catalogue, role, method, path):
    client = logged_in(role)[0]
    url = BASE + path.format(id=catalogue["asha"].pk)
    body = {"action": "flag", "reason": "trying it"}
    response = getattr(client, method)(url, body, content_type="application/json")
    assert response.status_code == 403
    assert Rating.objects.exclude(moderation="active").count() == 0
    assert AuditLog.objects.filter(action__startswith="rating_").count() == 0


@pytest.mark.parametrize("method,path", URLS)
def test_guests_are_denied(client, catalogue, method, path):
    url = BASE + path.format(id=catalogue["asha"].pk)
    assert getattr(client, method)(url).status_code in (401, 403)


def test_a_stylist_cannot_reach_another_stylists_pay_or_ratings(asha, ravi, catalogue, two_rated):
    for url in (
        f"{BASE}/pay/stylists/{catalogue['asha'].pk}/",
        f"{BASE}/ratings/stylists/{catalogue['asha'].pk}/",
    ):
        assert ravi[0].get(url).status_code == 403
    assert ravi[0].get("/api/stylist/ratings/").json()["count"] == 0
