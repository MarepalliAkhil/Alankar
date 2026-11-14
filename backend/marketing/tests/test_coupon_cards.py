"""The coupon cards on the payment page, and the owner's demo coupons (seed_demo_coupons)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from accounts.models import User
from core import demo_coupons
from core.models import DemoExtra
from marketing.models import Coupon, CouponRedemption
from marketing.tests.test_coupons_at_payment import apply, due, make_coupon, quote, remove
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import awaiting, catalogue, customer, desk  # noqa: F401

D = Decimal


def cards(client, appt_id, link) -> dict:
    return {c["code"]: c for c in quote(client, appt_id, link)["coupons"]}


# --------------------------------------------------------------------------- the list


def test_only_listed_active_in_date_coupons_are_cards(due, make_user):
    client, _, appt_id, link = due
    today = timezone.localdate()
    make_coupon("SHOWN")
    make_coupon("HIDDEN", listed=False)
    make_coupon("OFF", is_active=False)
    make_coupon("OLD", ends_on=today - timedelta(days=1))
    make_coupon("LATER", starts_on=today + timedelta(days=1))
    make_coupon("MINE", customer=make_user())
    assert list(cards(client, appt_id, link)) == ["SHOWN"]
    # A hidden code still works when typed.
    assert apply(client, appt_id, "HIDDEN", link).status_code == 200


def test_greyed_cards_say_exactly_why(due, catalogue, make_user):
    client, user, appt_id, link = due  # a Rs 300 haircut (Salon)
    make_coupon("MIN500", kind="flat", value=D("50"), min_bill=D("500"))
    spa = make_coupon("SPAONLY", applies_to="chosen", divisions=["spa"])
    make_coupon("PRODS", applies_to="products")
    make_coupon("FIRST", first_visit_only=True)
    used = make_coupon("ONCE", per_customer_limit=1)
    CouponRedemption.objects.create(coupon=used, customer=user, amount=D("10"))
    full = make_coupon("GONE", total_limit=1)
    CouponRedemption.objects.create(coupon=full, customer=make_user(), amount=D("10"))
    Appointment.objects.create(  # a finished visit: no longer a first visit
        **{
            f.name: getattr(Appointment.objects.get(pk=appt_id), f.name)
            for f in Appointment._meta.concrete_fields
            if f.name not in ("id", "status", "created_at", "updated_at")
        },
        status=AppointmentStatus.COMPLETED,
    )
    got = cards(client, appt_id, link)
    assert got["MIN500"]["reason"] == "Add Rs 200 more to use this"
    assert got["SPAONLY"]["reason"] == "Only for Spa services"
    assert got["PRODS"]["reason"] == "Only for products"
    assert got["FIRST"]["reason"] == "First visit only"
    assert got["ONCE"]["reason"] == "You have already used this"
    assert got["GONE"]["reason"] == "Usage limit reached"
    assert not any(c["eligible"] for c in got.values())
    assert got["SPAONLY"]["terms"] == "10% off · Spa services only"
    assert spa.code in got


def test_best_for_you_marks_the_largest_saving_and_tapping_switches(due):
    client, _, appt_id, link = due
    make_coupon("TEN")  # Rs 30 on Rs 300
    make_coupon("FLAT50", kind="flat", value=D("50"))
    got = cards(client, appt_id, link)
    assert got["FLAT50"]["best"] and not got["TEN"]["best"]
    full = quote(client, appt_id, link)["quote"]["total"]

    body = apply(client, appt_id, "TEN", link).json()
    assert body["applied_coupon"] == "TEN"
    assert [c["code"] for c in body["coupons"] if c["applied"]] == ["TEN"]
    # Tapping another card switches: still exactly one coupon.
    body = apply(client, appt_id, "FLAT50", link).json()
    assert body["applied_coupon"] == "FLAT50"
    assert [c["code"] for c in body["coupons"] if c["applied"]] == ["FLAT50"]
    assert D(body["quote"]["total"]) == D(full) - 50
    assert remove(client, appt_id, link).json()["quote"]["total"] == full


def test_the_browser_cannot_send_its_own_discount(due):
    client, _, appt_id, link = due
    make_coupon("TEN")
    response = client.post(
        f"/api/my/appointments/{appt_id}/payment/coupon/",
        {"code": "TEN", "link": link, "saves": "999", "coupon_amount": "999", "total": "1"},
        content_type="application/json",
    )
    assert response.json()["quote"]["coupon_amount"] == "30.00"


# --------------------------------------------------------------------------- demo coupons


@pytest.fixture
def owner(make_user):
    return make_user(role="admin", email=demo_coupons.OWNER_ADMIN, full_name="Owner")


def test_demo_coupons_need_the_owner_admin(db, make_user):
    with pytest.raises(CommandError, match="No account"):
        call_command("seed_demo_coupons", stdout=StringIO())
    make_user(role="customer", email=demo_coupons.OWNER_ADMIN)
    with pytest.raises(CommandError, match="not an admin"):
        call_command("seed_demo_coupons", stdout=StringIO())
    assert not Coupon.objects.exists()


def test_demo_coupons_are_add_only_and_idempotent(owner, catalogue):
    before = User.objects.values().get(pk=owner.pk)
    existing = make_coupon("FLAT100", kind="flat", value=D("75"), listed=True)
    snapshot = Coupon.objects.values().get(pk=existing.pk)

    out = StringIO()
    call_command("seed_demo_coupons", stdout=out)
    assert "skipped (already exist) FLAT100" in out.getvalue()
    made = Coupon.objects.exclude(pk=existing.pk)
    assert sorted(made.values_list("code", flat=True)) == sorted(
        set(demo_coupons.SPECS) - {"FLAT100"}
    )
    assert all(c.created_by_id == owner.pk for c in made)
    assert Coupon.objects.values().get(pk=existing.pk) == snapshot  # never edited
    assert User.objects.values().get(pk=owner.pk) == before  # the admin is only read
    assert DemoExtra.objects.filter(label="marketing.coupon").count() == made.count()

    vip = Coupon.objects.get(code="VIP25")
    assert not vip.listed and vip.per_customer_limit == 1
    welcome = Coupon.objects.get(code="WELCOME10")
    assert welcome.first_visit_only and welcome.max_discount == D("200")
    assert welcome.ends_on == timezone.localdate() + timedelta(days=90)
    assert Coupon.objects.get(code="SPA15").divisions == ["spa"]
    assert list(Coupon.objects.get(code="GLOW200").services.all()) == [catalogue["facial"]]
    assert Coupon.objects.get(code="CARE10").applies_to == "products"

    count = Coupon.objects.count()
    call_command("seed_demo_coupons", stdout=StringIO())
    assert Coupon.objects.count() == count  # the second run adds nothing

    call_command("remove_demo_extras", "--yes", stdout=StringIO())
    assert list(Coupon.objects.values_list("code", flat=True)) == ["FLAT100"]


def test_the_admin_list_shows_who_made_each_demo_coupon(owner, catalogue):
    from django.test import Client

    from conftest import login

    call_command("seed_demo_coupons", stdout=StringIO())
    client = Client()
    assert login(client, owner).status_code == 200
    rows = {r["code"]: r for r in client.get("/api/admin/marketing/coupons/").json()}
    assert rows["VIP25"]["created_by"] == demo_coupons.OWNER_ADMIN
    assert rows["VIP25"]["listed"] is False
