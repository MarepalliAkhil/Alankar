"""Task 3a: the receptionist desk: move, cancel, no-show, customer requests, day schedule."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import AuditLog
from billing.models import PaymentLink, Refund
from core.models import MailOutbox
from scheduling.models import Appointment, AppointmentStatus
from scheduling.tests.test_booking import (  # noqa: F401  (shared fixtures and helpers)
    awaiting,
    catalogue,
    confirm,
    customer,
    day_at,
    desk,
    pay,
    payment_token,
    requested,
)

S = AppointmentStatus


def post(client, path, data=None):
    return client.post(path, data or {}, content_type="application/json")


def move(client, appt_id, stylist, start, room=None):
    body = {"stylist": str(stylist.id), "start": start.isoformat()}
    if room is not None:
        body["room"] = str(room.id)
    return post(client, f"/api/desk/appointments/{appt_id}/move/", body)


def scheduled(customer_client, desk_client, cat, hour=11, days=3, stylist="asha") -> str:
    appt_id = awaiting(customer_client, desk_client, cat, hour=hour, days=days, stylist=stylist)
    assert pay(customer_client, appt_id, link=payment_token(appt_id)).status_code == 200
    return appt_id


def audited(action: str) -> int:
    return AuditLog.objects.filter(action=action).count()


# --------------------------------------------------------------------------- move


def test_a_scheduled_visit_can_be_moved_to_another_stylist_and_time(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    mails = MailOutbox.objects.count()
    response = move(desk[0], appt_id, catalogue["ravi"], day_at(3, 14), catalogue["chair"])
    assert response.status_code == 200, response.content
    body = response.json()
    assert body["status"] == "scheduled"
    assert body["stylist_name"] == "Ravi" and body["room_name"] == "Chair 1"
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.start == day_at(3, 14) and appt.end == day_at(3, 14) + timedelta(minutes=30)
    assert appt.events.last().action == "rescheduled"
    assert audited("appointment_rescheduled") == 1
    assert MailOutbox.objects.count() == mails + 1
    assert "moved" in MailOutbox.objects.latest("created_at").subject


def test_moving_clears_the_customers_reschedule_request(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(
        reschedule_requested=True, reschedule_preferred=day_at(4, 12), reschedule_note="Busy"
    )
    assert move(desk[0], appt_id, catalogue["asha"], day_at(4, 12)).status_code == 200
    appt = Appointment.objects.get(pk=appt_id)
    assert not appt.reschedule_requested and appt.reschedule_preferred is None


def test_a_clash_returns_409_with_three_nearest_times_and_changes_nothing(
    catalogue, customer, desk
):
    client, _ = customer
    first = scheduled(client, desk[0], catalogue, hour=11)
    scheduled(client, desk[0], catalogue, hour=14)  # Asha is busy 14:00
    response = move(desk[0], first, catalogue["asha"], day_at(3, 14))
    assert response.status_code == 409
    assert len(response.json()["slots"]) == 3
    assert Appointment.objects.get(pk=first).start == day_at(3, 11)
    assert audited("appointment_rescheduled") == 0


def test_a_room_clash_is_refused_too(catalogue, customer, desk):
    client, _ = customer
    a = scheduled(client, desk[0], catalogue, hour=11, stylist="asha")
    b = scheduled(client, desk[0], catalogue, hour=14, stylist="ravi")
    assert move(desk[0], a, catalogue["asha"], day_at(3, 11), catalogue["chair"]).status_code == 200
    clash = move(desk[0], b, catalogue["ravi"], day_at(3, 11), catalogue["chair"])
    assert clash.status_code == 409
    assert "room" in clash.json()["detail"].lower()


def test_moving_to_the_same_place_or_a_bad_time_is_refused(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    assert move(desk[0], appt_id, catalogue["asha"], day_at(3, 11)).status_code == 400
    past = move(desk[0], appt_id, catalogue["asha"], timezone.now() - timedelta(hours=2))
    assert past.status_code == 400
    off_grid = move(desk[0], appt_id, catalogue["asha"], day_at(3, 11, 7))
    assert off_grid.status_code == 400
    closed_hours = move(desk[0], appt_id, catalogue["asha"], day_at(3, 3))
    assert closed_hours.status_code == 400
    unqualified = move(desk[0], appt_id, catalogue["meena"], day_at(3, 12))  # facial only
    assert unqualified.status_code == 400
    assert Appointment.objects.get(pk=appt_id).start == day_at(3, 11)


def test_a_held_visit_moves_with_a_fresh_payment_link(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    old = PaymentLink.objects.get(appointment_id=appt_id)
    response = move(desk[0], appt_id, catalogue["asha"], day_at(3, 15))
    assert response.status_code == 200
    old.refresh_from_db()
    assert old.status == PaymentLink.Status.REPLACED
    assert PaymentLink.objects.filter(appointment_id=appt_id, status="active").count() == 1
    assert Appointment.objects.get(pk=appt_id).status == S.AWAITING_PAYMENT
    assert "pay" in MailOutbox.objects.latest("created_at").link


def test_only_held_or_scheduled_visits_can_be_moved(catalogue, customer, desk):
    client, _ = customer
    new = requested(client, catalogue)
    assert move(desk[0], new, catalogue["asha"], day_at(4, 11)).status_code == 400
    done = scheduled(client, desk[0], catalogue, hour=12)
    for status in (S.CHECKED_IN, S.COMPLETED, S.CANCELLED, S.NO_SHOW):
        Appointment.objects.filter(pk=done).update(status=status)
        assert move(desk[0], done, catalogue["asha"], day_at(4, 12)).status_code == 400, status


# --------------------------------------------------------------------------- cancel


def test_cancelling_a_paid_visit_asks_the_admin_for_the_refund(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    assert post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {}).status_code == 400
    short = post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "ab"})
    assert short.status_code == 400
    response = post(
        desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "Stylist is unwell"}
    )
    assert response.status_code == 200, response.content
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.status == S.CANCELLED and appt.cancel_reason == "Stylist is unwell"
    refund = Refund.objects.get()
    assert refund.status == Refund.Status.PENDING_APPROVAL
    assert refund.amount == Decimal("300.00") and refund.processed_at is None
    assert audited("appointment_cancelled") == 1
    assert "refunded once approved" in MailOutbox.objects.latest("created_at").body
    # The slot is free again and a second cancel is refused.
    assert (
        post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "again"}).status_code
        == 400
    )
    assert Refund.objects.count() == 1


def test_cancelling_a_held_visit_cancels_its_link(catalogue, customer, desk):
    client, _ = customer
    appt_id = awaiting(client, desk[0], catalogue)
    assert (
        post(desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "Closed"}).status_code
        == 200
    )
    assert PaymentLink.objects.get(appointment_id=appt_id).status == PaymentLink.Status.CANCELLED
    assert Refund.objects.count() == 0


def test_new_requests_are_rejected_not_cancelled(catalogue, customer, desk):
    client, _ = customer
    new = requested(client, catalogue)
    assert (
        post(desk[0], f"/api/desk/appointments/{new}/cancel/", {"reason": "No"}).status_code == 400
    )


# --------------------------------------------------------------------------- no-show


def test_no_show_only_after_the_start_time(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    url = f"/api/desk/appointments/{appt_id}/no-show/"
    assert post(desk[0], url).status_code == 400  # in the future
    Appointment.objects.filter(pk=appt_id).update(
        start=timezone.now() - timedelta(minutes=45), end=timezone.now() - timedelta(minutes=15)
    )
    response = post(desk[0], url)
    assert response.status_code == 200, response.content
    assert Appointment.objects.get(pk=appt_id).status == S.NO_SHOW
    assert Refund.objects.get().status == Refund.Status.PENDING_APPROVAL
    assert audited("appointment_no_show") == 1
    assert post(desk[0], url).status_code == 400


# --------------------------------------------------------------------------- customer requests


def test_declining_a_reschedule_or_cancel_request_keeps_the_booking(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    url = f"/api/desk/appointments/{appt_id}/dismiss/"
    assert post(desk[0], url, {"flag": "reschedule"}).status_code == 400  # none was made
    Appointment.objects.filter(pk=appt_id).update(
        reschedule_requested=True, reschedule_preferred=day_at(4, 12), cancel_requested=True
    )
    listing = desk[0].get("/api/desk/appointments/?status=flags").json()
    assert listing["counts"]["flags"] == 1 and len(listing["results"]) == 1
    actions = listing["results"][0]["actions"]
    assert "decline_reschedule" in actions and "decline_cancel" in actions
    assert post(desk[0], url, {"flag": "reschedule", "note": "Fully booked"}).status_code == 200
    assert post(desk[0], url, {"flag": "cancel"}).status_code == 200
    appt = Appointment.objects.get(pk=appt_id)
    assert not appt.reschedule_requested and not appt.cancel_requested
    assert appt.status == S.SCHEDULED and appt.start == day_at(3, 11)
    assert audited("appointment_flag_declined") == 2
    assert "Fully booked" in MailOutbox.objects.filter(subject__contains="reschedule").get().body
    assert desk[0].get("/api/desk/appointments/?status=flags").json()["counts"]["flags"] == 0


def test_a_customer_cancel_request_can_be_approved_by_cancelling(catalogue, customer, desk):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    Appointment.objects.filter(pk=appt_id).update(cancel_requested=True)
    assert (
        post(
            desk[0], f"/api/desk/appointments/{appt_id}/cancel/", {"reason": "As asked"}
        ).status_code
        == 200
    )
    appt = Appointment.objects.get(pk=appt_id)
    assert appt.status == S.CANCELLED and not appt.cancel_requested


# --------------------------------------------------------------------------- schedule board


def test_the_day_schedule_lists_stylists_rooms_and_visits_without_contact_details(
    catalogue, customer, desk
):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    day = day_at(3, 0).date().isoformat()
    body = desk[0].get(f"/api/desk/schedule/?date={day}").json()
    assert body["closed"] is False and body["step_minutes"] > 0
    assert {s["display_name"] for s in body["stylists"]} >= {"Asha", "Ravi", "Meena"}
    assert [r["name"] for r in body["rooms"]] == ["Chair 1"]
    (item,) = body["appointments"]
    assert item["id"] == appt_id and item["status"] == "scheduled"
    assert item["customer_name"] == "Priya Customer"
    assert "move" in item["actions"] and "cancel" in item["actions"]
    for secret in ("customer_phone", "customer_email", "notes", "allergies"):
        assert secret not in item
    # Another day is empty; cancelled visits do not appear.
    other = desk[0].get(f"/api/desk/schedule/?date={day_at(5, 0).date().isoformat()}").json()
    assert other["appointments"] == []
    Appointment.objects.filter(pk=appt_id).update(status=S.CANCELLED)
    assert desk[0].get(f"/api/desk/schedule/?date={day}").json()["appointments"] == []


# --------------------------------------------------------------------------- who may call what

ENDPOINTS = (
    ("get", "/api/desk/schedule/"),
    ("post", "/api/desk/appointments/{id}/move/"),
    ("post", "/api/desk/appointments/{id}/cancel/"),
    ("post", "/api/desk/appointments/{id}/no-show/"),
    ("post", "/api/desk/appointments/{id}/dismiss/"),
)


def call(client, method, url):
    if method == "get":
        return client.get(url)
    return client.post(url, {}, content_type="application/json")


@pytest.mark.parametrize("method,path", ENDPOINTS)
def test_customers_stylists_and_guests_cannot_use_the_desk(
    method, path, catalogue, customer, desk, logged_in
):
    appt_id = scheduled(customer[0], desk[0], catalogue)
    url = path.format(id=appt_id)
    assert call(Client(), method, url).status_code in (401, 403)
    assert call(customer[0], method, url).status_code == 403
    stylist_client, _ = logged_in("stylist")
    assert call(stylist_client, method, url).status_code == 403
    assert Appointment.objects.get(pk=appt_id).status == S.SCHEDULED


def test_the_admin_can_use_the_desk_and_the_receptionist_cannot_reach_admin_data(
    catalogue, customer, desk, logged_in
):
    client, _ = customer
    appt_id = scheduled(client, desk[0], catalogue)
    admin, _ = logged_in("admin")
    assert move(admin, appt_id, catalogue["ravi"], day_at(3, 16)).status_code == 200
    # The receptionist is refused on staff management, the audit log and chat.
    for url in ("/api/staff/", "/api/staff/invites/", "/api/audit/"):
        assert desk[0].get(url).status_code == 403, url
    assert (
        desk[0].post("/api/staff/invites/", {}, content_type="application/json").status_code == 403
    )


def test_unknown_appointments_give_404_not_a_hint(catalogue, desk):
    ghost = "00000000-0000-4000-8000-000000000000"
    assert desk[0].get(f"/api/desk/appointments/{ghost}/").status_code == 404
    assert move(desk[0], ghost, catalogue["asha"], day_at(3, 11)).status_code == 404
