"""Task 2b: booking request -> confirm -> payment link -> mock payment, per role."""

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.db import connection
from django.test import Client
from django.utils import timezone

from billing.models import Payment, PaymentLink, Refund
from conftest import PASSWORD, login
from core.models import MailOutbox
from people.models import CustomerProfile, StylistProfile
from scheduling.models import (
    Appointment,
    AppointmentStatus,
    Room,
    Service,
    ServiceAddon,
    ServiceCategory,
    ServiceVariant,
)

S = AppointmentStatus


# --------------------------------------------------------------------------- fixtures


@pytest.fixture
def catalogue(db):
    salon = ServiceCategory.objects.create(division="salon", name="Hair", slug="salon-hair")
    parlor = ServiceCategory.objects.create(
        division="beauty-parlor", name="Skin", slug="parlor-skin"
    )
    haircut = Service.objects.create(
        category=salon, name="Haircut", slug="haircut", summary="Cut", price=Decimal("300")
    )
    short = ServiceVariant.objects.create(
        service=haircut, label="Short", price=Decimal("300"), duration_minutes=30
    )
    long = ServiceVariant.objects.create(
        service=haircut, label="Long", price=Decimal("500"), duration_minutes=60
    )
    wash = ServiceAddon.objects.create(
        service=haircut, label="Wash", price=Decimal("100"), duration_minutes=15
    )
    facial = Service.objects.create(
        category=parlor,
        name="Facial",
        slug="facial",
        summary="Glow",
        price=Decimal("800"),
        duration_minutes=45,
    )
    asha = StylistProfile.objects.create(display_name="Asha", title="Senior stylist")
    ravi = StylistProfile.objects.create(display_name="Ravi", title="Stylist")
    meena = StylistProfile.objects.create(display_name="Meena", title="Beautician")
    hidden = StylistProfile.objects.create(display_name="Hidden", title="Trainee", is_public=False)
    for profile in (asha, ravi, hidden):
        profile.services.add(haircut)
    meena.services.add(facial)
    chair = Room.objects.create(name="Chair 1", division="salon")
    return {
        "haircut": haircut,
        "short": short,
        "long": long,
        "wash": wash,
        "facial": facial,
        "asha": asha,
        "ravi": ravi,
        "meena": meena,
        "hidden": hidden,
        "chair": chair,
    }


def day_at(days: int, hour: int, minute: int = 0) -> datetime:
    day = timezone.localdate() + timedelta(days=days)
    return datetime.combine(day, time(hour, minute), tzinfo=timezone.get_current_timezone())


@pytest.fixture
def customer(make_user):
    user = make_user(role="customer", full_name="Priya Customer")
    profile = CustomerProfile(user=user)
    profile.set_phone("9876543210")
    profile.save()
    client = Client()
    assert login(client, user).status_code == 200
    return client, user


@pytest.fixture
def desk(logged_in):
    return logged_in("receptionist")


def request_body(cat, **overrides):
    body = {
        "service": "haircut",
        "variant": str(cat["short"].id),
        "addons": [],
        "start": day_at(3, 11).isoformat(),
        "stylist": None,
        "contact_name": "Priya Customer",
        "contact_email": "priya@example.com",
        "contact_phone": "98765 43210",
        "notes": "Please be gentle",
        "allergies": "Ammonia",
        "consent": True,
    }
    body.update(overrides)
    return body


def send_request(client, cat, **overrides):
    return client.post(
        "/api/booking/requests/", request_body(cat, **overrides), content_type="application/json"
    )


def confirm(client, appt_id, stylist, start, room=None):
    body = {"stylist": str(stylist.id), "start": start.isoformat()}
    if room:
        body["room"] = str(room.id)
    return client.post(
        f"/api/desk/appointments/{appt_id}/confirm/", body, content_type="application/json"
    )


def requested(client, cat, **overrides) -> str:
    response = send_request(client, cat, **overrides)
    assert response.status_code == 201, response.content
    return response.json()["id"]


def awaiting(customer_client, desk_client, cat, hour=11, stylist="asha", days=3) -> str:
    appt_id = requested(customer_client, cat, start=day_at(days, hour).isoformat())
    response = confirm(desk_client, appt_id, cat[stylist], day_at(days, hour))
    assert response.status_code == 200, response.content
    return appt_id


def payment_token(appt_id) -> str:
    mail = MailOutbox.objects.filter(kind=MailOutbox.Kind.PAYMENT_LINK).latest("created_at")
    assert f"/customer/pay/{appt_id}?link=" in mail.link
    return mail.link.split("link=")[1]


def pay(client, appt_id, outcome="success", link=None):
    body = {"outcome": outcome}
    if link is not None:
        body["link"] = link
    return client.post(
        f"/api/my/appointments/{appt_id}/payment/", body, content_type="application/json"
    )


# --------------------------------------------------------------------------- booking sheet


def test_booking_options_only_for_customers(catalogue, customer, logged_in):
    client, _ = customer
    body = client.get("/api/booking/options/?service=haircut").json()
    assert [s["display_name"] for s in body["stylists"]] == ["Asha", "Ravi"]  # public only
    assert "phone" not in body["stylists"][0]
    assert body["contact"]["phone"] == "9876543210"
    assert body["rules"]["deposit_percent"] == 100
    assert Client().get("/api/booking/options/?service=haircut").status_code in (401, 403)
    for role in ("receptionist", "stylist", "admin"):
        staff, _ = logged_in(role)
        assert staff.get("/api/booking/options/?service=haircut").status_code == 403
        assert staff.post("/api/booking/requests/", {}).status_code == 403
    assert client.get("/api/booking/options/?service=nope").status_code == 404


def test_slots_price_and_grid(catalogue, customer):
    client, _ = customer
    day = day_at(3, 0).date().isoformat()
    url = (
        f"/api/booking/slots/?service=haircut&variant={catalogue['long'].id}"
        f"&addons={catalogue['wash'].id}&date={day}"
    )
    body = client.get(url).json()
    assert body["duration_minutes"] == 75
    assert body["price_total"] == "600.00"
    assert body["gst_amount"] == "91.53"  # 600 * 18 / 118
    assert body["amount_payable"] == "600.00"
    assert body["slots"][0] == day_at(3, 10).isoformat()
    assert all(s[11:16] >= "10:00" for s in body["slots"])
    # The last start leaves room for 75 minutes before closing.
    last = datetime.fromisoformat(body["slots"][-1])
    assert last + timedelta(minutes=75) <= day_at(3, 20) or last + timedelta(minutes=75) <= day_at(
        3, 18
    )
    missing = client.get(f"/api/booking/slots/?service=haircut&date={day}")
    assert missing.status_code == 400  # this service needs an option


def test_slots_hide_times_when_the_chosen_stylist_is_held(catalogue, customer, desk):
    client, _ = customer
    awaiting(client, desk[0], catalogue, hour=11, stylist="asha")
    day = day_at(3, 0).date().isoformat()
    base = f"/api/booking/slots/?service=haircut&variant={catalogue['short'].id}&date={day}"
    asha_slots = client.get(f"{base}&stylist={catalogue['asha'].id}").json()["slots"]
    assert day_at(3, 11).isoformat() not in asha_slots
    assert day_at(3, 10, 45).isoformat() not in asha_slots  # would overlap 11:00
    assert day_at(3, 11, 30).isoformat() in asha_slots
    any_slots = client.get(base).json()["slots"]
    assert day_at(3, 11).isoformat() in any_slots  # Ravi is free


def test_send_request_stores_snapshot_encrypted_and_emails(catalogue, customer):
    client, user = customer
    response = send_request(
        client, catalogue, variant=str(catalogue["long"].id), addons=[str(catalogue["wash"].id)]
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["status"] == "requested"
    assert body["service_name"] == "Haircut" and body["variant_label"] == "Long"
    assert body["addon_labels"] == ["Wash"]
    assert body["price_total"] == "600.00"
    assert "cancel" in body["actions"] and "pay" not in body["actions"]
    appt = Appointment.objects.get(pk=body["id"])
    assert appt.customer == user and appt.contact_phone == "9876543210"
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT contact_phone, allergies, notes FROM scheduling_appointment WHERE id = %s",
            [appt.id],
        )
        raw = cursor.fetchone()
    assert "9876543210" not in raw[0] and "Ammonia" not in raw[1] and "gentle" not in raw[2]
    assert MailOutbox.objects.filter(kind="booking", to_email="priya@example.com").exists()


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"consent": False}, "consent"),
        ({"contact_phone": "12345"}, "contact_phone"),
        ({"start": "bad"}, "start"),
    ],
)
def test_request_validation(catalogue, customer, overrides, field):
    response = send_request(customer[0], catalogue, **overrides)
    assert response.status_code == 400
    assert field in response.json()


def test_request_rules(catalogue, customer):
    client, _ = customer
    off_grid = send_request(client, catalogue, start=day_at(3, 11, 7).isoformat())
    assert off_grid.status_code == 400
    closed = send_request(client, catalogue, start=day_at(3, 22).isoformat())
    assert closed.status_code == 400
    past = send_request(client, catalogue, start=day_at(-1, 11).isoformat())
    assert past.status_code == 400
    too_far = send_request(client, catalogue, start=day_at(90, 11).isoformat())
    assert too_far.status_code == 400
    wrong_stylist = send_request(client, catalogue, stylist=str(catalogue["meena"].id))
    assert wrong_stylist.status_code == 400
    hidden = send_request(client, catalogue, stylist=str(catalogue["hidden"].id))
    assert hidden.status_code == 400
    other_variant = send_request(client, catalogue, variant=str(catalogue["wash"].id))
    assert other_variant.status_code == 400


def test_request_for_a_held_stylist_returns_409_with_nearest_slots(catalogue, customer, desk):
    client, _ = customer
    awaiting(client, desk[0], catalogue, hour=11, stylist="asha")
    response = send_request(
        client, catalogue, stylist=str(catalogue["asha"].id), start=day_at(3, 11).isoformat()
    )
    assert response.status_code == 409
    slots = response.json()["slots"]
    assert 1 <= len(slots) <= 3
    assert day_at(3, 11).isoformat() not in slots


# --------------------------------------------------------------------------- isolation


def test_customers_see_and_touch_only_their_own(catalogue, customer, make_user):
    client, _ = customer
    mine = requested(client, catalogue)
    other_user = make_user(role="customer")
    other = Client()
    login(other, other_user)
    theirs = requested(other, catalogue)

    listed = [a["id"] for a in client.get("/api/my/appointments/").json()]
    assert listed == [mine]
    assert client.get(f"/api/my/appointments/{theirs}/").status_code == 404
    assert client.post(f"/api/my/appointments/{theirs}/cancel/").status_code == 404
    assert client.get(f"/api/my/appointments/{theirs}/payment/").status_code == 404
    assert pay(client, theirs).status_code == 404
    assert Appointment.objects.get(pk=theirs).status == S.REQUESTED


def test_customer_payload_hides_desk_only_fields(catalogue, customer):
    client, _ = customer
    body = client.get(f"/api/my/appointments/{requested(client, catalogue)}/").json()
    for field in ("events", "customer_phone", "confirmed_by", "stylist_id", "source"):
        assert field not in body


@pytest.mark.parametrize("role", ["customer", "stylist"])
def test_desk_api_denied_for_customer_and_stylist(catalogue, logged_in, role):
    client, _ = logged_in(role)
    appt_id = "00000000-0000-0000-0000-000000000000"
    assert client.get("/api/desk/appointments/").status_code == 403
    assert client.get(f"/api/desk/appointments/{appt_id}/").status_code == 403
    assert client.post(f"/api/desk/appointments/{appt_id}/confirm/").status_code == 403
    assert client.post(f"/api/desk/appointments/{appt_id}/reject/").status_code == 403


def test_stylists_have_no_booking_or_my_appointments_access(catalogue, logged_in):
    client, _ = logged_in("stylist")
    assert client.get("/api/my/appointments/").status_code == 403
    assert client.get("/api/my/profile/").status_code == 403
    assert client.get("/api/booking/slots/").status_code == 403


def test_guest_is_denied_everything(catalogue):
    guest = Client()
    for url in ("/api/my/appointments/", "/api/desk/appointments/", "/api/my/profile/"):
        assert guest.get(url).status_code in (401, 403)


# --------------------------------------------------------------------------- desk


@pytest.mark.parametrize("role", ["receptionist", "admin"])
def test_desk_lists_all_requests_with_counts(catalogue, customer, logged_in, role):
    client, _ = customer
    requested(client, catalogue)
    staff, _ = logged_in(role)
    body = staff.get("/api/desk/appointments/?status=requested").json()
    assert body["counts"]["requested"] == 1
    card = body["results"][0]
    assert card["customer_phone"] == "9876543210" and card["allergies"] == "Ammonia"
    assert card["actions"] == ["confirm", "reject"]
    assert card["events"][0]["action"] == "requested"


def test_desk_options_mark_who_is_free(catalogue, customer, desk):
    client, _ = customer
    awaiting(client, desk[0], catalogue, hour=11, stylist="asha")
    appt_id = requested(client, catalogue, start=day_at(3, 11).isoformat())
    body = desk[0].get(f"/api/desk/appointments/{appt_id}/options/").json()
    names = {s["display_name"]: s for s in body["stylists"]}
    assert set(names) == {"Asha", "Ravi", "Hidden"}  # desk may assign non-public stylists
    assert names["Asha"]["free_at_preferred"] is False
    assert names["Ravi"]["free_at_preferred"] is True
    assert body["rooms"][0]["name"] == "Chair 1"
    assert day_at(3, 11).isoformat() in body["slots"]  # someone is free


def test_confirm_moves_to_awaiting_payment_and_emails_link(catalogue, customer, desk):
    client, _ = customer
    appt_id = requested(client, catalogue)
    response = confirm(desk[0], appt_id, catalogue["ravi"], day_at(3, 12), catalogue["chair"])
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == "awaiting_payment"
    assert body["stylist_name"] == "Ravi" and body["room_name"] == "Chair 1"
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.start == day_at(3, 12)
    assert appt.end == day_at(3, 12, 30)
    hold = appt.awaiting_payment_until - timezone.now()
    assert timedelta(hours=5, minutes=59) < hold <= timedelta(hours=6)
    link = PaymentLink.objects.get(appointment=appt)
    assert link.amount == Decimal("300.00") and link.status == "active"
    token = payment_token(appt_id)
    assert token not in link.token_hash  # only the hash is stored
    customer_view = client.get(f"/api/my/appointments/{appt_id}/").json()
    assert {"pay", "resend_link", "cancel"} <= set(customer_view["actions"])


def test_hold_is_shorter_for_a_visit_soon(catalogue, customer, desk):
    client, _ = customer
    appt_id = requested(client, catalogue, start=day_at(3, 11).isoformat())
    soon = (timezone.localtime() + timedelta(hours=3)).replace(second=0, microsecond=0)
    soon = soon.replace(minute=(soon.minute // 15) * 15)
    response = confirm(desk[0], appt_id, catalogue["asha"], soon)
    if response.status_code == 400:  # the shop is closed right now; nothing to check
        return
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.awaiting_payment_until <= soon - timedelta(minutes=30)


def test_no_double_booking_for_a_stylist(catalogue, customer, desk):
    client, _ = customer
    awaiting(client, desk[0], catalogue, hour=11, stylist="asha")
    second = requested(client, catalogue, start=day_at(3, 11, 15).isoformat())
    response = confirm(desk[0], second, catalogue["asha"], day_at(3, 11, 15))
    assert response.status_code == 409
    body = response.json()
    assert "already booked" in body["detail"]
    assert 1 <= len(body["slots"]) <= 3
    assert Appointment.objects.get(pk=second).status == S.REQUESTED
    # The same time with another stylist is fine.
    assert confirm(desk[0], second, catalogue["ravi"], day_at(3, 11, 15)).status_code == 200


def test_no_double_booking_for_a_room(catalogue, customer, desk):
    client, _ = customer
    first = requested(client, catalogue)
    assert (
        confirm(desk[0], first, catalogue["asha"], day_at(3, 11), catalogue["chair"]).status_code
        == 200
    )
    second = requested(client, catalogue)
    response = confirm(desk[0], second, catalogue["ravi"], day_at(3, 11), catalogue["chair"])
    assert response.status_code == 409
    assert "room" in response.json()["detail"]


def test_confirm_rules(catalogue, customer, desk):
    client, _ = customer
    appt_id = requested(client, catalogue)
    assert confirm(desk[0], appt_id, catalogue["meena"], day_at(3, 11)).status_code == 400
    assert confirm(desk[0], appt_id, catalogue["asha"], day_at(-1, 11)).status_code == 400
    assert confirm(desk[0], appt_id, catalogue["asha"], day_at(3, 23)).status_code == 400
    assert confirm(desk[0], appt_id, catalogue["asha"], day_at(3, 11)).status_code == 200
    again = confirm(desk[0], appt_id, catalogue["ravi"], day_at(3, 12))
    assert again.status_code == 400  # already confirmed


def test_inactive_stylist_account_cannot_be_assigned(catalogue, customer, desk, make_user):
    client, _ = customer
    gone = make_user(role="stylist", active=False)
    catalogue["ravi"].user = gone
    catalogue["ravi"].save()
    appt_id = requested(client, catalogue)
    assert confirm(desk[0], appt_id, catalogue["ravi"], day_at(3, 11)).status_code == 400


def test_reject_needs_a_reason_and_emails_customer(catalogue, customer, desk):
    client, _ = customer
    appt_id = requested(client, catalogue)
    url = f"/api/desk/appointments/{appt_id}/reject/"
    assert desk[0].post(url, {"reason": ""}, content_type="application/json").status_code == 400
    response = desk[0].post(url, {"reason": "Fully booked"}, content_type="application/json")
    assert response.status_code == 200 and response.json()["status"] == "rejected"
    mail = MailOutbox.objects.filter(subject__contains="could not confirm").get()
    assert "Fully booked" in mail.body
    customer_view = client.get(f"/api/my/appointments/{appt_id}/").json()
    assert customer_view["reject_reason"] == "Fully booked" and customer_view["actions"] == []


# --------------------------------------------------------------------------- payment


def test_mock_payment_success_schedules_and_sends_receipt(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    token = payment_token(appt_id)
    summary = client.get(f"/api/my/appointments/{appt_id}/payment/?link={token}").json()
    assert summary["state"] == "due" and summary["amount"] == "300.00"
    response = pay(client, appt_id, link=token)
    assert response.status_code == 200, response.content
    assert response.json()["appointment"]["status"] == "scheduled"
    payment = Payment.objects.get(appointment_id=appt_id)
    assert payment.status == "succeeded" and payment.reference.startswith("MOCK-")
    assert PaymentLink.objects.get(appointment_id=appt_id).status == "paid"
    assert MailOutbox.objects.filter(subject__contains="payment received").exists()
    assert pay(client, appt_id).status_code == 400  # nothing more to pay
    assert client.get(f"/api/my/appointments/{appt_id}/payment/").json()["state"] == "paid"


def test_mock_payment_failure_keeps_the_hold(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    response = pay(client, appt_id, outcome="fail")
    assert response.status_code == 402
    assert Appointment.objects.get(pk=appt_id).status == S.AWAITING_PAYMENT
    assert Payment.objects.get(appointment_id=appt_id).status == "failed"
    assert pay(client, appt_id).status_code == 200


def test_old_link_stops_working_after_resend(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    old = payment_token(appt_id)
    PaymentLink.objects.update(sent_at=timezone.now() - timedelta(minutes=5))
    response = desk[0].post(f"/api/desk/appointments/{appt_id}/resend-link/")
    assert response.status_code == 200
    new = payment_token(appt_id)
    assert new != old
    summary = client.get(f"/api/my/appointments/{appt_id}/payment/?link={old}").json()
    assert summary["state"] == "replaced"
    assert pay(client, appt_id, link=old).status_code == 409
    assert pay(client, appt_id, link=new).status_code == 200


def test_customer_resend_is_rate_limited(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    assert client.post(f"/api/my/appointments/{appt_id}/resend-link/").status_code == 429
    PaymentLink.objects.update(sent_at=timezone.now() - timedelta(minutes=2))
    assert client.post(f"/api/my/appointments/{appt_id}/resend-link/").status_code == 200


def test_expired_hold_releases_the_slot(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue, stylist="asha")
    Appointment.objects.filter(pk=appt_id).update(
        awaiting_payment_until=timezone.now() - timedelta(minutes=1)
    )
    body = client.get(f"/api/my/appointments/{appt_id}/").json()
    assert body["status"] == "payment_expired"
    assert PaymentLink.objects.get(appointment_id=appt_id).status == "expired"
    assert MailOutbox.objects.filter(subject__contains="expired").exists()
    assert pay(client, appt_id).status_code == 409
    # The time is free again for Asha.
    other = requested(client, catalogue)
    assert confirm(desk[0], other, catalogue["asha"], day_at(3, 11)).status_code == 200
    # The desk sees it and may re-confirm the expired one at another time.
    listed = desk[0].get("/api/desk/appointments/?status=payment_expired").json()
    assert listed["counts"]["payment_expired"] == 1
    assert confirm(desk[0], appt_id, catalogue["asha"], day_at(3, 13)).status_code == 200


def test_expire_payments_command(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(
        awaiting_payment_until=timezone.now() - timedelta(seconds=1)
    )
    call_command("expire_payments")
    assert Appointment.objects.get(pk=appt_id).status == S.PAYMENT_EXPIRED


# --------------------------------------------------------------------------- customer actions


def test_cancel_a_request(catalogue, customer):
    client, _ = customer
    appt_id = requested(client, catalogue)
    response = client.post(f"/api/my/appointments/{appt_id}/cancel/")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert client.post(f"/api/my/appointments/{appt_id}/cancel/").status_code == 400


def test_free_cancellation_refunds_a_paid_booking(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue, days=3)
    pay(client, appt_id)
    response = client.post(f"/api/my/appointments/{appt_id}/cancel/")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    refund = Refund.objects.get()
    assert refund.status == "processed" and refund.amount == Decimal("300.00")


def test_late_cancellation_becomes_a_request(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue, days=3)
    pay(client, appt_id)
    Appointment.objects.filter(pk=appt_id).update(
        start=timezone.now() + timedelta(hours=5), end=timezone.now() + timedelta(hours=6)
    )
    body = client.get(f"/api/my/appointments/{appt_id}/").json()
    assert "cancel" not in body["actions"] and "request_cancel" in body["actions"]
    assert client.post(f"/api/my/appointments/{appt_id}/cancel/").status_code == 400
    response = client.post(
        f"/api/my/appointments/{appt_id}/request-cancel/",
        {"reason": "Unwell"},
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json()["cancel_requested"] is True
    assert response.json()["status"] == "scheduled"
    assert not Refund.objects.exists()


def test_im_here_only_on_the_day(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue, days=3)
    pay(client, appt_id)
    assert client.post(f"/api/my/appointments/{appt_id}/arrived/").status_code == 400
    now = timezone.now()
    Appointment.objects.filter(pk=appt_id).update(start=now, end=now + timedelta(minutes=30))
    response = client.post(f"/api/my/appointments/{appt_id}/arrived/")
    assert response.status_code == 200
    assert response.json()["arrived_at"] and response.json()["status"] == "scheduled"


def test_reschedule_request_is_a_flag(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    url = f"/api/my/appointments/{appt_id}/reschedule/"
    past = {"preferred": day_at(-1, 11).isoformat()}
    assert client.post(url, past, content_type="application/json").status_code == 400
    response = client.post(
        url,
        {"preferred": day_at(5, 15).isoformat(), "note": "Evening please"},
        content_type="application/json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reschedule_requested"] is True and body["status"] == "awaiting_payment"
    assert "reschedule" not in body["actions"]
    assert client.post(f"/api/my/appointments/{appt_id}/unknown/").status_code == 404


# --------------------------------------------------------------------------- profile + password


def test_profile_read_and_update(catalogue, customer):
    client, user = customer
    assert client.get("/api/my/profile/").json()["phone"] == "9876543210"
    response = client.patch(
        "/api/my/profile/",
        {"full_name": "Priya K", "phone": "+91 91234 56789", "allergies": "Peanuts"},
        content_type="application/json",
    )
    assert response.status_code == 200
    assert response.json() == {
        "full_name": "Priya K",
        "email": user.email,
        "phone": "9123456789",
        "allergies": "Peanuts",
        "preferences": "",
    }
    with connection.cursor() as cursor:
        cursor.execute("SELECT allergies FROM people_customerprofile WHERE user_id = %s", [user.id])
        assert "Peanuts" not in cursor.fetchone()[0]
    bad = client.patch("/api/my/profile/", {"phone": "1"}, content_type="application/json")
    assert bad.status_code == 400
    email_change = client.patch(
        "/api/my/profile/", {"email": "x@example.com"}, content_type="application/json"
    )
    assert email_change.json()["email"] == user.email  # email is read-only


@pytest.mark.parametrize("role", ["receptionist", "admin", "stylist"])
def test_profile_is_customer_only(logged_in, role):
    client, _ = logged_in(role)
    assert client.get("/api/my/profile/").status_code == 403


def test_password_change(customer):
    client, user = customer
    url = "/api/auth/password/change/"
    wrong = client.post(
        url,
        {"current_password": "nope", "new_password": "Another-Strong-2026!"},
        content_type="application/json",
    )
    assert wrong.status_code == 400 and "current_password" in wrong.json()
    weak = client.post(
        url,
        {"current_password": PASSWORD, "new_password": "123"},
        content_type="application/json",
    )
    assert weak.status_code == 400 and "new_password" in weak.json()
    ok = client.post(
        url,
        {"current_password": PASSWORD, "new_password": "Another-Strong-2026!"},
        content_type="application/json",
    )
    assert ok.status_code == 200
    assert client.get("/api/my/profile/").status_code == 200  # this session continues
    assert login(Client(), user).status_code == 401
    assert login(Client(), user, password="Another-Strong-2026!").status_code == 200
