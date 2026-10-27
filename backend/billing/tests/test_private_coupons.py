"""Task 5e-2: private coupons - one customer, one use, an expiry."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice
from billing.tests.test_marketing import BASE, call, make_coupon, opted_in
from billing.tests.test_pos import (  # noqa: F401
    admin,
    billed,
    catalogue,
    customer,
    desk,
    quote,
    scheduled_visit,
    serum,
    visit,
)
from conftest import login
from core.models import MailOutbox
from marketing.models import Coupon, CouponRedemption
from people.models import Rating

D = Decimal
URL = f"{BASE}/private-coupons/"


def issue(admin, **over):
    body = {
        "name": "Thank you",
        "prefix": "VIP",
        "kind": "flat",
        "value": "100",
        "ends_on": (timezone.localdate() + timedelta(days=30)).isoformat(),
        **over,
    }
    return call(admin[0], "post", URL, body)


def test_issue_to_chosen_customers_gives_each_a_unique_code_and_emails_only_opted_in(
    admin, make_user
):
    yes = opted_in(make_user, "yes@example.com")
    no = opted_in(make_user, "no@example.com", yes=False)
    r = issue(admin, customers=[str(yes.pk), str(no.pk)])
    assert r.status_code == 201, r.content
    data = r.json()
    assert data["issued"] == 2 and data["emailed"] == 1
    codes = [c["code"] for c in data["coupons"]]
    assert len(set(codes)) == 2 and all(c.startswith("VIP-") for c in codes)
    mail = MailOutbox.objects.get(kind="marketing")
    assert mail.to_email == yes.email
    own = Coupon.objects.get(customer=yes)
    assert own.code in mail.body and own.total_limit == 1 and not own.stackable
    assert Coupon.objects.filter(customer=no).exists()
    entry = AuditLog.objects.get(action="coupons_issued")
    assert entry.metadata["count"] == 2 and entry.metadata["emailed"] == 1


def test_issue_to_a_segment_and_bad_input_is_refused(admin, make_user):
    opted_in(make_user, "a@example.com")
    opted_in(make_user, "b@example.com")
    opted_in(make_user, "c@example.com", yes=False)
    assert issue(admin, segment="all").json()["issued"] == 2
    assert issue(admin).status_code == 400  # nobody chosen
    both = issue(admin, segment="all", customers=["00000000-0000-0000-0000-000000000001"])
    assert both.status_code == 400
    stranger = issue(admin, customers=["00000000-0000-0000-0000-000000000001"])
    assert stranger.status_code == 400
    past = (timezone.localdate() - timedelta(days=1)).isoformat()
    assert issue(admin, segment="all", ends_on=past).status_code == 400
    assert issue(admin, segment="all", kind="percent", value="150").status_code == 400
    assert issue(admin, segment="all", prefix="no way!").status_code == 400


def test_only_the_owner_can_use_it_and_only_once(visit, desk, admin, make_user):
    _, user, appt_id = visit
    other = opted_in(make_user, "other@example.com")
    code = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]["code"]
    q = quote(desk[0], appt_id, coupon=code)
    assert q.status_code == 200 and D(q.json()["coupon_amount"]) == D("100")
    # a coupon issued to somebody else gives the same plain error as a made-up code
    theirs = issue(admin, customers=[str(other.pk)]).json()["coupons"][0]["code"]
    wrong = quote(desk[0], appt_id, coupon=theirs)
    made_up = quote(desk[0], appt_id, coupon="VIP-ZZZZZZZZ")
    assert wrong.status_code == made_up.status_code == 400
    assert wrong.json()["detail"] == made_up.json()["detail"]
    invoice = billed(desk, appt_id, coupon=code)
    assert invoice["coupon_code"] == code and CouponRedemption.objects.count() == 1
    assert Invoice.objects.count() == 1


def test_a_used_private_coupon_cannot_be_used_again(visit, desk, admin, catalogue):
    client, user, appt_id = visit
    code = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]["code"]
    billed(desk, appt_id, coupon=code)
    Rating.objects.filter(customer=user).update(status="submitted", stars=5)
    second = scheduled_visit(client, desk, catalogue, hour=15)
    again = quote(desk[0], second, coupon=code)
    assert again.status_code == 400


def test_an_expired_or_withdrawn_coupon_does_not_work(visit, desk, admin):
    _, user, appt_id = visit
    code = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]["code"]
    Coupon.objects.filter(code=code).update(ends_on=timezone.localdate() - timedelta(days=1))
    assert quote(desk[0], appt_id, coupon=code).status_code == 400
    Coupon.objects.filter(code=code).update(ends_on=timezone.localdate() + timedelta(days=1))
    assert quote(desk[0], appt_id, coupon=code).status_code == 200
    coupon = Coupon.objects.get(code=code)
    out = call(admin[0], "post", f"{URL}{coupon.id}/withdraw/")
    assert out.status_code == 200 and out.json()["state"] == "withdrawn"
    assert quote(desk[0], appt_id, coupon=code).status_code == 400
    assert call(admin[0], "post", f"{URL}{coupon.id}/withdraw/").status_code == 400
    assert AuditLog.objects.filter(action="coupon_revoked").count() == 1


def test_a_used_coupon_cannot_be_withdrawn(visit, desk, admin):
    _, user, appt_id = visit
    made = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]
    billed(desk, appt_id, coupon=made["code"])
    assert call(admin[0], "post", f"{URL}{made['id']}/withdraw/").status_code == 400
    listed = admin[0].get(URL).json()
    assert listed[0]["state"] == "used"


def test_private_coupons_stay_out_of_the_public_coupon_list(admin, make_user):
    user = opted_in(make_user, "yes@example.com")
    issue(admin, customers=[str(user.pk)])
    call(admin[0], "post", f"{BASE}/coupons/", make_coupon())
    shared = admin[0].get(f"{BASE}/coupons/").json()
    assert [c["code"] for c in shared] == ["WELCOME10"]
    assert len(admin[0].get(URL).json()) == 1


def test_a_customer_sees_only_their_own_coupons(admin, make_user):
    mine = opted_in(make_user, "mine@example.com")
    theirs = opted_in(make_user, "theirs@example.com")
    issue(admin, customers=[str(mine.pk)], name="Mine")
    issue(admin, customers=[str(theirs.pk)], name="Theirs")
    client = Client()
    login(client, mine)
    rows = client.get("/api/my/coupons/").json()
    assert [r["name"] for r in rows] == ["Mine"]
    assert "customer_email" not in rows[0] and "customer_id" not in rows[0]
    coupon = Coupon.objects.get(customer=mine)
    call(admin[0], "post", f"{URL}{coupon.id}/withdraw/")
    assert client.get("/api/my/coupons/").json() == []


def test_roles_that_must_not_reach_private_coupons(admin, desk, visit, make_user):
    _, user, _ = visit
    coupon = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]
    withdraw = f"{URL}{coupon['id']}/withdraw/"
    stylist = Client()
    login(stylist, make_user(role="stylist", email="st@example.com"))
    for client in (desk[0], stylist, visit[0], Client()):
        assert call(client, "get", URL).status_code in (401, 403)
        assert call(client, "post", URL, {}).status_code in (401, 403)
        assert call(client, "post", withdraw).status_code in (401, 403)
    for client in (admin[0], desk[0], stylist, Client()):
        if client is admin[0]:
            continue
        assert client.get("/api/my/coupons/").status_code in (401, 403)
    assert admin[0].get("/api/my/coupons/").status_code == 403


def test_anonymizing_stops_the_private_coupons(visit, admin):
    from people import privacy

    client, user, appt_id = visit
    Invoice.objects.count()
    coupon = issue(admin, customers=[str(user.pk)]).json()["coupons"][0]
    exported = privacy.export_data(user)
    assert exported["coupons"][0]["code"] == coupon["code"]
    from scheduling.models import Appointment, AppointmentStatus

    Appointment.objects.filter(pk=appt_id).update(status=AppointmentStatus.CANCELLED)
    privacy.anonymize(user)
    assert Coupon.objects.get(code=coupon["code"]).is_active is False
