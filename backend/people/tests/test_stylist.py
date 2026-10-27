"""Task 4a: the stylist's own area. What a stylist can see and do, completion with the services
really done, pay estimates, days off and account/profile linking."""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import Invoice
from billing.tests.helpers import bill
from billing.tests.test_invoices_ratings import post
from conftest import login
from core.models import MailOutbox
from people import linking, pay
from people.models import DayOffRequest, Rating, StylistProfile
from scheduling.models import Appointment, AppointmentStatus, Service, VisitCompletion
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    catalogue,
    confirm,
    customer,
    day_at,
    desk,
    payment_token,
    requested,
)
from scheduling.tests.test_booking import (
    pay as pay_online,
)
from website.models import SiteContent

D = Decimal
S = AppointmentStatus


# --------------------------------------------------------------------------- fixtures


def stylist_client(make_user, profile, name="Stylist One"):
    user = make_user(role="stylist", full_name=name)
    profile.user = user
    profile.save()
    client = Client()
    assert login(client, user).status_code == 200
    return client, user


@pytest.fixture
def asha(make_user, catalogue):
    return stylist_client(make_user, catalogue["asha"], "Asha")


@pytest.fixture
def ravi(make_user, catalogue):
    return stylist_client(make_user, catalogue["ravi"], "Ravi")


@pytest.fixture
def admin(logged_in):
    return logged_in("admin")


def booked(customer, desk, cat, *, hour=11, days=3, stylist="asha", addon=False) -> str:
    """A paid, scheduled visit (3 days ahead unless told otherwise)."""
    client, _ = customer
    extra = {"addons": [str(cat["wash"].id)]} if addon else {}
    appt_id = requested(client, cat, start=day_at(days, hour).isoformat(), **extra)
    assert confirm(desk[0], appt_id, cat[stylist], day_at(days, hour)).status_code == 200
    assert pay_online(client, appt_id, link=payment_token(appt_id)).status_code == 200
    return appt_id


def today_at(appt_id, hour=12):
    """Move a visit to today (the stylist's My Day shows today's visits)."""
    start = timezone.localtime().replace(hour=hour, minute=0, second=0, microsecond=0)
    appt = Appointment.objects.get(pk=appt_id)
    Appointment.objects.filter(pk=appt_id).update(
        start=start, end=start + timedelta(minutes=appt.duration_minutes)
    )


def set_status(appt_id, status):
    Appointment.objects.filter(pk=appt_id).update(status=status)


def walk(stylist_pair, appt_id, done=None, note=""):
    """Check in (desk's job, done in the database), then start and complete as the stylist."""
    client = stylist_pair[0]
    set_status(appt_id, S.CHECKED_IN)
    assert post(client, f"/api/stylist/appointments/{appt_id}/start/").status_code == 200
    keys = done if done is not None else ["service"]
    return post(
        client, f"/api/stylist/appointments/{appt_id}/complete/", {"done": keys, "note": note}
    )


def walk_all(stylist_pair, appt_id):
    appt = Appointment.objects.get(pk=appt_id)
    keys = ["service"] + [str(a.id) for a in appt.addons.all()]
    return walk(stylist_pair, appt_id, keys)


def strings_in(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from strings_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)
    elif value is not None:
        yield str(value)


def assert_no_contact_details(payload, customer_pair):
    """Nothing in a stylist response may carry the customer's phone, email or contact keys."""
    _, user = customer_pair
    forbidden = ["priya@example.com", user.email, "9876543210", "98765 43210", "98765"]
    text = " | ".join(strings_in(payload)).lower()
    for item in forbidden:
        assert item.lower() not in text, f"{item} leaked"
    keys = {s.lower() for s in strings_in(payload)}
    assert not {"phone", "email", "contact_phone", "contact_email", "contact_name"} & keys


def rate(appt_id, stars, comment=""):
    row = Rating.objects.get(appointment_id=appt_id)
    row.status = Rating.Status.SUBMITTED
    row.stars = stars
    row.comment = comment
    row.submitted_at = timezone.now()
    row.save()


# --------------------------------------------------------------------------- visibility


def test_my_day_shows_only_my_own_paid_visits_as_cards(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    today_at(appt_id)
    data = asha[0].get("/api/stylist/appointments/").json()
    assert [c["id"] for c in data["results"]] == [appt_id]
    card = data["results"][0]
    assert card["customer_first_name"] == "Priya"
    assert card["service_name"] == "Haircut" and card["room_name"] is None
    assert card["status"] == "scheduled" and card["allergy_alert"] is True
    assert "Customer" not in " ".join(strings_in(card))  # first name only
    assert_no_contact_details(data, customer)


def test_upcoming_and_past_scopes(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)  # 3 days ahead
    upcoming = asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"]
    assert [c["id"] for c in upcoming] == [appt_id]
    assert asha[0].get("/api/stylist/appointments/?scope=past").json()["results"] == []
    assert asha[0].get("/api/stylist/appointments/?scope=nonsense").status_code == 400


def test_a_stylist_never_sees_requests_or_unpaid_visits(catalogue, customer, desk, asha):
    client, _ = customer
    asked = requested(client, catalogue, start=day_at(3, 11).isoformat())
    Appointment.objects.filter(pk=asked).update(stylist=catalogue["asha"])  # even when assigned
    for status in (S.REQUESTED, S.AWAITING_PAYMENT, S.REJECTED, S.PAYMENT_EXPIRED, S.CANCELLED):
        set_status(asked, status)
        today_at(asked)
        assert asha[0].get("/api/stylist/appointments/").json()["results"] == []
        assert asha[0].get("/api/stylist/appointments/?scope=upcoming").json()["results"] == []
        assert asha[0].get(f"/api/stylist/appointments/{asked}/").status_code == 404
        assert post(asha[0], f"/api/stylist/appointments/{asked}/start/").status_code == 404


def test_no_show_visits_are_not_shown(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    set_status(appt_id, S.NO_SHOW)
    assert asha[0].get(f"/api/stylist/appointments/{appt_id}/").status_code == 404


def test_stylist_a_cannot_read_or_act_on_stylist_bs_visit(catalogue, customer, desk, asha, ravi):
    appt_id = booked(customer, desk, catalogue, stylist="ravi")
    today_at(appt_id)
    set_status(appt_id, S.CHECKED_IN)
    mine = asha[0]
    assert mine.get("/api/stylist/appointments/").json()["results"] == []
    assert mine.get(f"/api/stylist/appointments/{appt_id}/").status_code == 404
    assert post(mine, f"/api/stylist/appointments/{appt_id}/start/").status_code == 404
    set_status(appt_id, S.IN_PROGRESS)
    done = post(mine, f"/api/stylist/appointments/{appt_id}/complete/", {"done": ["service"]})
    assert done.status_code == 404
    assert Appointment.objects.get(pk=appt_id).status == S.IN_PROGRESS
    assert not VisitCompletion.objects.exists()
    # the owner can
    assert ravi[0].get(f"/api/stylist/appointments/{appt_id}/").status_code == 200
    assert ravi[0].get("/api/stylist/appointments/").json()["results"][0]["id"] == appt_id


def test_an_unknown_id_looks_the_same_as_someone_elses(asha):
    assert asha[0].get(f"/api/stylist/appointments/{uuid.uuid4()}/").status_code == 404


def test_detail_has_what_the_stylist_needs_and_no_contact_details(catalogue, customer, desk, asha):
    _, user = customer
    profile = user.customer_profile
    profile.preferences = "Quiet please"
    profile.save()
    appt_id = booked(customer, desk, catalogue, hour=11)
    # an earlier completed visit with this stylist, and one with another stylist
    older = Appointment.objects.get(pk=appt_id)
    older.pk = uuid.uuid4()
    older._state.adding = True
    older.status = S.COMPLETED
    older.service_name = "Beard trim"
    older.start = day_at(-20, 11)
    older.save()
    other = Appointment.objects.get(pk=appt_id)
    other.pk = uuid.uuid4()
    other._state.adding = True
    other.status = S.COMPLETED
    other.stylist = catalogue["ravi"]
    other.service_name = "Facial"
    other.start = day_at(-30, 11)
    other.save()
    response = asha[0].get(f"/api/stylist/appointments/{appt_id}/")
    assert response.status_code == 200
    body = response.json()
    assert body["allergies"] == "Ammonia" and "Please be gentle" in body["preferences"]
    assert "Quiet please" in body["preferences"]
    assert [h["service_name"] for h in body["history"]] == ["Beard trim"]
    assert body["booked_services"][0]["key"] == "service"
    assert_no_contact_details(body, customer)


# --------------------------------------------------------------------------- access


@pytest.mark.parametrize("role", ["customer", "receptionist", "admin"])
def test_other_roles_cannot_use_the_stylist_api(logged_in, role):
    client, _ = logged_in(role)
    for path in (
        "/api/stylist/appointments/",
        "/api/stylist/ratings/",
        "/api/stylist/earnings/",
        "/api/stylist/schedule/",
    ):
        assert client.get(path).status_code == 403
    assert post(client, f"/api/stylist/appointments/{uuid.uuid4()}/start/").status_code == 403
    assert post(client, "/api/stylist/days-off/", {}).status_code == 403


def test_guests_are_turned_away(client):
    assert client.get("/api/stylist/appointments/").status_code in (401, 403)


def test_a_stylist_cannot_use_the_desk_or_billing(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    set_status(appt_id, S.CHECKED_IN)
    for method, path in (
        ("get", "/api/desk/appointments/"),
        ("get", "/api/desk/pos/queue/"),
        ("post", "/api/desk/pos/checkout/"),
        ("post", f"/api/desk/appointments/{appt_id}/cancel/"),
        ("post", f"/api/desk/appointments/{appt_id}/check-in/"),
        ("get", "/api/desk/customers/"),
    ):
        assert getattr(asha[0], method)(path).status_code == 403


def test_a_stylist_without_a_linked_profile_gets_a_clear_message(make_user):
    user = make_user(role="stylist")
    client = Client()
    login(client, user)
    response = client.get("/api/stylist/appointments/")
    assert response.status_code == 409 and response.json()["code"] == "not_linked"


# --------------------------------------------------------------------------- start and complete


def test_start_and_complete_follow_the_status(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    base = f"/api/stylist/appointments/{appt_id}"
    # scheduled: neither start nor complete
    assert post(asha[0], f"{base}/start/").status_code == 409
    assert post(asha[0], f"{base}/complete/", {"done": ["service"]}).status_code == 409
    set_status(appt_id, S.CHECKED_IN)
    card = asha[0].get(f"{base}/").json()
    assert card["actions"] == ["start"]
    # checked in: cannot complete before starting
    assert post(asha[0], f"{base}/complete/", {"done": ["service"]}).status_code == 409
    started = post(asha[0], f"{base}/start/")
    assert started.status_code == 200 and started.json()["status"] == "in_progress"
    assert started.json()["actions"] == ["complete"]
    assert post(asha[0], f"{base}/start/").status_code == 409
    done = post(asha[0], f"{base}/complete/", {"done": ["service"], "note": "All good"})
    assert done.status_code == 200 and done.json()["status"] == "completed"
    assert done.json()["actions"] == []
    assert done.json()["completion"]["note"] == "All good"
    assert post(asha[0], f"{base}/complete/", {"done": ["service"]}).status_code == 409
    appt = Appointment.objects.get(pk=appt_id)
    actions = [e.action for e in appt.events.all()][-2:]
    assert actions == ["started", "completed"]
    assert appt.events.last().actor == asha[1]
    assert AuditLog.objects.filter(action="appointment_started", actor=asha[1]).count() == 1
    assert AuditLog.objects.filter(action="appointment_completed", actor=asha[1]).count() == 1


def test_complete_validates_the_services_and_the_note(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue, addon=True)
    set_status(appt_id, S.IN_PROGRESS)
    url = f"/api/stylist/appointments/{appt_id}/complete/"
    addon_id = str(catalogue["wash"].id)
    assert post(asha[0], url, {"done": []}).status_code == 400
    assert post(asha[0], url, {"done": [str(uuid.uuid4())]}).status_code == 400
    assert post(asha[0], url, {"done": ["service", "service"]}).status_code == 400
    assert post(asha[0], url, {"done": ["service"], "note": "x" * 501}).status_code == 400
    assert post(asha[0], url, {}).status_code == 400
    assert not VisitCompletion.objects.exists()
    assert post(asha[0], url, {"done": ["service", addon_id]}).status_code == 200


def test_the_stylist_cannot_take_payment_or_bill(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    assert walk(asha, appt_id).status_code == 200
    body = {"appointment": appt_id, "payments": []}
    assert post(asha[0], "/api/desk/pos/checkout/", body).status_code == 403
    assert post(asha[0], "/api/desk/pos/quote/", body).status_code == 403
    assert not Invoice.objects.exists()


def test_a_completed_visit_waits_at_the_pos_counter_with_the_stylists_note(
    catalogue, customer, desk, asha
):
    appt_id = booked(customer, desk, catalogue, addon=True)
    assert (
        walk(asha, appt_id, ["service"], note="Skipped the wash, guest in a hurry").status_code
        == 200
    )
    ready = desk[0].get("/api/desk/pos/queue/").json()["ready"]
    row = next(r for r in ready if r["id"] == appt_id)
    assert row["status"] == "completed"
    assert row["completion"]["removed"][0]["label"] == "Wash"
    assert row["completion"]["note"] == "Skipped the wash, guest in a hurry"
    assert row["completion"]["done"] == ["Haircut (Short)"]
    context = desk[0].get(f"/api/desk/pos/visits/{appt_id}/").json()
    assert context["visit"]["completion"]["note"].startswith("Skipped")


def test_removing_a_service_changes_the_invoice_and_refunds_the_extra_prepayment(
    catalogue, customer, desk, asha, admin
):
    appt_id = booked(customer, desk, catalogue, addon=True)  # Haircut 300 + Wash 100, paid 400
    walk(asha, appt_id, ["service"], note="no wash")
    quote = post(
        desk[0], "/api/desk/pos/quote/", {"appointment": appt_id, "products": [], "payments": []}
    ).json()
    assert quote["total"] == "300.00" and quote["excess_prepaid"] == "100.00"
    invoice = bill(appt_id)
    assert invoice.total == D("300.00")
    assert invoice.service_changes == "Not done: Wash (Rs. 100.00)"
    assert invoice.items.get().description == "Haircut (Short)"
    shown = desk[0].get(f"/api/desk/invoices/{invoice.id}/").json()
    assert shown["service_changes"] == "Not done: Wash (Rs. 100.00)"
    mail = MailOutbox.objects.filter(kind="invoice").latest("created_at")
    assert "Not done: Wash" in mail.body
    refund = admin[0].get("/api/desk/refunds/").json()
    assert len(refund) == 1 and refund[0]["amount"] == "100.00"
    # the customer sees the change on their own invoice too
    mine = customer[0].get("/api/my/invoices/").json()
    rows = mine["results"] if isinstance(mine, dict) else mine
    assert rows[0]["service_changes"] == "Not done: Wash (Rs. 100.00)"


def test_a_fully_done_visit_bills_the_booked_price(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue, addon=True)
    assert walk_all(asha, appt_id).status_code == 200
    invoice = bill(appt_id)
    assert invoice.total == D("400.00") and invoice.service_changes == ""
    assert Appointment.objects.get(pk=appt_id).status == S.COMPLETED


def test_a_completed_visit_cannot_be_billed_twice(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id)
    again = post(desk[0], "/api/desk/pos/quote/", {"appointment": appt_id, "products": []})
    assert again.status_code == 409
    assert desk[0].get(f"/api/desk/pos/visits/{appt_id}/").status_code == 404


def test_completion_records_cannot_be_changed_or_deleted(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    record = VisitCompletion.objects.get()
    record.note = "edited"
    with pytest.raises(ValueError):
        record.save()
    with pytest.raises(ValueError):
        record.delete()


# --------------------------------------------------------------------------- ratings and pay


@pytest.mark.django_db
def test_the_multiplier_bands_and_the_five_rating_minimum():
    assert pay.multiplier_for(D("4.50")) == D("1.20")
    assert pay.multiplier_for(D("4.49")) == D("1.10")
    assert pay.multiplier_for(D("4.00")) == D("1.10")
    assert pay.multiplier_for(D("3.99")) == D("1.00")
    assert pay.multiplier_for(D("3.50")) == D("1.00")
    assert pay.multiplier_for(D("3.49")) == D("0.90")
    assert pay.multiplier_for(D("3.00")) == D("0.90")
    assert pay.multiplier_for(D("2.99")) == D("0.80")
    few = pay.rating_summary([5, 5, 5, 5])
    assert few["enough"] is False and few["multiplier"] == "1.00" and few["needed"] == 5
    enough = pay.rating_summary([5, 5, 4, 5, 5])
    assert (
        enough["enough"] is True and enough["average"] == "4.80" and enough["multiplier"] == "1.20"
    )
    low = pay.rating_summary([2, 3, 2, 3, 2])
    assert low["multiplier"] == "0.80" and low["flagged"] is True


def test_the_band_table_is_shown_to_the_stylist(asha):
    rules = asha[0].get("/api/stylist/earnings/").json()["rules"]
    assert rules["min_ratings"] == 5
    assert [b["multiplier"] for b in rules["bands"]] == ["1.20", "1.10", "1.00", "0.90", "0.80"]
    assert rules["bands"][0]["label"] == "4.5 and above"
    assert rules["bands"][1]["label"] == "4.0 to 4.49"
    assert rules["bands"][-1]["label"] == "Below 3.0"


def test_earnings_rows_show_payout_multiplier_and_tip(catalogue, customer, desk, asha):
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("120"))
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    assert asha[0].get("/api/stylist/earnings/").json()["tasks"] == []  # not billed yet
    waiting = asha[0].get("/api/stylist/earnings/").json()["waiting_checkout"]
    assert [w["id"] for w in waiting] == [appt_id]
    bill(appt_id, tip="50")
    data = asha[0].get("/api/stylist/earnings/").json()
    assert data["estimated"] is True and data["waiting_checkout"] == []
    row = data["tasks"][0]
    assert row["service"] == "Haircut (Short)"
    assert (row["base_payout"], row["multiplier"], row["payout"], row["tip"]) == (
        "120.00",
        "1.00",
        "120.00",
        "50.00",
    )
    assert row["total"] == "170.00" and data["totals"]["total"] == "170.00"
    rating = data["rating"]
    assert rating["enough"] is False and rating["count"] == 0 and rating["needed"] == 5


def test_not_enough_ratings_keeps_the_multiplier_at_one(catalogue, customer, desk, asha):
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("120"))
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id)
    rate(appt_id, 5, "Wonderful")
    data = asha[0].get("/api/stylist/earnings/").json()
    assert data["rating"]["count"] == 1 and data["rating"]["enough"] is False
    assert data["tasks"][0]["multiplier"] == "1.00" and data["tasks"][0]["payout"] == "120.00"


def test_enough_ratings_apply_the_band_to_the_task_payout_but_not_to_tips(
    catalogue, customer, desk, asha
):
    SiteContent.objects.create(key="pay_rules", value={"min_ratings": 1})
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("120"))
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id, tip="50")
    rate(appt_id, 5)
    row = asha[0].get("/api/stylist/earnings/").json()["tasks"][0]
    assert row["multiplier"] == "1.20" and row["payout"] == "144.00"
    assert row["tip"] == "50.00" and row["total"] == "194.00"


def test_pay_counts_only_the_services_actually_done(catalogue, customer, desk, asha):
    Service.objects.filter(pk=catalogue["haircut"].pk).update(task_payout=D("120"))
    appt_id = booked(customer, desk, catalogue, addon=True)  # 400 booked
    walk(asha, appt_id, ["service"])  # 300 done
    bill(appt_id)
    row = asha[0].get("/api/stylist/earnings/").json()["tasks"][0]
    assert row["base_payout"] == "90.00" and row["partial"] is True  # 120 x 300 / 400


def test_without_a_flat_payout_the_commission_percentage_is_used(catalogue, customer, desk, asha):
    assert catalogue["haircut"].task_payout is None
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id)
    row = asha[0].get("/api/stylist/earnings/").json()["tasks"][0]
    assert row["base_payout"] == "90.00"  # 30% of 300


def test_months_are_separate_and_each_stylist_sees_only_their_own_pay(
    catalogue, customer, desk, asha, ravi
):
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id)
    assert len(asha[0].get("/api/stylist/earnings/").json()["tasks"]) == 1
    assert ravi[0].get("/api/stylist/earnings/").json()["tasks"] == []
    last = (timezone.localdate().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    assert asha[0].get(f"/api/stylist/earnings/?month={last}").json()["tasks"] == []


def test_ratings_are_anonymous(catalogue, customer, desk, asha, ravi):
    appt_id = booked(customer, desk, catalogue)
    walk_all(asha, appt_id)
    bill(appt_id)
    rate(appt_id, 2, "Rushed and late")
    data = asha[0].get("/api/stylist/ratings/").json()
    assert data["count"] == 1 and data["average"] == "2.00" and data["distribution"]["2"] == 1
    assert data["comments"][0]["comment"] == "Rushed and late"
    assert_no_contact_details(data, customer)
    text = " ".join(strings_in(data))
    assert "Priya" not in text and "customer" not in {k.lower() for k in strings_in(data)}
    assert ravi[0].get("/api/stylist/ratings/").json()["count"] == 0


# --------------------------------------------------------------------------- schedule, days off


def future(days):
    return timezone.localdate() + timedelta(days=days)


def ask(client, start, end, reason="Family function"):
    return post(
        client,
        "/api/stylist/days-off/",
        {"start_date": start.isoformat(), "end_date": end.isoformat(), "reason": reason},
    )


def test_schedule_shows_working_hours_and_requests(catalogue, asha):
    data = asha[0].get("/api/stylist/schedule/").json()
    assert [h["day"] for h in data["hours"]] == ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    assert data["hours"][0]["hours"] == ["10:00", "20:00"] and data["hours"][0]["own"] is False
    catalogue["asha"].weekly_hours = {"mon": ["12:00", "18:00"], "tue": None}
    catalogue["asha"].save()
    data = asha[0].get("/api/stylist/schedule/").json()
    assert data["hours"][0] == {"day": "mon", "hours": ["12:00", "18:00"], "own": True}
    assert data["hours"][1] == {"day": "tue", "hours": None, "own": True}


def test_a_stylist_can_ask_for_days_off_and_withdraw(catalogue, asha):
    made = ask(asha[0], future(20), future(22))
    assert made.status_code == 201 and made.json()["status"] == "pending"
    assert AuditLog.objects.filter(action="day_off_requested", actor=asha[1]).count() == 1
    listed = asha[0].get("/api/stylist/schedule/").json()["days_off"]
    assert [r["status"] for r in listed] == ["pending"]
    # the same days again are refused
    assert ask(asha[0], future(21), future(23)).status_code == 409
    gone = post(asha[0], f"/api/stylist/days-off/{made.json()['id']}/withdraw/")
    assert gone.status_code == 200 and gone.json()["status"] == "cancelled"
    assert AuditLog.objects.filter(action="day_off_withdrawn").count() == 1
    assert post(asha[0], f"/api/stylist/days-off/{made.json()['id']}/withdraw/").status_code == 409
    assert ask(asha[0], future(21), future(23)).status_code == 201  # free again


def test_days_off_are_refused_when_visits_are_scheduled(catalogue, customer, desk, asha):
    appt_id = booked(customer, desk, catalogue, days=3, hour=11)
    response = ask(asha[0], future(2), future(4))
    assert response.status_code == 409
    body = response.json()
    assert "reschedule" in body["detail"].lower()
    assert (
        body["visits"][0]["id"] == appt_id and body["visits"][0]["customer_first_name"] == "Priya"
    )
    assert_no_contact_details(body, customer)
    assert not DayOffRequest.objects.exists()
    # once reception moves it away, the days are free
    set_status(appt_id, S.CANCELLED)
    assert ask(asha[0], future(2), future(4)).status_code == 201


def test_another_stylists_visits_do_not_block_my_days_off(catalogue, customer, desk, asha, ravi):
    booked(customer, desk, catalogue, days=3, stylist="ravi")
    assert ask(asha[0], future(2), future(4)).status_code == 201


@pytest.mark.parametrize(
    "start,end,reason",
    [(-1, 1, "In the past"), (5, 4, "Backwards"), (5, 50, "Too long"), (5, 6, "")],
)
def test_bad_days_off_requests_are_refused(asha, start, end, reason):
    assert ask(asha[0], future(start), future(end), reason).status_code == 400


def test_one_stylist_cannot_withdraw_anothers_request(catalogue, asha, ravi):
    made = ask(asha[0], future(20), future(21)).json()
    assert post(ravi[0], f"/api/stylist/days-off/{made['id']}/withdraw/").status_code == 404
    assert [r["id"] for r in ravi[0].get("/api/stylist/schedule/").json()["days_off"]] == []


# --------------------------------------------------------------------------- linking


def test_accepting_a_stylist_invite_creates_a_hidden_linked_profile(logged_in):
    admin_client, _ = logged_in("admin")
    sent = post(
        admin_client,
        "/api/staff/invites/",
        {"full_name": "Neha Rao", "email": "neha@example.com", "role": "stylist"},
    )
    assert sent.status_code == 201
    mail = MailOutbox.objects.filter(to_email="neha@example.com").latest("created_at")
    token = mail.link.split("token=")[1]
    assert StylistProfile.objects.filter(display_name="Neha Rao").count() == 0
    accepted = post(
        Client(), "/api/auth/invite/accept/", {"token": token, "password": "Str0ng-pass-phrase!"}
    )
    assert accepted.status_code == 200, accepted.content
    profile = StylistProfile.objects.get(display_name="Neha Rao")
    assert profile.user.email == "neha@example.com" and profile.is_public is False


def test_a_profile_has_one_account_and_an_account_one_profile(make_user, catalogue):
    one, two = make_user(role="stylist"), make_user(role="stylist")
    catalogue["asha"].user = one
    catalogue["asha"].save()
    # a second profile for the same account is refused by the database
    with pytest.raises(IntegrityError), transaction.atomic():
        StylistProfile.objects.create(display_name="Second", title="x", user=one)
    # a second account on a taken profile is refused by the linking code
    with pytest.raises(linking.LinkError):
        linking.link_existing(two, catalogue["asha"])
    assert catalogue["asha"].user == one
    # an account that already has a used profile cannot take another
    with pytest.raises(linking.LinkError):
        linking.link_existing(one, catalogue["ravi"])
    # linking the same pair again is harmless
    assert linking.link_existing(one, catalogue["asha"]).user == one


def test_linking_replaces_only_an_unused_hidden_profile(make_user, catalogue):
    user = make_user(role="stylist", full_name="New Person")
    auto = linking.link_new_profile(user)
    assert auto.is_public is False
    linked = linking.link_existing(user, catalogue["ravi"])
    assert linked.user == user
    assert not StylistProfile.objects.filter(pk=auto.pk).exists()


def test_link_stylist_command(make_user, catalogue):
    user = make_user(role="stylist", email="rahul@example.com")
    call_command("link_stylist", email="rahul@example.com", profile="asha")
    catalogue["asha"].refresh_from_db()
    assert catalogue["asha"].user == user
    assert AuditLog.objects.filter(action="stylist_linked", target=user).exists()
    other = make_user(role="stylist", email="other@example.com")
    with pytest.raises(CommandError):
        call_command("link_stylist", email=other.email, profile="asha")  # already taken
    with pytest.raises(CommandError):
        call_command("link_stylist", email="nobody@example.com", profile="ravi")
    with pytest.raises(CommandError):
        call_command("link_stylist", email=other.email, profile="no such profile")
    customer_user = make_user(role="customer", email="cust@example.com")
    with pytest.raises(CommandError):
        call_command("link_stylist", email=customer_user.email, profile="ravi")


def test_a_deactivated_stylist_profile_is_not_bookable_but_history_stays(
    catalogue, customer, desk, asha
):
    appt_id = booked(customer, desk, catalogue)
    asha[1].is_active = False
    asha[1].save()
    assert Appointment.objects.get(pk=appt_id).stylist == catalogue["asha"]


def test_the_stylist_menu_lists_the_day_pages_chat_and_earnings():
    import json
    from pathlib import Path

    policy = json.loads(
        (Path(__file__).resolve().parents[3] / "shared" / "policy.json").read_text()
    )
    menu = policy["roles"]["stylist"]["menu"]
    assert [m["label"] for m in menu] == [
        "My Day",
        "My Appointments",
        "My Schedule",
        "Zen Chat",
        "Earnings",
    ]
    assert all(m["status"] == "available" for m in menu)
