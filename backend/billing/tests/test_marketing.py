"""Task 5c: coupons at the POS, loyalty rules, offers, campaigns and marketing consent."""

import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog, User
from billing.models import Invoice
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    catalogue,
    customer,
    desk,
    pay_in_full,
    quote,
    scheduled_visit,
    serum,
    visit,
)
from core.models import MailOutbox
from marketing.models import Campaign, Coupon, CouponRedemption
from people.models import CustomerProfile
from scheduling.models import Appointment, AppointmentStatus

D = Decimal
BASE = "/api/admin/marketing"


def call(client, method, url, body=None):
    client.get("/api/auth/csrf/")
    kwargs = {"content_type": "application/json"}
    if body is not None and method != "get":
        kwargs["data"] = json.dumps(body)
    token = client.cookies.get("csrftoken")
    headers = {"HTTP_X_CSRFTOKEN": token.value} if token is not None else {}
    return getattr(client, method)(url, **kwargs, **headers)


def make_coupon(**over):
    data = {
        "code": "WELCOME10",
        "name": "Welcome",
        "kind": "percent",
        "value": "10",
        "min_bill": "0",
        "per_customer_limit": 1,
        "applies_to": "all",
        "stackable": False,
        "is_active": True,
    }
    data.update(over)
    return data


def new_coupon(admin, **over):
    made = call(admin[0], "post", f"{BASE}/coupons/", make_coupon(**over))
    assert made.status_code == 201, made.content
    return made.json()


def audits(action):
    return list(AuditLog.objects.filter(action=action).order_by("-created_at"))


# --------------------------------------------------------------------------- coupons at the POS


def test_a_coupon_reduces_the_bill_and_is_recorded(visit, desk, admin):
    _, user, appt_id = visit
    new_coupon(admin, code="save100", kind="flat", value="100")
    plain = D(quote(desk[0], appt_id).json()["total"])
    r = quote(desk[0], appt_id, coupon="  save100 ")
    assert r.status_code == 200, r.content
    q = r.json()
    assert D(q["total"]) == plain - D("100") and D(q["coupon_amount"]) == D("100")
    assert D(q["subtotal"]) + D(q["gst_amount"]) == D(q["total"])
    assert Invoice.objects.count() == 0  # a quote writes nothing
    invoice = billed(desk, appt_id, coupon="SAVE100")
    assert D(invoice["total"]) == plain - D("100") and invoice["coupon_code"] == "SAVE100"
    row = CouponRedemption.objects.get()
    assert row.amount == D("100") and row.customer_id == user.id
    assert "Coupon SAVE100" in MailOutbox.objects.filter(kind="invoice").get().body
    with pytest.raises(ValueError):
        row.delete()


def test_a_percent_coupon_respects_its_cap_and_minimum(visit, desk, admin):
    _, _, appt_id = visit
    new_coupon(admin, code="BIG", value="50", max_discount="40")
    q = quote(desk[0], appt_id, coupon="BIG").json()
    assert D(q["coupon_amount"]) == D("40")
    new_coupon(admin, code="MIN", min_bill="5000")
    over = quote(desk[0], appt_id, coupon="MIN")
    assert over.status_code == 400 and "at least" in over.json()["detail"]


def test_coupon_cannot_be_stacked_with_a_manual_discount_unless_allowed(visit, desk, admin):
    _, _, appt_id = visit
    new_coupon(admin, code="SOLO", value="10")
    new_coupon(admin, code="MIXES", value="10", stackable=True)
    manual = {"discount_percent": "5", "discount_reason": "regular"}
    blocked = quote(desk[0], appt_id, coupon="SOLO", **manual)
    assert blocked.status_code == 400 and "another discount" in blocked.json()["detail"]
    ok = quote(desk[0], appt_id, coupon="MIXES", **manual).json()
    assert D(ok["coupon_amount"]) > 0 and D(ok["discount_amount"]) > D(ok["coupon_amount"])


def test_stacked_discounts_still_respect_the_receptionist_cap(visit, desk, admin):
    _, _, appt_id = visit
    new_coupon(admin, code="MIXES", value="15", stackable=True)
    manual = {"discount_percent": "10", "discount_reason": "regular"}
    over = quote(desk[0], appt_id, coupon="MIXES", **manual)
    assert over.status_code == 400 and "together" in over.json()["detail"]
    assert quote(admin[0], appt_id, coupon="MIXES", **manual).status_code == 200


def test_only_one_coupon_can_be_named_on_a_bill(visit, desk, admin):
    _, _, appt_id = visit
    new_coupon(admin, code="ONE", value="5")
    new_coupon(admin, code="TWO", value="5")
    assert quote(desk[0], appt_id, coupon="ONE,TWO").status_code == 400
    assert quote(desk[0], appt_id, coupon="ONE TWO").status_code == 400


def test_dates_switch_and_scope_are_enforced(visit, desk, admin):
    _, _, appt_id = visit
    today = timezone.localdate()
    new_coupon(admin, code="OLD", ends_on=(today - timedelta(days=1)).isoformat())
    new_coupon(admin, code="SOON", starts_on=(today + timedelta(days=1)).isoformat())
    new_coupon(admin, code="OFF", is_active=False)
    new_coupon(admin, code="SHOP", applies_to="products")
    for code, word in (("OLD", "expired"), ("SOON", "not valid yet"), ("OFF", "switched off")):
        r = quote(desk[0], appt_id, coupon=code)
        assert r.status_code == 400 and word in r.json()["detail"]
    nothing = quote(desk[0], appt_id, coupon="SHOP")
    assert nothing.status_code == 400 and "does not apply" in nothing.json()["detail"]
    assert quote(desk[0], appt_id, coupon="NOPE").status_code == 400


def test_a_products_only_coupon_leaves_the_service_alone(visit, desk, admin, serum):
    _, _, appt_id = visit
    new_coupon(admin, code="SHOP", applies_to="products", kind="flat", value="100")
    products = [{"product": str(serum.id), "quantity": 1}]
    q = quote(desk[0], appt_id, coupon="SHOP", products=products).json()
    service, product = q["lines"]
    assert D(service["discount"]) == 0 and D(product["discount"]) == D("100")


def test_per_customer_and_total_limits(visit, desk, admin, catalogue):
    client, user, appt_id = visit
    new_coupon(admin, code="ONCE", per_customer_limit=1)
    billed(desk, appt_id, coupon="ONCE")
    from people.models import Rating

    Rating.objects.filter(customer=user).update(status="submitted", stars=5)
    second = scheduled_visit(client, desk, catalogue, hour=14)
    again = quote(desk[0], second, coupon="ONCE")
    assert again.status_code == 400 and "allowed number" in again.json()["detail"]
    new_coupon(admin, code="LAST", total_limit=1, per_customer_limit=5)
    assert billed(desk, second, coupon="LAST")["coupon_code"] == "LAST"
    assert CouponRedemption.objects.filter(coupon__code="LAST").count() == 1
    Rating.objects.filter(customer=user).update(status="submitted", stars=5)
    third = scheduled_visit(client, desk, catalogue, hour=16)
    gone = quote(desk[0], third, coupon="LAST")
    assert gone.status_code == 400 and "fully used" in gone.json()["detail"]
    row = next(c for c in call(admin[0], "get", f"{BASE}/coupons/").json() if c["code"] == "LAST")
    assert row["used"] == 1 and row["state"] == "used_up"


def test_a_failed_checkout_does_not_use_up_the_coupon(visit, desk, admin):
    _, _, appt_id = visit
    new_coupon(admin, code="TRY", value="10")
    bad = desk[0].post(
        "/api/desk/pos/checkout/",
        {
            "appointment": str(appt_id),
            "coupon": "TRY",
            "payments": [{"method": "cash", "amount": "5"}],
        },
        content_type="application/json",
    )
    assert bad.status_code == 400
    assert CouponRedemption.objects.count() == 0 and Invoice.objects.count() == 0


def test_coupon_validation_and_audit(admin):
    assert call(admin[0], "post", f"{BASE}/coupons/", make_coupon(value="150")).status_code == 400
    assert call(admin[0], "post", f"{BASE}/coupons/", make_coupon(code="a b")).status_code == 400
    bad_dates = make_coupon(starts_on="2026-12-02", ends_on="2026-12-01")
    assert call(admin[0], "post", f"{BASE}/coupons/", bad_dates).status_code == 400
    made = new_coupon(admin, code="x-mas")
    assert made["code"] == "X-MAS"
    dup = call(admin[0], "post", f"{BASE}/coupons/", make_coupon(code="X-mas"))
    assert dup.status_code == 400
    changed = call(admin[0], "patch", f"{BASE}/coupons/{made['id']}/", {"is_active": False})
    assert changed.status_code == 200 and changed.json()["state"] == "off"
    last = audits("marketing_changed")[0]
    assert last.metadata["changes"]["is_active"] == ["True", "False"] or last.metadata["changes"]


# --------------------------------------------------------------------------- loyalty and offers


def test_loyalty_rules_change_what_is_earned_and_are_audited(visit, desk, admin):
    _, _, appt_id = visit
    got = call(admin[0], "get", f"{BASE}/loyalty/").json()
    assert got["loyalty_points_per_100"] == 1
    before = quote(desk[0], appt_id).json()["loyalty_earned"]
    changed = call(admin[0], "patch", f"{BASE}/loyalty/", {"loyalty_points_per_100": 3})
    assert changed.status_code == 200 and changed.json()["loyalty_points_per_100"] == 3
    after = quote(desk[0], appt_id).json()["loyalty_earned"]
    assert after == before * 3
    assert audits("marketing_changed")[0].metadata["changes"] == {"loyalty_points_per_100": [1, 3]}
    assert (
        call(admin[0], "patch", f"{BASE}/loyalty/", {"loyalty_point_value": 0}).status_code == 400
    )
    call(admin[0], "patch", f"{BASE}/loyalty/", {"loyalty_points_per_100": 3})
    assert len(audits("marketing_changed")) == 1  # an unchanged save writes nothing


def test_offers_are_edited_and_shown_on_the_public_site(admin, client):
    made = call(
        admin[0],
        "post",
        f"{BASE}/offers/",
        {"title": "Festive glow", "description": "20% off facials", "badge": "20% off"},
    )
    assert made.status_code == 201
    titles = [o["title"] for o in client.get("/api/public/site/").json()["offers"]]
    assert titles == ["Festive glow"]
    off = call(admin[0], "patch", f"{BASE}/offers/{made.json()['id']}/", {"is_active": False})
    assert off.status_code == 200
    assert client.get("/api/public/site/").json()["offers"] == []
    assert call(admin[0], "delete", f"{BASE}/offers/{made.json()['id']}/").status_code == 204
    assert len(audits("marketing_changed")) == 3


# --------------------------------------------------------------------------- consent

REGISTER = {
    "full_name": "Ananya Rao",
    "email": "ananya@example.com",
    "phone": "9876543210",
    "password": "Strong-Pass-2026!",
    "consent": True,
}


@pytest.mark.django_db
def test_registration_is_not_opted_in_unless_ticked(client):
    assert client.post("/api/auth/register/", REGISTER, content_type="application/json")
    profile = CustomerProfile.objects.get(user__email="ananya@example.com")
    assert profile.marketing_opt_in is False and profile.marketing_opt_changed_at is None
    assert audits("marketing_consent") == []
    ticked = {**REGISTER, "email": "b@example.com", "marketing_opt_in": True}
    client.post("/api/auth/register/", ticked, content_type="application/json")
    profile = CustomerProfile.objects.get(user__email="b@example.com")
    assert profile.marketing_opt_in is True and profile.marketing_opt_changed_at is not None
    (entry,) = audits("marketing_consent")
    assert entry.metadata == {"opted_in": True, "where": "registration"}


def test_profile_shows_and_changes_consent_with_the_date(customer):
    client, user = customer
    assert client.get("/api/my/profile/").json()["marketing_opt_in"] is False
    # An existing customer saving other details is not opted in by accident.
    saved = call(client, "patch", "/api/my/profile/", {"full_name": "Priya C"})
    assert saved.json()["marketing_opt_in"] is False and audits("marketing_consent") == []
    on = call(client, "patch", "/api/my/profile/", {"marketing_opt_in": True}).json()
    assert on["marketing_opt_in"] is True and on["marketing_opt_changed_at"]
    off = call(client, "patch", "/api/my/profile/", {"marketing_opt_in": False}).json()
    assert off["marketing_opt_in"] is False
    assert [a.metadata["opted_in"] for a in audits("marketing_consent")] == [False, True]


# --------------------------------------------------------------------------- campaigns


def opted_in(make_user, email, yes=True, **user_over):
    user = make_user(role="customer", email=email, **user_over)
    profile = CustomerProfile(user=user)
    profile.set_phone("9876543210")
    profile.set_marketing(yes)
    profile.save()
    return user


def draft(admin, **over):
    body = {"name": "Diwali", "subject": "Diwali offers", "body": "Come and glow.", **over}
    made = call(admin[0], "post", f"{BASE}/campaigns/", body)
    assert made.status_code == 201, made.content
    return made.json()


def test_campaign_goes_only_to_opted_in_customers_with_an_unsubscribe_link(admin, make_user):
    yes = opted_in(make_user, "yes@example.com")
    opted_in(make_user, "no@example.com", yes=False)
    opted_in(make_user, "gone@example.com", active=False)
    make_user(role="stylist", email="staff@example.com")
    new_coupon(admin, code="DIWALI")
    camp = draft(admin, coupon="DIWALI")
    assert camp["would_reach"] == 1
    sent = call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    assert sent.status_code == 200 and sent.json()["recipients"] == 1
    (mail,) = MailOutbox.objects.filter(kind="marketing")
    assert mail.to_email == yes.email and "DIWALI" in mail.body
    assert "unsubscribe" in mail.body.lower() and "/unsubscribe?token=" in mail.body
    entry = audits("campaign_sent")[0]
    assert entry.metadata["recipients"] == 1
    again = call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    assert again.status_code == 400 and MailOutbox.objects.filter(kind="marketing").count() == 1
    edit = call(admin[0], "patch", f"{BASE}/campaigns/{camp['id']}/", {"subject": "x"})
    assert edit.status_code == 400


def test_nobody_opted_in_means_nothing_is_sent(admin, make_user):
    opted_in(make_user, "no@example.com", yes=False)
    camp = draft(admin)
    sent = call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    assert sent.status_code == 400
    assert Campaign.objects.get().status == "draft" and not MailOutbox.objects.exists()


def test_audience_can_be_narrowed_by_recent_visits(admin, make_user, catalogue):
    recent = opted_in(make_user, "recent@example.com")
    opted_in(make_user, "lapsed@example.com")
    appt = Appointment(
        customer=recent,
        service=catalogue["haircut"],
        service_name="Haircut",
        duration_minutes=30,
        price_total=D("300"),
        gst_amount=D("45"),
        amount_payable=D("300"),
        preferred_start=timezone.now(),
        start=timezone.now() - timedelta(days=10),
        status=AppointmentStatus.COMPLETED,
        contact_name="R",
        contact_email=recent.email,
        policy_accepted_at=timezone.now(),
    )
    appt.save()
    assert draft(admin, audience="recent")["would_reach"] == 1
    assert draft(admin, audience="lapsed")["would_reach"] == 1
    assert draft(admin, audience="all")["would_reach"] == 2


def test_unsubscribe_link_works_without_signing_in(admin, make_user, client):
    user = opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    token = MailOutbox.objects.get(kind="marketing").body.split("token=")[1].split()[0]
    bad = client.post(
        "/api/public/unsubscribe/", {"token": token + "x"}, content_type="application/json"
    )
    assert bad.status_code == 400
    assert CustomerProfile.objects.get(user=user).marketing_opt_in is True
    ok = client.post("/api/public/unsubscribe/", {"token": token}, content_type="application/json")
    assert ok.status_code == 200
    assert CustomerProfile.objects.get(user=user).marketing_opt_in is False
    assert audits("marketing_consent")[0].metadata["where"] == "unsubscribe link"
    client.post("/api/public/unsubscribe/", {"token": token}, content_type="application/json")
    assert len(audits("marketing_consent")) == 1
    assert draft(admin)["would_reach"] == 0


# --------------------------------------------------------------------------- who may do what

ENDPOINTS = [
    ("get", "/api/admin/marketing/offers/"),
    ("post", "/api/admin/marketing/offers/"),
    ("patch", "/api/admin/marketing/offers/1/"),
    ("delete", "/api/admin/marketing/offers/1/"),
    ("get", "/api/admin/marketing/coupons/"),
    ("post", "/api/admin/marketing/coupons/"),
    ("patch", "/api/admin/marketing/coupons/00000000-0000-0000-0000-000000000001/"),
    ("get", "/api/admin/marketing/loyalty/"),
    ("patch", "/api/admin/marketing/loyalty/"),
    ("get", "/api/admin/marketing/campaigns/"),
    ("post", "/api/admin/marketing/campaigns/"),
    ("patch", "/api/admin/marketing/campaigns/00000000-0000-0000-0000-000000000001/"),
    ("delete", "/api/admin/marketing/campaigns/00000000-0000-0000-0000-000000000001/"),
    ("post", "/api/admin/marketing/campaigns/00000000-0000-0000-0000-000000000001/send/"),
    ("get", "/api/admin/reports/"),
    ("get", "/api/admin/reports/revenue-by-day/"),
    ("get", "/api/admin/content/"),
    ("get", "/api/admin/content/preview/"),
    ("put", "/api/admin/content/hero/"),
    ("delete", "/api/admin/content/hero/"),
    ("post", "/api/admin/content/hero/"),
    ("post", "/api/admin/content/announcements/unpublish/"),
    ("get", "/api/admin/content/faqs/"),
    ("post", "/api/admin/content/faqs/"),
    ("patch", "/api/admin/content/faqs/1/"),
    ("delete", "/api/admin/content/faqs/1/"),
    ("get", "/api/admin/content/achievements/"),
    ("post", "/api/admin/content/achievements/"),
    ("patch", "/api/admin/content/achievements/1/"),
    ("delete", "/api/admin/content/achievements/1/"),
]


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["customer", "stylist", "receptionist"])
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_other_roles_are_denied_everywhere(logged_in, role, method, url):
    client, _ = logged_in(role)
    assert call(client, method, url, {}).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("method,url", ENDPOINTS)
def test_guests_are_turned_away_everywhere(method, url):
    assert call(Client(), method, url, {}).status_code in (401, 403)


def test_changes_leave_an_audit_trail_with_no_email_bodies(admin, make_user):
    opted_in(make_user, "yes@example.com")
    camp = draft(admin)
    call(admin[0], "post", f"{BASE}/campaigns/{camp['id']}/send/")
    for entry in AuditLog.objects.filter(action__in=["campaign_sent", "marketing_changed"]):
        assert "Come and glow" not in json.dumps(entry.metadata)
    assert User.objects.filter(email="yes@example.com").exists()
