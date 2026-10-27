"""Task 3b: check-in, walk-in and phone bookings, and the customers pages (receptionist, admin)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import AuditLog, User
from core.models import MailOutbox
from people.models import CustomerNote, CustomerProfile
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    awaiting,
    catalogue,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
)

S = AppointmentStatus


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


def patch(client, path, data):
    return client.patch(path, data, content_type="application/json")


def audited(action: str) -> int:
    return AuditLog.objects.filter(action=action).count()


def scheduled(customer_client, desk_client, cat) -> str:
    appt_id = awaiting(customer_client, desk_client, cat)
    assert pay(customer_client, appt_id, link=payment_token(appt_id)).status_code == 200
    return appt_id


def move_to_today(appt_id, hours_from_now=1):
    now = timezone.now()
    start = now + timedelta(hours=hours_from_now)
    if timezone.localtime(start).date() != timezone.localtime(now).date():
        start = now  # late evening: stay on the same shop day
    Appointment.objects.filter(pk=appt_id).update(start=start, end=start + timedelta(minutes=30))


# --------------------------------------------------------------------------- check-in


def test_check_in_works_on_the_day_and_is_audited(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    assert "check_in" not in desk[0].get(f"/api/desk/appointments/{appt_id}/").json()["actions"]
    early = post(desk[0], f"/api/desk/appointments/{appt_id}/check-in/")
    assert early.status_code == 400  # not the day of the visit
    move_to_today(appt_id)
    assert "check_in" in desk[0].get(f"/api/desk/appointments/{appt_id}/").json()["actions"]
    response = post(desk[0], f"/api/desk/appointments/{appt_id}/check-in/")
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == "checked_in"
    assert body["arrived_at"]
    assert "check_in" not in body["actions"]
    assert audited("appointment_checked_in") == 1
    assert post(desk[0], f"/api/desk/appointments/{appt_id}/check-in/").status_code == 400


def test_only_scheduled_visits_can_be_checked_in(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)  # still unpaid
    move_to_today(appt_id)
    assert post(desk[0], f"/api/desk/appointments/{appt_id}/check-in/").status_code == 400


def test_check_in_is_closed_to_customers_stylists_and_guests(catalogue, customer, desk, logged_in):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    move_to_today(appt_id)
    url = f"/api/desk/appointments/{appt_id}/check-in/"
    assert post(client, url).status_code == 403
    assert post(logged_in("stylist")[0], url).status_code == 403
    from django.test import Client

    assert post(Client(), url).status_code in (401, 403)
    assert Appointment.objects.get(pk=appt_id).status == S.SCHEDULED
    assert post(logged_in("admin")[0], url).status_code == 200  # admin may do what the desk does


# --------------------------------------------------------------------------- walk-in booking


def booking_body(cat, customer_user, **overrides):
    body = {
        "customer": str(customer_user.id),
        "service": "haircut",
        "variant": str(cat["short"].id),
        "addons": [],
        "start": day_at(2, 12).isoformat(),
        "stylist": str(cat["asha"].id),
        "room": str(cat["chair"].id),
        "source": "phone",
    }
    body.update(overrides)
    return body


def test_desk_lists_free_times_with_the_stylists_free(catalogue, customer, desk):
    day = day_at(2, 0).date().isoformat()
    url = f"/api/desk/slots/?service=haircut&variant={catalogue['short'].id}&date={day}"
    body = desk[0].get(url).json()
    assert body["duration_minutes"] == 30
    assert {s["display_name"] for s in body["stylists"]} == {"Asha", "Ravi", "Hidden"}
    assert body["slots"][0]["start"] == day_at(2, 10).isoformat()
    assert len(body["slots"][0]["stylists"]) == 3
    assert [r["name"] for r in body["rooms"]] == ["Chair 1"]


def test_a_phone_booking_goes_straight_to_scheduled(catalogue, customer, desk):
    _, user = customer
    mails = MailOutbox.objects.count()
    response = post(desk[0], "/api/desk/bookings/", booking_body(catalogue, user))
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["status"] == "scheduled"
    assert body["source"] == "phone"
    assert body["stylist_name"] == "Asha"
    assert body["customer_name"] == "Priya Customer"
    assert body["customer_phone"] == "9876543210"
    assert body["amount_payable"] == "300.00"  # settled at checkout, not online
    assert MailOutbox.objects.count() == mails + 1
    appt = Appointment.objects.get(pk=body["id"])
    assert appt.confirmed_by == desk[1]
    assert audited("appointment_created_by_staff") == 1


def test_a_walk_in_can_be_checked_in_at_once(catalogue, customer, desk):
    _, user = customer
    response = post(
        desk[0],
        "/api/desk/bookings/",
        booking_body(catalogue, user, source="walk_in", check_in_now=True),
    )
    assert response.status_code == 201, response.content
    assert response.json()["status"] == "checked_in"
    assert audited("appointment_created_by_staff") == 1


def test_a_clash_returns_409_with_the_nearest_times(catalogue, customer, desk):
    _, user = customer
    assert post(desk[0], "/api/desk/bookings/", booking_body(catalogue, user)).status_code == 201
    again = post(desk[0], "/api/desk/bookings/", booking_body(catalogue, user, room=None))
    assert again.status_code == 409
    assert len(again.json()["slots"]) == 3
    assert Appointment.objects.filter(customer=user).count() == 1  # nothing half-created
    assert audited("appointment_created_by_staff") == 1


def test_desk_booking_rejects_bad_input(catalogue, customer, desk):
    _, user = customer
    past = day_at(-1, 12).isoformat()
    assert (
        post(desk[0], "/api/desk/bookings/", booking_body(catalogue, user, start=past)).status_code
        == 400
    )
    # Meena does not offer a haircut.
    other = booking_body(catalogue, user, stylist=str(catalogue["meena"].id))
    assert post(desk[0], "/api/desk/bookings/", other).status_code == 400
    unknown = booking_body(catalogue, user, customer="00000000-0000-0000-0000-000000000000")
    assert post(desk[0], "/api/desk/bookings/", unknown).status_code == 404
    assert (
        post(
            desk[0], "/api/desk/bookings/", booking_body(catalogue, user, source="online")
        ).status_code
        == 400
    )
    assert Appointment.objects.count() == 0


def test_desk_booking_is_closed_to_other_roles(catalogue, customer, logged_in):
    client, user = customer
    body = booking_body(catalogue, user)
    assert post(client, "/api/desk/bookings/", body).status_code == 403
    assert post(logged_in("stylist")[0], "/api/desk/bookings/", body).status_code == 403
    assert client.get("/api/desk/slots/?service=haircut").status_code == 403
    assert post(logged_in("admin")[0], "/api/desk/bookings/", body).status_code == 201


# --------------------------------------------------------------------------- customers


def test_search_by_name_email_and_full_mobile(customer, make_user, desk):
    _, user = customer
    other = make_user(role="customer", full_name="Rahul Verma", email="rahul@example.com")
    profile = CustomerProfile(user=other)
    profile.set_phone("9123456780")
    profile.save()
    staff_member = make_user(role="stylist", full_name="Priya Stylist")
    get = lambda q: desk[0].get("/api/desk/customers/", {"q": q}).json()  # noqa: E731
    assert [c["full_name"] for c in get("priya")["results"]] == ["Priya Customer"]
    assert [c["full_name"] for c in get("RAHUL@exa")["results"]] == ["Rahul Verma"]
    assert [c["full_name"] for c in get("98765 43210")["results"]] == ["Priya Customer"]
    assert [c["full_name"] for c in get("+91 91234 56780")["results"]] == ["Rahul Verma"]
    assert get("9876543211")["count"] == 0  # exact number only
    assert get("")["count"] == 2  # everyone, but never staff accounts
    assert str(staff_member.id) not in str(get(""))


def test_profile_shows_history_and_hides_what_it_should(catalogue, customer, desk, logged_in):
    client, user = customer
    appt_id = scheduled(client, desk[0], catalogue)
    CustomerNote.objects.create(
        customer=user, author=desk[1], body="Prefers morning visits", audience="desk"
    )
    CustomerNote.objects.create(
        customer=user, author=desk[1], body="Colour formula 6N + 20vol", audience="stylist"
    )
    body = desk[0].get(f"/api/desk/customers/{user.id}/").json()
    assert body["email"] == user.email
    assert body["phone"] == "9876543210"
    assert [v["id"] for v in body["visits_list"]] == [appt_id]
    assert body["visits_list"][0]["stylist_name"] == "Asha"
    assert body["stats"]["pending_ratings"] == 0
    assert [n["body"] for n in body["notes"]] == ["Prefers morning visits"]
    text = str(body)
    assert "Colour formula" not in text  # stylist-only notes stay out of the desk API
    assert "password" not in text
    admin = logged_in("admin")[0].get(f"/api/desk/customers/{user.id}/")
    assert admin.status_code == 200


def test_register_a_customer_at_the_desk(desk):
    body = {
        "full_name": "Walk In Guest",
        "email": "Walkin@Example.com",
        "phone": "9812345678",
        "allergies": "Latex",
    }
    response = post(desk[0], "/api/desk/customers/", body)
    assert response.status_code == 201, response.content
    created = response.json()
    assert created["email"] == "Walkin@Example.com"
    assert created["phone"] == "9812345678"
    assert created["allergies"] == "Latex"
    user = User.objects.get(pk=created["id"])
    assert user.role == "customer"
    assert not user.has_usable_password()
    assert user.email_verified_at is None
    assert CustomerProfile.objects.get(user=user).phone_index
    assert audited("customer_created") == 1
    dup = post(desk[0], "/api/desk/customers/", {**body, "email": "walkin@example.com"})
    assert dup.status_code == 409
    assert User.objects.filter(email__iexact="walkin@example.com").count() == 1


def test_register_rejects_bad_input(desk):
    good = {"full_name": "Guest One", "email": "g1@example.com", "phone": "9812345678"}
    for bad in (
        {**good, "phone": "12345"},
        {**good, "email": "not-an-email"},
        {**good, "full_name": "G"},
    ):
        assert post(desk[0], "/api/desk/customers/", bad).status_code == 400
    assert User.objects.filter(role="customer").count() == 0


def test_edit_customer_and_audit_what_changed(customer, desk):
    _, user = customer
    url = f"/api/desk/customers/{user.id}/"
    response = patch(
        desk[0], url, {"full_name": "Priya K", "phone": "9000000001", "allergies": "Nuts"}
    )
    assert response.status_code == 200, response.content
    assert response.json()["phone"] == "9000000001"
    user.refresh_from_db()
    assert user.full_name == "Priya K"
    entry = AuditLog.objects.get(action="customer_updated")
    assert sorted(entry.metadata["fields"]) == ["allergies", "full_name", "phone"]
    assert "9000000001" not in str(entry.metadata)  # no personal data in the log
    search = desk[0].get("/api/desk/customers/", {"q": "9000000001"}).json()
    assert search["count"] == 1  # the blind index followed the new number
    assert desk[0].get("/api/desk/customers/", {"q": "9876543210"}).json()["count"] == 0
    patch(desk[0], url, {"full_name": "Priya K"})
    assert audited("customer_updated") == 1  # nothing changed, nothing logged
    assert patch(desk[0], url, {"phone": "123"}).status_code == 400


def test_add_a_note(customer, desk):
    _, user = customer
    response = post(desk[0], f"/api/desk/customers/{user.id}/notes/", {"body": "Likes tea"})
    assert response.status_code == 201, response.content
    assert response.json()["notes"][0]["body"] == "Likes tea"
    assert response.json()["notes"][0]["author_name"] == desk[1].full_name
    assert audited("customer_note_added") == 1
    assert "Likes tea" not in str(AuditLog.objects.get(action="customer_note_added").metadata)
    assert post(desk[0], f"/api/desk/customers/{user.id}/notes/", {"body": " "}).status_code == 400
    from django.db import connection

    with connection.cursor() as cursor:  # stored encrypted, never as plain text
        cursor.execute("select body from people_customernote")
        assert "Likes tea" not in cursor.fetchone()[0]


def test_customers_are_closed_to_other_roles(customer, make_user, logged_in):
    from django.test import Client

    client, user = customer
    other = make_user(role="customer", email="other@example.com")
    urls = [
        ("get", "/api/desk/customers/"),
        ("post", "/api/desk/customers/"),
        ("get", f"/api/desk/customers/{other.id}/"),
        ("patch", f"/api/desk/customers/{other.id}/"),
        ("post", f"/api/desk/customers/{other.id}/notes/"),
    ]
    clients = [client, logged_in("stylist")[0], Client()]
    for c in clients:
        for method, url in urls:
            response = (
                getattr(c, method)(url, {}, content_type="application/json")
                if method != "get"
                else c.get(url)
            )
            assert response.status_code in (401, 403), (method, url)
    assert not CustomerNote.objects.exists()


def test_customer_ids_are_not_guessable_and_staff_ids_are_not_customers(desk, logged_in):
    stylist_user = logged_in("stylist")[1]
    assert desk[0].get(f"/api/desk/customers/{stylist_user.id}/").status_code == 404
    assert desk[0].get("/api/desk/customers/not-a-uuid/").status_code == 404


def test_a_desk_customer_can_claim_the_account_with_forgot_password(desk):
    from django.test import Client

    body = {"full_name": "Claim Me", "email": "claim@example.com", "phone": "9812345679"}
    assert post(desk[0], "/api/desk/customers/", body).status_code == 201
    anonymous = Client()
    sent = post(anonymous, "/api/auth/password-reset/", {"email": "claim@example.com"})
    assert sent.status_code == 200
    mail = MailOutbox.objects.filter(
        kind=MailOutbox.Kind.PASSWORD_RESET, to_email="claim@example.com"
    )
    assert mail.exists()
